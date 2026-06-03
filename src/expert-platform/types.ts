/**
 * expert-platform/types.ts — 行业专家贡献平台类型 (Slice 4.3)
 *
 * 护城河: 让不懂技术的行业专家用自然语言贡献诊断知识。
 * 系统自动提取 症状→根因→边→行业标签→置信度。
 *
 * @frozen 2026-06-03 — 拆包前冻结。TemplateStatus 枚举只增不删。
 * @since 0.1.0
 */
 * 模板持续进化: 有效→更强 / 失效→推送复核→标记历史参考。
 */

// ═══ Expert Contribution ═══

/** Raw contribution from an industry expert */
export interface ExpertContribution {
  /** Expert identifier */
  expertId: string;
  /** Industry (e.g. 'manufacturing', 'healthcare', 'finance') */
  industry: string;
  /** Scenario (e.g. 'high_turnover', 'slow_delivery', 'low_morale') */
  scenario: string;
  /** Natural language description of the problem and root cause */
  description: string;
  /** Expert's self-assessed confidence (0-1) */
  confidence?: number;
  /** Years of experience in this industry */
  yearsOfExperience?: number;
  /** Submitted timestamp */
  submittedAt?: string;
}

/** Structured template extracted from expert contribution */
export interface ExpertTemplate {
  id: string;
  /** Symptom node */
  symptom: string;
  /** Root cause node */
  rootCause: string;
  /** Edge type connecting them */
  edgeType: string;
  /** Industry label */
  industry: string;
  /** Scenario label */
  scenario: string;
  /** Confidence (0-1) */
  confidence: number;
  /** The WHY — timeless principle (区分原理层和方案层) */
  principle: string;
  /** The HOW — contextual solution (may become outdated) */
  solution: string;
  /** Submitted by expert */
  contributedBy: string;
  /** Creation timestamp */
  createdAt: string;
  /** Current template status */
  status: TemplateStatus;
}

// ═══ Template Evolution ═══

/** Template lifecycle status */
export type TemplateStatus =
  | 'active'       // actively used and validated
  | 'partial'      // partially validated — some conditions changed
  | 'needs_review' // significant deviation detected
  | 'outdated'     // confirmed outdated — kept as historical reference
  | 'experimental'; // new template, not yet validated

/** Evolution event for a template */
export interface TemplateEvolutionEvent {
  templateId: string;
  from: TemplateStatus;
  to: TemplateStatus;
  reason: string;
  evidence?: string;
  timestamp: string;
  triggeredBy: 'auto' | 'expert_review' | 'system';
}

/** Validation result from real-world diagnostic data */
export interface TemplateValidation {
  templateId: string;
  /** How many times this template was applied */
  usageCount: number;
  /** How many times the root cause was confirmed */
  confirmedCount: number;
  /** How many times the root cause was rejected */
  rejectedCount: number;
  /** Confirmation rate (confirmed / (confirmed + rejected)) */
  confirmationRate: number;
  /** Last validation timestamp */
  lastValidatedAt: string;
  /** Recommended status based on data */
  recommendedStatus: TemplateStatus;
}

/** Cross-validation by another expert */
export interface ExpertValidation {
  templateId: string;
  reviewerId: string;
  agrees: boolean;
  comment?: string;
  suggestedCorrection?: string;
  reviewedAt: string;
}
