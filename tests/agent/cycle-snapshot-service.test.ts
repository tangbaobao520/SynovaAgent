/**
 * tests/agent/cycle-snapshot-service.test.ts — L2 循环快照查询服务（D603 簇3）配对测试
 *
 * 契约（铁律 47）—— src/agent/cycle-snapshot-service.ts（纯转发 re-export）：
 *   @input  getCycleSnapshots(orgId, cycleId, graphStore, opts?) / getLatestSnapshot(orgId, cycleId, graphStore)
 *   @output 查询签名与结果原样传播（转发不换语义）
 *   @degraded 无——本服务不吞错；graphStore 不可用时的降级在 cycles 源实现与调用方
 *
 * 覆盖矩阵（铁律 48）：[回归] 与源模块导出同一函数（L1→L2 桥唯一契约）/
 * [正常] 转发调用真实到达源实现（内存桩 GraphStore 读写一致）
 */
import { describe, it, expect } from 'vitest';
import {
  getCycleSnapshots,
  getLatestSnapshot,
} from '../../src/agent/cycle-snapshot-service';
import {
  getCycleSnapshots as getCycleSnapshotsDirect,
  getLatestSnapshot as getLatestSnapshotDirect,
} from '../../src/cycles/overflow-graph-bridge';

describe('cycle-snapshot-service — 纯转发桥', () => {
  it('[回归] 与源模块导出同一函数（转发不换语义）', () => {
    expect(getCycleSnapshots).toBe(getCycleSnapshotsDirect);
    expect(getLatestSnapshot).toBe(getLatestSnapshotDirect);
  });

  it('[正常] 转发调用到达源实现：桩 GraphStore 的快照经桥原样读回', () => {
    // GraphStore.queryNodes 真实签名（graph-bridge.ts:33）；props 即 OverflowSnapshot 载荷
    const stubGraphStore = {
      queryNodes: () => [
        { id: 'n1', type: 'overflow_snapshot', props: { rev: 1, enterpriseId: 'org-x', cycleId: 'cycle-1' } },
      ],
    } as unknown as Parameters<typeof getCycleSnapshots>[2];

    const snapshots = getCycleSnapshots('org-x', 'cycle-1', stubGraphStore, { limit: 3 });
    expect(Array.isArray(snapshots)).toBe(true);
    expect((snapshots[0] as unknown as { rev: number }).rev).toBe(1);

    const latest = getLatestSnapshot('org-x', 'cycle-1', stubGraphStore);
    expect(latest === null || typeof latest === 'object').toBe(true);
  });
});
