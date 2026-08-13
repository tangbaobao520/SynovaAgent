import { describe, it, expect } from 'vitest';
import { computeRoutineDiffusion } from '../../extensions/sentinels/routine-diffusion/computes/compute-routine-diffusion';

describe('computeRoutineDiffusion', () => {
  it('空数据 degraded', () => {
    expect(computeRoutineDiffusion(0, 0).degraded).toBe(true);
  });

  it('多流程多团队 = 快速扩散', () => {
    const r = computeRoutineDiffusion(10, 3);
    expect(r.assessment).toBe('fast');
    expect(r.degraded).toBe(false);
  });

  it('少流程多团队 = 缓慢扩散', () => {
    const r = computeRoutineDiffusion(1, 5);
    expect(r.assessment).toBe('slow');
  });

  it('中等 = moderate', () => {
    const r = computeRoutineDiffusion(3, 3);
    expect(r.assessment).toBe('moderate');
  });
});
