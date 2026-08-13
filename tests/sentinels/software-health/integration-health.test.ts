/**
 * integration-health.test.ts — T1 computeIntegrationHealth 测试
 */
import { describe, it, expect } from 'vitest';
import { computeIntegrationHealth } from '../../../extensions/sentinels/software-health/computes/integration-health';

describe('computeIntegrationHealth', () => {
  it('should be healthy when >80% systems connected', () => {
    const tools = [
      { id: 't1', hasOutEdge: true },
      { id: 't2', hasOutEdge: true },
      { id: 't3', hasOutEdge: true },
      { id: 't4', hasOutEdge: true },
      { id: 't5', hasOutEdge: false },
    ];
    const r = computeIntegrationHealth(tools);
    expect(r.signal).toBe('healthy');
    expect(r.connectivityRate).toBe(0.8);
    expect(r.degraded).toBe(false);
  });

  it('should warn when 50-80% connected', () => {
    const tools = [
      { id: 't1', hasOutEdge: true },
      { id: 't2', hasOutEdge: true },
      { id: 't3', hasOutEdge: false },
      { id: 't4', hasOutEdge: false },
    ];
    const r = computeIntegrationHealth(tools);
    expect(r.signal).toBe('warning');
    expect(r.connectivityRate).toBe(0.5);
  });

  it('should be critical when <50% connected', () => {
    const tools = [
      { id: 't1', hasOutEdge: true },
      { id: 't2', hasOutEdge: false },
      { id: 't3', hasOutEdge: false },
    ];
    const r = computeIntegrationHealth(tools);
    expect(r.signal).toBe('critical');
    expect(r.isolatedSystems.length).toBe(2);
  });

  it('should degrade on empty data', () => {
    const r = computeIntegrationHealth([]);
    expect(r.degraded).toBe(true);
  });
});
