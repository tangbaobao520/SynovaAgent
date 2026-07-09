/**
 * tests/agent-observer/collector.test.ts — Agent Observer 收集器 单元测试
 *
 * 铁律 0-2: 每个 public 函数 ≥ 2 用例 (happy + sad)
 * 铁律 12: 不 mock 管线 — GraphStore 用内存 Map 模拟真实 upsert 行为
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { collectActivity, collectActivities } from '../../src/agent-observer/collector';
import type { GraphStore } from '../../src/l4/graph-bridge';
import type { AgentActivity } from '../../src/agent-observer/types';

let idSeq = 0;

/** 基于内存 Map 的 GraphStore mock — createNode 自动生成 ID */
function mockStore(): { store: GraphStore; nodes: Map<string, { type: string; props: Record<string, unknown> }> } {
  const nodes = new Map<string, { type: string; props: Record<string, unknown> }>();

  const store: GraphStore = {
    createNode(type: string, props: Record<string, unknown>, _graph: string): string {
      const id = `node_${type}_${++idSeq}`;
      nodes.set(id, { type, props: { ...props } });
      return id;
    },
    createNodes(entries, graph) {
      return entries.map(e => this.createNode(e.type, e.props, graph));
    },
    queryNodes(type: string, filters?: Record<string, unknown>, _graph?: string) {
      return Array.from(nodes.entries())
        .filter(([, n]) => n.type === type)
        .filter(([, n]) => {
          if (!filters) return true;
          for (const [k, v] of Object.entries(filters)) {
            if (n.props[k] !== v) return false;
          }
          return true;
        })
        .map(([id, n]) => ({ id, type: n.type, props: { ...n.props } }));
    },
    queryEdges() { return []; },
    createEdge() { return 'e1'; },
    createEdges(entries) { return entries.map(() => 'e1'); },
    getNode(id: string, _graph: string) {
      const n = nodes.get(id);
      return n ? { id, type: n.type, props: { ...n.props } } : null;
    },
    updateNode(id: string, props: Record<string, unknown>, _graph: string) {
      const existing = nodes.get(id);
      if (existing) {
        nodes.set(id, { type: existing.type, props: { ...existing.props, ...props } });
      }
    },
    deleteNode() {},
    deleteEdge() {},
    traverse() { return null; },
    findPaths() { return []; },
    queryTriples() { return []; },
    getNodeAtTime() { return null; },
  };

  return { store, nodes };
}

function makeActivity(overrides?: Partial<AgentActivity>): AgentActivity {
  return {
    agentId: 'test-agent-1',
    platform: 'claude-code',
    name: '测试 Agent',
    agentType: 'external',
    activityType: 'tool_call',
    timestamp: '2026-06-05T10:00:00.000Z',
    ...overrides,
  };
}

// ═══ collectActivity — 创建 ═══

describe('collectActivity — create', () => {
  let store: GraphStore;
  let nodes: Map<string, { type: string; props: Record<string, unknown> }>;

  beforeEach(() => {
    const m = mockStore();
    store = m.store;
    nodes = m.nodes;
  });

  it('Given new agent, When activity collected, Then creates AGENT node with action=created', () => {
    const result = collectActivity(store, makeActivity({ lastToolName: 'Bash' }));
    expect(result.ok).toBe(true);
    expect(result.action).toBe('created');
    expect(result.degraded).toBe(false);
    expect(result.agentNodeId).toBeTruthy();
    expect(nodes.has(result.agentNodeId)).toBe(true);

    const node = nodes.get(result.agentNodeId)!;
    expect(node.type).toBe('resource/agent');
    expect(node.props.name).toBe('测试 Agent');
    expect(node.props.platform).toBe('claude-code');
    expect(node.props.agentType).toBe('external');
    expect(node.props.lastToolName).toBe('Bash');
    expect(node.props.activityCount).toBe(1);
    expect(node.props.status).toBe('active');
  });

  it('Given activity with model, When collected, Then props include model', () => {
    const result = collectActivity(store, makeActivity({ model: 'claude-opus-4-8' }));
    const node = nodes.get(result.agentNodeId)!;
    expect(node.props.model).toBe('claude-opus-4-8');
  });

  it('Given activity with status=error, When collected, Then props reflect error status', () => {
    const result = collectActivity(store, makeActivity({ status: 'error' }));
    const node = nodes.get(result.agentNodeId)!;
    expect(node.props.status).toBe('error');
  });

  it('Given missing teamId, When collected, Then creates node successfully', () => {
    const result = collectActivity(store, makeActivity({ teamId: undefined }));
    expect(result.ok).toBe(true);
    expect(result.action).toBe('created');
  });
});

// ═══ collectActivity — 更新 ═══

