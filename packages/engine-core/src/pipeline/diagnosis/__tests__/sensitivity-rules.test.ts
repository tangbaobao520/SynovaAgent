/**
 * sensitivity-rules.test.ts — 隐私控制单元测试
 */

import { DiagnosisPermissionLevel } from '../types';
import {
  detectSensitiveFields,
  scanContentForSensitivity,
  redactField,
  redactObject,
  getBuiltinRules,
  createCustomRule,
} from '../sensitivity-rules';

describe('detectSensitiveFields', () => {
  it('flags salary field as financial', () => {
    // Given: field names including salary
    const fields = ['name', '年薪', 'department', 'bonus'];

    // When: detecting sensitive fields
    const matches = detectSensitiveFields(fields);

    // Then: salary and bonus flagged as financial
    const financialMatches = matches.filter(m => m.category === 'financial');
    expect(financialMatches.length).toBeGreaterThanOrEqual(2);
    expect(financialMatches.some(m => m.field === '年薪')).toBe(true);
  });

  it('flags 绩效 as performance with INITIATOR_ONLY min level', () => {
    // Given: performance review field
    const fields = ['绩效评级'];

    // When: detecting
    const matches = detectSensitiveFields(fields);

    // Then: requires INITIATOR_ONLY
    expect(matches).toHaveLength(1);
    expect(matches[0].minLevel).toBe(DiagnosisPermissionLevel.INITIATOR_ONLY);
  });

  it('flags health-related fields as NEVER level', () => {
    // Given: health field
    const fields = ['心理压力评估'];

    // When: detecting
    const matches = detectSensitiveFields(fields);

    // Then: NEVER exposed
    expect(matches.length).toBeGreaterThanOrEqual(1);
    const healthMatch = matches.find(m => m.category === 'health');
    expect(healthMatch).toBeDefined();
    expect(healthMatch!.minLevel).toBe(DiagnosisPermissionLevel.NEVER);
  });

  it('supports custom rules alongside builtins', () => {
    // Given: custom rule for a proprietary category
    const custom = createCustomRule('custom-prop', 'strategic', ['专有算法'], DiagnosisPermissionLevel.ADMIN_ONLY, 'redact');
    const fields = ['专有算法版本'];

    // When: detecting with custom rules
    const matches = detectSensitiveFields(fields, [custom]);

    // Then: custom keyword matched
    expect(matches).toHaveLength(1);
    expect(matches[0].matchedKeyword).toBe('专有算法');
  });

  it('returns empty array for non-sensitive fields', () => {
    // Given: innocuous field names
    const fields = ['teamName', 'createdAt', 'memberCount'];

    // When: detecting
    const matches = detectSensitiveFields(fields);

    // Then: no matches
    expect(matches).toHaveLength(0);
  });
});

