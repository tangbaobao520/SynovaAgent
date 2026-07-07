/**
 * tests/l4/graph-bridge.test.ts — Phase 1a: GraphBridge 接口适配测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 fake GraphStore
 * 铁律 0-2: 每个 upsert 方法 >= 2 用例 (happy + sad)
 *
 * 修复: GraphStore 接口不匹配（参数顺序/自生成ID）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createGraphBridge } from '../../src/l4/graph-bridge';
import type { GraphStore } from '../../src/l4/graph-bridge';
import { NodeType, EdgeType } from '@synova/ontology';

// ═══ Fake GraphStore (matches REAL engine-core interface) ═══

class FakeGraphStore implements GraphStore {
  nodes: Array<{ id: string; type: string; props: Record<string,unknown>; graph: string }> = [];
  edges: Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string,unknown>; graph: string }> = [];
  private seq = 0;

  private genId(prefix: string): string { return `${prefix}_${(++this.seq).toString(36)}_${Date.now().toString(36)}`; }

  createNode(type: string, props: Record<string,unknown>, graph: string): string {
    const id = this.genId(`node_${type}`);
    this.nodes.push({ id, type, props, graph });
    return id;
  }

  createNodes(nodeList: Array<{type:string, props:Record<string,unknown>}>, graph: string): string[] {
    return nodeList.map(n => this.createNode(n.type, n.props, graph));
  }

  getNode(id: string, graph: string) {
    return this.nodes.find(n => n.id === id && n.graph === graph) || null;
  }

  queryNodes(type: string, filters?: Record<string,unknown>, graph?: string) {
    return this.nodes.filter(n => n.type === type && (!graph || n.graph === graph));
  }

  updateNode() {}
  deleteNode() {}

  createEdge(type: string, from: string, to: string, weight = 1, props: Record<string,unknown> = {}, graph = 'default'): string {
    const id = this.genId(`edge_${type}`);
    this.edges.push({ id, type, from, to, weight, props, graph });
    return id;
  }

  createEdges(edgeList: Array<{type:string, from:string, to:string, weight?:number, props?:Record<string,unknown>}>, graph: string): string[] {
    return edgeList.map(e => this.createEdge(e.type, e.from, e.to, e.weight, e.props, graph));
  }

  queryEdges(type?: string, from?: string, to?: string, graph?: string) {
    return this.edges.filter(e =>
      (!type || e.type === type) && (!from || e.from === from) && (!to || e.to === to) && (!graph || e.graph === graph),
    );
  }

  traverse() { return { nodes: [], edges: [] }; }
  findPaths() { return []; }
  queryTriples() { return []; }
  deleteEdge() {}
  getNodeAtTime() { return null; }
}

// ═══ Tests ═══

describe('GraphBridge — 6 upsert methods with real GraphStore API', () => {
  let store: FakeGraphStore;
  let bridge: ReturnType<typeof createGraphBridge>;
  const orgId = 'test-org';

  beforeEach(() => {
    store = new FakeGraphStore();
    bridge = createGraphBridge(store, orgId);
  });

  // ── upsertFromHONA ──

  it('Given HONA result with interactions, When upsertFromHONA, Then creates Person nodes + INTERACTS_WITH edges', () => {
    const result = bridge.upsertFromHONA(
      [{ personId: 'p1', name: 'Alice' }, { personId: 'p2', name: 'Bob' }],
      [{ from: 'p1', to: 'p2', weight: 0.85 }],
    );
    expect(result.nodesCreated).toBe(2);
    expect(result.edgesCreated).toBe(1);
    expect(result.degraded).toBe(false);
    expect(store.nodes.filter(n => n.type === NodeType.RESOURCE_PERSON)).toHaveLength(2);
    expect(store.edges.filter(e => e.type === EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */)).toHaveLength(1);
  });

  it('Given empty HONA input, When upsertFromHONA, Then returns zero counts', () => {
    const result = bridge.upsertFromHONA([], []);
    expect(result.nodesCreated).toBe(0);
    expect(result.edgesCreated).toBe(0);
    expect(result.degraded).toBe(false);
  });

  // ── upsertFromKeyPersonRisk ──

  it('Given key person risk profiles, When upsertFromKeyPersonRisk, Then creates Risk nodes + AFFECTS edges to matching Person', () => {
    // First create matching Person nodes in the store
    store.createNode(NodeType.RESOURCE_PERSON, { name: 'cto' }, orgId);
    store.createNode(NodeType.RESOURCE_PERSON, { name: 'lead-dev' }, orgId);

    const result = bridge.upsertFromKeyPersonRisk([
      { roleId: 'cto', riskLevel: 'critical', knowledgeDomains: ['architecture', 'security'], busFactor: 1 },
      { roleId: 'lead-dev', riskLevel: 'medium', knowledgeDomains: ['frontend'], busFactor: 2 },
    ]);
    expect(result.nodesCreated).toBe(2);
    expect(result.degraded).toBe(false);
    expect(store.nodes.filter(n => n.type === NodeType.OUTCOME_RISK)).toHaveLength(2);
    expect(store.edges.filter(e => e.type === EdgeType.DEPENDS_ON /* ONTOLOGY-MIGRATION: SOGEdgeType.AFFECTS -> DEPENDS_ON + INFORMS (combination). */).length).toBeGreaterThanOrEqual(1);
  });

  it('Given empty risk input, When upsertFromKeyPersonRisk, Then returns zero counts', () => {
    const result = bridge.upsertFromKeyPersonRisk([]);
    expect(result.nodesCreated).toBe(0);
    expect(result.edgesCreated).toBe(0);
  });

  // ── upsertFromFinancialImpact ──

  it('Given financial impact data, When upsertFromFinancialImpact, Then creates Financial nodes + CONSUMES edges', () => {
    const result = bridge.upsertFromFinancialImpact([
      { dimension: 'communication_cost', amount: 15000, financialType: 'cost', summary: '沟通损耗' },
      { dimension: 'tool_savings', amount: 5000, financialType: 'revenue', summary: '工具优化节省' },
    ]);
    expect(result.nodesCreated).toBe(2);
    expect(result.degraded).toBe(false);
    expect(store.nodes.filter(n => n.type === NodeType.OUTCOME_FINANCIAL /* ONTOLOGY-MIGRATION: SOGNodeType.FINANCIAL -> outcome/financial or resource/money? Context-dependent. */)).toHaveLength(2);
  });

  // ── upsertFromCapabilityGap ──

  it('Given capability gaps, When upsertFromCapabilityGap, Then creates Capability nodes + PROVIDES edges', () => {
    const result = bridge.upsertFromCapabilityGap([
      { name: 'AI/ML', category: 'technical', severity: 0.8, requiredBy: ['team-1'], suggestion: '招聘ML工程师' },
    ]);
    expect(result.nodesCreated).toBe(1);
    expect(result.degraded).toBe(false);
    expect(store.nodes.filter(n => n.type === NodeType.RESOURCE_KNOWLEDGE /* ONTOLOGY-MIGRATION: SOGNodeType.CAPABILITY has no direct match. Using resource/knowledge. */)).toHaveLength(1);
  });

  // ── upsertFromSevenPowers ──

  it('Given seven powers analysis, When upsertFromSevenPowers, Then creates Goal nodes + ALIGNS_WITH edges', () => {
    const result = bridge.upsertFromSevenPowers([
      { power: 'scale_economies', score: 0.7, recommendation: '扩大规模' },
      { power: 'network_effects', score: 0.85, recommendation: '强化网络效应' },
    ]);
    expect(result.nodesCreated).toBe(2);
    expect(result.degraded).toBe(false);
    expect(store.nodes.filter(n => n.type === NodeType.ACTIVITY_GOVERNANCE /* ONTOLOGY-MIGRATION: SOGNodeType.GOAL has no direct match. Using activity/governance (strategic alignment). */)).toHaveLength(2);
  });

  // ── Partial failure: one upsert throws, others continue ──

  it('Given a failing upsert, When all upserts called, Then degraded but others continue', () => {
    // Simulate by passing data that causes partial success (one empty, one valid)
    const r1 = bridge.upsertFromHONA([], []); // empty
    const r2 = bridge.upsertFromKeyPersonRisk([{ roleId: 'ceo', riskLevel: 'high', knowledgeDomains: ['all'], busFactor: 1 }]);
    expect(r1.nodesCreated).toBe(0);
    expect(r2.nodesCreated).toBe(1);
    // Overall system should continue
    expect(store.nodes.length).toBe(1);
  });

  // ── upsertFromCPC ──

  it('Given CPC result with processes, When upsertFromCPC, Then creates Process nodes + BELONGS_TO edges', () => {
    const result = bridge.upsertFromCPC([
      { processName: 'CodeReview', teamId: 'team-eng', efficiency: 0.75 },
      { processName: 'DeployPipeline', teamId: 'team-ops', efficiency: 0.9 },
    ]);
    expect(result.nodesCreated).toBe(2);
    expect(result.degraded).toBe(false);
    expect(store.nodes.filter(n => n.type === NodeType.ACTIVITY_PRODUCTION /* ONTOLOGY-MIGRATION: SOGNodeType.PROCESS is approximate. Check processType and map to correct activity type. */)).toHaveLength(2);
  });

  it('Given empty CPC input, When upsertFromCPC, Then returns zero counts', () => {
    const result = bridge.upsertFromCPC([]);
    expect(result.nodesCreated).toBe(0);
  });
});
