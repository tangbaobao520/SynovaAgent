import { describe, it, expect } from 'vitest';
import { profitHealthSentinel } from '../../extensions/sentinels/profit-health/aggregate';
const mockStore = { queryNodes: () => [], queryEdges: () => [] };
describe('profit-health sentinel', () => {
  it('有 check 方法', () => { expect(typeof profitHealthSentinel.check).toBe('function'); });
  it('check 返回 SentinelFinding[]', async () => { const r = await profitHealthSentinel.check(mockStore as any, 'test-team'); expect(Array.isArray(r)).toBe(true); });
  it('空数据返回空数组', async () => { const r = await profitHealthSentinel.check(mockStore as any, 'test-team'); expect(r.length).toBe(0); });
});
