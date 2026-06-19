/**
 * tests/expert-quality/suite.test.ts — 主入口
 *
 * 三层级联执行：
 *   L0 结构校验 → L1 规则检查 → L2 LLM 法官
 *
 * L0 全部通过才跑 L1。L1+L0 全部通过才跑 L2。
 * 便宜的先跑，贵的只在必要时跑。
 *
 * 运行: npx vitest run tests/expert-quality/suite.test.ts
 */
import { describe, it, expect } from 'vitest';
import { DIMENSION_WEIGHTS, computeOverallScore, getGrade, type DimensionName } from './judge-prompt';

// ═══ 评分标准自身验证 ═══

describe('评分标准验证', () => {
  it('Given 六维权重, Then 总和为 1.0', () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((sum, w) => sum + w, 0);
    expect(total).toBeCloseTo(1.0, 2);
  });

  it('Given 各维度权重, Then 事实准确性权重最高', () => {
    const maxWeight = Math.max(...Object.values(DIMENSION_WEIGHTS));
    expect(DIMENSION_WEIGHTS.factualAccuracy).toBe(maxWeight);
  });

  it('Given 满分 5, When computeOverallScore with all 5s, Then 返回 5.0', () => {
    const scores: Record<DimensionName, number> = {
      factualAccuracy: 5,
      evidenceQuality: 5,
      reasoningDepth: 5,
      actionability: 5,
      domainBoundary: 5,
      expressionQuality: 5,
    };
    expect(computeOverallScore(scores)).toBe(5.0);
  });

  it('Given 全 1 分, When computeOverallScore, Then 返回 1.0', () => {
    const scores: Record<DimensionName, number> = {
      factualAccuracy: 1,
      evidenceQuality: 1,
      reasoningDepth: 1,
      actionability: 1,
      domainBoundary: 1,
      expressionQuality: 1,
    };
    expect(computeOverallScore(scores)).toBe(1.0);
  });

  it('Given 3 分均匀分布, When computeOverallScore, Then 返回 3.0', () => {
    const scores: Record<DimensionName, number> = {
      factualAccuracy: 3,
      evidenceQuality: 3,
      reasoningDepth: 3,
      actionability: 3,
      domainBoundary: 3,
      expressionQuality: 3,
    };
    expect(computeOverallScore(scores)).toBe(3.0);
  });

  it('Given 分数临界值, When getGrade, Then 返回正确等级', () => {
    expect(getGrade(4.5).grade).toBe('A');
    expect(getGrade(4.0).grade).toBe('A');
    expect(getGrade(3.9).grade).toBe('B');
    expect(getGrade(3.0).grade).toBe('B');
    expect(getGrade(2.9).grade).toBe('C');
    expect(getGrade(2.0).grade).toBe('C');
    expect(getGrade(1.9).grade).toBe('D');
    expect(getGrade(0.5).grade).toBe('F');
    expect(getGrade(0).grade).toBe('F');
  });

  it('Given 极端权重场景——事实准确性 1 分但其他满分, Then 总分被拉低', () => {
    const scores: Record<DimensionName, number> = {
      factualAccuracy: 1, // 25% weight — 幻觉不应被其他维度掩盖
      evidenceQuality: 5,
      reasoningDepth: 5,
      actionability: 5,
      domainBoundary: 5,
      expressionQuality: 5,
    };
    const result = computeOverallScore(scores);
    // 1*0.25 + 5*0.75 = 0.25 + 3.75 = 4.0
    expect(result).toBe(4.0);
    // 仍在 A 级，因为有其他维度支撑，但比满分低了 1.0 分
  });
});

// ═══ L0 快速冒烟（不调 LLM） ═══

describe('L0 快速冒烟', () => {
  it('Given 评分标准模块, Then 所有导出可用', () => {
    expect(DIMENSION_WEIGHTS).toBeDefined();
    expect(Object.keys(DIMENSION_WEIGHTS)).toHaveLength(6);
    expect(computeOverallScore).toBeDefined();
    expect(getGrade).toBeDefined();
  });

  it('Given judge-prompt 模块, Then buildJudgeSystemPrompt 返回有效 prompt', async () => {
    const { buildJudgeSystemPrompt } = await import('./judge-prompt');
    const prompt = buildJudgeSystemPrompt('strategy', '企业背景测试');
    expect(prompt.length).toBeGreaterThan(500);
    expect(prompt).toContain('factualAccuracy');
    expect(prompt).toContain('评分标准');
    expect(prompt).toContain('strategy');
  });
});
