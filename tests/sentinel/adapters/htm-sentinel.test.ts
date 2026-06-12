/**
 * tests/sentinel/adapters/htm-sentinel.test.ts — HTM 哨兵单元测试
 *
 * Iron Law 33: *.test.ts = 单元测试 (mock 引擎模块, 无 I/O)
 * Iron Law 0-2: ≥2 用例/函数 (happy + sad)
 *
 * 测试:
 *   Given: mock computeHTM 返回有效报告 → When: check() → Then: 返回 findings
 *   Given: mock computeHTM 返回 null → When: check() → Then: ok + degraded
 *   Given: mock computeHTM throw → When: check() → Then: ok=false + error
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SentinelContext } from '../../../src/sentinel/types';

// ═══ Mock engine-core 动态 import ═══

vi.mock('../../../packages/engine-core/src/pipeline/diagnosis/htm', () => ({
  computeHTM: vi.fn(),
}));

// ═══ Mock engine-context (DB 交换) ═══

const mockGetDb = vi.fn(() => null);
vi.mock('../../../packages/engine-core/src/engine-context', () => ({
  getEngineContext: vi.fn(() => ({
    database: { getDb: mockGetDb },
    ruleEngine: { evaluate: vi.fn() },
  })),
}));

// ═══ 需要延迟 import 以让 vi.mock 先生效 ═══
let htmSentinel: typeof import('../../../src/sentinel/adapters/htm-sentinel').htmSentinel;
let computeHTMMock: ReturnType<typeof vi.fn>;

async function loadModules() {
  const htmMod = await import('../../../src/sentinel/adapters/htm-sentinel');
  htmSentinel = htmMod.htmSentinel;
  const engineMod = await import('../../../packages/engine-core/src/pipeline/diagnosis/htm');
  computeHTMMock = engineMod.computeHTM as ReturnType<typeof vi.fn>;
}

// ═══ Helpers ═══

function makeContext(db: unknown = mockGetDb): SentinelContext {
  return { db, now: new Date('2026-06-12T09:00:00Z') };
}

function makeValidHTMReport() {
  return {
    trustCurves: [{ date: '2026-06-12', correctionRate: 0.45, autoAcceptRate: 0.55, sampleSize: 42 }],
    autoAcceptRate: 0.55,
    escalationRate: 0.12,
    agentAgentHealth: 0.3,
    trustHealthScore: 0.28, // < 0.4 → warning
    trend: 'declining' as const,
    decayEvents: [
      { date: '2026-06-11', correctionRate: 0.72, baselineRate: 0.25, severity: 'critical' as const, possibleTrigger: 'Agent 错误决策导致客户投诉' },
    ],
    singlePointRisks: [
      { agentId: 'agent-7', dependencyConcentration: 0.85, routeCount: 23, risk: 'critical' as const },
    ],
    interpretation: '信任模型显示系统性信任偏移，HITL 修正率远高于基线。',
  };
}

// ═══ Tests ═══

describe('htmSentinel', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await loadModules();
  });

  describe('check() — happy path', () => {
    it('Given 有效 HTMReport → 返回包含 trustHealth + decay + singlePointRisk 的 findings', async () => {
      computeHTMMock.mockReturnValue(makeValidHTMReport());

      const result = await htmSentinel.check(makeContext());

      expect(result.ok).toBe(true);
      expect(result.findings.length).toBeGreaterThanOrEqual(3);

      // trustHealthScore < 0.4 触发 warning
      const trustFinding = result.findings.find(f => f.id.includes('low-trust'));
      expect(trustFinding).toBeDefined();
      expect(trustFinding!.severity).toBe('warning');

      // decayEvents 触发 critical
      const decayFindings = result.findings.filter(f => f.id.includes('decay'));
      expect(decayFindings.length).toBe(1);
      expect(decayFindings[0].severity).toBe('critical');

      // singlePointRisks 触发 warning
      const sprFindings = result.findings.filter(f => f.id.includes('spr'));
      expect(sprFindings.length).toBe(1);
    });

    it('Given 健康报告 (trustHealthScore > 0.4, 无 decay, 无 SPR) → 返回空 findings', async () => {
      computeHTMMock.mockReturnValue({
        ...makeValidHTMReport(),
        trustHealthScore: 0.85,
        trend: 'stable' as const,
        decayEvents: [],
        singlePointRisks: [],
      });

      const result = await htmSentinel.check(makeContext());

      expect(result.ok).toBe(true);
      expect(result.findings.length).toBe(0);
    });
  });

  describe('check() — sad path', () => {
    it('Given computeHTM 返回 null → ok=true, degraded=true, findings=[]', async () => {
      computeHTMMock.mockReturnValue(null);

      const result = await htmSentinel.check(makeContext());

      expect(result.ok).toBe(true);
      expect(result.degraded).toBe(true);
      expect(result.findings).toEqual([]);
    });
  });

  describe('check() — error path', () => {
    it('Given computeHTM throw → ok=false, error 非空', async () => {
      computeHTMMock.mockImplementation(() => { throw new Error('SQLITE_CORRUPT: database disk image is malformed'); });

      const result = await htmSentinel.check(makeContext());

      expect(result.ok).toBe(false);
      expect(result.error).toContain('SQLITE_CORRUPT');
      expect(result.degraded).toBe(true);
      expect(result.findings).toEqual([]);
    });
  });
});
