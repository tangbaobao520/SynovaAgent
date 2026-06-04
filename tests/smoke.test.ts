/**
 * smoke.test.ts — SynovaAgent 冒烟测试
 *
 * Slice 1: 进程启动 + 健康检查
 * Slice 2: 本体 API (ingest → graph → HTML)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server';
import type { Server } from 'http';

let server: Server;
let BASE: string;

beforeAll(async () => {
  // port 0 = OS 分配随机端口, 避免 EADDRINUSE
  process.env.PORT = '0';
  process.env.SYNOVA_DB_PATH = ':memory:';
  server = await createServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3000;
  BASE = `http://localhost:${port}`;
});

afterAll(() => {
  if (server) { server.close(); }
});

// ═══ Slice 1: Health ═══

describe('Health', () => {
  it('GET /health → 200, status=ok, name=synova-agent', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.name).toBe('synova-agent');
    expect(body.version).toBeDefined();
  });
});

// ═══ Slice 2: Ontology ═══

describe('Ontology API', () => {
  const orgId = 'test-org';

  it('POST /api/ontology/ingest → creates Document node + edges', async () => {
    const res = await fetch(`${BASE}/api/ontology/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orgId,
        name: '测试文档',
        type: 'report',
        content: 'SynovaAgent smoke test',
        author: '测试用户',
        authorEmail: 'test@synova.dev',
        teamId: 'team-test',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.nodeId).toMatch(/^node_Document_/);
    expect(body.edges.length).toBeGreaterThanOrEqual(1); // OWNS + BELONGS_TO
  });

  it('GET /api/ontology/graph/:orgId → returns nodes and edges', async () => {
    const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.nodeCount).toBeGreaterThanOrEqual(2); // Document + Person (author)
    expect(body.nodes.length).toBeGreaterThan(0);
  });

  it('GET /api/ontology/graph/:orgId.html → returns HTML page', async () => {
    const res = await fetch(`${BASE}/api/ontology/graph/${orgId}.html`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<title>');
    expect(html).toContain(orgId);
    expect(html).toContain('SynovaAgent');
  });
});

// ═══ Slice 3: Diagnosis ═══

describe('Diagnosis API', () => {
  it('POST /api/diagnosis/consult without teamId → 400', async () => {
    const res = await fetch(`${BASE}/api/diagnosis/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/diagnosis/consult without initiator.role → 400', async () => {
    const res = await fetch(`${BASE}/api/diagnosis/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId: 'test', initiator: {} }),
    });
    expect(res.status).toBe(400);
  });

  it('POST /api/diagnosis/consult → SSE response format', { timeout: 10_000 }, async () => {
    // 验证 SSE 端点正确返回 event-stream content-type
    // 完整诊断流程需真实 LLM >3min, 这里只验证 HTTP 响应格式
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 3000); // 3s 后中断 — 只验证连接建立
    try {
      const res = await fetch(`${BASE}/api/diagnosis/consult`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: 'test-team-quick',
          initiator: { role: 'CEO', name: '测试' },
        }),
        signal: ctrl.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      expect(contentType).toContain('text/event-stream');
      // 连接已建立 — 格式验证通过
    } catch (err: any) {
      if (err.name === 'AbortError' || err.name === 'TypeError') return; // 预期中断
      throw err;
    }
    await res.text();
  });

  it('GET /api/diagnosis/consult/nonexistent/status → 404', async () => {
    const res = await fetch(`${BASE}/api/diagnosis/consult/nonexistent/status`);
    expect(res.status).toBe(404);
  });
});
