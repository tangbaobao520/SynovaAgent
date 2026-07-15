/**
 * tests/cycles/overflow-dashboard.test.ts — 溢出仪表盘测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CycleRegistry } from '../../src/cycles/cycle-registry';
import type { CycleConfig } from '../../src/cycles/cycle-types';
import type { GraphStore } from '../../src/l4/graph-bridge';

const TEST_CYCLE: CycleConfig = {
  cycleId: 'test-cycle', name: '测试循环', description: '', version: '1.0.0',
  applicableIndustries: [],
  nodes: [{ id: 'n1', label: '节点1', type: 'stock', initialValue: 100 }],
  edges: [{ from: 'n1', to: 'n1', polarity: '+', delay: 2, weight: 1 }],
  overflowFormula: { condition: 'n1 > 100', targetNode: 'n1', formula: 'n1*0.5', minDataMaturity: 'medium' },
  dataMaturity: 'medium', mapping: [], crossCyclePropagation: [],
};

function createMockStore(): GraphStore {
  const snapshotData: Array<Record<string, unknown>> = [];
  return {
    createNode(type, props) { snapshotData.push(props); return 'id-1'; },
    queryNodes(type, filters) {
      return snapshotData.filter(d =>
        (!filters || Object.entries(filters).every(([k, v]) => d[k] === v))
      ).map(d => ({ id: d.id as string, type: 'OVERFLOW_SNAPSHOT', props: d as Record<string, unknown> }));
    },
    getNode: () => null, updateNode: () => {}, createNodes: () => [],
    createEdge: () => '', createEdges: () => [], queryEdges: () => [],
    deleteNode: () => {}, deleteEdge: () => {}, traverse: () => null,
    findPaths: () => [], queryTriples: () => [], getNodeAtTime: () => null,
  };
}

describe('generateOverflowDashboard', () => {
  it('生成包含注册循环的仪表盘', async () => {
    const { generateOverflowDashboard } = await import('../../src/cycles/overflow-dashboard');
    const registry = new CycleRegistry();
    registry.register(TEST_CYCLE);
    const store = createMockStore();

    const dashboard = generateOverflowDashboard('e1', registry, store);
    expect(dashboard.totalCycles).toBe(1);
    expect(dashboard.rows.length).toBe(1);
    expect(dashboard.rows[0].cycleId).toBe('test-cycle');
  });

  it('热力图为数组', async () => {
    const { generateOverflowDashboard } = await import('../../src/cycles/overflow-dashboard');
    const registry = new CycleRegistry();
    registry.register(TEST_CYCLE);
    const store = createMockStore();

    const dashboard = generateOverflowDashboard('e1', registry, store);
    expect(Array.isArray(dashboard.heatmap)).toBe(true);
    expect(Array.isArray(dashboard.conductionTimeline)).toBe(true);
  });

  it('传导时间线包含边信息', async () => {
    const { generateOverflowDashboard } = await import('../../src/cycles/overflow-dashboard');
    const registry = new CycleRegistry();
    registry.register(TEST_CYCLE);
    const store = createMockStore();

    const dashboard = generateOverflowDashboard('e1', registry, store);
    expect(dashboard.conductionTimeline.length).toBe(1);
    expect(dashboard.conductionTimeline[0].estimatedLag).toContain('2');
  });
});
