/**
 * tests/sentinels/revenue-health.test.ts — 收入健康哨兵门禁
 *
 * 覆盖（铁律 48：正常 / 降级 / 边界 三路径）:
 *   1. 契约面: check 方法存在 + 返回 SentinelFinding[]
 *   2. 降级面: 空库 → 返回空数组（不抛、不误报）
 *   3. D803 切片② 正常面: 上传形态（financialType='erp-standard' + total_revenue）必须被吃到
 *      —— 回归守卫，防 `financialType === 'revenue'` 硬编码值域断裂复发（K3 断裂②同构）
 *   4. D803 边界面: total_revenue 显式 0 仍算有收入数据（0 是合法营收值，不判空）
 */
import { describe, it, expect } from 'vitest';
import { revenueHealthSentinel } from '../../extensions/sentinels/revenue-health/aggregate';
import type { GraphStoreReader } from '../../src/l4/graph-traversal';

type Node = { id: string; type: string; props: Record<string, unknown> };

function createStore(byType: Record<string, Node[]> = {}): GraphStoreReader {
  return {
    queryNodes: (type: string) => byType[type] ?? [],
    queryEdges: () => [],
    getNode: () => null,
  };
}

const emptyStore = createStore();

/** 包一层计数 store：Client 查询次数 = 代码是否走过 `if (!revenueNodes[0]) return []` 的物理证据 */
function countingStore(store: GraphStoreReader, counter: { client: number }): GraphStoreReader {
  return {
    queryNodes: (type: string) => {
      if (type === 'Client') counter.client += 1;
      return store.queryNodes(type);
    },
    queryEdges: () => [],
    getNode: () => null,
  };
}

describe('revenue-health sentinel', () => {
  it('有 check 方法', () => { expect(typeof revenueHealthSentinel.check).toBe('function'); });

  it('check 返回 SentinelFinding[]', async () => {
    const r = await revenueHealthSentinel.check(emptyStore, 'test-team');
    expect(Array.isArray(r)).toBe(true);
  });

  it('空数据返回空数组（降级不误报）', async () => {
    const r = await revenueHealthSentinel.check(emptyStore, 'test-team');
    expect(r.length).toBe(0);
  });

  it('D803 切片②: 上传形态 financialType=erp-standard + total_revenue 被吃到（不判空）', async () => {
    const store = createStore({
      Financial: [{ id: 'fin-erp-1', type: 'Financial', props: { financialType: 'erp-standard', total_revenue: 1200000, period: '2026-Q2' } }],
    });
    const counter = { client: 0 };

    const r = await revenueHealthSentinel.check(countingStore(store, counter), 'team1');

    // 正控: Client 也被查了 ⇒ 代码走过了 `if (!revenueNodes[0]) return []`（非提前返回）
    expect(counter.client).toBe(1);
    expect(Array.isArray(r)).toBe(true);
  });

  it('D803 切片② 边界: total_revenue 显式 0 仍算有收入数据（0 是合法值，不判空）', async () => {
    const store = createStore({
      Financial: [{ id: 'fin-zero', type: 'Financial', props: { financialType: 'erp-standard', total_revenue: 0, period: '2026-Q2' } }],
    });
    const counter = { client: 0 };

    await revenueHealthSentinel.check(countingStore(store, counter), 'team1');

    // 真值判断（n.props.total_revenue）会让显式 0 判空 → counter.client=0；`!= null` 不会
    expect(counter.client).toBe(1);
  });
});
