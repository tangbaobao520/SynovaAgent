import { describe, it, expect } from 'vitest';
import { computeSaasUsageScore } from '../../extensions/sentinels/software-health/computes/saas-usage-score';
import { computeShadowItScore } from '../../extensions/sentinels/software-health/computes/shadow-it-score';

describe('computeSaasUsageScore', () => {
  it('空列表 degraded', () => {
    const r = computeSaasUsageScore([]);
    expect(r.degraded).toBe(true);
  });

  it('活跃工具应提高利用率', () => {
    const r = computeSaasUsageScore([
      { id: '1', name: 'Slack', status: 'active', category: 'communication' },
      { id: '2', name: 'Zoom', status: 'active', category: 'communication' },
    ]);
    expect(r.usageRate).toBe(1);
    expect(r.degraded).toBe(false);
  });

  it('闲置工具应降低利用率', () => {
    const r = computeSaasUsageScore([
      { id: '1', name: 'ToolA', status: 'active', category: 'prod' },
      { id: '2', name: 'ToolB', status: 'idle', category: 'prod' },
      { id: '3', name: 'ToolC', status: 'unused', category: 'prod' },
    ]);
    expect(r.usageRate).toBeCloseTo(1 / 3, 2);
  });

  it('同类超过3个应标记重叠', () => {
    const r = computeSaasUsageScore([
      { id: '1', name: 'A', status: 'active', category: 'chat' },
      { id: '2', name: 'B', status: 'active', category: 'chat' },
      { id: '3', name: 'C', status: 'active', category: 'chat' },
    ]);
    expect(r.overlappingCategories.length).toBe(1);
    expect(r.overlappingCategories[0].toolCount).toBe(3);
  });
});

describe('computeShadowItScore', () => {
  it('空列表 degraded', () => {
    const r = computeShadowItScore([]);
    expect(r.degraded).toBe(true);
  });

  it('全部授权零风险', () => {
    const r = computeShadowItScore([
      { id: '1', name: 'Slack', authorized: true, category: 'communication' },
      { id: '2', name: 'Zoom', authorized: true, category: 'communication' },
    ]);
    expect(r.unauthorizedRate).toBe(0);
  });

  it('未授权工具应提高风险', () => {
    const r = computeShadowItScore([
      { id: '1', name: 'ToolA', authorized: true, category: 'prod' },
      { id: '2', name: 'ToolB', authorized: false, category: 'file_sharing' },
      { id: '3', name: 'ToolC', authorized: false, category: 'ai_tool' },
    ]);
    expect(r.unauthorizedCount).toBe(2);
    expect(r.highRiskUnauthorized.length).toBeGreaterThan(0);
  });
});
