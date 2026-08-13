/**
 * tests/cycles/overflow-graph-bridge.test.ts — OverflowGraphBridge 测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { GraphStore } from '../../src/l4/graph-bridge';
import type { OverflowSnapshot } from '../../src/cycles/overflow-compute';

function createMockStore(): { store: GraphStore; nodes: Map<string, unknown> } {
  const nodes = new Map<string, unknown>();
  const store: GraphStore = {
    createNode(type, props) {
      const id = (props.id as string) || `node-${nodes.size}`;
      nodes.set(id, { id, type, props });
      return id;
    },
    queryNodes(type, filters) {
      return [...nodes.values()]
        .filter(n => {
          const node = n as { id: string; type: string; props: Record<string, unknown> };
          if (node.type !== type) return false;
          if (filters) {
            for (const [k, v] of Object.entries(filters)) {
              if (node.props[k] !== v) return false;
            }
          }
          return true;
        }) as Array<{ id: string; type: string; props: Record<string, unknown> }>;
    },
    getNode: () => null, updateNode: () => {}, createNodes: () => [], createEdge: () => '',
    createEdges: () => [], queryEdges: () => [], deleteNode: () => {}, deleteEdge: () => {},
    traverse: () => null, findPaths: () => [], queryTriples: () => [], getNodeAtTime: () => null,
  };
  return { store, nodes };
}

describe('OverflowGraphBridge', () => {
  describe('writeOverflowSnapshot', () => {
    it('写入快照 → 节点创建成功', async () => {
      const { writeOverflowSnapshot } = await import('../../src/cycles/overflow-graph-bridge');
      const { store, nodes } = createMockStore();
      const snapshot: OverflowSnapshot = {
        cycleId: 'test-cycle', month: '2026-07', overflowValue: 50, unit: '万',
        trend: '上升', trendDelta: 5, maturity: 'active', isIndustryBaseline: false,
        momChange: 5, momChangePercent: 10, yoyChange: 15, yoyChangePercent: 30,
        trendDirection: 'rising', consecutiveDirection: 3, degraded: false,
      };
      writeOverflowSnapshot('enterprise-1', 'test-cycle', snapshot, store);
      expect(nodes.size).toBe(1);
    });
  });

  describe('getCycleSnapshots', () => {
    it('写入后查询 → 返回快照列表', async () => {
      const { writeOverflowSnapshot, getCycleSnapshots } = await import('../../src/cycles/overflow-graph-bridge');
      const { store } = createMockStore();
      const s: OverflowSnapshot = {
        cycleId: 'c1', month: '2026-07', overflowValue: 50, unit: '万',
        trend: '', trendDelta: 0, maturity: 'active', isIndustryBaseline: false,
        momChange: 0, momChangePercent: 0, yoyChange: null, yoyChangePercent: null,
        trendDirection: 'stable', consecutiveDirection: 0, degraded: false,
      };
      writeOverflowSnapshot('e1', 'c1', s, store);
      const snapshots = getCycleSnapshots('e1', 'c1', store);
      expect(snapshots.length).toBe(1);
      expect(snapshots[0].cycleId).toBe('c1');
    });

    it('不存在的 ciclo → 空数组', async () => {
      const { getCycleSnapshots } = await import('../../src/cycles/overflow-graph-bridge');
      const { store } = createMockStore();
      const snapshots = getCycleSnapshots('e1', 'nonexistent', store);
      expect(snapshots.length).toBe(0);
    });
  });

  describe('getLatestSnapshot', () => {
    it('返回最新快照', async () => {
      const { writeOverflowSnapshot, getLatestSnapshot } = await import('../../src/cycles/overflow-graph-bridge');
      const { store } = createMockStore();
      const s1: OverflowSnapshot = {
        cycleId: 'c1', month: '2026-06', overflowValue: 40, unit: '万',
        trend: '', trendDelta: 0, maturity: 'active', isIndustryBaseline: false,
        momChange: 0, momChangePercent: 0, yoyChange: null, yoyChangePercent: null,
        trendDirection: 'stable', consecutiveDirection: 0, degraded: false,
      };
      const s2: OverflowSnapshot = { ...s1, month: '2026-07', overflowValue: 50 };
      writeOverflowSnapshot('e1', 'c1', s1, store);
      writeOverflowSnapshot('e1', 'c1', s2, store);
      const latest = getLatestSnapshot('e1', 'c1', store);
      expect(latest).not.toBeNull();
      expect(latest?.month).toBe('2026-07');
    });
  });
});
