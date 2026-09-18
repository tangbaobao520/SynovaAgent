/**
 * tests/sentinels/cash-runway/compute-cash-runway-months.test.ts
 *
 * D803 切片③（10-4 加固）：跑道计算的字段语义契约 + 存在性守卫回归守卫。
 *
 * 覆盖矩阵（铁律 48：正常 / 降级 / 边界 三路径；S-5：red 覆盖失败模式，非仅 happy path）:
 *   正常  — 遍历分支 / 回退分支 / 消耗链三级兜底 / Infinity 边界
 *   降级  — 无节点（无数据）/ 现金属性缺失（S4 行2 误报根因）/ 图遍历异常 / 存储异常
 *   边界  — cash 显式 0 是合法值（不降级、不被 `||` 穿透成 total_revenue）
 *   反向  — 现金链不得把 total_revenue 当现金（守 K3 断裂②，反向验证第 3 条）
 */
import { describe, it, expect } from 'vitest';
import {
  computeCashRunwayMonths,
  pickPresentNumber,
  CASH_PROP_CHAIN,
} from '../../../extensions/sentinels/cash-runway/computes/compute-cash-runway-months';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

type Node = { id: string; type: string; props: Record<string, unknown> };

function createMockStore(nodes: Node[]): GraphStoreReader {
  return {
    queryNodes: () => nodes,
    queryEdges: () => [],
    getNode: () => null,
  };
}

/** 遍历分支桩（result.nodes[0] 存在 → 走遍历分支） */
function traversalOf(nodes: Node[]) {
  return {
    traverse: () => ({ nodes, edges: [], path: nodes.map((n) => n.id), degraded: false, warnings: [] }),
  };
}

const fin = (props: Record<string, unknown>, id = 'fin1'): Node => ({ id, type: 'Financial', props });

