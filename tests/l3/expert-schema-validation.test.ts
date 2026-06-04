/**
 * tests/l3/expert-schema-validation.test.ts — EC-07: zod Schema 校验测试
 *
 * Anthropic 工程标准: 每个 public 函数 ≥ 2 用例 (happy + sad)。
 */
import { describe, it, expect } from 'vitest';
import {
  validateExpertOutput,
  FindingSchema,
  ExpertOutputSchema,
} from '../../src/l3/expert-output-schema';

describe('ExpertOutputSchema — zod validation', () => {
  // ── Happy Path ──

  it('Given a valid complete expert output, When validated, Then valid=true, degraded=false', () => {
    const input = {
      findings: [{
        id: 'f1',
        dimension: 'strategy',
        statement: '战略清晰度不足，管理层无法对齐Q3目标',
        confidence: 0.75,
        evidenceRefs: ['ev-001', 'ev-002'],
        severity: 'high',
        suggestedActions: ['召开战略对齐会议', '明确Q3 OKR'],
      }],
      overallAssessment: '组织在战略传达层面存在显著瓶颈，建议优先解决管理层对齐问题',
      uncertainties: [{
        description: '缺少一线员工视角的数据',
        reason: '数据不足',
        suggestedNextStep: '补充员工访谈',
      }],
      conflictingSignals: [{
        dimension: 'org',
        myFinding: '跨部门协作频繁',
        myConfidence: 0.6,
        potentialOpposingExpert: 'org_diagnostician',
        reason: 'org专家可能看到不同的协作模式',
      }],
      crossReferences: [{
        dimension: 'finance',
        expertType: 'financial_analyst',
        reason: '财务约束可能影响战略执行',
        priority: 'important',
      }],
    };

    const result = validateExpertOutput(input);
    expect(result.valid).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.errors).toHaveLength(0);
    expect(result.output.findings).toHaveLength(1);
    expect(result.output.findings![0].id).toBe('f1');
  });

  it('Given minimal valid output (findings only), When validated, Then valid=true', () => {
    const input = {
      findings: [{
        id: 'f1', dimension: 'tech', statement: '技术债务影响交付速度',
        confidence: 0.5, evidenceRefs: ['ev-1'], severity: 'medium',
      }],
    };

    const result = validateExpertOutput(input);
    expect(result.valid).toBe(true);
    expect(result.degraded).toBe(false);
  });

  // ── Sad Path ──

  it('Given empty object, When validated, Then valid=true (all optional), no errors', () => {
    // Empty is valid — all fields are optional
    const result = validateExpertOutput({});
    expect(result.valid).toBe(true);
  });

  it('Given missing required finding fields, When validated, Then valid=false, degraded=true', () => {
    const input = {
      findings: [{ id: 'f1' }], // missing dimension, statement, etc.
    };

    const result = validateExpertOutput(input);
    expect(result.valid).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('Given confidence out of range, When validated, Then valid=false', () => {
    const input = {
      findings: [{
        id: 'f1', dimension: 'strategy', statement: 'test',
        confidence: 9.99, // out of range
        evidenceRefs: [], severity: 'low',
      }],
    };

    const result = validateExpertOutput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('confidence'))).toBe(true);
  });

  it('Given invalid severity enum, When validated, Then valid=false', () => {
    const input = {
      findings: [{
        id: 'f1', dimension: 'strategy', statement: 'test',
        confidence: 0.5, evidenceRefs: [], severity: 'extreme', // not in enum
      }],
    };

    const result = validateExpertOutput(input);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('severity'))).toBe(true);
  });

  it('Given string instead of object, When validated, Then valid=false, partial recovery', () => {
    const result = validateExpertOutput('not an object' as any);
    expect(result.valid).toBe(false);
    expect(result.degraded).toBe(true);
    // Partial recovery should still return a valid-shaped output
    expect(result.output.findings).toBeDefined();
    expect(result.output.overallAssessment).toBe('');
  });

  // ── Partial Recovery ──

  it('Given invalid findings array items, When validated, Then partial recovery produces sanitized output', () => {
    const input = {
      findings: [
        { id: 'good', dimension: 'ok', statement: 'valid', confidence: 0.5, evidenceRefs: [], severity: 'low' },
        { id: 'bad' }, // incomplete — will be filtered
      ],
    };

    const result = validateExpertOutput(input);
    expect(result.valid).toBe(false); // bad item causes failure
    expect(result.degraded).toBe(true);
    // Partial recovery: the good item survives in the partial output
    expect(result.output.findings!.length).toBeGreaterThanOrEqual(1);
  });
});

describe('FindingSchema — unit validation', () => {
  it('valid finding passes', () => {
    const r = FindingSchema.safeParse({
      id: 'f1', dimension: 'strategy', statement: 'valid',
      confidence: 0.5, evidenceRefs: [], severity: 'low',
    });
    expect(r.success).toBe(true);
  });

  it('missing required field fails', () => {
    const r = FindingSchema.safeParse({
      id: 'f1', dimension: 'strategy',
      // missing: statement, confidence, evidenceRefs, severity
    });
    expect(r.success).toBe(false);
  });

  it('suggestedActions is optional', () => {
    const r = FindingSchema.safeParse({
      id: 'f1', dimension: 'strategy', statement: 'valid',
      confidence: 0.5, evidenceRefs: [], severity: 'low',
      // no suggestedActions
    });
    expect(r.success).toBe(true);
  });
});

describe('ExpertOutputSchema — type inference', () => {
  it('output type includes findings with correct shape', () => {
    const output = {
      findings: [{ id: 'f1', dimension: 'd', statement: 's', confidence: 0.5, evidenceRefs: [], severity: 'low' as const }],
    };
    const r = ExpertOutputSchema.safeParse(output);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.findings![0].id).toBe('f1');
    }
  });
});
