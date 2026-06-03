/**
 * expert-platform/outcome-tracker.ts — 诊断效果跟踪 (Phase 2.3a)
 *
 * 跟踪诊断建议执行后的实际效果 (30/60/90天),
 * 更新模板 confirmationRate。
 */
import { createLogger } from '../logger';
import type { ExpertTemplate } from './types';
import { TemplateValidator } from './validator';

const log = createLogger('expert-platform/outcome-tracker');

export interface OutcomeRecord {
  id: string;
  templateId: string;
  diagnosisId: string;
  orgId: string;
  /** 建议是否被采纳 */
  adopted: boolean;
  /** 采纳后的实际效果评分 (0-1) */
  effectiveness?: number;
  /** 跟踪阶段: 30/60/90 天 */
  checkPoint: 30 | 60 | 90;
  recordedAt: string;
  notes?: string;
}

export class OutcomeTracker {
  private records = new Map<string, OutcomeRecord[]>();
  private validator: TemplateValidator;

  constructor(validator: TemplateValidator) {
    this.validator = validator;
  }

  /** Record an outcome at a checkpoint */
  record(outcome: OutcomeRecord): void {
    const existing = this.records.get(outcome.templateId) || [];
    existing.push(outcome);
    this.records.set(outcome.templateId, existing);

    // Update template validation based on outcome
    const wasEffective = (outcome.effectiveness ?? 0) >= 0.5;
    this.validator.recordValidation(outcome.templateId, wasEffective,
      `${outcome.checkPoint}天跟踪: 效果=${outcome.effectiveness}`);

    log.debug({ templateId: outcome.templateId, checkPoint: outcome.checkPoint,
      effective: wasEffective }, '效果已记录');
  }

  /** Get outcome history for a template */
  getHistory(templateId: string): OutcomeRecord[] {
    return this.records.get(templateId) || [];
  }

  /** Get effectiveness rate for a template */
  getEffectivenessRate(templateId: string): number | null {
    const history = this.getHistory(templateId);
    if (history.length === 0) return null;
    const effective = history.filter(r => (r.effectiveness ?? 0) >= 0.5).length;
    return Math.round((effective / history.length) * 100) / 100;
  }
}

// ═══ StalenessDetector ═══

/** Days without validation before downgrade */
const STALENESS_THRESHOLDS: Record<string, number> = {
  active_to_needs_review: 90,    // 90 days no validation → needs review
  needs_review_to_outdated: 180, // 180 days → outdated
};

export class StalenessDetector {
  private validator: TemplateValidator;

  constructor(validator: TemplateValidator) {
    this.validator = validator;
  }

  /**
   * Check a template for staleness.
   * Automatically downgrades if no validation for too long.
   */
  checkStaleness(template: ExpertTemplate, lastValidatedAt: string): void {
    const daysSinceValidation = (Date.now() - new Date(lastValidatedAt).getTime()) / (24 * 3600_000);

    if (template.status === 'active' && daysSinceValidation > STALENESS_THRESHOLDS.active_to_needs_review) {
      this.validator.requestReview(template.id,
        `模板超过 ${Math.round(daysSinceValidation)} 天无验证 — 自动降级`);
      log.info({ templateId: template.id, daysSince: Math.round(daysSinceValidation) },
        '模板过期 → needs_review');
    } else if (template.status === 'needs_review' && daysSinceValidation > STALENESS_THRESHOLDS.needs_review_to_outdated) {
      this.validator.markOutdated(template.id,
        `模板超过 ${Math.round(daysSinceValidation)} 天待复核 — 标记为过时`);
      log.info({ templateId: template.id }, '模板长期待复核 → outdated');
    }
  }
}
