/**
 * tests/l4/traversal-permission-filter.test.ts — TraversalPermissionFilter 单元测试
 *
 * 覆盖: manager部门过滤 / admin放行 / staff敏感度过滤 /
 *       全裁剪边界 / 全局节点 / nodeType白名单
 * 要求: ≥6 个测试用例
 */
import { describe, it, expect } from 'vitest';
import { TraversalPermissionFilter } from '../../src/l4/traversal-permission-filter';
import type { GraphTraversal, TraversalResult } from '../../src/l4/graph-traversal';

// ═══ Mock 辅助 ═══

interface MockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

interface MockEdge {
  id: string;
  type: string;
  from: string;
  to: string;
  weight: number;
  props: Record<string, unknown>;
}

function makeTraversalMock(result: TraversalResult): GraphTraversal {
  return {
    traverse: () => result,
    getTemporalParams: () => ({
      current: 0,
      window_3m: { mean: 0, slope: 0, variance: 0 },
      window_12m: { mean: 0, slope: 0, variance: 0 },
      trend: 'stable' as const,
    }),
    scanOutliers: () => [],
    evaluateEdges: () => [],
  };
}

function makeNode(id: string, overrides: Partial<MockNode> = {}): MockNode {
  return { id, type: 'Financial', props: {}, ...overrides };
}

function makeEdge(id: string, from: string, to: string, overrides: Partial<MockEdge> = {}): MockEdge {
  return { id, type: 'DEPLOYS', from, to, weight: 1, props: {}, ...overrides };
}

