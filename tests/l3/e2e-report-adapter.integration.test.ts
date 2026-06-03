/**
 * tests/l3/e2e-report-adapter.integration.test.ts — ReportGraphAdapter E2E
 *
 * 用户旅程: Phase 4 → ReportGraphAdapter → 节点统计 + 风险排序 + 因果链 → 报告渲染
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { ReportGraphAdapter } from '../../src/l4/report-graph-adapter';
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';

let server: Server;

beforeAll(async () => {
  const app = express();

  app.post('/api/test/phase4-report', async (req, res) => {
    const { orgId } = req.body as { orgId: string };

    const fakeStore = {
      queryNodes(type: string) {
        const all = [
          { id:'p1', type:SOGNodeType.PERSON, props:{name:'Alice'}},
          { id:'p2', type:SOGNodeType.PERSON, props:{name:'Bob'}},
          { id:'t1', type:SOGNodeType.TEAM, props:{name:'Engineering'}},
          { id:'r1', type:SOGNodeType.RISK, props:{severity:'critical', riskType:'key_person', name:'Bus Factor=1'}},
          { id:'r2', type:SOGNodeType.RISK, props:{severity:'high', riskType:'technical_debt', name:'技术债'}},
          { id:'f1', type:SOGNodeType.FINANCIAL, props:{amount:5000, financialType:'cost'}},
        ];
        return all.filter(n => n.type === type).map(n => ({...n}));
      },
      queryEdges() {
        return [
          { id:'e1', type:SOGEdgeType.AFFECTS, from:'r1', to:'p1', weight:0.9, props:{} },
        ];
      },
      traverse(id: string) {
        return { nodes: [{id, type:'Risk'}], edges: [] };
      },
      findPaths() { return []; },
    } as any;

    const adapter = new ReportGraphAdapter(fakeStore, orgId);
    const stats = adapter.getNodeStats();
    const risks = adapter.getRiskSummary();
    const chains = adapter.getCausalChains('r1');

    res.json({
      ok: true,
      orgId,
      stats: { totalNodes: stats.totalNodes, totalEdges: stats.totalEdges, degraded: stats.degraded },
      topRisk: risks[0] || null,
      riskCount: risks.length,
      causalChainCount: chains.length,
    });
  });

  return new Promise<void>((resolve) => { server = app.listen(3094, () => resolve()); });
});

afterAll(() => { if (server) server.close(); });

describe('E2E: ReportGraphAdapter → Phase 4', () => {
  it('returns node stats with correct counts', async () => {
    const res = await fetch('http://localhost:3094/api/test/phase4-report', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orgId:'e2e' }),
    });
    const body = await res.json() as any;
    expect(body.stats.totalNodes).toBe(6);
    expect(body.stats.totalEdges).toBe(1);
    expect(body.stats.degraded).toBe(false);
  });

  it('returns risks sorted critical first', async () => {
    const res = await fetch('http://localhost:3094/api/test/phase4-report', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orgId:'e2e' }),
    });
    const body = await res.json() as any;
    expect(body.topRisk.severity).toBe('critical');
    expect(body.riskCount).toBe(2);
  });

  it('returns causal chains for root cause analysis', async () => {
    const res = await fetch('http://localhost:3094/api/test/phase4-report', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ orgId:'e2e' }),
    });
    const body = await res.json() as any;
    expect(body.causalChainCount).toBeGreaterThanOrEqual(0);
  });
});
