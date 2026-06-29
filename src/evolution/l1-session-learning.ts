/**
 * evolution/l1-session-learning.ts — L1 会话内学习 (Phase 4.1b)
 *
 * 用户反馈 (说"这个诊断不准") → 实时调整 → 持久化到 AgentMemoryStore
 *
 * P1 Loop Engineering 修复: endSession() 不再丢弃调整，改为写入 SQLite。
 * 下次会话通过 AgentMemoryStore.recallEntity() 加载历史学习。
 */
import { createLogger } from '@synova/logger';
import type { AgentMemoryStore } from '../l4/agent-memory-store';

const log = createLogger('evolution/l1');

export interface SessionFeedback {
  diagnosisId: string;
  rating: number;
  inaccurateClaims: string[];
  accurateClaims: string[];
  comment?: string;
  orgId?: string;
}

export interface LearningAdjustment {
  claim: string;
  adjustment: 'boost' | 'penalize';
  magnitude: number;
  reason: string;
}

export class SessionLearningEngine {
  private adjustments = new Map<string, LearningAdjustment[]>();
  private memoryStore: AgentMemoryStore | null = null;

  /** 注入 AgentMemoryStore — 启用跨会话持久化 */
  withMemoryStore(store: AgentMemoryStore): this {
    this.memoryStore = store;
    return this;
  }

  /** Process user feedback within the current session */
  processFeedback(feedback: SessionFeedback): LearningAdjustment[] {
    const sessionAdjustments: LearningAdjustment[] = [];

    for (const claim of feedback.accurateClaims) {
      const adj: LearningAdjustment = {
        claim, adjustment: 'boost',
        magnitude: Math.min(0.3, feedback.rating * 0.05),
        reason: `用户确认: "${claim}" 准确 (评分 ${feedback.rating}/5)`,
      };
      sessionAdjustments.push(adj);
    }

    for (const claim of feedback.inaccurateClaims) {
      const adj: LearningAdjustment = {
        claim, adjustment: 'penalize',
        magnitude: Math.min(0.3, (5 - feedback.rating) * 0.05),
        reason: `用户纠正: "${claim}" 不准确 (评分 ${feedback.rating}/5)`,
      };
      sessionAdjustments.push(adj);
    }

    this.adjustments.set(feedback.diagnosisId, sessionAdjustments);
    log.info({
      diagnosisId: feedback.diagnosisId,
      rating: feedback.rating,
      adjustments: sessionAdjustments.length,
    }, 'L1: 会话反馈已处理');

    return sessionAdjustments;
  }

  /** Get adjustments for a diagnosis */
  getAdjustments(diagnosisId: string): LearningAdjustment[] {
    return this.adjustments.get(diagnosisId) || [];
  }

  /**
   * End session — P1 修复: 持久化到 AgentMemoryStore 而非丢弃。
   * 退化兼容: memoryStore 未注入时行为不变 (丢弃)。
   */
  endSession(diagnosisId: string, orgId?: string): void {
    const adjustments = this.adjustments.get(diagnosisId);
    if (!adjustments || adjustments.length === 0) {
      this.adjustments.delete(diagnosisId);
      return;
    }

    if (this.memoryStore && orgId) {
      // 持久化: 每条调整写为一条 pattern 类型记忆
      let persisted = 0;
      for (const adj of adjustments) {
        try {
          this.memoryStore.remember({
            orgId,
            key: `evolution_${diagnosisId}_${adj.claim.slice(0, 30).replace(/[^a-zA-Z0-9一-鿿]/g, '_')}`,
            value: JSON.stringify(adj),
            type: 'pattern',
            confidence: 0.7 + adj.magnitude,
            source: 'user_feedback',
            tags: ['evolution', 'l1_learning', adj.adjustment, `diag_${diagnosisId}`],
            expiresAt: null,
          });
          persisted++;
        } catch (err: unknown) {
          log.warn({ err, claim: adj.claim }, 'L1 持久化失败 — degraded');
        }
      }
      log.info({
        diagnosisId, orgId, total: adjustments.length, persisted,
      }, 'L1: 会话学习已持久化到 AgentMemoryStore');
    } else {
      log.debug({ diagnosisId, count: adjustments.length },
        'L1: 会话结束，调整已丢弃 (memoryStore 未注入)');
    }

    this.adjustments.delete(diagnosisId);
  }

  /**
   * 加载历史学习 — 从 AgentMemoryStore 检索跨会话的进化模式。
   * 返回按标签匹配的 pattern 类型记忆，按置信度降序。
   */
  loadHistoricalLearning(orgId: string): LearningAdjustment[] {
    if (!this.memoryStore) return [];

    try {
      const memories = this.memoryStore.recallEntity(orgId, 'evolution');
      const adjustments: LearningAdjustment[] = [];
      for (const mem of memories) {
        try {
          const adj = JSON.parse(mem.value) as LearningAdjustment;
          adjustments.push(adj);
        } catch { /* 跳过损坏数据 */ }
      }
      log.info({ orgId, count: adjustments.length }, 'L1: 历史学习已加载');
      return adjustments;
    } catch (err: unknown) {
      log.warn({ err, orgId }, 'L1: 历史学习加载失败 — degraded');
      return [];
    }
  }

  /** Summarize session learning (含历史) */
  summarize(diagnosisId: string): string {
    const adjustments = this.getAdjustments(diagnosisId);
    if (adjustments.length === 0) return '无会话学习记录';

    const boosts = adjustments.filter(a => a.adjustment === 'boost').length;
    const penalizes = adjustments.filter(a => a.adjustment === 'penalize').length;
    const totalMag = adjustments.reduce((s, a) => s + a.magnitude, 0);

    return `会话学习: ${boosts} 个确认, ${penalizes} 个纠正, 总调整量=${totalMag.toFixed(2)}`;
  }
}
