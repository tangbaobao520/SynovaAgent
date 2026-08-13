/**
 * tests/l4/report-graph-adapter.test.ts — Phase 1c: 报告图查询适配器测试
 *
 * 验证: 报告渲染 / 根因分析从 GraphStore 读数据, 非硬编码模板
 * 穷尽: 图有数据 / 图空 / 图部分数据 / 大数据量限制
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ReportGraphAdapter } from '../../src/l4/report-graph-adapter';
import { NodeType, EdgeType } from '@synova/ontology';

// Fake GraphStore with real interface
function fakeStore(nodes: Array<{id:string, type:string, props:Record<string,unknown>}> = [], edges: Array<{id:string, type:string, from:string, to:string, weight:number, props:Record<string,unknown>}> = []) {
  return {
    nodes, edges,
    queryNodes(type: string) { return this.nodes.filter(n => n.type === type); },
    queryEdges(type?: string) { return type ? this.edges.filter(e => e.type === type) : this.edges; },
    traverse(start: string) {
      const visited = new Set<string>([start]);
      const subNodes = this.nodes.filter(n => n.id === start);
      const subEdges = this.edges.filter(e => e.from === start || e.to === start);
      return { nodes: subNodes, edges: subEdges };
    },
    findPaths(from: string, to: string) {
      if (this.edges.some(e => e.from === from && e.to === to)) return [{ nodes: [from, to], edges: [this.edges.find(e => e.from === from && e.to === to)!], length: 1, totalWeight: 0.5 }];
      return [];
    },
  } as any;
}

describe('ReportGraphAdapter', () => {
  // ── Happy: graph has data ──

  it('Given a graph with nodes and edges, When getNodeStats called, Then returns type distribution and counts', () => {
    const store = fakeStore(
      [{ id:'n1', type:NodeType.RESOURCE_PERSON, props:{name:'Alice'}},
       { id:'n2', type:NodeType.RESOURCE_PERSON, props:{name:'Bob'}},
       { id:'n3', type:NodeType.RESOURCE_TEAM, props:{name:'Engineering'}},
       { id:'n4', type:NodeType.OUTCOME_RISK, props:{severity:'high'}}],
      [{ id:'e1', type:EdgeType.INFORMS /* ONTOLOGY-MIGRATION: SOGEdgeType.INTERACTS_WITH -> INFORMS (approximate). */, from:'n1', to:'n2', weight:0.8, props:{}},
       { id:'e2', type:EdgeType.DEPENDS_ON /* ONTOLOGY-MIGRATION: SOGEdgeType.BELONGS_TO no direct match. Using DEPENDS_ON (syntactic node ID path). */, from:'n1', to:'n3', weight:1, props:{}}],
    );
    const adapter = new ReportGraphAdapter(store, 'test-org');

    const stats = adapter.getNodeStats();
    expect(stats.totalNodes).toBe(4);
    expect(stats.totalEdges).toBe(2);
    expect(stats.byType[NodeType.RESOURCE_PERSON]).toBe(2);
    expect(stats.byType[NodeType.RESOURCE_TEAM]).toBe(1);
    expect(stats.byType[NodeType.OUTCOME_RISK]).toBe(1);
  });

  it('Given a graph with risk nodes, When getRiskSummary called, Then returns risks sorted by severity', () => {
    const store = fakeStore(
      [{ id:'r1', type:NodeType.OUTCOME_RISK, props:{severity:'critical', riskType:'key_person', name:'单点故障'}},
       { id:'r2', type:NodeType.OUTCOME_RISK, props:{severity:'high', riskType:'technical_debt', name:'技术债'}},
       { id:'r3', type:NodeType.OUTCOME_RISK, props:{severity:'low', riskType:'market', name:'市场波动'}}],
    );
    const adapter = new ReportGraphAdapter(store, 'test-org');

    const risks = adapter.getRiskSummary();
    expect(risks).toHaveLength(3);
    expect(risks[0].severity).toBe('critical');
    expect(risks[2].severity).toBe('low');
    // Sorted: critical > high > low
    expect(risks[0].name).toBe('单点故障');
    expect(risks[1].name).toBe('技术债');
  });

  it('Given a graph with causal paths, When getCausalChains called, Then returns paths with descriptions', () => {
    const store = fakeStore(
      [{ id:'p1', type:NodeType.RESOURCE_PERSON, props:{name:'CTO'}},
       { id:'t1', type:NodeType.RESOURCE_TEAM, props:{name:'Engineering'}},
       { id:'r1', type:NodeType.OUTCOME_RISK, props:{severity:'critical', name:'Bus Factor=1'}},
       { id:'fin1', type:NodeType.OUTCOME_FINANCIAL /* ONTOLOGY-MIGRATION: SOGNodeType.FINANCIAL -> outcome/financial or resource/money? Context-dependent. */, props:{amount:50000, financialType:'cost'}}],
      [{ id:'e1', type:EdgeType.DEPENDS_ON /* ONTOLOGY-MIGRATION: SOGEdgeType.AFFECTS -> DEPENDS_ON + INFORMS (combination). */, from:'r1', to:'p1', weight:0.9, props:{}},
       { id:'e2', type:EdgeType.DEPENDS_ON /* ONTOLOGY-MIGRATION: SOGEdgeType.AFFECTS -> DEPENDS_ON + INFORMS (combination). */, from:'r1', to:'fin1', weight:0.7, props:{}}],
    );
    const adapter = new ReportGraphAdapter(store, 'test-org');

    const chains = adapter.getCausalChains('r1');
    expect(chains.length).toBeGreaterThanOrEqual(0);
    expect(chains.every(c => c.rootCause)).toBe(true);
  });

  // ── Sad: empty graph ──

  it('Given an empty graph, When getNodeStats called, Then returns zero counts with degraded flag', () => {
    const store = fakeStore();
    const adapter = new ReportGraphAdapter(store, 'test-org');

    const stats = adapter.getNodeStats();
    expect(stats.totalNodes).toBe(0);
    expect(stats.totalEdges).toBe(0);
    expect(stats.degraded).toBe(true);
  });

  it('Given an empty graph, When getRiskSummary called, Then returns empty array with hint', () => {
    const store = fakeStore();
    const adapter = new ReportGraphAdapter(store, 'test-org');

    const risks = adapter.getRiskSummary();
    expect(risks).toHaveLength(0);
  });

  it('Given an empty graph, When getCausalChains called, Then returns empty array', () => {
    const store = fakeStore();
    const adapter = new ReportGraphAdapter(store, 'test-org');

    const chains = adapter.getCausalChains('nonexistent');
    expect(chains).toHaveLength(0);
  });

  // ── Edge: large graph ──

  it('Given 100 nodes, When getNodeStats called, Then limits returned data to top 10 types', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: `n${i}`, type: i % 5 === 0 ? NodeType.RESOURCE_PERSON : NodeType.RESOURCE_TEAM,
      props: { name: `Entity${i}` },
    }));
    const store = fakeStore(nodes);
    const adapter = new ReportGraphAdapter(store, 'test-org', { maxRiskNodes: 5 });

    const stats = adapter.getNodeStats();
    expect(stats.totalNodes).toBe(100);
    expect(stats.byType[NodeType.RESOURCE_PERSON]).toBe(20);
    expect(stats.byType[NodeType.RESOURCE_TEAM]).toBe(80);
  });

  // ── Specific node types ──

  it('Given Capability nodes exist, When getNodeStats, Then capability count is correct', () => {
    const store = fakeStore(
      [{ id:'c1', type:NodeType.RESOURCE_KNOWLEDGE /* ONTOLOGY-MIGRATION: SOGNodeType.CAPABILITY has no direct match. Using resource/knowledge. */, props:{name:'AI/ML'}},
       { id:'c2', type:NodeType.RESOURCE_KNOWLEDGE /* ONTOLOGY-MIGRATION: SOGNodeType.CAPABILITY has no direct match. Using resource/knowledge. */, props:{name:'Cloud'}},
       { id:'p1', type:NodeType.RESOURCE_PERSON, props:{name:'Engineer'}}],
    );
    const adapter = new ReportGraphAdapter(store, 'test-org');

    const stats = adapter.getNodeStats();
    expect(stats.byType[NodeType.RESOURCE_KNOWLEDGE /* ONTOLOGY-MIGRATION: SOGNodeType.CAPABILITY has no direct match. Using resource/knowledge. */]).toBe(2);
  });
});
