/** tests/sentinel/adapters/token-economics-sentinel.test.ts — TokenEcon 哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockCompute = vi.fn();
vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/token-economics', () => ({
  computeTokenEconomics: (...args: unknown[]) => mockCompute(...args),
}));
vi.mock('../../../packages/engine-core/src/engine-context', () => ({
  getEngineContext: vi.fn(() => ({ database: { getDb: vi.fn(() => null) }, ruleEngine: { evaluate: vi.fn() } })),
}));

let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/token-economics-sentinel')).tokenEconomicsSentinel; }
function ctx() { return { db: null, now: new Date('2026-06-13T09:00:00Z') }; }

describe('tokenEconomicsSentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });

  it('Given 低成本效率 → 空 findings', async () => {
    mockCompute.mockReturnValue({
      teamId: 'test', totalTokenCost: 0.5, tokenCostPerDiagnosis: 0.001,
      marginEstimate: 0.8, costEfficiencyScore: 0.85, trend: 'stable',
      interpretation: '成本健康',
    });
    const r = await sentinel.check(ctx());
    expect(r.findings.length).toBe(0);
  });

  it('Given 低效率 → warning', async () => {
    mockCompute.mockReturnValue({
      teamId: 'test', totalTokenCost: 50, tokenCostPerDiagnosis: 0.05,
      marginEstimate: 0.2, costEfficiencyScore: 0.25, trend: 'stable',
      interpretation: '成本过高',
    });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('high-cost'))).toBe(true);
  });

  it('Given 下降趋势 → info', async () => {
    mockCompute.mockReturnValue({
      teamId: 'test', totalTokenCost: 5, tokenCostPerDiagnosis: 0.005,
      marginEstimate: 0.5, costEfficiencyScore: 0.6, trend: 'declining',
      interpretation: '成本上升',
    });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('trend-down'))).toBe(true);
  });

  it('Given null → degraded', async () => {
    mockCompute.mockReturnValue(null);
    expect((await sentinel.check(ctx())).degraded).toBe(true);
  });
});
