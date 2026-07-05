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
import { EscalationEngine, type EscalationRule } from '../services/escalation-engine';
import { createLogger } from '@synova/logger';

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

interface SignalRouteResult {
  experts: string[];
  crossValidateAt: string;
  auxiliaryExperts?: string[];
}

/** 根据哨兵 ID 查找路由规则：优先级 sentinel.config.route > 维度默认映射 */
function findSignalRoute(sentinelId: string): SignalRouteResult | undefined {
  const registry = getSentinelRegistry();
  const sentinel = registry.get(sentinelId);
  if (!sentinel) return undefined;

  // 1. 哨兵自身配置了 route（无限扩展：加新哨兵时在 config 中声明路由）
  const route = (sentinel.config as unknown as Record<string, unknown>).route as { experts?: string[]; crossValidateAt?: string } | undefined;
  if (route?.experts?.length) return { experts: route.experts, crossValidateAt: route.crossValidateAt || 'high' };

  // 2. 从 layer + priority 推导默认路由（技术方案 §7）
  // 优先使用 manifest 中的 layer 字段，fallback 到旧 category
  const config = sentinel.config as unknown as Record<string, unknown>;
  const layer = (config.layer as string) || sentinel.config.category;

  const LAYER_EXPERTS: Record<string, string[]> = {
    environment: ['strategy'],
    capital: ['finance'],
    interface: ['strategy'],
    technology: ['tech'],
    alignment: ['org'],
    internal: ['org'],
    // layer fallback: 旧 category 兼容
    risk: ['org', 'finance'],
    capability: ['org'],
    collaboration: ['org', 'tech'],
    health: ['tech'],
    'data-quality': ['tech'],
    strategy: ['strategy'],
  };
  const experts = LAYER_EXPERTS[layer] || ['org'];

  // 根据哨兵 ID 细化 interface 层路由
  if (layer === 'interface' || layer === 'interface') {
    const sid = sentinel.config.id.toLowerCase();
    if (sid.includes('value-capture') || sid.includes('unit-economics') || sid.includes('ltv')) {
      return { experts: ['finance'], crossValidateAt: 'high' };
    }
    if (sid.includes('niche') || sid.includes('moat') || sid.includes('competitive')) {
      return { experts: ['strategy'], crossValidateAt: 'high' };
    }
    if (sid.includes('network') || sid.includes('transaction-cost') || sid.includes('power')) {
      return { experts: ['org', 'finance'], crossValidateAt: 'high' };
    }
    if (sid.includes('business') || sid.includes('make-or-buy') || sid.includes('time')) {
      return { experts: ['business_model', 'strategy'], crossValidateAt: 'high' };
    }
  }

  const crossValidateAt = sentinel.config.priority === 'P0' ? 'emergency' : sentinel.config.priority === 'P1' ? 'high' : 'medium';
  // 读取 auxiliaryExperts（manifest 声明的辅助专家）
  const auxiliaryExperts = (config.auxiliaryExperts as string[]) || undefined;
  return { experts, crossValidateAt, auxiliaryExperts };
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
  /** G3: 升级链引擎 — 对接人忽略告警后自动升级到上级 */
  readonly escalationEngine = new EscalationEngine();

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
          severity TEXT NOT NULL CHECK(severity IN ('emergency','critical','warning','info')),
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

      // G3: 升级链评估 — 对每个聚合信号检查是否需升级
      for (const signal of signals) {
        try {
          // 查找该 signal 的忽略记录（简化: 首次评估无历史，后续由外部触发 recordIgnore）
          const decision = this.escalationEngine.evaluate({
            alertId: signal.id,
            sentinelId: signal.sources?.[0]?.sentinelId ?? signal.id,
            severity: signal.severity === 'critical' ? 'critical' as const
              : signal.severity === 'warning' ? 'warning' as const
              : 'info' as const,
            firstIgnoredAt: null,
            cumulativeIgnores: 0,
            dataImproved: false,
          });
          if (decision?.shouldEscalate) {
            log.warn({
              signalId: signal.id,
              escalateTo: decision.escalateTo,
              reason: decision.reason,
            }, '[runner] 升级链触发 — 需升级到上级');
          }
        } catch (err: unknown) {
          log.warn({ err, signalId: signal.id }, '[runner] 升级链评估失败 — 非阻断');
        }
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

    const { getExpertRegistry } = await import('../l3/expert-registry');
    const VALID_EXPERTS = new Set(getExpertRegistry().listTypes());

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
      // 合并 auxiliaryExperts（manifest 声明的辅助专家）到目标专家列表
      const auxExperts = route?.auxiliaryExperts || [];
      const targetExperts = shouldCrossValidate
        ? [...new Set([...routedExperts, ...auxExperts, ...signal.recommendedExperts])]
        : [...new Set([...routedExperts, ...auxExperts])];

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

    // L3 闭环: emergency/critical 信号自动创建工单
    if (severity === 'emergency' || severity === 'critical') {
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

  // ═══ Phase P1-1: L3WriteAPI (L0 进化层接口) ═══

  /**
   * 返回 L3WriteAPI 实现，供 L0 进化层调用。
   * 每个方法独立 try/catch，降级安全。
   */
  getL0API(): import('@synova/evolution').L3WriteAPI {
    const self = this;
    return {
      async closeTicket(orgId: string, sentinelId: string): Promise<number> {
        try {
          const result = (self.db as { prepare(sql: string): { run(...args: unknown[]): { changes: number } } }).prepare(
            `UPDATE sentinel_tickets SET status = 'resolved', resolved_at = datetime('now')
             WHERE signal_id LIKE ? AND status = 'open'`
          ).run(`%${sentinelId}%`);
          if (result.changes > 0) {
            log.info({ orgId, sentinelId, closed: result.changes }, '[L3WriteAPI] 工单已关闭');
          }
          return result.changes;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg, orgId, sentinelId }, '[L3WriteAPI] closeTicket 失败 — degraded');
          return 0;
        }
      },

      async getThreshold(orgId: string, sentinelId: string): Promise<{ warning: number; critical: number } | null> {
        try {
          // 1. 先查 AgentMemoryStore 中的自定义阈值
          const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
          const { getDatabase } = await import('../init/engine-context');
          const db = getDatabase();
          const memStore = getAgentMemoryStore(db);
          const stored = memStore.recall(orgId, `threshold_${sentinelId}`);
          if (stored) {
            const parsed = JSON.parse(stored.value) as { newThreshold?: { warning: number; critical: number } };
            if (parsed.newThreshold) return parsed.newThreshold;
          }
        } catch { /* degraded — fallback to manifest */ }

        // 2. Fallback 到 SentinelManifest 默认阈值
        try {
          const { loadSentinels } = await import('./sentinel-loader');
          const { sentinels } = loadSentinels();
          const sentinel = sentinels.find((s: { manifest: { name: string } }) => s.manifest.name === sentinelId || s.manifest.name === sentinelId.replace('sentinel-', ''));
          if (sentinel?.manifest.thresholds) {
            const key = Object.keys(sentinel.manifest.thresholds)[0];
            if (key) return sentinel.manifest.thresholds[key];
          }
        } catch { /* degraded */ }

        // 3. 通用默认值
        return { warning: 0.5, critical: 1.0 };
      },

      async updateThreshold(orgId: string, sentinelId: string, threshold: { warning?: number; critical?: number }): Promise<void> {
        try {
          const existing = await this.getThreshold(orgId, sentinelId);
          const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
          const { getDatabase } = await import('../init/engine-context');
          const db = getDatabase();
          const memStore = getAgentMemoryStore(db);
          memStore.remember({
            orgId,
            key: `threshold_${sentinelId}`,
            value: JSON.stringify({
              sentinelId,
              newThreshold: {
                warning: threshold.warning ?? existing?.warning ?? 0.5,
                critical: threshold.critical ?? existing?.critical ?? 1.0,
              },
              adjustedAt: new Date().toISOString(),
            }),
            type: 'enterprise_fact',
            confidence: 0.8,
            source: 'l3_write_api',
            tags: ['threshold_adjustment', sentinelId],
            expiresAt: null,
          });
          log.info({ orgId, sentinelId, threshold }, '[L3WriteAPI] 阈值已更新');
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg, orgId, sentinelId }, '[L3WriteAPI] updateThreshold 失败 — degraded');
        }
      },

      async getSentinelStats(industry: string): Promise<import('@synova/evolution').PerSentinelStats[]> {
        try {
          const { getAgentMemoryStore } = await import('../l4/agent-memory-store');
          const { getDatabase } = await import('../init/engine-context');
          const db = getDatabase();
          const memStore = getAgentMemoryStore(db);

          // 按 industry:{name} 标签查询所有组织的哨兵得分
          const memories = memStore.list({
            orgId: 'global',
            tags: [`industry:${industry}`],
            limit: 200,
          });

          // 聚合: 按 sentinelId 分组统计
          const sentinelMap = new Map<string, number[]>();
          for (const mem of memories) {
            try {
              const data = JSON.parse(mem.value) as { sentinelId?: string; score?: number };
              if (data.sentinelId && typeof data.score === 'number') {
                const list = sentinelMap.get(data.sentinelId) || [];
                list.push(data.score);
                sentinelMap.set(data.sentinelId, list);
              }
            } catch { /* 跳过损坏数据 */ }
          }

          const stats: import('@synova/evolution').PerSentinelStats[] = [];
          for (const [sentinelId, values] of sentinelMap) {
            const sorted = [...values].sort((a, b) => a - b);
            const n = sorted.length;
            stats.push({
              sentinelId,
              name: sentinelId,
              orgCount: n,
              values: sorted,
              median: n > 0 ? sorted[Math.floor(n / 2)] : 0,
              p25: n > 0 ? sorted[Math.floor(n * 0.25)] : 0,
              p75: n > 0 ? sorted[Math.floor(n * 0.75)] : 0,
            });
          }

          return stats;
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.warn({ err: msg, industry }, '[L3WriteAPI] getSentinelStats 失败 — degraded');
          return [];
        }
      },
    };
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
      // V4.2.9: 构造上下文 — 包装 raw SQLite 为 GraphStore 供哨兵 queryNodes()
      let graphCtx: Record<string, unknown>;
      if (typeof this.db === 'object' && this.db !== null && 'queryNodes' in this.db) {
        graphCtx = this.db as Record<string, unknown>;
      } else {
        try {
          const { createSynovaGraphStore } = await import('@synova/graph-store');
          graphCtx = createSynovaGraphStore(this.db as import('@synova/graph-store').SqliteDb) as unknown as Record<string, unknown>;
        } catch { graphCtx = this.db as Record<string, unknown>; } // degraded
      }
      const ctx = {
        db: graphCtx,
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
