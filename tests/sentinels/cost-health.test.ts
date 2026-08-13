import { describe, it, expect } from 'vitest';
import { costHealthSentinel } from '../../extensions/sentinels/cost-health/aggregate';
const mockStore = { queryNodes: () => [], queryEdges: () => [] };
describe('cost-health sentinel', () => {
  it('有 check 方法', () => { expect(typeof costHealthSentinel.check).toBe('function'); });
  it('check 返回 SentinelFinding[]', async () => { const r = await costHealthSentinel.check(mockStore as any, 'test-team'); expect(Array.isArray(r)).toBe(true); });
  it('空数据返回空数组', async () => { const r = await costHealthSentinel.check(mockStore as any, 'test-team'); expect(r.length).toBe(0); });
});
