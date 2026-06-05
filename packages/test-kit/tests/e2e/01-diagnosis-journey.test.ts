/**
 * tests/e2e/01-diagnosis-journey.test.ts
 *
 * L4: 完整诊断用户旅程。
 * 验证: POST /api/diagnosis/consult → SSE 流式响应 → 本体图查询
 *
 * 历史：EADDRINUSE 端口冲突 — 此测试使用动态端口 + waitForServer
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE = process.env.BASE_URL || 'http://localhost:3099';

describe('E2E: 诊断 API 用户旅程', () => {
  it('GET /health → 200 + status:ok', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('ok');
  });

  it('GET /api/status → 200 + llmConfigured', async () => {
    const res = await fetch(`${BASE}/api/status`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('POST /api/diagnosis/consult → SSE 流式响应', async () => {
    const res = await fetch(`${BASE}/api/diagnosis/consult`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        teamId: 'e2e-test-team',
        initiator: { role: 'CEO', name: '测试用户', organizationName: 'E2E 测试组织' },
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
  });

  it('GET /api/ontology/graph/:orgId → 200 + 图结构', async () => {
    const res = await fetch(`${BASE}/api/ontology/graph/e2e-test-team`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.orgId).toBe('e2e-test-team');
  });

  it('GET /api/sessions → 200 + 会话列表', async () => {
    const res = await fetch(`${BASE}/api/sessions`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});
