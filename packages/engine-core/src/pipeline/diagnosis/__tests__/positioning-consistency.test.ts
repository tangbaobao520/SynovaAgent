/**
 * __tests__/positioning-consistency.test.ts — 定位三方一致性测试
 *
 * 被测系统: src/pipeline/diagnosis/positioning-consistency.ts
 * Mock 边界: 不 mock（纯计算模块，零外部依赖）
 * 时间处理: 不涉及
 */
import { describe, it, expect } from 'vitest';
import { computePositioningConsistency } from '../positioning-consistency';

describe('computePositioningConsistency', () => {
  it('三方数据任一方为空 → 返回 null', () => {
    expect(computePositioningConsistency({
      externalClaims: [],
      internalDescriptions: ['协同平台'],
      customerDescriptions: ['协同软件'],
    })).toBeNull();

    expect(computePositioningConsistency({
      externalClaims: ['协同平台'],
      internalDescriptions: [],
      customerDescriptions: ['协同软件'],
    })).toBeNull();

    expect(computePositioningConsistency({
      externalClaims: ['协同平台'],
      internalDescriptions: ['协同平台'],
      customerDescriptions: [],
    })).toBeNull();
  });

  it('三方用词高度一致 → strong', () => {
    const result = computePositioningConsistency({
      externalClaims: [
        '协同办公平台',
        '团队协作工具',
        '企业协同软件',
      ],
      internalDescriptions: [
        '协同办公软件',
        '企业协作平台',
        '团队协同工具',
      ],
      customerDescriptions: [
        '协同平台',
        '团队协作软件',
        '办公协作工具',
        '企业协同办公',
      ],
    })!;

    expect(result).not.toBeNull();
    expect(result.alignment).toBe('strong');
    expect(result.gaps.length).toBe(0);
    expect(result.interpretation).toContain('健康');
    expect(result.externalKeywords.length).toBeGreaterThan(0);
    expect(result.internalKeywords.length).toBeGreaterThan(0);
    expect(result.customerKeywords.length).toBeGreaterThan(0);
  });

  it('对外与内部一致但客户感知偏离 → partial', () => {
    const result = computePositioningConsistency({
      externalClaims: [
        '企业级协同办公平台',
        '高效团队协作工具',
      ],
      internalDescriptions: [
        '协同办公软件平台',
        '企业团队协作解决方案',
      ],
      customerDescriptions: [
        '办公软件，但不清楚是不是企业级',
        '项目管理工具吧',
        '任务分配用的系统',
      ],
    })!;

    expect(result).not.toBeNull();
    expect(result.alignment).toBe('partial');
    const customerGaps = result.gaps.filter(
      g => g.pair === 'external-customer' || g.pair === 'internal-customer',
    );
    expect(customerGaps.length).toBeGreaterThan(0);
    // 外部与内部应对齐较好
    expect(result.externalInternalAlignment).toBeGreaterThan(result.externalCustomerAlignment);
  });

  it('三方各说各话 → broken', () => {
    const result = computePositioningConsistency({
      externalClaims: ['AI客服平台'],
      internalDescriptions: ['软件外包'],
      customerDescriptions: ['便宜工具'],
    })!;

    expect(result).not.toBeNull();
    expect(result.alignment).toBe('broken');
    expect(result.interpretation).toContain('断裂');
    expect(result.gaps.length).toBeGreaterThanOrEqual(2);
  });

  it('三方都提到相同的核心词 → 含协同', () => {
    const result = computePositioningConsistency({
      externalClaims: ['协同办公平台，专注团队协作'],
      internalDescriptions: ['协同办公软件，做企业协作'],
      customerDescriptions: ['协同平台，帮团队协作'],
    })!;

    expect(result).not.toBeNull();
    const allKeywords = [
      ...result.externalKeywords,
      ...result.internalKeywords,
      ...result.customerKeywords,
    ].join('');
    expect(allKeywords).toContain('协同');
  });

  it('英文定位词也被识别（多响应提权）', () => {
    const result = computePositioningConsistency({
      externalClaims: [
        'AI-powered CRM platform',
        'customer relationship management',
      ],
      internalDescriptions: [
        'CRM system for sales',
        'customer management platform',
      ],
      customerDescriptions: [
        'CRM tool for our team',
        'customer management software',
        'helps manage customer relationships',
      ],
    })!;

    expect(result).not.toBeNull();
    expect(result.alignment).toBe('strong');
    expect(result.interpretation).toContain('健康');
  });

  it('对齐度在 0-1 范围内', () => {
    const result = computePositioningConsistency({
      externalClaims: ['任意文本A'],
      internalDescriptions: ['任意文本B'],
      customerDescriptions: ['任意文本C'],
    })!;

    expect(result.externalInternalAlignment).toBeGreaterThanOrEqual(0);
    expect(result.externalInternalAlignment).toBeLessThanOrEqual(1);
    expect(result.externalCustomerAlignment).toBeGreaterThanOrEqual(0);
    expect(result.externalCustomerAlignment).toBeLessThanOrEqual(1);
    expect(result.internalCustomerAlignment).toBeGreaterThanOrEqual(0);
    expect(result.internalCustomerAlignment).toBeLessThanOrEqual(1);
  });

  it('三方完全相同的文本 → 最高对齐度', () => {
    const same = ['企业级协同办公平台'];
    const result = computePositioningConsistency({
      externalClaims: same,
      internalDescriptions: same,
      customerDescriptions: same,
    })!;

    expect(result.alignment).toBe('strong');
    expect(result.externalInternalAlignment).toBe(1);
  });
});
