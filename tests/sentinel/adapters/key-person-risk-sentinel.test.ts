/** tests/sentinel/adapters/key-person-risk-sentinel.test.ts — KPR 哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockAnalyze = vi.fn();
const mockBuildDeps = vi.fn(() => []);
const mockBuildDomains = vi.fn(() => []);

vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/key-person-risk', () => ({
  analyzeKeyPersonRisk: (...args: unknown[]) => mockAnalyze(...args),
  buildDependenciesFromRoles: (...args: unknown[]) => mockBuildDeps(...args),
  buildKnowledgeDomains: (...args: unknown[]) => mockBuildDomains(...args),
}));

vi.mock('../../../packages/engine-core/src/engine-context', () => ({
  getEngineContext: vi.fn(() => ({ database: { getDb: vi.fn(() => null) }, ruleEngine: { evaluate: vi.fn() } })),
}));

let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/key-person-risk-sentinel')).keyPersonRiskSentinel; }
function ctx() { return { db: null, now: new Date('2026-06-13T09:00:00Z') }; }

describe('keyPersonRiskSentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });

  it('Given 高风险角色 → critical findings', async () => {
    mockAnalyze.mockReturnValue({
      teamId: 'test', busFactorReport: [],
      spofs: ['CTO'],
      topRisks: [{ roleId: 'CTO', riskScore: 9.2, reason: 'Bus Factor=1, 所有架构知识集中于一人' }],
      interpretation: '高风险',
    });
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings.some((f: any) => f.severity === 'critical')).toBe(true);
  });

  it('Given 无风险 → 空 findings', async () => {
    mockAnalyze.mockReturnValue({ teamId: 'test', busFactorReport: [], spofs: [], topRisks: [], interpretation: '健康' });
    const r = await sentinel.check(ctx());
    expect(r.findings.length).toBe(0);
  });

  it('Given analyzeKeyPersonRisk throw → ok=true, 空 findings (单团队失败不阻断)', async () => {
    mockAnalyze.mockImplementation(() => { throw new Error('Data unavailable'); });
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings.length).toBe(0);
  });
});
