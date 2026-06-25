import { describe, it, expect } from 'vitest';
import { computeDataReadiness } from '../../extensions/sentinels/data-health/computes/data-readiness-score';
import { computeDataSiloScore } from '../../extensions/sentinels/data-health/computes/data-silo-score';

describe('computeDataReadiness', () => {
  it('空列表应返回 degraded: true', () => {
    const r = computeDataReadiness([]);
    expect(r.degraded).toBe(true);
    expect(r.readiness).toBe(1);
  });

  it('结构化节点应返回高就绪度', () => {
    const r = computeDataReadiness([
      { id: '1', type: 'FINANCIAL', props: { amount: 100, period: '2024Q1', revenue: 500 } },
      { id: '2', type: 'FINANCIAL', props: { amount: 200, period: '2024Q2', cost: 300 } },
    ]);
    expect(r.readiness).toBeGreaterThan(0.5);
    expect(r.missingFieldRate).toBe(0);
    expect(r.degraded).toBe(false);
  });

  it('仅含 name 的节点应增加缺失率', () => {
    const r = computeDataReadiness([
      { id: '1', type: 'Person', props: { name: '张三' } },
      { id: '2', type: 'Person', props: { name: '李四', skill: 'AI' } },
    ]);
    expect(r.missingFieldRate).toBe(0.5);
    expect(r.degraded).toBe(false);
  });

  it('应检测 PII 字段', () => {
    const r = computeDataReadiness([
      { id: '1', type: 'Person', props: { name: '张三', phone: '13800138000' } },
    ]);
    expect(r.piiHitCount).toBe(1);
  });
});

describe('computeDataSiloScore', () => {
  it('少于2个系统应返回 degraded', () => {
    const r = computeDataSiloScore([{ id: '1', name: 'S1' }], []);
    expect(r.degraded).toBe(true);
  });

  it('完全连通的系统应零孤岛', () => {
    const systems = [
      { id: '1', name: 'S1' }, { id: '2', name: 'S2' }, { id: '3', name: 'S3' },
    ];
    const edges = [
      { from: '1', to: '2' }, { from: '2', to: '3' }, { from: '3', to: '1' },
    ];
    const r = computeDataSiloScore(systems, edges);
    expect(r.siloRate).toBe(0);
    expect(r.degraded).toBe(false);
  });

  it('孤立系统应提高孤岛率', () => {
    const systems = [
      { id: '1', name: 'S1' }, { id: '2', name: 'S2' }, { id: '3', name: 'S3' },
    ];
    const edges = [{ from: '1', to: '2' }];
    const r = computeDataSiloScore(systems, edges);
    expect(r.siloCount).toBe(1); // S3 是孤岛
    expect(r.siloRate).toBeCloseTo(1 / 3, 2);
  });
});
