/**
 * tests/sentinels/cash-runway/compute-receivable-overdue-rate.test.ts
 *
 * D803 切片③（10-4 加固）：应收逾期率的字段语义契约 + 存在性守卫回归守卫。
 *
 * 覆盖矩阵（铁律 48：正常 / 降级 / 边界 三路径）:
 *   正常  — 遍历分支 / 本体 schema 名（receivables）与遗留别名（accounts_receivable）互认
 *   降级  — 无节点（无数据）/ 应收>0 而现金未上报（分母不存在，诚实降级）
 *   边界  — 现金显式 0 → 不降级（0 是合法值）；应收缺失 → 0 不告警（S2 行12 无害）
 *   反向  — 现金链不得把 total_revenue 当现金（守 K3 断裂②，反向验证第 2/3 条）
 */
import { describe, it, expect } from 'vitest';
import { computeReceivableOverdueRate } from '../../../extensions/sentinels/cash-runway/computes/compute-receivable-overdue-rate';
import type { GraphStoreReader } from '../../../src/l4/graph-traversal';

type Node = { id: string; type: string; props: Record<string, unknown> };

function createMockStore(nodes: Node[]): GraphStoreReader {
  return {
    queryNodes: () => nodes,
    queryEdges: () => [],
    getNode: () => null,
  };
}

function traversalOf(nodes: Node[]) {
  return {
    traverse: () => ({ nodes, edges: [], path: nodes.map((n) => n.id), degraded: false, warnings: [] }),
  };
}

const fin = (props: Record<string, unknown>, id = 'fin1'): Node => ({ id, type: 'Financial', props });

describe('computeReceivableOverdueRate', () => {
  // ─── 既有回归 ───
  it('should compute overdue rate from traversal data', async () => {
    const store = createMockStore([]);
    const result = await computeReceivableOverdueRate(store, {
      teamId: 'team1',
      traversal: traversalOf([fin({ cash_balance: 100000, accounts_receivable: 25000 })]) as never,
    });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0.25); // 25000 / 100000
    expect(result.unit).toBe('比率');
  });

  it('should degrade on empty data', async () => {
    const store = createMockStore([]);
    const result = await computeReceivableOverdueRate(store, { teamId: 'empty-team' });
    expect(result.degraded).toBe(true);
    expect(result.value).toBe(0);
    expect(result.warnings.some((w) => w.includes('无财务数据'))).toBe(true);
  });

  // ─── D803 切片③ 新增 ───
  it('边界: 现金显式 0 → 非 degraded（0 是合法值，比率按既有语义算 0）', async () => {
    const store = createMockStore([fin({ cash: 0, receivables: 5000 })]);
    const result = await computeReceivableOverdueRate(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0);
  });

  it('降级: 应收>0 而现金链属性全缺 → degraded（分母不存在，不静默算 0）', async () => {
    // 上传形态：报了应收没报现金 → 修复前 totalCash=0 → 比率 0 → 静默「没问题」
    const store = createMockStore([fin({ financialType: 'erp-standard', receivables: 80000, total_revenue: 1200000 })]);
    const result = await computeReceivableOverdueRate(store, { teamId: 'team1' });
    expect(result.degraded).toBe(true);
    expect(result.warnings.some((w) => w.includes('现金字段缺失'))).toBe(true);
  });

  it('降级: 遍历分支 total_revenue 在而现金链全缺 + 应收>0 → degraded（不得把收入当现金当分母）', async () => {
    const store = createMockStore([]);
    const result = await computeReceivableOverdueRate(store, {
      teamId: 'team1',
      traversal: traversalOf([fin({ total_revenue: 1200000, accounts_receivable: 80000 })]) as never,
    });
    expect(result.degraded).toBe(true);
    expect(result.warnings.some((w) => w.includes('现金字段缺失'))).toBe(true);
  });

  it('字段链: 本体 schema 名 receivables 与遗留别名 accounts_receivable 互认（遍历/回退两分支同口径）', async () => {
    const store = createMockStore([fin({ cash: 100000, receivables: 30000 })]);
    const viaFallback = await computeReceivableOverdueRate(store, { teamId: 'team1' });
    expect(viaFallback.value).toBe(0.3); // 30000 / 100000

    const viaTraversal = await computeReceivableOverdueRate(createMockStore([]), {
      teamId: 'team1',
      traversal: traversalOf([fin({ cash: 100000, receivables: 30000 })]) as never,
    });
    expect(viaTraversal.value).toBe(0.3); // 修复前遍历分支只读 accounts_receivable → 0
  });

  it('边界: 应收缺失 → 0 且不降级（无害，S2 行12）', async () => {
    const store = createMockStore([fin({ cash: 100000 })]);
    const result = await computeReceivableOverdueRate(store, { teamId: 'team1' });
    expect(result.degraded).toBe(false);
    expect(result.value).toBe(0);
  });

  it('should handle exceptions gracefully', async () => {
    const brokenStore = {
      queryNodes: () => { throw new Error('DB down'); },
      queryEdges: () => { throw new Error('DB down'); },
      getNode: () => null,
    };
    const result = await computeReceivableOverdueRate(brokenStore as unknown as GraphStoreReader, { teamId: 'team1' });
    expect(result.degraded).toBe(true);
  });
});
