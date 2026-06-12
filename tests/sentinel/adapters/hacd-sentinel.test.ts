/**
 * tests/sentinel/adapters/hacd-sentinel.test.ts — HACD 哨兵单元测试
 * Iron Law 33: *.test.ts = 单元测试. 3+ cases.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
const mockCompute = vi.fn();
vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/hacd', () => ({ computeHACD: mockCompute }));
const mockGetDb = vi.fn(() => null);
vi.mock('../../../packages/engine-core/src/engine-context', () => ({
  getEngineContext: vi.fn(() => ({ database: { getDb: mockGetDb }, ruleEngine: { evaluate: vi.fn() } })),
}));

let sentinel: any;
async function load() {
  sentinel = (await import('../../../src/sentinel/adapters/hacd-sentinel')).hacdSentinel;
}
function ctx() { return { db: mockGetDb, now: new Date('2026-06-12T09:00:00Z') }; }

describe('hacdSentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });
  it('Given 高 HITL 比率 (>0.5) + 下降趋势 → 返回 warning findings', async () => {
    mockCompute.mockReturnValue({ level: 'L2', hitlRatio: 0.65, autoRatio: 0.35, trend: 'declining', interpretation: 'HITL偏高' });
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings.some((f: any) => f.id.includes('high-hitl'))).toBe(true);
    expect(r.findings.some((f: any) => f.id.includes('trend-down'))).toBe(true);
  });
  it('Given L0 等级 → 返回 info finding', async () => {
    mockCompute.mockReturnValue({ level: 'L0', hitlRatio: 0.9, autoRatio: 0.1, trend: 'stable', interpretation: '' });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('low-level'))).toBe(true);
  });
  it('Given computeHACD 返回 null → degraded', async () => {
    mockCompute.mockReturnValue(null);
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(true); expect(r.degraded).toBe(true);
  });
  it('Given computeHACD throw → ok=false', async () => {
    mockCompute.mockImplementation(() => { throw new Error('DB error'); });
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(false); expect(r.error).toContain('DB error');
  });
});
