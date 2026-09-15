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
import { NodeType, EdgeType } from '@synova/ontology';

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
    expect(graphNodes[0].type).toBe(NodeType.RESOURCE_PERSON);
  });

  it('Given a failing module, When afterRun with GraphBridge, Then only successful modules create nodes', async () => {
    const graphNodes: Array<{type:string, props:Record<string,unknown>}> = [];
    // D726: 替身必须忠实于 GraphStore 接口（createNodes 转发时带上 props）。
    //   旧写法 `this.createNode(n.type)` 丢掉 props —— createGraphBridge 会改写 store.createNode
    //   （graph-bridge.ts:81），改写过的那版读 props.observed_at（:90）→ TypeError →
    //   upsertFromHONA 降级 → graphNodes 恒 0。断言的红因在替身，不在接线（见下方打点断言）。
    const fakeStore = {
      createNode(type: string, props: Record<string,unknown>) {
        graphNodes.push({type, props}); return `n_${graphNodes.length}`;
      },
      createNodes(nodes: Array<{type:string, props:Record<string,unknown>}>) {
        return nodes.map(n => this.createNode(n.type, n.props));
      },
      queryNodes() { return []; },
      queryEdges() { return []; },
      createEdge() { return 'e1'; },
    } as any;

    const bridge = createGraphBridge(fakeStore, 'org-1');
    // D726 判据: 打点 afterRun —— 只有它证明「ModuleRunner → afterRun 这条接线还活着」。
    //   仅断言 graphNodes 数量无法区分「接线断了」与「接线在、下游降级」（两者都表现为 0）。
    const observed: {
      calls: number;
      payload: { total: number; completed: number; failed: number; degraded: string[] } | null;
    } = { calls: 0, payload: null };
    const runner = new ModuleRunner({
      maxParallel: 3, perModuleTimeoutMs: 5000,
      afterRun: async (results) => {
        observed.calls += 1;
        observed.payload = {
          total: results.results.length,
          completed: results.completedCount,
          failed: results.failedCount,
          degraded: [...results.degradedModules],
        };
        for (const r of results.results) {
          if (!r.error) bridge.upsertFromHONA([{ personId: r.moduleId, name: r.moduleId }], []);
        }
      },
    });

    await runner.runAll([
      { name:'hona', priority:'P1', async compute() { return { moduleId:'hona' }; } },
      { name:'broken', priority:'P1', async compute() { throw new Error('crash'); } },
    ]);

    // 接线证明: afterRun 被调用恰好 1 次，且拿到完整的运行结果
    expect(observed.calls).toBe(1);
    expect(observed.payload).toEqual({ total: 2, completed: 1, failed: 1, degraded: ['broken'] });
    // 只有 hona 建节点；broken 未建
    expect(graphNodes.length).toBe(1);
  });

  it('Given a store that cannot satisfy the GraphStore contract, When upsertFromHONA runs, Then bridge degrades honestly', () => {
    // D726 契约用例（铁律 24/31）: store 缺 createNodes 时，bridge 必须**显式降级**——
    //   返回 degraded:true + 具名错误，绝不静默假装成功。
    //   注: 本用例钉住的是「降级诚实」这条契约，不代表「缺方法可接受」——
    //   D726 实测生产适配器 SqliteGraphStore 无 createNodes（报错原文
    //   `store.createNodes is not a function`），upsertFromHONA 生产路径恒降级，
    //   修复须动 src/（D726 写集外）→ 已上报，见任务报告。
    const partialStore = {
      createNode(type: string, props: Record<string,unknown>) { return 'n_1'; },
      queryNodes() { return []; },
      queryEdges() { return []; },
      createEdge() { return 'e1'; },
    } as any;

    const bridge = createGraphBridge(partialStore, 'org-1');
    const result = bridge.upsertFromHONA([{ personId: 'p1', name: 'p1' }], []);

    expect(result.degraded).toBe(true);
    expect(result.nodesCreated).toBe(0);
    expect(result.errors.join(' ')).toMatch(/createNodes/);
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
