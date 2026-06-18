/**
 * sentinel/runner.ts — SentinelRunner 调度框架 (P1-4)
 *
 * 桥接 Sentinel 接口与 CronScheduler:
 *   1. 从 SentinelRegistry 读取所有 cron-mode 哨兵
 *   2. 为每个哨兵注册 Cron 任务
 *   3. 执行 check() → 收集发现 → 记录日志
 *   4. 单个哨兵失败不影响其他 (degraded 传播)
 *
 * @state: real — 生产可用, 与现有 CronScheduler 集成
 */

import type { CronScheduler } from '../cron/scheduler';
import type { Sentinel, SentinelCheckResult } from './types';
import type { Evidence } from '../evidence/types';
import { getSentinelRegistry } from './registry';
import { getBaselineStore } from './baseline-store';
import { createLogger } from '../logger';

const log = createLogger('sentinel/runner');

// ═══ 信号路由表 (手册 §19.1) ═══
// 哨兵 → 专家 预定义映射。规则驱动，只有模糊场景丢给 LLM。
// 信号级别: Low(只记录) / Medium(通知专家) / High(交叉验证) / Emergency(告警FDE)

interface SignalRoute {
  sentinelId: string;
  /** 匹配模式: exact(精确ID) | prefix(ID前缀) */
  match: 'exact' | 'prefix';
  /** 路由到哪些专家 */
  experts: string[];
  /** 触发交叉验证的最低信号级别 (medium=通知不交叉, high/emergency=交叉验证) */
  crossValidateAt: 'medium' | 'high' | 'emergency';
}

