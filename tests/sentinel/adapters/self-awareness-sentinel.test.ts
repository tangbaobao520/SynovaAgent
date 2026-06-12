/** tests/sentinel/adapters/self-awareness-sentinel.test.ts — SelfAwareness 哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
const mockCompute = vi.fn();
vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/self-awareness', () => ({ computeSelfAwareness: mockCompute, recordSelfAssessment: vi.fn(), getSelfAssessments: vi.fn(), clearTeamSelfAssessments: vi.fn() }));
vi.mock('../../../packages/engine-core/src/engine-context', () => ({ getEngineContext: vi.fn(() => ({ database: { getDb: vi.fn(() => null) }, ruleEngine: { evaluate: vi.fn() } })) }));
let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/self-awareness-sentinel')).selfAwarenessSentinel; }
function ctx() { return { db: null, now: new Date('2026-06-12T09:00:00Z') }; }

describe('selfAwarenessSentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });
  it('Given 显著偏差维度 → warning', async () => {
    mockCompute.mockReturnValue({ deltas: [], overallGap: 0.15, significantDimensions: [{ dimension: 'div_of_labor', engineScore: 0.3, selfScore: 0.8, delta: 0.5, interpretation: '高估分工能力' }], interpretation: '有偏差' });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('delta'))).toBe(true);
  });
  it('Given 高总体偏差但无显著维度 → info', async () => {
    mockCompute.mockReturnValue({ deltas: [], overallGap: 0.35, significantDimensions: [], interpretation: '累积偏差' });
    const r = await sentinel.check(ctx());
    expect(r.findings.some((f: any) => f.id.includes('high-gap'))).toBe(true);
  });
  it('Given 无数据 → degraded', async () => {
    mockCompute.mockReturnValue({ deltas: [], overallGap: 0, significantDimensions: [], interpretation: '' });
    expect((await sentinel.check(ctx())).degraded).toBe(true);
  });
});
