/** tests/sentinel/adapters/cpc-sentinel.test.ts — CPC 哨兵单元测试 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
const mockCompute = vi.fn();
vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/cpc', () => ({ computeCPC: mockCompute }));
vi.mock('../../../packages/engine-core/src/engine-context', () => ({ getEngineContext: vi.fn(() => ({ database: { getDb: vi.fn(() => null) }, ruleEngine: { evaluate: vi.fn() } })) }));
let sentinel: any;
async function load() { sentinel = (await import('../../../src/sentinel/adapters/cpc-sentinel')).cpcSentinel; }
function ctx() { return { db: null, now: new Date('2026-06-12T09:00:00Z') }; }

describe('cpcSentinel', () => {
  beforeEach(async () => { vi.clearAllMocks(); await load(); });
  it('Given gaps + 低完备性 → critical gaps + warning', async () => {
    mockCompute.mockReturnValue({ completenessScore: 0.25, byDimension: { dim1: { score: 0.2, confidence: 'high', missingCapabilities: [] } }, gaps: [{ dimension: 'dim1', severity: 'critical', description: '缺失', suggestion: '修复' }], level: 'minimal', interpretation: '很差' });
    const r = await sentinel.check(ctx());
    expect(r.ok).toBe(true);
    expect(r.findings.some((f: any) => f.id.includes('gap-'))).toBe(true);
    expect(r.findings.some((f: any) => f.id.includes('low-score'))).toBe(true);
  });
  it('Given null → degraded', async () => {
    mockCompute.mockReturnValue(null);
    expect((await sentinel.check(ctx())).degraded).toBe(true);
  });
});
