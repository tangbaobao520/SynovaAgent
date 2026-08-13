import { describe, it, expect } from 'vitest';
import { computeAdaptationVelocity } from '../../extensions/sentinels/adaptation-velocity/computes/compute-adaptation-velocity';

describe('computeAdaptationVelocity', () => {
  it('空事件返回 degraded', () => {
    const r = computeAdaptationVelocity([]);
    expect(r.degraded).toBe(true);
  });

  it('调适事件多应得高分', () => {
    const r = computeAdaptationVelocity([
      { eventType: 'project_launch' },
      { eventType: 'process_change' },
      { eventType: 'strategic' },
    ]);
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.adaptationEvents).toBe(3);
    expect(r.degraded).toBe(false);
  });

  it('问题事件无调适应触发信号', () => {
    const r = computeAdaptationVelocity([
      { eventType: 'problem_detected' },
      { eventType: 'client_churn' },
      { eventType: 'problem_detected' },
    ]);
    expect(r.signals.length).toBeGreaterThan(0);
  });

  it('无调适事件应得低分', () => {
    const r = computeAdaptationVelocity([
      { eventType: 'routine_update' },
      { eventType: 'minor_change' },
    ]);
    expect(r.score).toBeLessThan(0.4);
  });
});
