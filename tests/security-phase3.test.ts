/**
 * security-phase3.test.ts — Phase 2.3+3: 安全 + 模板校准测试
 *
 * 对标 Claw-Code: Given/When/Then
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { PermissionPolicy, AuditLog, PIIScrubber, DataBoundary } from '../src/security/index';
import { OutcomeTracker, StalenessDetector } from '../src/expert-platform/outcome-tracker';
import { TemplateValidator } from '../src/expert-platform/validator';
import type { ExpertTemplate } from '../src/expert-platform/types';

function fakeTemplate(overrides: Partial<ExpertTemplate> = {}): ExpertTemplate {
  return {
    id: 'tpl_test', symptom: '人员流失', rootCause: '排班问题',
    edgeType: 'TRIGGERS', industry: 'manufacturing', scenario: 'turnover',
    confidence: 0.85, principle: '不合理排班导致流失', solution: '轮班制',
    contributedBy: 'expert-1', createdAt: '2026-01-01', status: 'active',
    ...overrides,
  };
}

// ═══ PermissionPolicy ═══

describe('PermissionPolicy', () => {
  it('Given no orgId, When check, Then denied', () => {
    const policy = new PermissionPolicy();
    const result = policy.check({ orgId: '', action: 'read', resource: 'diagnosis' });
    expect(result.allowed).toBe(false);
  });

  it('Given valid orgId, When check, Then allowed', () => {
    const policy = new PermissionPolicy();
    const result = policy.check({ orgId: 'org-a', action: 'read', resource: 'diagnosis' });
    expect(result.allowed).toBe(true);
  });

  it('Given allowlisted orgs, When non-member checks, Then denied', () => {
    const policy = new PermissionPolicy(['org-a']);
    expect(policy.check({ orgId: 'org-b', action: 'read', resource: 'x' }).allowed).toBe(false);
    expect(policy.check({ orgId: 'org-a', action: 'read', resource: 'x' }).allowed).toBe(true);
  });
});

// ═══ AuditLog ═══

describe('AuditLog', () => {
  let db: Database.Database;
  let audit: AuditLog;

  beforeEach(() => { db = new Database(':memory:'); audit = new AuditLog(db); });

  it('Given audit event, When recorded, Then query returns it', () => {
    audit.record({ action: 'diagnosis_trigger', orgId: 'org-x', result: 'allowed' });
    const entries = audit.query('org-x');
    expect(entries).toHaveLength(1);
    expect(entries[0].action).toBe('diagnosis_trigger');
  });
});

// ═══ PIIScrubber ═══

describe('PIIScrubber', () => {
  it('Given phone number in text, When scrubbed, Then replaced with [PHONE]', () => {
    const text = '联系人：13812345678';
    const result = PIIScrubber.scrub(text);
    expect(result).not.toContain('13812345678');
    expect(result).toContain('[PHONE]');
  });

  it('Given email in text, When scrubbed, Then replaced with [EMAIL]', () => {
    const text = '邮箱：admin@example.com';
    expect(PIIScrubber.scrub(text)).toContain('[EMAIL]');
    expect(PIIScrubber.scrub(text)).not.toContain('admin@example.com');
  });

  it('Given clean text, When scrubbed, Then unchanged', () => {
    const text = '组织沟通效率有待提升';
    expect(PIIScrubber.scrub(text)).toBe(text);
  });
});

// ═══ DataBoundary ═══

describe('DataBoundary', () => {
  it('Given text with phone, When classify, Then restricted', () => {
    expect(DataBoundary.classify('电话13812345678')).toBe('restricted');
  });

  it('Given text with salary info, When classify, Then sensitive', () => {
    expect(DataBoundary.classify('员工薪酬结构需要调整')).toBe('sensitive');
  });

  it('Given PII content, When canSendToLLM, Then returns false', () => {
    expect(DataBoundary.canSendToLLM('手机13812345678')).toBe(false);
  });
});

// ═══ OutcomeTracker ═══

describe('OutcomeTracker', () => {
  let validator: TemplateValidator;
  let tracker: OutcomeTracker;

  beforeEach(() => {
    validator = new TemplateValidator();
    tracker = new OutcomeTracker(validator);
  });

  it('Given effective outcome, When recorded, Then template validation updated', () => {
    const tpl = fakeTemplate();
    validator.register(tpl);
    tracker.record({
      id: 'out_1', templateId: tpl.id, diagnosisId: 'diag_1',
      orgId: 'org-1', adopted: true, effectiveness: 0.8,
      checkPoint: 30, recordedAt: new Date().toISOString(),
    });
    const rate = tracker.getEffectivenessRate(tpl.id);
    expect(rate).toBe(1.0); // 1/1 effective
  });
});

// ═══ StalenessDetector ═══

describe('StalenessDetector', () => {
  it('Given active template with recent validation, When checked, Then stays active', () => {
    const validator = new TemplateValidator();
    const detector = new StalenessDetector(validator);
    const tpl = fakeTemplate({ status: 'active' });
    validator.register(tpl);
    detector.checkStaleness(tpl, new Date().toISOString());
    expect(tpl.status).toBe('active');
  });

  it('Given active template with no validation for 100 days, When checked, Then downgrades', () => {
    const validator = new TemplateValidator();
    const detector = new StalenessDetector(validator);
    const tpl = fakeTemplate({ status: 'active' });
    validator.register(tpl);
    const oldDate = new Date(Date.now() - 100 * 24 * 3600_000).toISOString();
    detector.checkStaleness(tpl, oldDate);
    expect(tpl.status).toBe('needs_review');
  });
});
