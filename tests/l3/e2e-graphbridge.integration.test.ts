/**
 * tests/l3/e2e-graphbridge.integration.test.ts — GraphBridge E2E 验证
 *
 * 用户旅程: Phase 1 模块完成 → GraphBridge → SOG 节点写入 GraphStore → 可查询
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import Database from 'better-sqlite3';
import { createGraphBridge } from '../../src/l4/graph-bridge';
import { NodeType, EdgeType } from '@synova/ontology';

let server: Server;
let db: Database.Database;

beforeAll(async () => {
  const app = express();
  app.use(express.json());

  // GraphBridge endpoint: simulate Phase 1 → auto-sync to graph
  app.post('/api/test/phase1-graphbridge', async (req, res) => {
    try {
      const { modules } = req.body as { modules: Array<{ name: string; findings: Array<{ type: string; summary: string }> }> };

      // In-memory graph store
      const nodes: Array<{ type: string; props: Record<string,unknown> }> = [];
      const edges: Array<{ from: string; to: string; type: string }> = [];
      const fakeStore = {
        createNode(type: string, props: Record<string,unknown>) {
          const id = `n_${nodes.length}`; nodes.push({ type, props }); return id;
        },
        createNodes(nodeList: Array<{ type: string; props: Record<string,unknown> }>) {
          return nodeList.map(n => this.createNode(n.type, n.props));
        },
        createEdge(type: string, from: string, to: string) {
          edges.push({ from, to, type }); return `e_${edges.length}`;
        },
        queryNodes() { return []; },
        queryEdges() { return []; },
      } as any;

      const bridge = createGraphBridge(fakeStore, 'e2e-org');

      // Simulate ModuleRunner completing → GraphBridge syncs
      const results: Array<{ nodesCreated: number; edgesCreated: number; degraded: boolean }> = [];
      for (const mod of modules) {
        if (mod.name === 'hona') {
          results.push(bridge.upsertFromHONA(
            [{ personId: mod.name, name: mod.name }],
            [],
          ));
        } else if (mod.name === 'key-person-risk') {
          results.push(bridge.upsertFromKeyPersonRisk(
            mod.findings.map(f => ({ roleId: f.type, riskLevel: 'high', knowledgeDomains: [f.summary], busFactor: 1 })),
          ));
        } else if (mod.name === 'financial-impact') {
          results.push(bridge.upsertFromFinancialImpact(
            mod.findings.map(f => ({ dimension: f.type, amount: 1000, financialType: 'cost', summary: f.summary })),
          ));
        }
      }

      res.json({
        ok: true,
        totalNodesCreated: results.reduce((s, r) => s + r.nodesCreated, 0),
        totalEdgesCreated: results.reduce((s, r) => s + r.edgesCreated, 0),
        graphNodes: nodes.map(n => ({ type: n.type, name: n.props.name })),
        graphEdges: edges.map(e => ({ from: e.from, to: e.to, type: e.type })),
        anyDegraded: results.some(r => r.degraded),
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return new Promise<void>((resolve) => {
    server = app.listen(3096, () => resolve());
  });
});

afterAll(() => { if (server) server.close(); });

describe('E2E: GraphBridge → Phase 1 auto-sync', () => {
  it('Given HONA module completes, When GraphBridge syncs, Then Person nodes created', async () => {
    const res = await fetch('http://localhost:3096/api/test/phase1-graphbridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modules: [{ name: 'hona', findings: [{ type: 'info_flow', summary: 'score 0.6' }] }],
      }),
    });

    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.totalNodesCreated).toBeGreaterThan(0);
    expect(body.graphNodes.some((n: any) => n.type === NodeType.RESOURCE_PERSON)).toBe(true);
  });

  it('Given risk module completes, When GraphBridge syncs, Then Risk nodes created', async () => {
    const res = await fetch('http://localhost:3096/api/test/phase1-graphbridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modules: [{ name: 'key-person-risk', findings: [{ type: 'cto', summary: '单点故障' }] }],
      }),
    });

    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.graphNodes.some((n: any) => n.type === NodeType.OUTCOME_RISK)).toBe(true);
  });

  it('Given financial module completes, When GraphBridge syncs, Then Financial nodes created', async () => {
    const res = await fetch('http://localhost:3096/api/test/phase1-graphbridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modules: [{ name: 'financial-impact', findings: [{ type: 'cost', summary: '沟通损耗15%' }] }],
      }),
    });

    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.graphNodes.some((n: any) => n.type === NodeType.OUTCOME_FINANCIAL /* ONTOLOGY-MIGRATION: SOGNodeType.FINANCIAL -> outcome/financial or resource/money? Context-dependent. */)).toBe(true);
    expect(body.anyDegraded).toBe(false);
  });

  it('Given multiple modules complete, When GraphBridge syncs all, Then all node types created', async () => {
    const res = await fetch('http://localhost:3096/api/test/phase1-graphbridge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modules: [
          { name: 'hona', findings: [] },
          { name: 'key-person-risk', findings: [{ type: 'architect', summary: '架构师单点' }] },
          { name: 'financial-impact', findings: [{ type: 'cost', summary: '损耗' }] },
        ],
      }),
    });

    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.totalNodesCreated).toBe(3);
    const types = body.graphNodes.map((n: any) => n.type).sort();
    expect(types).toContain(NodeType.RESOURCE_PERSON);
    expect(types).toContain(NodeType.OUTCOME_RISK);
    expect(types).toContain(NodeType.OUTCOME_FINANCIAL /* ONTOLOGY-MIGRATION: SOGNodeType.FINANCIAL -> outcome/financial or resource/money? Context-dependent. */);
  });
});
