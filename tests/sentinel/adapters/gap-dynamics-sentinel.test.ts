/** tests/sentinel/adapters/gap-dynamics-sentinel.test.ts — GapDynamics 哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
const mockCompute = vi.fn();
vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/gap-dynamics', () => ({ computeDynamics: mockCompute }));
vi.mock('../../../packages/engine-core/src/engine-context', () => ({ getEngineContext: vi.fn(() => ({ database: { getDb: vi.fn(() => null) }, ruleEngine: { evaluate: vi.fn() } })) }));
let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/gap-dynamics-sentinel')).gapDynamicsSentinel; }
function ctx() { return { db: null, now: new Date('2026-06-12T09:00:00Z') }; }

describe('gapDynamicsSentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });
  it('Given 负速度(恶化) + 粘性维度 → critical + warning', async () => {
    mockCompute.mockReturnValue({ velocity: { division_of_labor: -0.12 }, acceleration: { division_of_labor: 0.01 }, phaseCoupling: [], stickyDimensions: [{ dimension: 'information_flow', variance: 0.001, monthsUnchanged: 5, interpretation: '信息流5月未变' }], overallChangeRate: -0.03 });
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings.some((f: any) => f.id.includes('velocity-neg'))).toBe(true);
    expect(r.findings.some((f: any) => f.id.includes('sticky'))).toBe(true);
  });
  it('Given 强相位耦合 (|r|>0.8) → info', async () => {
    mockCompute.mockReturnValue({ velocity: {}, acceleration: {}, phaseCoupling: [{ dim1: 'a', dim2: 'b', correlation: 0.85, lag: 0 }], stickyDimensions: [], overallChangeRate: 0.1 });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('coupling'))).toBe(true);
  });
  it('Given null → degraded', async () => {
    mockCompute.mockReturnValue(null);
    const r = await sentinel.check(ctx());
    expect(r.degraded).toBe(true);
  });
});
