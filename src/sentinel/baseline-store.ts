/**
 * sentinel/baseline-store.ts — 基线管理系统 (L5-backed, SQLite 持久化)
 * @state: real — 2026-06-18 持久化升级
 *
 * 手册 §8.1/§10.3: 基线管理是"第一个发现"的前提。
 *
 * 基线策略:
 *   - 前 N 次运行 (默认 3) → 建立基线 (不告警)
 *   - 基线就绪后 → 对比基线，偏离 > 阈值 → 升级 finding 严重度
 *   - 阈值从 synova.json 读取，支持 FDE 按客户调整
 */

import type { SentinelFinding } from './types';
import { createLogger } from '../logger';

const log = createLogger('sentinel/baseline-store');

// ═══ Types ═══

export interface BaselineRecord {
  sentinelId: string;
  findingCount: number;
  criticalCount: number;
  warningCount: number;
  checkedAt: string;
}

export interface BaselineStats {
  sentinelId: string;
  totalRuns: number;
  avgFindingCount: number;
  avgCriticalCount: number;
  avgWarningCount: number;
  lastRunAt: string | null;
  /** 基线是否已建立 (≥3 runs) */
  baselineReady: boolean;
}

export interface BaselineComparison {
  sentinelId: string;
  current: BaselineRecord;
  baseline: BaselineStats;
  deviation: {
    findingCountRatio: number;     // current / avg
    criticalCountDelta: number;    // current - avg
    warningCountDelta: number;     // current - avg
  };
  escalatedFindings: SentinelFinding[];  // 升级后的 findings
}

// ═══ Config ═══

export interface BaselineConfig {
  /** 建立基线所需的最小运行次数 (默认 3) */
  baselineMinRuns: number;
  /** finding 数量比基线均值 > 此值 → warning (默认 2.0) */
  findingCountRatioWarning: number;
  /** finding 数量比基线均值 > 此值 → critical (默认 3.0) */
  findingCountRatioCritical: number;
  /** 单 sentinel 覆盖配置 (sentinelId → 阈值覆写) */
  perSentinel?: Record<string, { warningRatio?: number; criticalRatio?: number; minRuns?: number }>;
}

export const DEFAULT_BASELINE_CONFIG: BaselineConfig = {
  baselineMinRuns: 3,
  findingCountRatioWarning: 2.0,
  findingCountRatioCritical: 3.0,
};

// ═══ BaselineStore ═══

export class BaselineStore {
  private records = new Map<string, BaselineRecord[]>();
  private config: BaselineConfig;
  private db: { exec(sql: string): void; prepare(sql: string): { run(...args: unknown[]): unknown; get(...args: unknown[]): unknown | undefined; all(...args: unknown[]): unknown[] } } | null = null;

  constructor(config?: Partial<BaselineConfig>) {
    this.config = { ...DEFAULT_BASELINE_CONFIG, ...config };
  }

  /**
   * 注入 SQLite 数据库 — 持久化基线数据。
   * 调用后自动从 DB 加载历史记录。
   */
  setDatabase(db: BaselineStore['db']): void {
    this.db = db;
    this.initSchema();
    this.loadFromDatabase();
  }

  /** 更新阈值配置 (支持运行时热加载) */
  updateConfig(config: Partial<BaselineConfig>): void {
    this.config = { ...this.config, ...config };
    log.info({ ...this.config }, '[baseline] 阈值配置已更新');
  }

  /** 获取当前配置 */
  getConfig(): BaselineConfig {
    return { ...this.config };
  }

  /** 记录一次哨兵运行结果 (内存 + SQLite 双写) */
  record(sentinelId: string, findings: SentinelFinding[], now: Date = new Date()): void {
    const history = this.records.get(sentinelId) || [];
    const record: BaselineRecord = {
      sentinelId,
      findingCount: findings.length,
      criticalCount: findings.filter(f => f.severity === 'critical').length,
      warningCount: findings.filter(f => f.severity === 'warning').length,
      checkedAt: now.toISOString(),
    };
    history.push(record);
    if (history.length > 30) history.shift();
    this.records.set(sentinelId, history);

    // SQLite 持久化
    if (this.db) {
      try {
        this.db.prepare(
          `INSERT INTO sentinel_baselines (sentinel_id, finding_count, critical_count, warning_count, checked_at)
           VALUES (?, ?, ?, ?, ?)`
        ).run(sentinelId, record.findingCount, record.criticalCount, record.warningCount, record.checkedAt);
      } catch (err: any) { log.debug({ err: err.message }, '[baseline] 持久化失败 (非阻断)'); }
    }
  }

