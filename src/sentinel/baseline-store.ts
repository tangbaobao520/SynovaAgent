/**
 * sentinel/baseline-store.ts — 基线管理系统 (L5-backed)
 * @state: real
 *
 * 存储哨兵历史结果 → 对比基线 → 超阈值告警。
 *
 * 手册 §8.1/§10.3: 基线管理是"第一个发现"的前提——没有基线就没有异常检测。
 *
 * 基线策略:
 *   - 前 3 次运行 → 建立基线 (不告警)
 *   - 第 4 次起 → 对比基线，偏离 > 阈值 → 升级 finding 严重度
 *   - 阈值: finding 数量变化 > 2x 基线均值 → warning
 *           finding 数量变化 > 3x 基线均值 → critical
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

// ═══ BaselineStore ═══

export class BaselineStore {
  private records = new Map<string, BaselineRecord[]>();

  /** 记录一次哨兵运行结果 */
  record(sentinelId: string, findings: SentinelFinding[], now: Date = new Date()): void {
    const history = this.records.get(sentinelId) || [];
    history.push({
      sentinelId,
      findingCount: findings.length,
      criticalCount: findings.filter(f => f.severity === 'critical').length,
      warningCount: findings.filter(f => f.severity === 'warning').length,
      checkedAt: now.toISOString(),
    });
    // 只保留最近 30 条
    if (history.length > 30) history.shift();
    this.records.set(sentinelId, history);
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

  /** 对比当前结果与基线 */
  compare(sentinelId: string, findings: SentinelFinding[], now: Date = new Date()): BaselineComparison {
    const baseline = this.getBaseline(sentinelId);
    const currentCount = findings.length;
    const currentCritical = findings.filter(f => f.severity === 'critical').length;
    const currentWarning = findings.filter(f => f.severity === 'warning').length;

    const findingCountRatio = baseline.avgFindingCount > 0 ? currentCount / baseline.avgFindingCount : 1;
    const criticalCountDelta = currentCritical - baseline.avgCriticalCount;
    const warningCountDelta = currentWarning - baseline.avgWarningCount;

    // 基线未就绪或偏离在正常范围 → 不升级
    const escalatedFindings = !baseline.baselineReady ? findings : findings.map(f => {
      if (findingCountRatio > 3) {
        return { ...f, severity: 'critical' as const };
      }
      if (findingCountRatio > 2 && f.severity === 'warning') {
        return { ...f, severity: 'critical' as const };
      }
      return f;
    });

    if (findingCountRatio > 2 && baseline.baselineReady) {
      log.warn({ sentinelId, ratio: findingCountRatio.toFixed(1), baseline: baseline.avgFindingCount.toFixed(1), current: currentCount },
        `[baseline] ${sentinelId} finding 数量异常 — ${findingCountRatio.toFixed(1)}x 基线均值`);
    }

    return {
      sentinelId,
      current: { sentinelId, findingCount: currentCount, criticalCount: currentCritical, warningCount: currentWarning, checkedAt: now.toISOString() },
      baseline,
      deviation: { findingCountRatio, criticalCountDelta, warningCountDelta },
      escalatedFindings,
    };
  }

  /** 获取所有哨兵的基线概览 */
  getAllStats(): BaselineStats[] {
    return [...this.records.keys()].map(id => this.getBaseline(id));
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
