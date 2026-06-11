/**
 * __tests__/category-clarity.test.ts — 品类认知清晰度测试
 *
 * 被测系统: src/pipeline/diagnosis/category-clarity.ts
 * Mock 边界: 不 mock（纯计算模块，零外部依赖）
 * 时间处理: 不涉及
 */
import { describe, it, expect } from 'vitest';
import { computeCategoryClarity } from '../category-clarity';

describe('computeCategoryClarity', () => {
  it('不足3条响应返回 null', () => {
    expect(computeCategoryClarity([])).toBeNull();
    expect(computeCategoryClarity(['协同软件'])).toBeNull();
    expect(computeCategoryClarity(['协同软件', '项目管理'])).toBeNull();
  });

  it('客户用词高度一致 → clear', () => {
    const responses = [
      '协同办公软件',
      '协同软件，帮团队协作的',
      '就是协同工具',
      '协同办公平台',
    ];
    const result = computeCategoryClarity(responses)!;
    expect(result).not.toBeNull();
    expect(result.clarity).toBe('clear');
    // "协同" 应该出现在所有响应中
    expect(result.dominantCategory).toContain('协同');
    expect(result.consistencyRatio).toBeGreaterThanOrEqual(0.7);
    expect(result.interpretation).toContain('清晰');
  });

  it('客户用词分散 → fuzzy', () => {
    const responses = [
      '协同办公软件',
      '项目管理工具',
      '任务分配系统',
      '团队沟通平台',
      '协同软件',
    ];
    const result = computeCategoryClarity(responses)!;
    expect(result).not.toBeNull();
    expect(result.clarity).toBe('fuzzy');
    expect(result.interpretation).toContain('模糊');
  });

  it('客户用词完全不一致 → chaotic', () => {
    const responses = [
      '一个软件工具',
      '做AI的吧',
      '好像是搞咨询的',
      '不太清楚，帮我们做流程的',
      '数据分析公司',
    ];
    const result = computeCategoryClarity(responses)!;
    expect(result).not.toBeNull();
    expect(result.clarity).toBe('chaotic');
    expect(result.interpretation).toContain('混乱');
    expect(result.consistencyRatio).toBeLessThan(0.3);
  });

  it('返回词频分布 top10', () => {
    const responses = Array(5).fill('协同办公软件');
    const result = computeCategoryClarity(responses)!;
    expect(result.categoryDistribution.length).toBeGreaterThanOrEqual(1);
    expect(result.categoryDistribution.length).toBeLessThanOrEqual(10);
    // 分布按频次降序
    for (let i = 1; i < result.categoryDistribution.length; i++) {
      expect(result.categoryDistribution[i].count).toBeLessThanOrEqual(result.categoryDistribution[i - 1].count);
    }
  });

  it('样本引用脱敏不超过5条', () => {
    const responses = Array(20).fill('协同软件');
    const result = computeCategoryClarity(responses)!;
    expect(result.sampleQuotes.length).toBeLessThanOrEqual(5);
  });

  it('totalResponses 等于输入数量', () => {
    const responses = ['协同软件', '协同平台', '协同工具', '团队协作'];
    const result = computeCategoryClarity(responses)!;
    expect(result.totalResponses).toBe(4);
  });

  it('识别英文品类词', () => {
    const responses = [
      'CRM system',
      'CRM platform for sales',
      'a CRM tool',
      'customer relationship management',
    ];
    const result = computeCategoryClarity(responses)!;
    expect(result).not.toBeNull();
    // CRM should be detected as dominant
    expect(result.dominantCategory?.toLowerCase()).toContain('crm');
  });

  it('种子词出现在文本中被识别', () => {
    const responses = [
      '我们是用低代码平台',
      '低代码开发工具',
      '无代码平台',
    ];
    const result = computeCategoryClarity(responses)!;
    // 低代码 is a seed term
    expect(result.categoryDistribution.some(d => d.term === '低代码')).toBe(true);
  });
});