  /** 获取哨兵基线统计 */
  getBaseline(sentinelId: string): BaselineStats {
    const history = this.records.get(sentinelId) || [];
    if (history.length === 0) {
      return { sentinelId, totalRuns: 0, avgFindingCount: 0, avgCriticalCount: 0, avgWarningCount: 0, lastRunAt: null, baselineReady: false };
    }
    const avgFindingCount = history.reduce((s, r) => s + r.findingCount, 0) / history.length;
    const avgCriticalCount = history.reduce((s, r) => s + r.criticalCount, 0) / history.length;
    const avgWarningCount = history.reduce((s, r) => s + r.warningCount, 0) / history.length;
    return {
      sentinelId, totalRuns: history.length,
      avgFindingCount, avgCriticalCount, avgWarningCount,
      lastRunAt: history[history.length - 1].checkedAt,
      baselineReady: history.length >= 3,
    };
  }

  /** 对比当前结果与基线 (使用可配置阈值) */
  compare(sentinelId: string, findings: SentinelFinding[], now: Date = new Date()): BaselineComparison {
    const baseline = this.getBaseline(sentinelId);
    const currentCount = findings.length;
    const currentCritical = findings.filter(f => f.severity === 'critical').length;
    const currentWarning = findings.filter(f => f.severity === 'warning').length;

    const findingCountRatio = baseline.avgFindingCount > 0 ? currentCount / baseline.avgFindingCount : 1;
    const criticalCountDelta = currentCritical - baseline.avgCriticalCount;
    const warningCountDelta = currentWarning - baseline.avgWarningCount;

    // 读取 per-sentinel 覆写阈值
    const perSentinel = this.config.perSentinel?.[sentinelId];
    const warnRatio = perSentinel?.warningRatio ?? this.config.findingCountRatioWarning;
    const critRatio = perSentinel?.criticalRatio ?? this.config.findingCountRatioCritical;
    const minRuns = perSentinel?.minRuns ?? this.config.baselineMinRuns;

    // 基线未就绪 → 不升级
    const isReady = baseline.totalRuns >= minRuns;
    const escalatedFindings = !isReady ? findings : findings.map(f => {
      if (findingCountRatio > critRatio) {
        return { ...f, severity: 'critical' as const };
      }
      if (findingCountRatio > warnRatio && f.severity === 'warning') {
        return { ...f, severity: 'critical' as const };
      }
      return f;
    });

    if (findingCountRatio > warnRatio && isReady) {
      log.warn({ sentinelId, ratio: findingCountRatio.toFixed(1), baseline: baseline.avgFindingCount.toFixed(1), current: currentCount, warnRatio, critRatio },
        `[baseline] ${sentinelId} finding 数量异常 — ${findingCountRatio.toFixed(1)}x 基线均值 (阈值 ${warnRatio}x)`);
    }

    return {
      sentinelId,
      current: { sentinelId, findingCount: currentCount, criticalCount: currentCritical, warningCount: currentWarning, checkedAt: now.toISOString() },
      baseline: { ...baseline, baselineReady: isReady },
      deviation: { findingCountRatio, criticalCountDelta, warningCountDelta },
      escalatedFindings,
    };
  }

  /** 获取所有哨兵的基线概览 */
  getAllStats(): BaselineStats[] {
    return [...this.records.keys()].map(id => this.getBaseline(id));
  }

  // ═══ Private: SQLite 持久化 ═══

  private initSchema(): void {
    if (!this.db) return;
    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sentinel_baselines (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sentinel_id TEXT NOT NULL,
          finding_count INTEGER NOT NULL DEFAULT 0,
          critical_count INTEGER NOT NULL DEFAULT 0,
          warning_count INTEGER NOT NULL DEFAULT 0,
          checked_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sentinel_baselines_sid ON sentinel_baselines(sentinel_id, checked_at);
      `);
    } catch (err: any) { log.debug({ err: err.message }, '[baseline] schema 初始化失败 (可能已存在)'); }
  }

  private loadFromDatabase(): void {
    if (!this.db) return;
    try {
      const rows = this.db.prepare(
        `SELECT sentinel_id AS sentinelId, finding_count AS findingCount, critical_count AS criticalCount,
                warning_count AS warningCount, checked_at AS checkedAt
         FROM sentinel_baselines ORDER BY sentinel_id, checked_at ASC`
      ).all() as BaselineRecord[];
      if (!rows || rows.length === 0) return;

      let count = 0;
      for (const row of rows) {
        const history = this.records.get(row.sentinelId) || [];
        history.push(row);
        if (history.length > 30) history.shift();
        this.records.set(row.sentinelId, history);
        count++;
      }
      log.info({ recordsLoaded: count, sentinels: this.records.size }, '[baseline] 历史基线已从 SQLite 加载');
    } catch (err: any) { log.warn({ err: err.message }, '[baseline] 加载历史基线失败 — 使用空基线'); }
  }
}

// ═══ Global Singleton ═══

let _globalBaseline: BaselineStore | null = null;

export function getBaselineStore(): BaselineStore {
  if (!_globalBaseline) _globalBaseline = new BaselineStore();
  return _globalBaseline;
}

export function destroyBaselineStore(): void {
  _globalBaseline = null;
}
