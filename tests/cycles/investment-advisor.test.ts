/**
 * tests/cycles/investment-advisor.test.ts — 投资建议引擎测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import type { CycleConfig } from '../../src/cycles/cycle-types';
import type { GraphStore } from '../../src/l4/graph-bridge';

const TEST_CYCLE: CycleConfig = {
  cycleId: 'test-cycle', name: '测试循环', description: '', version: '1.0.0',
  applicableIndustries: [],
  nodes: [{ id: 'n1', label: '节点1', type: 'stock', initialValue: 100 }],
  edges: [{ from: 'n1', to: 'n1', polarity: '+', delay: 1, weight: 0.5 }],
  overflowFormula: { condition: 'n1 > 100', targetNode: 'n1', formula: 'n1*0.5', minDataMaturity: 'medium' },
  dataMaturity: 'medium', mapping: [], crossCyclePropagation: [
    { targetCycleId: 'other-cycle', viaEdge: 'n1→other', strength: 0.3 },
  ],
};

function createMockStore(): GraphStore {
  return {
    createNode() { return 'id'; },
    queryNodes() { return []; },
    getNode: () => null, updateNode: () => {}, createNodes: () => [],
    createEdge: () => '', createEdges: () => [], queryEdges: () => [],
    deleteNode: () => {}, deleteEdge: () => {}, traverse: () => null,
    findPaths: () => [], queryTriples: () => [], getNodeAtTime: () => null,
  };
}

describe('simulateInvestment', () => {
  it('返回完整模拟结果', async () => {
    const { simulateInvestment } = await import('../../src/cycles/investment-advisor');
    const store = createMockStore();
    const result = simulateInvestment('test-org', 'test-cycle', 100, '扩大产能', TEST_CYCLE, store, [TEST_CYCLE]);
    expect(result.cycleId).toBe('test-cycle');
    expect(result.investmentAmount).toBe(100);
    expect(result.commitments.length).toBeGreaterThanOrEqual(3);
    expect(result.constraints.length).toBeGreaterThanOrEqual(3);
  });

  it('传导描述包含路径信息', async () => {
    const { simulateInvestment } = await import('../../src/cycles/investment-advisor');
    const store = createMockStore();
    const result = simulateInvestment('test-org', 'test-cycle', 200, '优化节点', TEST_CYCLE, store, [TEST_CYCLE]);
    expect(result.conductionDescription).toContain('节点1');
    expect(result.conductionDescription).toContain('200');
  });

  it('承诺清单含 can_do / cannot_do 标注', async () => {
    const { simulateInvestment } = await import('../../src/cycles/investment-advisor');
    const store = createMockStore();
    const result = simulateInvestment('test-org', 'test-cycle', 0, '', TEST_CYCLE, store, [TEST_CYCLE]);
    const cannotDo = result.commitments.filter(c => c.commitment === 'cannot_do');
    expect(cannotDo.length).toBeGreaterThanOrEqual(1); // amount=0 → cannot_do
  });
});
