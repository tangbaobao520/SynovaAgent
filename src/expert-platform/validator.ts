/**
 * expert-platform/validator.ts — 模板进化引擎 (Slice 4.3 实现)
 *
 * 用真实诊断结果持续检验模板有效性，自动标记状态。
 *   有效→更强 / 部分有效→生成假设→推送复核 / 失效→标记历史参考
 *
 * 区分原理层 (why, timeless) 和方案层 (how, context)。
 */
import { createLogger } from '../logger';
import type { ExpertTemplate, TemplateStatus, TemplateValidation, TemplateEvolutionEvent } from './types';

const log = createLogger('expert-platform/validator');

// ═══ Template Validator ═══

export class TemplateValidator {
  private templates = new Map<string, ExpertTemplate>();
  private validations = new Map<string, TemplateValidation[]>();
  private evolutionLog = new Map<string, TemplateEvolutionEvent[]>();

  /** Register a template for tracking */
  register(template: ExpertTemplate): void {
    this.templates.set(template.id, template);
    log.debug({ id: template.id, symptom: template.symptom }, '模板已注册');
  }

  /**
   * Record a real-world validation of a template.
   *
   * Called after each diagnosis that used this template.
   * Updates confirmationRate and auto-adjusts status.
   */
  recordValidation(
    templateId: string,
    wasConfirmed: boolean,
    evidence?: string,
  ): TemplateValidation | null {
    const template = this.templates.get(templateId);
    if (!template) {
      log.warn({ templateId }, '模板未注册，无法记录验证');
      return null;
    }

    const history = this.validations.get(templateId) || [];
    const totalConfirmations = history.filter(v => v.confirmationRate > 0.5).length;

    const validation: TemplateValidation = {
      templateId,
      usageCount: history.length + 1,
      confirmedCount: wasConfirmed
        ? history.filter(v => v.confirmationRate > 0.5).length + 1
        : history.filter(v => v.confirmationRate > 0.5).length,
      rejectedCount: wasConfirmed
        ? history.filter(v => v.confirmationRate <= 0.5).length
        : history.filter(v => v.confirmationRate <= 0.5).length + 1,
      confirmationRate: 0,
      lastValidatedAt: new Date().toISOString(),
      recommendedStatus: template.status,
    };

    // Calculate confirmation rate
    const total = validation.confirmedCount + validation.rejectedCount;
    validation.confirmationRate = total > 0
      ? Math.round((validation.confirmedCount / total) * 1000) / 1000
      : 0;

    history.push(validation);
    this.validations.set(templateId, history);

    // Auto-adjust status based on evidence
    const newStatus = this.computeStatus(template, validation);

    if (newStatus !== template.status) {
      const event: TemplateEvolutionEvent = {
        templateId,
        from: template.status,
        to: newStatus,
        reason: this.buildReason(template, validation, newStatus),
        evidence,
        timestamp: new Date().toISOString(),
        triggeredBy: 'auto',
      };

      template.status = newStatus;
      const events = this.evolutionLog.get(templateId) || [];
      events.push(event);
      this.evolutionLog.set(templateId, events);

      log.info({
        templateId,
        from: event.from,
        to: event.to,
        confirmationRate: validation.confirmationRate,
      }, '模板状态自动迁移');
    }

    return validation;
  }

  /**
   * Request expert review for a template that needs attention.
   */
  requestReview(templateId: string, reason: string): void {
    const template = this.templates.get(templateId);
    if (!template) return;

    const event: TemplateEvolutionEvent = {
      templateId,
      from: template.status,
      to: 'needs_review',
      reason,
      timestamp: new Date().toISOString(),
      triggeredBy: 'system',
    };

    template.status = 'needs_review';
    const events = this.evolutionLog.get(templateId) || [];
    events.push(event);
    this.evolutionLog.set(templateId, events);

    log.info({ templateId, reason }, '模板已标记为待复核');
  }

  /** Get validation history */
  getValidations(templateId: string): TemplateValidation[] {
    return this.validations.get(templateId) || [];
  }

  /** Get evolution events */
  getEvolutionLog(templateId: string): TemplateEvolutionEvent[] {
    return this.evolutionLog.get(templateId) || [];
  }

  /** Get all template statuses */
  getAllStatuses(): Record<string, TemplateStatus> {
    const result: Record<string, TemplateStatus> = {};
    for (const [id, tpl] of this.templates) {
      result[id] = tpl.status;
    }
    return result;
  }

  /** Mark a template as outdated (principle preserved as wisdom) */
  markOutdated(templateId: string, reason: string): void {
    const template = this.templates.get(templateId);
    if (!template) return;

    const event: TemplateEvolutionEvent = {
      templateId,
      from: template.status,
      to: 'outdated',
      reason,
      timestamp: new Date().toISOString(),
      triggeredBy: 'expert_review',
    };

    template.status = 'outdated';
    // principle is preserved — it's timeless wisdom
    const events = this.evolutionLog.get(templateId) || [];
    events.push(event);
    this.evolutionLog.set(templateId, events);

    log.info({ templateId, principle: template.principle }, '模板已标记为过时（原理保留为智慧）');
  }

  // ═══ Internal ═══

  private computeStatus(template: ExpertTemplate, validation: TemplateValidation): TemplateStatus {
    // New template: stay experimental until enough data
    if (validation.usageCount < 5) return template.status;

    const rate = validation.confirmationRate;

    if (rate >= 0.8) return 'active';
    if (rate >= 0.5) return 'partial';
    if (rate >= 0.3) return 'needs_review';
    return 'outdated';
  }

  private buildReason(
    template: ExpertTemplate,
    validation: TemplateValidation,
    newStatus: TemplateStatus,
  ): string {
    const rate = Math.round(validation.confirmationRate * 100);
    const total = validation.usageCount;
    const confirmed = validation.confirmedCount;

    switch (newStatus) {
      case 'active':
        return `${confirmed}/${total} 次验证确认根因 (${rate}%), 模板高度有效`;
      case 'partial':
        return `${confirmed}/${total} 次验证确认根因 (${rate}%), 部分场景生效`;
      case 'needs_review':
        return `仅 ${confirmed}/${total} 次验证确认 (${rate}%), 根因可能已变化`;
      case 'outdated':
        return `${confirmed}/${total} 次验证确认 (${rate}%), 方案层已过时`;
      default:
        return `状态: ${newStatus} (${rate}%)`;
    }
  }
}
