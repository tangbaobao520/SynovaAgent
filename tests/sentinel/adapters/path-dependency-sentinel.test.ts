/** tests/sentinel/adapters/path-dependency-sentinel.test.ts — PathDep 哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
const mockDetect = vi.fn();
vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/path-dependency', () => ({ detectPathDependency: mockDetect }));
vi.mock('../../../packages/engine-core/src/engine-context', () => ({ getEngineContext: vi.fn(() => ({ database: { getDb: vi.fn(() => null) }, ruleEngine: { evaluate: vi.fn() } })) }));
let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/path-dependency-sentinel')).pathDependencySentinel; }
function ctx() { return { db: null, now: new Date('2026-06-12T09:00:00Z') }; }

describe('pathDependencySentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });
  it('Given isAnomaly=true → critical', async () => {
    mockDetect.mockReturnValue([{ dimension: 'dim1', stickinessScore: 0.9, monthsUnchanged: 8, peerAvgChangeRate: 0.1, isAnomaly: true, lockedBy: '创始人习惯', interpretation: '历史锁定' }]);
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.severity === 'critical')).toBe(true);
  });
  it('Given 高粘性但非异常 → warning', async () => {
    mockDetect.mockReturnValue([{ dimension: 'dim2', stickinessScore: 0.85, monthsUnchanged: 4, peerAvgChangeRate: 0.2, isAnomaly: false, lockedBy: null, interpretation: '偏高' }]);
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.severity === 'warning')).toBe(true);
  });
  it('Given 空数组 → 无finding', async () => {
    mockDetect.mockReturnValue([]);
    expect((await sentinel.check(ctx())).findings).toEqual([]);
  });
});
