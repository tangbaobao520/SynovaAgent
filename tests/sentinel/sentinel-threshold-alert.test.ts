/**
 * tests/sentinel/sentinel-threshold-alert.test.ts
 * SYNOVA-IMPL-DSH-D356 — P0 哨兵阈值告警接线 + 降级误报修复
 *
 * 覆盖三处缺陷（K3 全链路审计 P0-1/P1-1/P1-3）:
 *   P0-1: loader 从不挂 manifest → 阈值 finding 死代码
 *   P1-1: cash-runway 阈值判断缺 !degraded 守卫 → degraded value=0 误报 critical
 *   P1-3: capital-* 缺字段 `|| 0` 静默默认 → 误报 critical
 *
 * 测试先行（铁律 0-2/48）: 每个用例含 expect() 断言，覆盖正常/降级/边界/回归。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SentinelManifest } from '../../src/sentinel/sentinel-loader';
import { injectSentinelManifest } from '../../src/sentinel/sentinel-loader';

// ═══ mock cash-runway computes（阈值判断依赖的指标，按用例注入返回值）═══
vi.mock('../../extensions/sentinels/cash-runway/computes/compute-cash-runway-months', () => ({
  computeCashRunwayMonths: vi.fn(),
}));
vi.mock('../../extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate', () => ({
  computeReceivableOverdueRate: vi.fn(),
}));
vi.mock('../../extensions/sentinels/cash-runway/computes/compute-constraint-impact', () => ({
  computeConstraintImpact: vi.fn(),
}));
vi.mock('../../extensions/sentinels/cash-runway/computes/compute-replenish-rate', () => ({
  computeReplenishRate: vi.fn(),
}));
vi.mock('../../extensions/sentinels/revenue-health/computes/compute-revenue-growth', () => ({
  computeRevenueGrowth: vi.fn(),
}));

import { cashRunwaySentinel } from '../../extensions/sentinels/cash-runway/aggregate';
import { revenueHealthSentinel } from '../../extensions/sentinels/revenue-health/aggregate';
import { capitalStructureSentinel } from '../../extensions/sentinels/_extinct/capital-structure/aggregate';
import { capitalTurnoverSentinel } from '../../extensions/sentinels/_extinct/capital-turnover/aggregate';
import { capitalEfficiencySentinel } from '../../extensions/sentinels/_extinct/capital-efficiency/aggregate';
import { computeCashRunwayMonths } from '../../extensions/sentinels/cash-runway/computes/compute-cash-runway-months';
import { computeReceivableOverdueRate } from '../../extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate';
import { computeConstraintImpact } from '../../extensions/sentinels/cash-runway/computes/compute-constraint-impact';
import { computeReplenishRate } from '../../extensions/sentinels/cash-runway/computes/compute-replenish-rate';
import { computeRevenueGrowth } from '../../extensions/sentinels/revenue-health/computes/compute-revenue-growth';

// ═══ helpers ═══

type FinNode = { id: string; type: string; props: Record<string, unknown> };

function makeStore(finNodes: FinNode[] = [], clientNodes: FinNode[] = []) {
  return {
    queryNodes: (type: string, _filters?: Record<string, unknown>) =>
      type === 'Client' ? clientNodes : finNodes,
    queryEdges: () => [],
    getNode: () => null,
  };
}

function makeManifest(name: string, thresholds: SentinelManifest['thresholds']): SentinelManifest {
  return {
    name, version: '1.0.0', type: 'sentinel', displayName: name,
    description: 'test', schedule: '0 9 * * *', expert: 'finance', priority: 'P0',
    computes: [], thresholds, aggregation: 'worst_first',
    context: { requiredDataSources: [], dataAccess: { allowedDimensions: ['financial'], sensitiveAccess: 'read' } },
    entryPoint: './aggregate.ts', exportKey: 'default',
  };
}

const cashRunwayManifest = makeManifest('cash-runway', {
  cash_runway_months: { warning: 12, critical: 6 },
  receivable_overdue: { warning: 0.15, critical: 0.3 },
});
const revenueHealthManifest = makeManifest('revenue-health', {
  customer_concentration: { warning: 0.4, critical: 0.6 },
  revenue_growth: { warning: -0.05, critical: -0.2 },
});

beforeEach(() => {
  // 默认让 constraint/replenish 不触发额外 finding
  vi.mocked(computeConstraintImpact).mockResolvedValue({
    value: 0, unit: '得分', confidence: 'low', evidence: [], degraded: true, warnings: [], computedAt: '',
  });
  vi.mocked(computeReplenishRate).mockResolvedValue({
    value: 1, unit: '比率', confidence: 'medium', evidence: [], degraded: false, warnings: [], computedAt: '',
  });
  cashRunwaySentinel.manifest = cashRunwayManifest;
  revenueHealthSentinel.manifest = revenueHealthManifest;
});

// ═══ 缺陷 A（P0-1）: loader 注入 manifest ═══

describe('injectSentinelManifest（P0-1 loader 注入）', () => {
  it('sentinelObj 为 object → 注入 manifest 且返回 true', () => {
    const sentinelObj: Record<string, unknown> = { check: () => [] };
    const injected = injectSentinelManifest(sentinelObj, cashRunwayManifest);
    expect(injected).toBe(true);
    expect((sentinelObj as { manifest?: SentinelManifest }).manifest).toBe(cashRunwayManifest);
  });

  it('sentinelObj 非 object（function）→ 跳过且不抛，返回 false', () => {
    const fn = function check(): unknown[] { return []; };
    expect(() => injectSentinelManifest(fn, cashRunwayManifest)).not.toThrow();
    expect(injectSentinelManifest(fn, cashRunwayManifest)).toBe(false);
  });
});

// ═══ 缺陷 B（P1-1）: cash-runway !degraded 守卫 ═══

describe('cash-runway threshold（P1-1 degraded 守卫）', () => {
  it('runway degraded=true value=0 → 不产出 critical（不误报现金流危急）', async () => {
    vi.mocked(computeCashRunwayMonths).mockResolvedValue({
      value: 0, unit: '个月', confidence: 'low', evidence: [], degraded: true, warnings: [], computedAt: '',
    });
    vi.mocked(computeReceivableOverdueRate).mockResolvedValue({
      value: 0, unit: '比率', confidence: 'low', evidence: [], degraded: true, warnings: [], computedAt: '',
    });
    const findings = await cashRunwaySentinel.check(makeStore(), 'team1', undefined);
    expect(findings.some(f => f.id === 'cash_critical')).toBe(false);
    expect(findings.some(f => f.id === 'cash_warning')).toBe(false);
  });

  it('runway degraded=false value=3（< critical 6）→ 产出 critical', async () => {
    vi.mocked(computeCashRunwayMonths).mockResolvedValue({
      value: 3, unit: '个月', confidence: 'high', evidence: [], degraded: false, warnings: [], computedAt: '',
    });
    vi.mocked(computeReceivableOverdueRate).mockResolvedValue({
      value: 0, unit: '比率', confidence: 'high', evidence: [], degraded: false, warnings: [], computedAt: '',
    });
    const findings = await cashRunwaySentinel.check(makeStore(), 'team1', undefined);
    expect(findings.some(f => f.id === 'cash_critical')).toBe(true);
  });

  it('overdue degraded=true → 不产出 ar critical', async () => {
    vi.mocked(computeCashRunwayMonths).mockResolvedValue({
      value: 100, unit: '个月', confidence: 'high', evidence: [], degraded: false, warnings: [], computedAt: '',
    });
    vi.mocked(computeReceivableOverdueRate).mockResolvedValue({
      value: 0.5, unit: '比率', confidence: 'low', evidence: [], degraded: true, warnings: [], computedAt: '',
    });
    const findings = await cashRunwaySentinel.check(makeStore(), 'team1', undefined);
    expect(findings.some(f => f.id === 'ar_critical')).toBe(false);
  });
});

// ═══ 缺陷 C（P1-3）: capital-* 缺字段检查 ═══

describe('capital-structure（P1-3 缺字段 ≠ 0）', () => {
  it('totalDebt 缺失 → 返回 []（不误报利息覆盖 0.0x）', async () => {
    const store = makeStore([{
      id: 'f1', type: 'Financial',
      props: { equity: 100, operatingIncome: 2, interestExpense: 10, shortTermDebt: 0, longTermDebt: 0 },
    }]);
    const findings = await capitalStructureSentinel.check(store, 'team1', undefined);
    expect(findings).toEqual([]);
  });

  it('totalDebt=0（字段存在且值为 0）→ 正常参与计算，不误判缺失', async () => {
    const store = makeStore([{
      id: 'f1', type: 'Financial',
      props: { totalDebt: 0, equity: 100, operatingIncome: 2, interestExpense: 10, shortTermDebt: 0, longTermDebt: 0 },
    }]);
    const findings = await capitalStructureSentinel.check(store, 'team1', undefined);
    // operatingIncome=2 / interestExpense=10 → icr=0.2 < 1.5 → 应产出 ICR critical
    expect(findings.some(f => f.id?.startsWith('f2-icr-crit'))).toBe(true);
  });

  it('空 financials（无 Financial 节点）→ 返回 [] 不抛', async () => {
    const findings = await capitalStructureSentinel.check(makeStore(), 'team1', undefined);
    expect(findings).toEqual([]);
  });
});

describe('capital-turnover（P1-3 缺字段检查）', () => {
  it('revenue 缺失 → 返回 []（不误报总资产周转率过低）', async () => {
    const store = makeStore([{ id: 'f1', type: 'Financial', props: { currentAssets: 100 } }]);
    const findings = await capitalTurnoverSentinel.check(store, 'team1', undefined);
    expect(findings).toEqual([]);
  });
});

describe('capital-efficiency（P1-3 缺字段检查）', () => {
  it('totalDebt/equity 缺失 → 返回 []（不误报价值毁灭）', async () => {
    const store = makeStore([{ id: 'f1', type: 'Financial', props: { revenue: 100, cost: 200 } }]);
    const findings = await capitalEfficiencySentinel.check(store, 'team1', undefined);
    expect(findings).toEqual([]);
  });
});

// ═══ 回归: revenue-health degraded 守卫不回归 ═══

describe('revenue-health（回归: degraded 守卫）', () => {
  it('growth degraded=true → 不产出 rev_growth_critical', async () => {
    vi.mocked(computeRevenueGrowth).mockResolvedValue({
      value: -0.5, unit: '比率', confidence: 'low', evidence: [], degraded: true, warnings: [], computedAt: '',
      totalRevenue: 0, previousRevenue: 0,
    });
    const store = makeStore([{ id: 'f1', type: 'Financial', props: { financialType: 'revenue', amount: 100 } }]);
    const findings = await revenueHealthSentinel.check(store, 'team1', undefined);
    expect(findings.some(f => f.id === 'rev_growth_critical')).toBe(false);
  });
});
