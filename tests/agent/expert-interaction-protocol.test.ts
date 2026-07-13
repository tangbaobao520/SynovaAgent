/**
 * tests/agent/expert-interaction-protocol.test.ts — D56 专家交互原语
 *
 * 覆盖: RequestValidation / Endorse / Challenge / formatInteraction
 * 约束: ≥8测试 / 零as any / 结构化输出(非自由文本)
 */
import { describe, it, expect } from 'vitest';
import {
  requestValidation,
  endorse,
  challenge,
  formatInteraction,
} from '../../src/agent/expert-interaction-protocol';

describe('D56 — RequestValidation', () => {
  it('创建RequestValidation: 返回结构化对象', () => {
    const rv = requestValidation(
      'strategy',
      'finding-01',
      '利润率下降结论需要战略视角验证',
      ['财务数据E-05', '市场竞争数据E-03'],
    );
    expect(rv.type).toBe('RequestValidation');
    expect(rv.targetExpert).toBe('strategy');
    expect(rv.targetFinding).toBe('finding-01');
    expect(rv.reason).toContain('利润率');
    expect(rv.evidence).toHaveLength(2);
  });

  it('RequestValidation: 无evidence时为空数组', () => {
    const rv = requestValidation('org', 'finding-02', '组织诊断需要验证');
    expect(rv.evidence).toEqual([]);
  });

  it('RequestValidation: format()产出人类可读字符串', () => {
    const rv = requestValidation('finance', 'finding-03', '现金流数据验证');
    const formatted = formatInteraction(rv);
    expect(formatted).toContain('RequestValidation');
    expect(formatted).toContain('finance');
    expect(formatted).toContain('finding-03');
  });
});

describe('D56 — Endorse', () => {
  it('创建Endorse: 返回结构化对象', () => {
    const en = endorse('strategy', 'finding-s1', 0.85, '数据分析支持该结论');
    expect(en.type).toBe('Endorse');
    expect(en.sourceExpert).toBe('strategy');
    expect(en.sourceFinding).toBe('finding-s1');
    expect(en.confidence).toBe(0.85);
    expect(en.rationale).toContain('数据分析');
  });

  it('Endorse: confidence裁剪至[0,1]范围', () => {
    const en = endorse('tech', 'finding-t1', 1.5, '超出范围');
    expect(en.confidence).toBe(1.0);
    const en2 = endorse('tech', 'finding-t2', -0.5, '负值');
    expect(en2.confidence).toBe(0.0);
  });

  it('Endorse: format()产出人类可读字符串', () => {
    const en = endorse('org', 'finding-o1', 0.7, '组织数据一致');
    const formatted = formatInteraction(en);
    expect(formatted).toContain('Endorse');
    expect(formatted).toContain('0.7');
  });
});

describe('D56 — Challenge', () => {
  it('创建Challenge: 返回结构化对象', () => {
    const ch = challenge(
      'finance',
      'finding-f1',
      '毛利率计算口径不一致',
      ['业务报表数据', '财务系统数据'],
      0.4,
    );
    expect(ch.type).toBe('Challenge');
    expect(ch.targetExpert).toBe('finance');
    expect(ch.targetFinding).toBe('finding-f1');
    expect(ch.disagreePoint).toContain('毛利率');
    expect(ch.alternativeEvidence).toHaveLength(2);
    expect(ch.suggestedConfidence).toBe(0.4);
  });

  it('Challenge: suggestedConfidence为null时不指定', () => {
    const ch = challenge('marketing', 'finding-m1', '数据来源不可靠');
    expect(ch.suggestedConfidence).toBeNull();
    expect(ch.alternativeEvidence).toEqual([]);
  });

  it('Challenge: suggestedConfidence裁剪至[0,1]', () => {
    const ch = challenge('finance', 'finding-f2', '超出范围', [], 2.0);
    expect(ch.suggestedConfidence).toBe(1.0);
  });

  it('Challenge: format()产出人类可读字符串', () => {
    const ch = challenge('strategy', 'finding-s2', '假设不成立', ['替代数据'], 0.3);
    const formatted = formatInteraction(ch);
    expect(formatted).toContain('Challenge');
    expect(formatted).toContain('strategy');
    expect(formatted).toContain('0.3');
  });
});

describe('D56 — 结构化输出验证', () => {
  it('所有原语type字段为字面量', () => {
    const rv = requestValidation('a', 'b', 'c');
    const en = endorse('a', 'b', 0.5, 'c');
    const ch = challenge('a', 'b', 'c');

    expect(JSON.stringify(rv)).toContain('"RequestValidation"');
    expect(JSON.stringify(en)).toContain('"Endorse"');
    expect(JSON.stringify(ch)).toContain('"Challenge"');
  });

  it('formatInteraction处理所有三种原语', () => {
    const rv = requestValidation('a', 'b', 'c');
    const en = endorse('a', 'b', 0.5, 'c');
    const ch = challenge('a', 'b', 'c');

    expect(formatInteraction(rv)).toBeTruthy();
    expect(formatInteraction(en)).toBeTruthy();
    expect(formatInteraction(ch)).toBeTruthy();
  });
});
