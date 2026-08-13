import { describe, it, expect } from 'vitest';
import { computeCausalSequence } from '../../../extensions/sentinels/shared/computes/l3-causal/compute-causal-sequence';

describe('computeCausalSequence', () => {
  it('normal: 3 events in sequence', () => {
    const r = computeCausalSequence([
      { id: 'A', timestamp: 100, magnitude: 10 },
      { id: 'B', timestamp: 200, magnitude: 15 },
      { id: 'C', timestamp: 300, magnitude: 5 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.value).toHaveLength(2);
    expect(r.value[0].from).toBe('A');
    expect(r.value[0].to).toBe('B');
  });

  it('degraded: less than 2 events', () => {
    const r = computeCausalSequence([{ id: 'A', timestamp: 100, magnitude: 10 }]);
    expect(r.degraded).toBe(true);
    expect(r.value).toHaveLength(0);
  });

  it('boundary: zero magnitude events', () => {
    const r = computeCausalSequence([
      { id: 'A', timestamp: 100, magnitude: 0 },
      { id: 'B', timestamp: 200, magnitude: 0 },
    ]);
    expect(r.degraded).toBe(false);
    expect(r.value[0].strength).toBe(0.5);
  });
});