describe('scanContentForSensitivity', () => {
  it('detects salary keywords in free text', () => {
    // Given: text containing salary info
    const text = '团队成员对薪资结构有不满，认为奖金分配不公平。';

    // When: scanning
    const matches = scanContentForSensitivity(text);

    // Then: financial sensitivity detected
    const financialMatches = matches.filter(m => m.category === 'financial');
    expect(financialMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('detects conflict keywords in interview notes', () => {
    // Given: interview text with conflict mentions
    const text = '前后端团队之间存在较严重的冲突和对立情绪。';

    // When: scanning
    const matches = scanContentForSensitivity(text);

    // Then: conflict detected
    const conflictMatches = matches.filter(m => m.category === 'conflict');
    expect(conflictMatches.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty for neutral text', () => {
    // Given: purely operational text
    const text = '团队站会每天上午 10 点进行，时长 15 分钟。';

    // When: scanning
    const matches = scanContentForSensitivity(text);

    // Then: no sensitivity
    expect(matches).toHaveLength(0);
  });
});

describe('redactField', () => {
  it('allows access when requester level meets minimum', () => {
    // Given: CEO (INITIATOR_ONLY) viewing salary
    const match = detectSensitiveFields(['年薪'])[0];

    // When: redacting for INITIATOR_ONLY level
    const result = redactField('年薪', '500000', match, DiagnosisPermissionLevel.INITIATOR_ONLY);

    // Then: allowed with original value
    expect(result.action).toBe('allow');
    expect(result.sanitizedValue).toBe('500000');
  });

  it('redacts pii for EVERYONE level', () => {
    // Given: org member viewing PII
    const match = detectSensitiveFields(['手机号'])[0];

    // When: redacting for EVERYONE
    const result = redactField('手机号', '13800138000', match, DiagnosisPermissionLevel.EVERYONE);

    // Then: redacted
    expect(result.action).toBe('redact');
    expect(result.sanitizedValue).toBe('***');
  });

  it('summarizes performance data for lower levels', () => {
    // Given: org member viewing performance
    const match = detectSensitiveFields(['绩效评级'])[0];

    // When: redacting for ORG_MEMBER
    const result = redactField('绩效评级', 'A级，超额完成目标，团队贡献突出', match, DiagnosisPermissionLevel.ORG_MEMBER);

    // Then: summarized
    expect(result.action).toBe('summarize');
    expect(result.sanitizedValue).toContain('[摘要]');
  });
});

describe('redactObject', () => {
  it('redacts sensitive fields while preserving safe ones', () => {
    // Given: object with mixed sensitivity
    const obj = {
      teamName: '创新实验室',
      createdAt: '2026-01-01',
      年薪: '600000',
      绩效评级: '优秀',
    };

    // When: redacting for ORG_MEMBER
    const { redacted, audit } = redactObject(obj, DiagnosisPermissionLevel.ORG_MEMBER);

    // Then: safe fields preserved, sensitive fields redacted
    expect(redacted.teamName).toBe('创新实验室');
    expect(redacted.createdAt).toBe('2026-01-01');
    expect(redacted.年薪).not.toBe('600000');
    expect(audit.length).toBeGreaterThanOrEqual(2);
  });

  it('produces audit entries with timestamps', () => {
    // Given: object with one sensitive field
    const obj = { 手机号: '13900001111', department: 'engineering' };

    // When: redacting
    const { audit } = redactObject(obj, DiagnosisPermissionLevel.EVERYONE);

    // Then: audit entry has ISO timestamp
    expect(audit).toHaveLength(1);
    expect(audit[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(audit[0].field).toBe('手机号');
  });

  it('returns empty audit when no sensitive fields present', () => {
    // Given: fully safe object
    const obj = { teamId: 't1', phase: 'collect', iterations: 3 };

    // When: redacting
    const { redacted, audit } = redactObject(obj, DiagnosisPermissionLevel.EVERYONE);

    // Then: unchanged, no audit entries
    expect(redacted).toEqual(obj);
    expect(audit).toHaveLength(0);
  });
});

describe('getBuiltinRules', () => {
  it('returns all six builtin rule categories', () => {
    const rules = getBuiltinRules();
    const categories = new Set(rules.map(r => r.category));
    expect(categories.size).toBe(6);
    expect(categories.has('pii')).toBe(true);
    expect(categories.has('financial')).toBe(true);
    expect(categories.has('performance')).toBe(true);
    expect(categories.has('health')).toBe(true);
    expect(categories.has('conflict')).toBe(true);
    expect(categories.has('strategic')).toBe(true);
  });
});

describe('createCustomRule', () => {
  it('creates a valid custom sensitivity rule', () => {
    // Given: custom rule parameters
    // When: creating
    const rule = createCustomRule('my-rule', 'strategic', ['商业计划'], DiagnosisPermissionLevel.ADMIN_ONLY, 'summarize');

    // Then: rule fields match
    expect(rule.name).toBe('my-rule');
    expect(rule.keywords).toContain('商业计划');
    expect(rule.defaultAction).toBe('summarize');
  });
});
