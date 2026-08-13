import { describe, it, expect } from 'vitest';
import { computeModelCoherence } from '../../extensions/sentinels/business-model-coherence/computes/model-consistency-score';
describe('computeModelCoherence', () => {
  it('空degraded', () => { expect(computeModelCoherence([]).degraded).toBe(true); });
  it('完整定义=高一致性', () => { const r = computeModelCoherence([{type:'BusinessModel',props:{valueProposition:'fast'}},{type:'FINANCIAL',props:{revenue:100,cost:60}},{type:'Capability',props:{capability:'tech'}}]); expect(r.score).toBeGreaterThan(0.5); });
  it('部分定义=中等', () => { const r = computeModelCoherence([{type:'BusinessModel',props:{valueProposition:'fast'}}]); expect(r.score).toBeLessThan(0.5); });
});
