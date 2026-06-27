import { describe, it, expect } from 'vitest';
import { computeNetworkPower } from '../../extensions/sentinels/network-power/computes/betweenness-centrality';
describe('computeNetworkPower', () => {
  it('空degraded', () => { expect(computeNetworkPower([]).degraded).toBe(true); });
  it('有节点不degraded', () => { const r = computeNetworkPower([{id:'1',type:'Person',props:{manager:'2'}},{id:'2',type:'Person',props:{}}]); expect(r.degraded).toBe(false); });
});
