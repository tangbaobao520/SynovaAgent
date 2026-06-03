/**
 * evolution/l1-session-learning.ts — L1 会话内学习 (Phase 4.1b)
 *
 * 用户反馈 (说"这个诊断不准") → 实时调整 → 会话结束丢弃
 */
import { createLogger } from '../logger';

const log = createLogger('evolution/l1');

export interface SessionFeedback {
  diagnosisId: string;
  rating: number;
  inaccurateClaims: string[];
  accurateClaims: string[];
  comment?: string;
}

export interface LearningAdjustment {
  claim: string;
  adjustment: 'boost' | 'penalize';
  magnitude: number;
  reason: string;
}

export class SessionLearningEngine {
  private adjustments = new Map<string, LearningAdjustment[]>();

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

  /** Get adjustments for a diagnosis (discarded after session end) */
  getAdjustments(diagnosisId: string): LearningAdjustment[] {
    return this.adjustments.get(diagnosisId) || [];
  }

  /** End session — discard all adjustments (L1 is session-scoped) */
  endSession(diagnosisId: string): void {
    this.adjustments.delete(diagnosisId);
    log.debug({ diagnosisId }, 'L1: 会话结束，调整已丢弃');
  }

  /** Summarize session learning */
  summarize(diagnosisId: string): string {
    const adjustments = this.getAdjustments(diagnosisId);
    if (adjustments.length === 0) return '无会话学习记录';

    const boosts = adjustments.filter(a => a.adjustment === 'boost').length;
    const penalizes = adjustments.filter(a => a.adjustment === 'penalize').length;
    const totalMag = adjustments.reduce((s, a) => s + a.magnitude, 0);

    return `会话学习: ${boosts} 个确认, ${penalizes} 个纠正, 总调整量=${totalMag.toFixed(2)}`;
  }
}
