/**
 * tests/interview/gpi-estimator.test.ts — T11 GPI 估算测试
 *
 * 约束6: ≥3个测试（正常路径+边界+降级）
 * 约束3: 验证 confidence:'preliminary' + dataSource:'interview'
 */
import { describe, it, expect } from 'vitest';
import { estimateGPI } from '../../src/interview/gpi-estimator';
import type { CausalSignal } from '../../src/interview/signals';

describe('T11 gpi-estimator', () => {
  it('约束3: 输出含 confidence:preliminary + dataSource:interview', () => {
    const result = estimateGPI({
      signals: [],
      contradictionCount: 0,
      blindSpotCount: 0,
    });

    expect(result.external_opportunity.confidence).toBe('preliminary');
    expect(result.value_capture.confidence).toBe('preliminary');
    expect(result.endogenous_creation.confidence).toBe('preliminary');
    expect(result.growth_cost.confidence).toBe('unavailable');
    expect(result.growth_cost.reason).toBe('需财务数据');
    expect(result.dataSource).toBe('interview');
  });

  it('正常: 强负面信号 → GPI 较低 (红或黄区)', () => {
    const signals: CausalSignal[] = [
      { id: 'pain_1', dimension: 'market_shift', sourceRole: 'ceo', sourceAnswer: '竞争太激烈', signalStrength: 'strong', evidenceType: 'pattern', description: '市场价格竞争恶化' },
      { id: 'pain_2', dimension: 'market_shift', sourceRole: 'cfo', sourceAnswer: '客户越来越少', signalStrength: 'strong', evidenceType: 'pattern', description: '客户流失加速' },
      { id: 'pain_3', dimension: 'cashflow_health', sourceRole: 'cfo', sourceAnswer: '现金流紧张', signalStrength: 'strong', evidenceType: 'direct', description: '现金流危机' },
      { id: 'pain_4', dimension: 'culture', sourceRole: 'hr', sourceAnswer: '人员流失严重', signalStrength: 'strong', evidenceType: 'direct', description: '核心人才流失' },
      { id: 'pain_5', dimension: 'tech_debt', sourceRole: 'cto', sourceAnswer: '系统太老了', signalStrength: 'strong', evidenceType: 'direct', description: '技术债严重' },
    ];

    const result = estimateGPI({
      industry: 'manufacturing',
      signals,
      contradictionCount: 4,
      blindSpotCount: 2,
    });

    // 强负面信号压低了三个因子
    expect(result.gpi).toBeLessThan(0.5);
    // 外部机会被制造业基线+负面信号压低
    expect(result.external_opportunity.score).toBeDefined();
    expect(result.value_capture.score).toBeDefined();
    expect(result.endogenous_creation.score).toBeDefined();
    expect(result.growth_cost.score).toBeNull();
  });

  it('正常: 强正面信号 → GPI 较高', () => {
    const signals: CausalSignal[] = [
      { id: 'sig_1', dimension: 'goal_alignment', sourceRole: 'ceo', sourceAnswer: '团队方向很一致', signalStrength: 'strong', evidenceType: 'direct', description: '目标一致性好' },
      { id: 'sig_2', dimension: 'strategy_clarity', sourceRole: 'cto', sourceAnswer: '战略很清晰', signalStrength: 'strong', evidenceType: 'direct', description: '战略清晰度高' },
    ];

    const result = estimateGPI({
      industry: 'saas',
      signals,
      contradictionCount: 0,
      blindSpotCount: 0,
    });

    expect(result.gpi).toBeGreaterThan(0.5);
    expect(result.gpiTier).not.toBe('red');
    expect(result.external_opportunity.score).toBeGreaterThanOrEqual(0.6);
  });

  it('正常: SaaS 行业基线较高', () => {
    const result1 = estimateGPI({ signals: [], contradictionCount: 0, blindSpotCount: 0, industry: 'saas' });
    const result2 = estimateGPI({ signals: [], contradictionCount: 0, blindSpotCount: 0, industry: 'manufacturing' });

    expect(result1.external_opportunity.score).toBeGreaterThan(result2.external_opportunity.score!);
  });

  it('边界: 无信号 + 无行业 → 默认 GPI', () => {
    const result = estimateGPI({ signals: [], contradictionCount: 0, blindSpotCount: 0 });

    expect(result.gpi).toBeGreaterThan(0);
    expect(result.gpi).toBeLessThanOrEqual(1);
    expect(result.gpiTier).toBeDefined();
    expect(result.degraded).toBe(false);
  });
});
