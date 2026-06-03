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
const PORT = 3099;
const BASE = `http://localhost:${PORT}`;

beforeAll(async () => {
  server = await createServer();
});

afterAll(() => {
  if (server) server.close();
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

  it('POST /api/diagnosis/consult with valid input → 200 SSE stream', async () => {
    const res = await fetch(`${BASE}/api/diagnosis/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: 'test-team',
        initiator: { role: 'CEO', name: '测试用户' },
      }),
    });
    // SSE 流或错误——都是有效响应 (LLM 未配置时会走到错误路径)
    expect(res.status).toBe(200);
    const contentType = res.headers.get('content-type') || '';
    // 应该是 SSE 流或 JSON 错误
    expect(contentType).toMatch(/text\/event-stream|application\/json/);
    // 消费流以避免资源泄漏
    await res.text();
  }, 30000);

  it('GET /api/diagnosis/consult/nonexistent/status → 404', async () => {
    const res = await fetch(`${BASE}/api/diagnosis/consult/nonexistent/status`);
    expect(res.status).toBe(404);
  });
});
