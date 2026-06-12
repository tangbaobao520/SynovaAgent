/** tests/sentinel/adapters/seven-powers-sentinel.test.ts — 7Powers 哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
const mockCompute = vi.fn();
vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/seven-powers', () => ({ computeSevenPowers: mockCompute }));
vi.mock('../../../packages/engine-core/src/engine-context', () => ({ getEngineContext: vi.fn(() => ({ database: { getDb: vi.fn(() => null) }, ruleEngine: { evaluate: vi.fn() } })) }));
let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/seven-powers-sentinel')).sevenPowersSentinel; }
function ctx() { return { db: null, now: new Date('2026-06-12T09:00:00Z') }; }

describe('sevenPowersSentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });
  it('Given 薄弱护城河 (<0.3) → warning', async () => {
    mockCompute.mockReturnValue({ powers: [{ power: 'Scale', score: 0.2, confidence: 'medium', evidence: [], method: 'keyword' }], overallMoatStrength: 0.15, strongestPower: 'Scale', weakestPower: 'Scale', interpretation: '壁垒薄弱' });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('weak-moat'))).toBe(true);
  });
  it('Given 最强力量<0.5 但整体>0.3 → warning (无 standout)', async () => {
    mockCompute.mockReturnValue({ powers: [{ power: 'Brand', score: 0.45, confidence: 'high', evidence: ['客户访谈'], method: 'survey' }], overallMoatStrength: 0.4, strongestPower: 'Brand', weakestPower: 'Brand', interpretation: '' });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('no-standout'))).toBe(true);
  });
  it('Given 健康护城河 (>0.5) → 空 findings', async () => {
    mockCompute.mockReturnValue({ powers: [{ power: 'Network', score: 0.75, confidence: 'high', evidence: ['DAU/MAU 高'], method: 'metric' }], overallMoatStrength: 0.7, strongestPower: 'Network', weakestPower: 'Network', interpretation: '强壁垒' });
    const r = await sentinel.check(ctx());
    expect(r.findings.length).toBe(0);
  });
});