describe('TraversalPermissionFilter', () => {
  // ═══ Manager: 本部门节点保留，其他部门裁剪 ═══

  it('manager → 本department节点保留，其他department被裁剪', () => {
    const rawResult: TraversalResult = {
      nodes: [
        makeNode('n1', { props: { department: 'eng' } }),
        makeNode('n2', { props: { department: 'eng' } }),
        makeNode('n3', { props: { department: 'sales' } }),
        makeNode('n4', { props: {} }), // 无 department → 不过滤
      ],
      edges: [
        makeEdge('e1', 'n1', 'n2'),
        makeEdge('e2', 'n1', 'n3'), // n3 被裁 → 此边应移除
        makeEdge('e3', 'n1', 'n4'),
      ],
      path: ['n1', 'n2', 'n3', 'n4'],
      degraded: false,
      warnings: [],
    };

    const mock = makeTraversalMock(rawResult);
    const filter = new TraversalPermissionFilter(mock);

    const result = filter.traverseFiltered(
      { role: 'manager', department: 'eng', clearance: 'S2' },
      ['n1'], ['DEPLOYS'], 3,
    );

    // n3 被裁剪 (sales)
    expect(result.nodes.map(n => n.id)).toEqual(['n1', 'n2', 'n4']);
    // e2 (n1→n3) 被移除
    expect(result.edges.map(e => e.id)).toEqual(['e1', 'e3']);
    // warnings 包含裁剪计数
    expect(result.warnings.some(w => w.includes('pruned'))).toBe(true);
  });

  // ═══ Admin: 不做裁剪 ═══

  it('admin → 全部节点通过', () => {
    const rawResult: TraversalResult = {
      nodes: [
        makeNode('n1', { props: { department: 'sales', sensitivity: 'S4' } }),
        makeNode('n2', { props: { department: 'eng', sensitivity: 'S3' } }),
      ],
      edges: [makeEdge('e1', 'n1', 'n2')],
      path: ['n1', 'n2'],
      degraded: false,
      warnings: [],
    };

    const mock = makeTraversalMock(rawResult);
    const filter = new TraversalPermissionFilter(mock);

    const result = filter.traverseFiltered(
      { role: 'admin', clearance: 'S0' },
      ['n1'], ['DEPLOYS'], 3,
    );

    // admin 全部放行
    expect(result.nodes).toHaveLength(2);
    expect(result.edges).toHaveLength(1);
    expect(result.warnings.some(w => w.includes('pruned'))).toBe(false);
  });

  // ═══ Staff: S3/S4 敏感节点被过滤 ═══

  it('staff → S3/S4节点被过滤, S0-S1通过', () => {
    const rawResult: TraversalResult = {
      nodes: [
        makeNode('n1', { props: { sensitivity: 'S0' } }),
        makeNode('n2', { props: { sensitivity: 'S1' } }),
        makeNode('n3', { props: { sensitivity: 'S3' } }),
        makeNode('n4', { props: { sensitivity: 'S4' } }),
        makeNode('n5', { props: {} }), // 默认 S0
      ],
      edges: [
        makeEdge('e1', 'n1', 'n2'),
        makeEdge('e2', 'n2', 'n3'), // n3 被裁 → 移除
        makeEdge('e3', 'n3', 'n4'), // 两端都被裁
        makeEdge('e4', 'n1', 'n5'),
      ],
      path: ['n1', 'n2', 'n3', 'n4', 'n5'],
      degraded: false,
      warnings: [],
    };

    const mock = makeTraversalMock(rawResult);
    const filter = new TraversalPermissionFilter(mock);

    const result = filter.traverseFiltered(
      { role: 'staff', clearance: 'S1' },
      ['n1'], ['DEPLOYS'], 3,
    );

    const nodeIds = result.nodes.map(n => n.id);
    expect(nodeIds).toContain('n1');
    expect(nodeIds).toContain('n2');
    expect(nodeIds).toContain('n5');
    expect(nodeIds).not.toContain('n3');
    expect(nodeIds).not.toContain('n4');

    // e2 (n2→n3) 和 e3 (n3→n4) 被移除
    expect(result.edges.map(e => e.id)).toEqual(['e1', 'e4']);
    expect(result.warnings.some(w => w.includes('pruned'))).toBe(true);
  });

  // ═══ 边界: 全部节点被裁剪 → edges空数组 + warnings ═══

  it('全部节点被裁剪 → edges空数组 + warnings含pruned', () => {
    const rawResult: TraversalResult = {
      nodes: [
        makeNode('n1', { props: { department: 'sales', sensitivity: 'S4' } }),
        makeNode('n2', { props: { department: 'eng', sensitivity: 'S3' } }),
      ],
      edges: [makeEdge('e1', 'n1', 'n2')],
      path: ['n1', 'n2'],
      degraded: false,
      warnings: [],
    };

    const mock = makeTraversalMock(rawResult);
    const filter = new TraversalPermissionFilter(mock);

    const result = filter.traverseFiltered(
      { role: 'staff', department: 'hr', clearance: 'S1' },
      ['n1'], ['DEPLOYS'], 3,
    );

    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
    expect(result.warnings.some(w => w.includes('pruned'))).toBe(true);
  });

  // ═══ 边界: 无department字段的全局节点 → 不被departmentFilter裁剪 ═══

  it('无department字段的全局节点 → 不被departmentFilter裁剪', () => {
    const rawResult: TraversalResult = {
      nodes: [
        makeNode('n1', { props: { department: 'eng' } }),
        makeNode('n2', { props: {} }), // 全局节点，无department
        makeNode('n3', { props: { department: 'sales' } }),
      ],
      edges: [
        makeEdge('e1', 'n1', 'n2'),
        makeEdge('e2', 'n2', 'n3'),
      ],
      path: ['n1', 'n2', 'n3'],
      degraded: false,
      warnings: [],
    };

    const mock = makeTraversalMock(rawResult);
    const filter = new TraversalPermissionFilter(mock);

    const result = filter.traverseFiltered(
      { role: 'manager', department: 'eng', clearance: 'S2' },
      ['n1'], ['DEPLOYS'], 3,
    );

    // n2 无department → 保留; n3 是 sales → 裁剪
    const nodeIds = result.nodes.map(n => n.id);
    expect(nodeIds).toContain('n1');
    expect(nodeIds).toContain('n2');
    expect(nodeIds).not.toContain('n3');
  });

  // ═══ nodeType白名单 ═══

  it('nodeType白名单 — 只保留指定类型', () => {
    const rawResult: TraversalResult = {
      nodes: [
        makeNode('n1', { type: 'Financial' }),
        makeNode('n2', { type: 'Person' }),
        makeNode('n3', { type: 'Event' }),
      ],
      edges: [
        makeEdge('e1', 'n1', 'n2'), // n2 被裁
        makeEdge('e2', 'n1', 'n3'),
      ],
      path: ['n1', 'n2', 'n3'],
      degraded: false,
      warnings: [],
    };

    const mock = makeTraversalMock(rawResult);
    const filter = new TraversalPermissionFilter(mock);

    const result = filter.traverseFiltered(
      { role: 'manager', clearance: 'S2' },
      ['n1'], ['DEPLOYS'], 3,
      { nodeTypeWhitelist: ['Financial', 'Event'] },
    );

    const nodeIds = result.nodes.map(n => n.id);
    expect(nodeIds).toEqual(['n1', 'n3']);
    expect(result.edges.map(e => e.id)).toEqual(['e2']);
  });

  // ═══ 异常降级 ═══

  it('异常降级 — 原始traverse异常时返回degraded', () => {
    const errorMock: GraphTraversal = {
      traverse: () => { throw new Error('traverse failed'); },
      getTemporalParams: () => ({
        current: 0,
        window_3m: { mean: 0, slope: 0, variance: 0 },
        window_12m: { mean: 0, slope: 0, variance: 0 },
        trend: 'stable' as const,
      }),
      scanOutliers: () => [],
      evaluateEdges: () => [],
    };

    const filter = new TraversalPermissionFilter(errorMock);
    const result = filter.traverseFiltered(
      { role: 'admin', clearance: 'S0' },
      ['n1'], ['DEPLOYS'], 3,
    );

    expect(result.nodes).toHaveLength(0);
    expect(result.degraded).toBe(true);
    expect(result.warnings.some(w => w.includes('error'))).toBe(true);
  });

  // ═══ 降级语义: traverse异常+fallback异常 ═══

  it('双重异常 — 返回空结果+degraded', () => {
    const doubleErrorMock: GraphTraversal = {
      traverse: () => { throw new Error('primary error'); },
      getTemporalParams: () => { throw new Error('unused'); },
      scanOutliers: () => { throw new Error('unused'); },
      evaluateEdges: () => { throw new Error('unused'); },
    };

    const filter = new TraversalPermissionFilter(doubleErrorMock);
    const result = filter.traverseFiltered(
      { role: 'staff', clearance: 'S0' },
      ['n1'], ['DEPLOYS'], 3,
    );

    expect(result.nodes).toHaveLength(0);
    expect(result.degraded).toBe(true);
  });
});
