/**
 * expert-platform/outcome-tracker.ts — 诊断效果跟踪 (Phase 2.3a)
 *
 * 跟踪诊断建议执行后的实际效果 (30/60/90天),
 * 更新模板 confirmationRate。
 */
import { createLogger } from '@synova/logger';
import type { ExpertTemplate } from './types';
import { TemplateValidator } from './validator';

const log = createLogger('expert-platform/outcome-tracker');

export interface OutcomeRecord {
  id: string;
  templateId: string;
  diagnosisId: string;
  orgId: string;
  adopted: boolean;
  effectiveness?: number;
  checkPoint: 30 | 60 | 90;
  recordedAt: string;
  notes?: string;
}

/** EC-09: OutcomeStore 接口 — 内存+SQLite 双实现 */
export interface OutcomeStore {
  save(outcome: OutcomeRecord): void;
  getByTemplate(templateId: string): OutcomeRecord[];
  getEffectivenessRate(templateId: string): number | null;
}

export class OutcomeTracker {
  // EC-09: 优先 SQLite, 回退内存 Map
  private memoryFallback = new Map<string, OutcomeRecord[]>();
  private store: OutcomeStore | null = null;
  private validator: TemplateValidator;

  constructor(validator: TemplateValidator, store?: OutcomeStore) {
    this.validator = validator;
    if (store) this.store = store;
  }

  /** EC-09: 注入 SQLite store */
  withStore(store: OutcomeStore): this {
    this.store = store;
    // 迁移内存中的已有记录
    for (const [templateId, records] of this.memoryFallback) {
      for (const r of records) store.save(r);
    }
    this.memoryFallback.clear();
    return this;
  }

  record(outcome: OutcomeRecord): void {
    if (this.store) {
      this.store.save(outcome);
    } else {
      const existing = this.memoryFallback.get(outcome.templateId) || [];
      existing.push(outcome);
      this.memoryFallback.set(outcome.templateId, existing);
    }

    const wasEffective = (outcome.effectiveness ?? 0) >= 0.5;
    this.validator.recordValidation(outcome.templateId, wasEffective,
      `${outcome.checkPoint}天跟踪: 效果=${outcome.effectiveness}`);

    log.debug({ templateId: outcome.templateId, checkPoint: outcome.checkPoint,
      effective: wasEffective, persisted: !!this.store }, '效果已记录');
  }

  getHistory(templateId: string): OutcomeRecord[] {
    if (this.store) return this.store.getByTemplate(templateId);
    return this.memoryFallback.get(templateId) || [];
  }

  getEffectivenessRate(templateId: string): number | null {
    if (this.store) return this.store.getEffectivenessRate(templateId);
    const history = this.memoryFallback.get(templateId) || [];
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