describe('computeCashRunwayMonths', () => {
  // ─── 既有回归（D355 / P1-1 已修路径，不得回退） ───
  it('should compute runway from traversal data', async () => {
    const store = createMockStore([]);
    const result = await computeCashRunwayMonths(store, {
      teamId: 'team1',
      traversal: traversalOf([fin({ cash_balance: 120000, monthly_burn: 10000 })]) as never,
    });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(12); // 120000 / 10000 = 12 months
    expect(result.unit).toBe('个月');
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  it('should degrade on empty data', async () => {
    const store = createMockStore([]);
    const result = await computeCashRunwayMonths(store, { teamId: 'empty-team' });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
    expect(result.warnings.some((w) => w.includes('无财务数据'))).toBe(true);
  });

  it('should handle Infinity runway (zero burn, positive cash)', async () => {
    const store = createMockStore([fin({ cash: 50000, operating_expense: 0 })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(Infinity);
  });

  it('should fallback to queryNodes when traversal fails', async () => {
    const store = createMockStore([fin({ cash: 100000, amount: 20000 })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(5); // 100000 / 20000 = 5
  });

  it('should query Financial nodes without teamId-value filter (D355 fix)', async () => {
    let capturedFilter: Record<string, unknown> | undefined;
    const store: GraphStoreReader = {
      queryNodes: (type, filter) => { capturedFilter = filter; return []; },
      queryEdges: () => [],
      getNode: () => null,
    };
    await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(capturedFilter).toBeUndefined(); // 修复前是 { team1: 'team1' }（永不匹配）
  });

  it('should handle exceptions gracefully', async () => {
    const brokenStore = {
      queryNodes: () => { throw new Error('DB down'); },
      queryEdges: () => { throw new Error('DB down'); },
      getNode: () => null,
    };
    const result = await computeCashRunwayMonths(brokenStore as unknown as GraphStoreReader, { teamId: 'team1' });
    expect(result.degraded).toBe(true);
  });

  // ─── D803 切片③ 新增：降级路径（S4 行2 误报 critical 根因） ───
  it('降级: 现金属性不存在而月消耗>0 → degraded，不产 runway=0（S4 行2 red→green）', async () => {
    // 上传形态：只上报收入与费用，没上报现金 → 修复前 totalCash=0 → runway 0 → critical 误报
    const store = createMockStore([fin({ financialType: 'erp-standard', total_revenue: 1200000, operating_expense: 120000, period: '2026-Q2' })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(true);
    expect(result.warnings.some((w) => w.includes('现金字段缺失'))).toBe(true);
  });

  it('降级: 现金属性不存在且月消耗=0 → 仍 degraded（不把「不知道」说成「跑道 0 个月」）', async () => {
    const store = createMockStore([fin({ financialType: 'erp-standard', total_revenue: 1200000, period: '2026-Q2' })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(true);
    expect(result.warnings.some((w) => w.includes('现金字段缺失'))).toBe(true);
  });

  it('降级: 遍历分支 total_revenue 在而现金链全缺 → degraded（现金链不得挪用收入）', async () => {
    const store = createMockStore([]);
    const result = await computeCashRunwayMonths(store, {
      teamId: 'team1',
      traversal: traversalOf([fin({ total_revenue: 1200000, monthly_burn: 120000 })]) as never,
    });
    expect(result.degraded).toBe(true);
    expect(result.warnings.some((w) => w.includes('现金字段缺失'))).toBe(true);
  });

  // ─── D803 切片③ 新增：边界（0 是合法值） ───
  it('边界: cash 显式 0 + 月消耗>0 → 非 degraded，value=0（0 是合法值，仍走阈值门）', async () => {
    const store = createMockStore([fin({ cash: 0, operating_expense: 120000 })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0); // 真没钱 = 0 个月跑道 → 该告警
  });

  it('边界: cash 显式 0 不被 `||` 穿透成 total_revenue（0 是真值，不是缺失）', async () => {
    const store = createMockStore([fin({ cash: 0, total_revenue: 1200000, operating_expense: 120000 })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0); // 若 0 被穿透 → 1200000/120000 = 10（掩盖真没钱）
  });

  // ─── D803 切片③ 新增：字段链（消耗链三级兜底） ───
  it('字段链: monthly_burn 缺 → operating_expense 被吃到（erp-standard 写侧名）', async () => {
    const store = createMockStore([fin({ cash: 240000, operating_expense: 120000 })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.value).toBe(2); // 240000 / 120000
    expect(result.degraded).toBe(false);
  });

  it('字段链: monthly_burn/operating_expense 缺 → total_cost 兜底', async () => {
    const store = createMockStore([fin({ cash: 240000, total_cost: 80000 })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.value).toBe(3); // 240000 / 80000
  });

  it('字段链: 现金链 cash_balance 优先于 cash（本体 schema 名兜底）', async () => {
    const store = createMockStore([fin({ cash_balance: 60000, cash: 999 })]);
    const result = await computeCashRunwayMonths(store, { teamId: 'team1' });
    expect(result.evidence.some((e) => e.includes('总现金: 60000'))).toBe(true);
  });
});

describe('pickPresentNumber（存在性守卫原语）', () => {
  it('属性缺失 → found=false（区别于值为 0）', () => {
    expect(pickPresentNumber({}, CASH_PROP_CHAIN)).toEqual({ found: false, value: 0 });
  });

  it('属性存在且值为 0 → found=true, value=0（0 是合法值，不被穿透）', () => {
    expect(pickPresentNumber({ cash: 0, cash_balance: undefined }, CASH_PROP_CHAIN)).toEqual({ found: true, value: 0 });
  });

  it('属性存在但值坏 → 跳过该键继续找可解析的候选', () => {
    expect(pickPresentNumber({ cash_balance: 'abc', cash: 5000 }, CASH_PROP_CHAIN)).toEqual({ found: true, value: 5000 });
  });

  it('边界: 全候选都坏 → found=true, value=0（有键但值坏 ≠ 键缺失）', () => {
    expect(pickPresentNumber({ cash: 'abc' }, CASH_PROP_CHAIN)).toEqual({ found: true, value: 0 });
  });
});
