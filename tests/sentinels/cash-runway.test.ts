import { describe, it, expect } from 'vitest';
import { cashRunwaySentinel } from '../../extensions/sentinels/cash-runway/aggregate';
const mockStore = { queryNodes: () => [], queryEdges: () => [] };
describe('cash-runway sentinel', () => {
  it('有 check 方法', () => { expect(typeof cashRunwaySentinel.check).toBe('function'); });
  it('check 返回 SentinelFinding[]', async () => { const r = await cashRunwaySentinel.check(mockStore as any, 'test-team'); expect(Array.isArray(r)).toBe(true); });
  it('空数据返回空数组', async () => { const r = await cashRunwaySentinel.check(mockStore as any, 'test-team'); expect(r.length).toBe(0); });
});
