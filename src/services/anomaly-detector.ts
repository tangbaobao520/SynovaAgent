/**
 * src/services/anomaly-detector.ts — 防破坏异常检测 (D243)
 *
 * 基线自适应阈值: 过去30天操作量均值+标准差
 * 破坏场景: Action 3x / Goal 4x / Export 1h多次
 */
import { createLogger } from '@synova/logger';

const log = createLogger('services/anomaly-detector');

// ═══ Types ═══

export interface BaselineStats {
  mean: number;
  stddev: number;
  sampleCount: number;
}

export interface CheckResult {
  anomaly: boolean;
  severity: 'info' | 'warning' | 'critical';
  ratio: number;
  reason?: string;
  suggestFreeze: boolean;
}

export type OperationType = 'action_create' | 'goal_change' | 'data_export';

// ═══ BaselineCalculator ═══

export function calculateBaseline(history: number[]): BaselineStats {
  if (history.length === 0) return { mean: 0, stddev: 0, sampleCount: 0 };
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const variance = history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
  return { mean, stddev: Math.sqrt(variance), sampleCount: history.length };
}

// ═══ Thresholds ═══

const THRESHOLDS: Record<OperationType, { freezeMultiplier: number; warnMultiplier: number }> = {
  action_create: { freezeMultiplier: 3, warnMultiplier: 2 },
  goal_change: { freezeMultiplier: 4, warnMultiplier: 2.5 },
  data_export: { freezeMultiplier: 3, warnMultiplier: 2 },
};

// ═══ AnomalyDetector ═══

export class AnomalyDetector {
  /**
   * 检测操作量是否异常。
   *
   * @param operation  - 操作类型
   * @param currentCount - 当前窗口内的操作次数
   * @param baseline   - 基线统计
   * @returns 检测结果
   */
  check(operation: OperationType, currentCount: number, baseline: BaselineStats): CheckResult {
    if (baseline.sampleCount === 0 || baseline.mean === 0) {
      return { anomaly: false, severity: 'info', ratio: 0, suggestFreeze: false };
    }

    const threshold = THRESHOLDS[operation];
    const ratio = currentCount / baseline.mean;

    if (ratio >= threshold.freezeMultiplier) {
      return {
        anomaly: true, severity: 'critical', ratio,
        reason: `${operation}: ${ratio.toFixed(1)}x 超过冻结阈值 ${threshold.freezeMultiplier}x`,
        suggestFreeze: true,
      };
    }
    if (ratio >= threshold.warnMultiplier) {
      return {
        anomaly: true, severity: 'warning', ratio,
        reason: `${operation}: ${ratio.toFixed(1)}x 超过警告阈值 ${threshold.warnMultiplier}x`,
        suggestFreeze: false,
      };
    }
    return { anomaly: false, severity: 'info', ratio, suggestFreeze: false };
  }
}

// ═══ SabotageHandler ═══

export interface UserStoreLike {
  updateUser(userId: string, props: Record<string, unknown>): void;
  getById(userId: string): Record<string, unknown> | null;
}

export class SabotageHandler {
  private userStore: UserStoreLike;
  private alerts: Array<{ userId: string; reason: string; frozenAt: string }> = [];

  constructor(userStore: UserStoreLike) {
    this.userStore = userStore;
  }

  freezeUser(userId: string, reason: string): void {
    try {
      this.userStore.updateUser(userId, { status: 'disabled' });
      this.alerts.push({ userId, reason, frozenAt: new Date().toISOString() });
      log.warn({ userId, reason }, '用户已冻结 — 防破坏机制');
    } catch (err) {
      log.warn({ err, userId }, '冻结用户失败 — 降级');
    }
  }

  unfreezeUser(userId: string): void {
    try {
      this.userStore.updateUser(userId, { status: 'active' });
      log.info({ userId }, '用户已解冻');
    } catch (err) {
      log.warn({ err, userId }, '解冻用户失败 — 降级');
    }
  }

  getAlerts(): Array<{ userId: string; reason: string; frozenAt: string }> {
    return [...this.alerts];
  }
}
