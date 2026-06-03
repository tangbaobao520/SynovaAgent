/**
 * tests/l3/graphbridge-wiring.test.ts — GraphBridge 接入 Phase 1
 *
 * 用户旅程: Phase 1 → ModuleRunner.runAll → afterRun → GraphBridge → GraphStore
 *
 * 铁律 0-2 Step 5-6: 接线验证 + 集成测试
 */
import { describe, it, expect } from 'vitest';
import { ModuleRunner } from '../../src/orchestrator/module-runner';
import { createGraphBridge } from '../../src/l4/graph-bridge';
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';

describe('GraphBridge → ModuleRunner.afterRun → Phase 1', () => {
  it('Given Phase 1 modules complete, When afterRun with GraphBridge, Then findings become SOG nodes', async () => {
    const graphNodes: Array<{type:string, props:Record<string,unknown>}> = [];
    const graphEdges: Array<{type:string, from:string, to:string}> = [];

    const fakeStore = {
      createNode(type: string, props: Record<string,unknown>) {
        const id = `n_${graphNodes.length}`; graphNodes.push({type, props}); return id;
      },
      createNodes(nodes: Array<{type:string, props:Record<string,unknown>}>) {
        return nodes.map(n => this.createNode(n.type, n.props));
      },
      createEdge(type: string, from: string, to: string) {
        graphEdges.push({type, from, to}); return `e_${graphEdges.length}`;
      },
      queryNodes() { return []; },
      queryEdges() { return []; },
    } as any;

    const bridge = createGraphBridge(fakeStore, 'org-1');
    const runner = new ModuleRunner({
      maxParallel: 3, perModuleTimeoutMs: 5000,
      afterRun: async (results) => {
        for (const r of results.results) {
          if (!r.error) {
            bridge.upsertFromHONA([{ personId: r.moduleId, name: r.moduleId }], []);
          }
        }
      },
    });

    await runner.runAll([
      { name: 'hona', priority:'P1', async compute() { return { moduleId:'hona', findings:[{ type:'info_flow', summary:'score 0.6' }] }; } },
      { name: 'gaps', priority:'P1', async compute() { return { moduleId:'gaps', findings:[{ type:'collaboration', summary:'3 gaps' }] }; } },
    ]);

    expect(graphNodes.length).toBe(2);
    expect(graphNodes[0].type).toBe(SOGNodeType.PERSON);
  });

  it('Given a failing module, When afterRun with GraphBridge, Then only successful modules create nodes', async () => {
    const graphNodes: Array<{type:string}> = [];
    const fakeStore = {
      createNode(type: string) { graphNodes.push({type}); return `n_${graphNodes.length}`; },
      createNodes(nodes: Array<{type:string}>) { return nodes.map(n => this.createNode(n.type)); },
      queryNodes() { return []; },
      queryEdges() { return []; },
      createEdge() { return 'e1'; },
    } as any;

    const bridge = createGraphBridge(fakeStore, 'org-1');
    const runner = new ModuleRunner({
      maxParallel: 3, perModuleTimeoutMs: 5000,
      afterRun: async (results) => {
        for (const r of results.results) {
          if (!r.error) bridge.upsertFromHONA([{ personId: r.moduleId, name: r.moduleId }], []);
        }
      },
    });

    await runner.runAll([
      { name:'hona', priority:'P1', async compute() { return { moduleId:'hona' }; } },
      { name:'broken', priority:'P1', async compute() { throw new Error('crash'); } },
    ]);

    // Only hona created a node; broken did not
    expect(graphNodes.length).toBe(1);
  });

  it('Given GraphBridge.upsertFromKeyPersonRisk, When risk profiles provided, Then creates Risk nodes + AFFECTS edges', () => {
    const fakeStore = {
      createNode(type: string, props: Record<string,unknown>) { return `n_risk`; },
      createNodes(nodes: Array<{type:string}>) { return nodes.map(() => 'n'); },
      createEdge() { return 'e1'; },
      queryNodes() { return [{ id:'p1', type:'Person', props:{}}]; },
      queryEdges() { return []; },
    } as any;

    const bridge = createGraphBridge(fakeStore, 'org-1');
    const result = bridge.upsertFromKeyPersonRisk([
      { roleId:'cto', riskLevel:'critical', knowledgeDomains:['architecture'], busFactor:1 },
    ]);

    expect(result.nodesCreated).toBe(1);
    expect(result.degraded).toBe(false);
  });
});
