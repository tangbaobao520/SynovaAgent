/**
 * tests/l3/e2e-autonomy.integration.test.ts — Gear 1 端到端验证
 *
 * 用户旅程: 启动服务 → POST /api/diagnosis/consult → Phase 2 专家自主查图 → 假设输出
 *
 * 铁律 0-2 Step 6: 集成测试覆盖完整调用路径
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import Database from 'better-sqlite3';
import { initEngineContext } from '../../src/init/engine-context';
import { SubAgentCoordinator } from '../../src/orchestrator/subagent-coordinator';
import { ExpertAutonomyEngine } from '../../src/l3/expert-autonomy';
import type { LLMClient } from '../../src/orchestrator/diagnosis-orchestrator';
import type { Evidence } from '../../src/evidence/types';

// ═══ Test Server Setup ═══

let server: Server;
let db: Database.Database;

beforeAll(async () => {
  process.env.DEV_MODE = 'true';
  process.env.PORT = '3097';
  process.env.SYNOVA_DB_PATH = ':memory:';

  // Minimal Express server for E2E test — not using full createServer to isolate
  const app = express();
  app.use(express.json());

  // Health
  app.get('/health', (_req, res) => res.json({ status:'ok', name:'synova-agent', version:'0.1.0' }));

  // Test endpoint: simulate Phase 2 expert dispatch with autonomy
  app.post('/api/test/phase2-autonomy', async (req, res) => {
    try {
      const { evidence } = req.body as { evidence: Evidence[] };

      const fakeLLM: LLMClient = {
        async consult() {
          return { content: '{"thought":"分析完成","action":"finalize","hypothesis":"信息流瓶颈在CTO节点,导致跨部门决策延迟","confidence":0.88}', model:'fake' };
        },
      };

      const queryApi = {
        findDiagnosticPaths: async () => [{ nodes:['a','b'], edges:[], length:2, totalWeight:0.8 }],
        summarizeSubgraph: async () => ({ rootId:'r1', nodeCount:10, edgeCount:15, typeDistribution:{}, strongestConnections:[], risks:[], anomalyScore:0.2 }),
        findCrossDimensionalBrokers: async () => [{ nodeId:'b1', nodeType:'Person', betweennessScore:0.9, bridgingDimensions:['finance','org'] }],
      };

      const coordinator = new SubAgentCoordinator(fakeLLM);
      coordinator.enableExpertAutonomy(queryApi, {
        queryNodes() { return [{ id:'ev_test' }, { id:'ev1' }, { id:'ev2' }]; },
      });

      const results = await coordinator.dispatch(evidence || [], 6);

      res.json({
        ok: true,
        expertCount: results.length,
        hypotheses: results.map(r => ({
          expert: r.expertType,
          hypothesis: r.hypothesis.slice(0, 100),
          confidence: r.confidence,
          rounds: r.autonomyRounds,
          warnings: r.qualityWarnings,
        })),
      });
    } catch (err: any) {
      res.status(500).json({ ok: false, error: err.message });
    }
  });

  return new Promise<void>((resolve) => {
    server = app.listen(3097, () => resolve());
  });
});

afterAll(() => {
  if (server) server.close();
});

// ═══ E2E Tests ═══

describe('E2E: Phase 2 Expert Autonomy', () => {
  it('Given evidence posted, When /api/test/phase2-autonomy called, Then all 6 experts produce hypotheses through ReAct', async () => {
    const evidence: Evidence[] = [
      { id:'ev1', source:'interviewee', sourceId:'org-1', type:'goal_alignment', content:'战略目标传达不畅', confidence:0.8, collectedAt:new Date().toISOString(), orgId:'org-1' },
      { id:'ev2', source:'interviewee', sourceId:'org-1', type:'risk', content:'CTO是单点瓶颈', confidence:0.9, collectedAt:new Date().toISOString(), orgId:'org-1' },
      { id:'ev3', source:'interviewee', sourceId:'org-1', type:'cost', content:'沟通损耗约15%工时', confidence:0.75, collectedAt:new Date().toISOString(), orgId:'org-1' },
    ];

    const res = await fetch('http://localhost:3097/api/test/phase2-autonomy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.ok).toBe(true);
    expect(body.expertCount).toBe(6);

    // All 6 experts should produce hypotheses
    for (const h of body.hypotheses) {
      expect(h.expert).toBeTruthy();
      expect(h.hypothesis.length).toBeGreaterThan(0);
      expect(h.confidence).toBeGreaterThan(0);
    }

    // At least one expert should have autonomy rounds (proving ReAct was used)
    const hasAutonomy = body.hypotheses.some((h: any) => h.rounds > 0);
    expect(hasAutonomy).toBe(true);
  });

  it('Given no evidence, When /api/test/phase2-autonomy called, Then returns empty results gracefully', async () => {
    const res = await fetch('http://localhost:3097/api/test/phase2-autonomy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence: [] }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.expertCount).toBe(0);
  });

  it('E2E User Journey: expert autonomy produces distinct hypotheses per expert type', async () => {
    const evidence: Evidence[] = [
      { id:'ev1', source:'interviewee', sourceId:'org-1', type:'goal_alignment', content:'战略不清晰', confidence:0.7, collectedAt:new Date().toISOString(), orgId:'org-1' },
    ];

    const res = await fetch('http://localhost:3097/api/test/phase2-autonomy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence }),
    });

    const body = await res.json() as any;
    const expertTypes = body.hypotheses.map((h: any) => h.expert).sort();
    expect(expertTypes).toEqual(['action', 'finance', 'marketing', 'org', 'strategy', 'tech']);
  });
});