describe('collectActivity — update', () => {
  it('Given same agentId+platform, When collected twice, Then second returns action=updated', () => {
    const m = mockStore();
    const r1 = collectActivity(m.store, makeActivity({ agentId: 'dup-agent', platform: 'hermes' }));
    expect(r1.action).toBe('created');

    const r2 = collectActivity(m.store, makeActivity({ agentId: 'dup-agent', platform: 'hermes', lastToolName: 'Read' }));
    expect(r2.ok).toBe(true);
    expect(r2.action).toBe('updated');
    expect(r2.degraded).toBe(false);
    expect(r2.agentNodeId).toBe(r1.agentNodeId); // 同一个节点

    const node = m.nodes.get(r1.agentNodeId)!;
    expect(node.props.activityCount).toBe(2);
    expect(node.props.lastToolName).toBe('Read');
  });

  it('Given activityCount increments correctly over 3 reports', () => {
    const m = mockStore();
    for (let i = 1; i <= 3; i++) {
      collectActivity(m.store, makeActivity({ agentId: 'counter' }));
    }
    const result = collectActivity(m.store, makeActivity({ agentId: 'counter' }));
    const node = m.nodes.get(result.agentNodeId)!;
    expect(node.props.activityCount).toBe(4);
  });

  it('Given different agents same platform, When collected, Then creates separate nodes', () => {
    const m = mockStore();
    const r1 = collectActivity(m.store, makeActivity({ agentId: 'agent-a' }));
    const r2 = collectActivity(m.store, makeActivity({ agentId: 'agent-b' }));
    expect(r1.agentNodeId).not.toBe(r2.agentNodeId);
    expect(r1.action).toBe('created');
    expect(r2.action).toBe('created');
    expect(m.nodes.size).toBe(2);
  });

  it('Given same agentId different platforms, When collected, Then creates separate nodes', () => {
    const m = mockStore();
    const r1 = collectActivity(m.store, makeActivity({ agentId: 'x', platform: 'claude-code' }));
    const r2 = collectActivity(m.store, makeActivity({ agentId: 'x', platform: 'hermes' }));
    expect(r1.agentNodeId).not.toBe(r2.agentNodeId);
  });
});

// ═══ collectActivity — 降级 ═══

describe('collectActivity — degraded', () => {
  it('Given store throws error, When collected, Then returns degraded=true not exception', () => {
    const m = mockStore();
    const badStore: GraphStore = {
      ...m.store,
      queryNodes() { throw new Error('DB connection lost'); },
    };
    const result = collectActivity(badStore, makeActivity());
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('DB connection lost');
  });

  it('Given update fails, When collected, Then degraded=true', () => {
    const m = mockStore();
    // 先创建一个节点
    collectActivity(m.store, makeActivity({ agentId: 'fail-update' }));

    // 然后让 updateNode 失败
    const badStore: GraphStore = {
      ...m.store,
      queryNodes: m.store.queryNodes.bind(m.store),
      updateNode() { throw new Error('write conflict'); },
    };
    const result = collectActivity(badStore, makeActivity({ agentId: 'fail-update' }));
    expect(result.degraded).toBe(true);
    expect(result.errors[0]).toContain('write conflict');
  });
});

// ═══ collectActivities (batch) ═══

describe('collectActivities', () => {
  it('Given multiple activities, When batch collected, Then returns results for each', () => {
    const m = mockStore();
    const { results, degraded } = collectActivities(m.store, [
      makeActivity({ agentId: 'a' }),
      makeActivity({ agentId: 'b' }),
      makeActivity({ agentId: 'c' }),
    ]);
    expect(results).toHaveLength(3);
    expect(degraded).toBe(false);
    expect(results.every(r => r.ok)).toBe(true);
    expect(m.nodes.size).toBe(3);
  });

  it('Given one activity fails, When batch collected, Then others succeed + degraded=true', () => {
    const m = mockStore();
    let callCount = 0;
    const storeWithFault: GraphStore = {
      ...m.store,
      queryNodes(type: string, filters?: Record<string, unknown>, graph?: string) {
        callCount++;
        if (callCount === 3) throw new Error('transient fault on 3rd call');
        return m.store.queryNodes(type, filters, graph);
      },
    };
    const { results, degraded } = collectActivities(storeWithFault, [
      makeActivity({ agentId: 'a' }),
      makeActivity({ agentId: 'b' }),
      makeActivity({ agentId: 'c' }),
    ]);
    expect(results).toHaveLength(3);
    expect(degraded).toBe(true);
    expect(results[0].degraded).toBe(false);
    expect(results[1].degraded).toBe(false);
    expect(results[2].degraded).toBe(true);
  });
});