const SIGNAL_ROUTING_TABLE: SignalRoute[] = [
  // D1 增长动力
  { sentinelId: 'sentinel-revenue-decomposition', match: 'exact', experts: ['finance', 'strategy'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-customer-dynamics', match: 'exact', experts: ['marketing', 'strategy'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-cash-flow', match: 'exact', experts: ['finance'], crossValidateAt: 'emergency' },
  { sentinelId: 'sentinel-token-economics', match: 'exact', experts: ['finance', 'strategy'], crossValidateAt: 'high' },
  // D2 组织能力
  { sentinelId: 'sentinel-gap-dynamics', match: 'exact', experts: ['org'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-cpc', match: 'exact', experts: ['org', 'tech'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-path-dependency', match: 'exact', experts: ['org', 'strategy'], crossValidateAt: 'medium' },
  { sentinelId: 'sentinel-self-awareness', match: 'exact', experts: ['org'], crossValidateAt: 'medium' },
  { sentinelId: 'sentinel-goal-alignment', match: 'exact', experts: ['org', 'strategy'], crossValidateAt: 'high' },
  // D3 人+Agent
  { sentinelId: 'sentinel-htm', match: 'exact', experts: ['org'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-hacd', match: 'exact', experts: ['org', 'tech'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-hona', match: 'exact', experts: ['org'], crossValidateAt: 'medium' },
  { sentinelId: 'sentinel-eob', match: 'exact', experts: ['org'], crossValidateAt: 'medium' },
  // D4 软件生态
  { sentinelId: 'sentinel-integration-health', match: 'exact', experts: ['tech'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-data-silos', match: 'exact', experts: ['tech'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-saas-utilization', match: 'exact', experts: ['tech', 'finance'], crossValidateAt: 'medium' },
  { sentinelId: 'sentinel-shadow-it', match: 'exact', experts: ['tech'], crossValidateAt: 'high' },
  // D5 软件-Agent适配
  { sentinelId: 'sentinel-api-accessibility', match: 'exact', experts: ['tech'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-data-readiness', match: 'exact', experts: ['tech'], crossValidateAt: 'medium' },
  { sentinelId: 'sentinel-protocol-coverage', match: 'exact', experts: ['tech'], crossValidateAt: 'medium' },
  // D6 战略健康
  { sentinelId: 'sentinel-seven-powers', match: 'exact', experts: ['strategy'], crossValidateAt: 'high' },
  // D7 风险预警
  { sentinelId: 'sentinel-key-person-risk', match: 'exact', experts: ['org'], crossValidateAt: 'emergency' },
  { sentinelId: 'sentinel-risk-aggregator', match: 'exact', experts: ['org', 'strategy', 'finance'], crossValidateAt: 'emergency' },
  { sentinelId: 'sentinel-financial-impact', match: 'exact', experts: ['finance'], crossValidateAt: 'high' },
  { sentinelId: 'sentinel-financial-snapshot', match: 'exact', experts: ['finance'], crossValidateAt: 'medium' },
];

/** 根据哨兵 ID 查找路由规则 */
function findSignalRoute(sentinelId: string): SignalRoute | undefined {
  return SIGNAL_ROUTING_TABLE.find(r =>
    r.match === 'exact' ? r.sentinelId === sentinelId : sentinelId.startsWith(r.sentinelId)
  );
}

/** 获取所有路由覆盖的哨兵 ID 列表 */
export function getRoutedSentinelIds(): string[] {
  return SIGNAL_ROUTING_TABLE.map(r => r.sentinelId);
}

// ═══ Types ═══

export interface SentinelRunRecord {
  sentinelId: string;
  sentinelName: string;
  result: SentinelCheckResult;
  /** Cron job ID (from scheduler) */
  cronJobId: string;
}

export interface SentinelRunnerStats {
  totalSentinels: number;
  totalRuns: number;
  totalFindings: number;
  criticalFindings: number;
  warningFindings: number;
  lastRunAt: string | null;
}

// ═══ SentinelRunner ═══

export class SentinelRunner {
  private scheduler: CronScheduler;
  private db: unknown;
  private records = new Map<string, SentinelRunRecord[]>();
  private cronJobIds = new Map<string, string>();
  private totalRuns = 0;

  constructor(scheduler: CronScheduler, db: unknown) {
    this.scheduler = scheduler;
    this.db = db;
  }

  /**
   * 启动所有 cron-mode 哨兵。
   * 从 SentinelRegistry 读取, 为每个 cron 哨兵注册定时任务。
   */
  start(): void {
    // 哨兵工单表 (L3 闭环)
    try {
      (this.db as { exec(sql: string): void }).exec(`
        CREATE TABLE IF NOT EXISTS sentinel_tickets (
          id TEXT PRIMARY KEY,
          signal_id TEXT NOT NULL,
          severity TEXT NOT NULL CHECK(severity IN ('critical','warning','info')),
          expert_type TEXT NOT NULL,
          diagnosis TEXT,
          suggested_actions TEXT,
          status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','dismissed')),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          resolved_at TEXT
        );
      `);
    } catch { log.debug('哨兵工单表初始化失败 — 可能已存在或 db 不可用'); }

    const registry = getSentinelRegistry();
    const cronSentinels = registry.listCronSentinels();

    if (cronSentinels.length === 0) {
      log.info('[runner] 无 cron-mode 哨兵 — 跳过启动');
      return;
    }

    for (const { sentinel, cron } of cronSentinels) {
      this.scheduleSentinel(sentinel, cron);
    }

    // 信号聚合 — 每小时整点过 5 分运行 (在所有哨兵之后)
    this.scheduler.schedule('SignalAggregator', '5 * * * *', async () => {
      await this.aggregateAndDispatch();
    });

    log.info({ count: cronSentinels.length }, '[runner] 所有 cron 哨兵 + 信号聚合已启动');
  }

  /**
   * 停止所有哨兵。
   */
  stop(): void {
    for (const [sentinelId, cronJobId] of this.cronJobIds) {
      try {
        this.scheduler.remove(cronJobId);
      } catch { log.warn({ sentinelId }, '[runner] cron 取消失败 (可能已停止)'); }
    }
    this.cronJobIds.clear();
    log.info('[runner] 所有哨兵已停止');
  }

  /**
   * 手动运行指定哨兵 (不等待 cron)。
   */
  async runOnce(sentinelId: string): Promise<SentinelCheckResult | null> {
    const registry = getSentinelRegistry();
    const sentinel = registry.get(sentinelId);
    if (!sentinel) {
      log.warn({ sentinelId }, '[runner] 哨兵未找到');
      return null;
    }
    return this.executeSentinel(sentinel);
  }

  /** 获取运行统计 */
  getStats(): SentinelRunnerStats {
    const allFindings = [...this.records.values()].flatMap(rs => rs.flatMap(r => r.result.findings));
    const lastRecord = [...this.records.values()].flatMap(rs => rs).sort((a, b) =>
      b.result.checkedAt.localeCompare(a.result.checkedAt)
    )[0];

    return {
      totalSentinels: this.cronJobIds.size,
      totalRuns: this.totalRuns,
      totalFindings: allFindings.length,
      criticalFindings: allFindings.filter(f => f.severity === 'critical').length,
      warningFindings: allFindings.filter(f => f.severity === 'warning').length,
      lastRunAt: lastRecord?.result.checkedAt ?? null,
    };
  }

  /**
   * 信号聚合 — 收集所有哨兵最新结果，交叉关联，输出聚合信号。
   * 每小时调用一次 (在所有哨兵 cron tick 之后)。
   */
  async aggregateAndDispatch(): Promise<void> {
    try {
      const results: SentinelCheckResult[] = [];
      for (const [, history] of this.records) {
        if (history.length > 0) {
          results.push(history[history.length - 1].result);
        }
      }
      if (results.length === 0) return;

      const { aggregateSignals } = await import('./signal-aggregator');
      const { signals, stats } = aggregateSignals(results);

      if (stats.criticalSignals > 0) {
        log.warn({
          totalFindings: stats.totalFindings,
          aggregatedSignals: stats.aggregatedSignals,
          criticalSignals: stats.criticalSignals,
        }, '[runner] 聚合信号 — 发现 critical 信号，准备路由专家');
      } else if (signals.length > 0) {
        log.info({ signals: signals.length, critical: 0 }, '[runner] 聚合完成 — 无 critical 信号');
      }

      // ═══ 接线: 信号 → 专家 (复用 Track A 的 ExpertDispatcher) ═══
      const criticalOrWarning = signals.filter(s => s.severity === 'critical' || s.severity === 'warning');
      if (criticalOrWarning.length > 0) {
        await this.dispatchSignalsToExperts(criticalOrWarning);
      }
    } catch (err: unknown) {
      log.error({ err }, '[runner] 信号聚合失败');
    }
  }

  /**
   * 将聚合信号转换为 Evidence，调用 ExpertDispatcher 启动专家推理。
   * 铁律 31: 专家不可用时降级 (log.error + degraded)，不阻断哨兵调度。
   */
  private async dispatchSignalsToExperts(
    signals: Array<{ id: string; severity: string; title: string; sources: Array<any>; entities: string[]; recommendedExperts: string[] }>,
  ): Promise<void> {
    const { getGlobalExpertDispatcher } = await import('../l3/expert-dispatcher');
    const dispatcher = getGlobalExpertDispatcher();

    if (!dispatcher) {
      log.warn('[runner] ExpertDispatcher 未初始化 — 信号无法路由专家（非阻断）');
      return;
    }

    const VALID_EXPERTS = new Set(['strategy', 'org', 'finance', 'tech', 'marketing', 'action', 'business_model']);

    for (const signal of signals) {
      // 手册 §19.1: 优先用预定义路由表，fallback 到信号自带的 recommendedExperts
      const evidenceItems = signal.sources.map((src: any, i: number) => ({
        id: 'sentinel-' + signal.id + '-' + i,
        source: 'diagnosis' as const,
        sourceId: src.sentinelId,
        type: 'sentinel-' + src.sentinelId,
        content: '[' + src.finding.severity + '] ' + src.finding.title + ': ' + src.finding.description,
        confidence: 0.7,
        collectedAt: src.finding.detectedAt,
        orgId: signal.entities[0] || 'default',
        sessionId: 'sentinel-' + signal.id,
      }));

      // 查找路由表匹配的专家
      const sourceSentinelId = signal.sources[0]?.sentinelId || '';
      const route = findSignalRoute(sourceSentinelId);
      const routedExperts = route?.experts || signal.recommendedExperts;

      // 交叉验证: 信号严重度 >= 路由阈值时，激活相关专家并行推理
      const severityRank = { info: 0, warning: 1, critical: 2, emergency: 3 };
      const thresholdRank = { medium: 1, high: 2, emergency: 3 };
      const shouldCrossValidate = (severityRank[signal.severity as keyof typeof severityRank] || 0)
        >= (thresholdRank[route?.crossValidateAt as keyof typeof thresholdRank] || 2);
      const targetExperts = shouldCrossValidate
        ? [...new Set([...routedExperts, ...signal.recommendedExperts])]
        : routedExperts;

      for (const rec of targetExperts) {
        const expertType = VALID_EXPERTS.has(rec) ? rec : null;
        if (!expertType) continue;

        try {
          log.info({ signal: signal.id, expert: expertType, evidenceCount: evidenceItems.length, crossValidate: shouldCrossValidate },
            '[runner] 信号路由专家 → 启动推理');
          const report = await dispatcher.runExpert(
            expertType as 'strategy' | 'org' | 'finance' | 'tech' | 'marketing' | 'action',
            evidenceItems as unknown as Evidence[],
          );
          if (report) {
            log.info({ signalId: signal.id, expert: expertType }, '[runner] 专家诊断完成');
            this.storeExpertReport(signal.id, expertType, report, signal.severity);
          }
        } catch (expertErr: unknown) {
          log.error({ signalId: signal.id, expert: expertType, err: (expertErr as Error)?.message },
            '[runner] 专家调用失败 — 降级继续（不阻断其他信号）');
        }
      }
    }
  }

  /** 存储专家报告（内存，供 API 查询） */
  private expertReports: Array<{ signalId: string; expertType: string; report: unknown; storedAt: string }> = [];

  private storeExpertReport(signalId: string, expertType: string, report: unknown, severity?: string): void {
    this.expertReports.push({ signalId, expertType, report, storedAt: new Date().toISOString() });
    if (this.expertReports.length > 50) this.expertReports.shift();

    // L3 闭环: critical 信号自动创建工单
    if (severity === 'critical') {
      try {
        const ticketId = `ticket-${signalId}-${expertType}`;
        const r = report as Record<string, unknown>;
        (this.db as { prepare(sql: string): { run(...args: unknown[]): void } }).prepare(
          `INSERT OR REPLACE INTO sentinel_tickets (id, signal_id, severity, expert_type, diagnosis, suggested_actions, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'open', datetime('now'))`
        ).run(
          ticketId, signalId, severity, expertType,
          JSON.stringify(r),
          Array.isArray(r?.suggestedActions) ? (r.suggestedActions as string[]).join('; ') : null
        );
        log.info({ ticketId, signalId, expertType }, '[runner] 工单已创建');
      } catch (err) { log.warn({ err }, '[runner] 工单创建失败 (非阻断)'); }
    }
  }

  /** 获取专家报告 (供 API 查询) */
  getExpertReports(): Array<{ signalId: string; expertType: string; report: unknown; storedAt: string }> {
    return this.expertReports;
  }

  /** 获取最近哨兵运行记录 (供外部 API 查询) */
  getRecentResults(): Map<string, SentinelRunRecord[]> {
    return this.records;
  }

  // ═══ Private ═══

  private scheduleSentinel(sentinel: Sentinel, cron: string): void {
    const cronJobId = this.scheduler.schedule(
      `Sentinel: ${sentinel.config.name}`,
      cron,
      async () => {
        await this.executeSentinel(sentinel);
      },
    );
    this.cronJobIds.set(sentinel.config.id, cronJobId);

    log.info({ sentinelId: sentinel.config.id, cron }, '[runner] 哨兵已调度');
  }

  private async executeSentinel(sentinel: Sentinel): Promise<SentinelCheckResult> {
    const startTime = Date.now();
    try {
      // 构造上下文 — 哨兵通过 context.db 访问数据库
      const ctx = {
        db: this.db,
        now: new Date(),
        registry: getSentinelRegistry(),
      };

      const result = await sentinel.check(ctx);
      const duration = Date.now() - startTime;
      result.durationMs = duration;

      // 记录运行
      const record: SentinelRunRecord = {
        sentinelId: sentinel.config.id,
        sentinelName: sentinel.config.name,
        result,
        cronJobId: this.cronJobIds.get(sentinel.config.id) || '',
      };

      const history = this.records.get(sentinel.config.id) || [];
      history.push(record);
      // 只保留最近 50 条记录
      if (history.length > 50) history.shift();
      this.records.set(sentinel.config.id, history);
      this.totalRuns++;

      // 记录发现
      // 基线记录 + 对比 (B2)
      try {
        const baselineStore = getBaselineStore();
        baselineStore.record(sentinel.config.id, result.findings);
        const comparison = baselineStore.compare(sentinel.config.id, result.findings);
        if (comparison.deviation.findingCountRatio > 2 && comparison.baseline.baselineReady) {
          log.warn({
            sentinelId: sentinel.config.id,
            ratio: comparison.deviation.findingCountRatio.toFixed(1),
            baseline: comparison.baseline.avgFindingCount.toFixed(1),
            current: comparison.current.findingCount,
          }, '[runner] 基线偏离 — finding 数量异常');
        }
      } catch (baselineErr: any) {
        log.debug({ err: baselineErr.message }, '[runner] 基线记录失败 (非阻断)');
      }

      if (result.findings.length > 0) {
        const critical = result.findings.filter(f => f.severity === 'critical').length;
        const warning = result.findings.filter(f => f.severity === 'warning').length;
        log.warn({
          sentinelId: sentinel.config.id,
          total: result.findings.length,
          critical,
          warning,
          durationMs: duration,
        }, `[runner] 哨兵发现: ${result.findings.length} 条 (${critical} critical, ${warning} warning)`);
      }

      if (!result.ok) {
        log.error({
          sentinelId: sentinel.config.id,
          error: result.error,
          durationMs: duration,
        }, '[runner] 哨兵执行失败');
      }

      return result;
    } catch (err) {
      const duration = Date.now() - startTime;
      log.error({ sentinelId: sentinel.config.id, err, durationMs: duration }, '[runner] 哨兵异常 (未捕获)');

      return {
        sentinelId: sentinel.config.id,
        ok: false,
        findings: [],
        durationMs: duration,
        checkedAt: new Date().toISOString(),
        error: (err as Error).message || '未知错误',
        degraded: true,
      };
    }
  }
}

// ═══ Global Singleton ═══

let _globalRunner: SentinelRunner | null = null;

export function getGlobalSentinelRunner(): SentinelRunner | null {
  return _globalRunner;
}

export function setGlobalSentinelRunner(runner: SentinelRunner | null): void {
  _globalRunner = runner;
}
