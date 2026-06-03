/**
 * tests/l3/report-adapter-wiring.test.ts — ReportGraphAdapter 接入 Phase 4
 *
 * 用户旅程: Phase 4 报告生成 → ReportGraphAdapter.getNodeStats → 报告数据
 *          → getRiskSummary → 根因节点 + 因果链 → 渲染
 *
 * 铁律 0-2 Step 5-6
 */
import { describe, it, expect } from 'vitest';
import { ReportGraphAdapter } from '../../src/l4/report-graph-adapter';
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';

describe('ReportGraphAdapter → Phase 4 Wiring', () => {
  function fakeStore(nodes: Array<{id:string, type:string, props:Record<string,unknown>}>, edges: Array<{id:string, type:string, from:string, to:string, weight:number}> = []) {
    return {
      queryNodes(type: string) { return nodes.filter(n => n.type === type).map(n => ({...n})); },
      queryEdges() { return edges.map(e => ({...e, props:{}})); },
      traverse() { return { nodes: nodes.map(n => ({id:n.id, type:n.type})), edges: edges.map(e => ({id:e.id, type:e.type, from:e.from, to:e.to})) }; },
      findPaths() { return []; },
    } as any;
  }

  it('Given graph with nodes and edges, When getNodeStats, Then returns type distribution for report header', () => {
    const store = fakeStore([
      { id:'p1', type:SOGNodeType.PERSON, props:{name:'Alice'}},
      { id:'p2', type:SOGNodeType.PERSON, props:{name:'Bob'}},
      { id:'t1', type:SOGNodeType.TEAM, props:{name:'Engineering'}},
      { id:'r1', type:SOGNodeType.RISK, props:{severity:'critical', name:'单点故障'}},
      { id:'f1', type:SOGNodeType.FINANCIAL, props:{amount:5000, financialType:'cost'}},
    ], [
      { id:'e1', type:SOGEdgeType.AFFECTS, from:'r1', to:'p1', weight:0.9 },
      { id:'e2', type:SOGEdgeType.BELONGS_TO, from:'p1', to:'t1', weight:1 },
    ]);

    const adapter = new ReportGraphAdapter(store, 'test-org');
    const stats = adapter.getNodeStats();

    expect(stats.totalNodes).toBe(5);
    expect(stats.totalEdges).toBe(2);
    expect(stats.byType[SOGNodeType.PERSON]).toBe(2);
    expect(stats.byType[SOGNodeType.RISK]).toBe(1);
    expect(stats.byType[SOGNodeType.FINANCIAL]).toBe(1);
    expect(stats.degraded).toBe(false);
  });

  it('Given graph with risks, When getRiskSummary, Then risks sorted critical→low for report', () => {
    const store = fakeStore([
      { id:'r1', type:SOGNodeType.RISK, props:{severity:'critical', riskType:'key_person', name:'Bus Factor=1'}},
      { id:'r2', type:SOGNodeType.RISK, props:{severity:'high', riskType:'technical_debt', name:'技术债'}},
      { id:'r3', type:SOGNodeType.RISK, props:{severity:'low', riskType:'market', name:'市场波动'}},
    ]);

    const adapter = new ReportGraphAdapter(store, 'test-org');
    const risks = adapter.getRiskSummary();

    expect(risks).toHaveLength(3);
    expect(risks[0].severity).toBe('critical');
    expect(risks[0].name).toBe('Bus Factor=1');
    expect(risks[2].severity).toBe('low');
  });

  it('Given graph with causal paths, When getCausalChains from root cause, Then returns chains for report rendering', () => {
    const store = fakeStore([
      { id:'root', type:SOGNodeType.RISK, props:{severity:'critical', name:'单点故障'}},
      { id:'p1', type:SOGNodeType.PERSON, props:{name:'CTO'}},
      { id:'fin1', type:SOGNodeType.FINANCIAL, props:{amount:50000, financialType:'cost'}},
    ], [
      { id:'e1', type:SOGEdgeType.AFFECTS, from:'root', to:'p1', weight:0.9 },
      { id:'e2', type:SOGEdgeType.AFFECTS, from:'root', to:'fin1', weight:0.7 },
    ]);

    const adapter = new ReportGraphAdapter(store, 'test-org');
    const chains = adapter.getCausalChains('root');

    expect(chains.length).toBeGreaterThan(0);
    expect(chains[0].rootCause).toBe(true);
    expect(chains[0].description).toContain('因果链');
  });

  it('Given empty graph, When getNodeStats, Then returns degraded=true for graceful handling', () => {
    const adapter = new ReportGraphAdapter(fakeStore([]), 'test-org');
    const stats = adapter.getNodeStats();

    expect(stats.totalNodes).toBe(0);
    expect(stats.degraded).toBe(true);
  });
});
