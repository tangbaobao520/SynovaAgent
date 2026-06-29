/**
 * session-learner.ts — 会话内学习引擎 (L0 进化层｜第一层)
 *
 * 纯内存，不持久化。仅在当前诊断会话中生效。
 * 用户对假设的否定/确认 → 调整诊断引擎的权重偏好。
 *
 * 三层进化结构:
 *   第一层: 会话内 (SessionLearner) — 实时, 纯内存, 会话结束即丢弃
 *   第二层: 组织自适应 (OrgAdapter) — 每次诊断后, 持久化到 AgentMemoryStore
 *   第三层: 全局进化 (GlobalAnalyzer) — 每月, 跨组织聚合
 *
 * 铁律 46: 不引用 engine-core。仅依赖 @synova/logger + 内置类型。
 */

import { createLogger } from '@synova/logger';

const log = createLogger('evolution/session-learner');

// ═══ 类型 ═══

export interface HypothesisFeedback {
  /** 假设/哨兵 ID */
  hypothesisId: string;
  /** 用户行为 */
  action: 'negated' | 'confirmed' | 'focused';
  /** 用户提供的理由（供后续第二层做持久化分析） */
  reason?: string;
}

export interface WeightEntry {
  hypothesisId: string;
  /** 当前权重 (-1.0 ~ 1.0). 负值 = 被否定过; 正值 = 被确认过 */
  weight: number;
  /** 调整次数 */
  adjustments: number;
  /** 最后一次调整的理由 */
  lastReason: string;
}

// ═══ SessionLearner ═══

export class SessionLearner {
  /** { hypothesisId → WeightEntry } */
  private weights = new Map<string, WeightEntry>();
  /** 会话是否活跃 */
  private active = true;

  /**
   * 用户否定了一个假设。
   * 降低该假设置信度，同时可能影响相关假设的追问优先级。
   */
  onHypothesisNegated(hypothesisId: string, reason?: string): void {
    if (!this.active) return;

    const existing = this.weights.get(hypothesisId);
    const currentWeight = existing?.weight ?? 0;

    // 每次否定 -0.2，最低 -1.0
    const newWeight = Math.max(-1.0, currentWeight - 0.2);
    this.weights.set(hypothesisId, {
      hypothesisId,
      weight: newWeight,
      adjustments: (existing?.adjustments ?? 0) + 1,
      lastReason: reason || '用户否定假设',
    });

    log.debug({ hypothesisId, from: currentWeight, to: newWeight, reason }, '假设被否定 — 权重下调');
  }

  /**
   * 用户确认了一个假设。
   * 提升该假设及相关证据的权重。
   */
  onHypothesisConfirmed(hypothesisId: string, reason?: string): void {
    if (!this.active) return;

    const existing = this.weights.get(hypothesisId);
    const currentWeight = existing?.weight ?? 0;

    // 每次确认 +0.3，最高 1.0
    const newWeight = Math.min(1.0, currentWeight + 0.3);
    this.weights.set(hypothesisId, {
      hypothesisId,
      weight: newWeight,
      adjustments: (existing?.adjustments ?? 0) + 1,
      lastReason: reason || '用户确认假设',
    });

    log.debug({ hypothesisId, from: currentWeight, to: newWeight }, '假设被确认 — 权重上调');
  }

  /**
   * 用户对某维度表现出强烈关注（反复追问/表达情绪）。
   * 提高该维度的报告优先级。
   */
  onDimensionFocused(dimensionId: string): void {
    if (!this.active) return;

    const key = `dim_${dimensionId}`;
    const existing = this.weights.get(key);
    const currentWeight = existing?.weight ?? 0;

    const newWeight = Math.min(1.0, currentWeight + 0.1);
    this.weights.set(key, {
      hypothesisId: key,
      weight: newWeight,
      adjustments: (existing?.adjustments ?? 0) + 1,
      lastReason: '用户持续关注该维度',
    });
  }

  /**
   * 获取当前所有权重快照。
   * 诊断引擎在生成假设时调用此方法，决定假设的优先级。
   */
  getWeights(): WeightEntry[] {
    return Array.from(this.weights.values())
      .sort((a, b) => b.weight - a.weight); // 高权重优先
  }

  /**
   * 获取指定 hypothesis 的权重（若无记录则返回 0）。
   */
  getWeight(hypothesisId: string): number {
    return this.weights.get(hypothesisId)?.weight ?? 0;
  }

  /**
   * 获取权重为负（被否定过）的假设列表。
   * 诊断引擎在生成新假设时应避免这些方向。
   */
  getNegatedHypotheses(): WeightEntry[] {
    return Array.from(this.weights.values())
      .filter(w => w.weight < 0)
      .sort((a, b) => a.weight - b.weight); // 最被否定的优先
  }

  /**
   * 获取权重为正（被确认过）的假设列表。
   * 诊断引擎应加深这些方向的追问。
   */
  getConfirmedHypotheses(): WeightEntry[] {
    return Array.from(this.weights.values())
      .filter(w => w.weight > 0)
      .sort((a, b) => b.weight - a.weight);
  }

  /**
   * 重置所有权重（新会话开始时调用）。
   */
  reset(): void {
    this.weights.clear();
    this.active = true;
    log.debug('会话内学习已重置');
  }

  /**
   * 标记会话结束。
   * 之后的所有调用将被忽略（防止跨会话污染）。
   */
  endSession(): void {
    this.active = false;
    log.debug({ finalWeights: this.weights.size }, '会话内学习已结束');
  }

  /**
   * 会话是否仍活跃。
   */
  isActive(): boolean {
    return this.active;
  }
}
