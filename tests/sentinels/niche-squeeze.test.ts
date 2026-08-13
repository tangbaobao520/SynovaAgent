import { describe, it, expect } from 'vitest';
import { computeNicheSqueezeIndex } from '../../extensions/sentinels/niche-squeeze/computes/niche-squeeze-index';
describe('computeNicheSqueezeIndex', () => {
  it('空degraded', () => { expect(computeNicheSqueezeIndex([]).degraded).toBe(true); });
  it('垄断=高挤压', () => { const r = computeNicheSqueezeIndex([{name:'A',revenue:100},{name:'B',revenue:1}]); expect(r.squeeze).toBeGreaterThan(0.5); expect(r.degraded).toBe(false); });
  it('分散=低挤压', () => { const r = computeNicheSqueezeIndex(Array.from({length:15},(_,i)=>({name:String.fromCharCode(65+i),revenue:10}))); expect(r.squeeze).toBeLessThan(0.5); });
});
