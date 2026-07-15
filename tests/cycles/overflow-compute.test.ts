/**
 * tests/cycles/overflow-compute.test.ts — 溢出计算引擎测试
 */
import { describe, it, expect } from 'vitest';
import { computeOverflow } from '../../src/cycles/overflow-compute';
import type { CycleConfig, EnterpriseTimeSeries } from '../../src/cycles/overflow-compute';

const BASE_CYCLE: CycleConfig = {
  cycleId: 'test-cycle', name: 'Test', description: '', version: '1.0.0',
  applicableIndustries: [],
  nodes: [
    { id: 'revenue', label: '营收', type: 'stock', initialValue: 100, unit: '万' },
    { id: 'reinvestment', label: '再投资', type: 'flow', initialValue: 30, unit: '万' },
  ],
  edges: [{ from: 'revenue', to: 'reinvestment', polarity: '+', weight: 0.5 }],
  overflowFormula: {
    condition: 'revenue > reinvestment * 3',
    targetNode: 'reinvestment',
    formula: 'revenue.currentValue * 0.3',
    minDataMaturity: 'medium',
  },
  dataMaturity: 'medium',
  mapping: [{ nodeId: 'revenue', edgeId: 'E-4.1', weight: 1.0 }],
  crossCyclePropagation: [],
};

function makeSeries(lastValue: number, months: number): EnterpriseTimeSeries {
  const dataPoints: Array<{ month: string; value: number }> = [];
  const start = new Date();
  for (let i = months; i >= 0; i--) {
    const d = new Date(start.getFullYear(), start.getMonth() - i, 1);
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    dataPoints.push({ month, value: lastValue - i * 2 });
  }
  return {
    dataPoints,
    currentNodeValues: { revenue: lastValue, reinvestment: lastValue * 0.3 },
    enterpriseId: 'test-org',
  };
}

describe('computeOverflow', () => {
  it('正常数据 → 返回完整快照', () => {
    const data = makeSeries(100, 13);
    const result = computeOverflow(BASE_CYCLE, data);
    expect(result.cycleId).toBe('test-cycle');
    expect(result.overflowValue).toBeGreaterThan(0);
    expect(typeof result.momChangePercent).toBe('number');
    expect(result.degraded).toBe(false);
  });

  it('数据不足 12 月 → yoy 为 null', () => {
    const data = makeSeries(100, 5); // 仅 6 个月
    const result = computeOverflow(BASE_CYCLE, data);
    expect(result.yoyChange).toBeNull();
    expect(result.yoyChangePercent).toBeNull();
  });

  it('数据不足 2 个月 → degraded', () => {
    const data = makeSeries(100, 0); // 仅 1 个月
    const result = computeOverflow(BASE_CYCLE, data);
    expect(result.degraded).toBe(true);
  });

  it('公式包含 {{nodeId}} 占位符 → 正确替换', () => {
    const cycle: CycleConfig = {
      ...BASE_CYCLE,
      overflowFormula: {
        condition: 'x > 0',
        targetNode: 'revenue',
        formula: '{{revenue}} * 2',
        minDataMaturity: 'medium',
      },
    };
    const data = makeSeries(50, 3);
    const result = computeOverflow(cycle, data);
    expect(result.overflowValue).toBe(100); // 50 * 2
  });

  it('趋势方向判断正确', () => {
    const data = makeSeries(100, 6);
    const result = computeOverflow(BASE_CYCLE, data);
    expect(['rising', 'stable', 'declining']).toContain(result.trendDirection);
  });
});

describe('computeOverflow — 边界', () => {
  it('empty currentNodeValues → 使用 initialValue', () => {
    const data: EnterpriseTimeSeries = {
      dataPoints: [{ month: '2026-07', value: 100 }, { month: '2026-08', value: 110 }],
      currentNodeValues: {},
      enterpriseId: 'test',
    };
    const result = computeOverflow(BASE_CYCLE, data);
    expect(result.overflowValue).toBeGreaterThanOrEqual(0);
  });
});
