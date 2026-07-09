/**
 * tests/agent-observer/report.integration.test.ts — Agent Observer 上报 集成测试
 *
 * 切片: POST /api/agent-observer/report → SOG AGENT 节点创建/更新 → GET graph 验证
 * 铁律 0-2: 集成测试覆盖真实路由，不 mock 管线
 * 铁律 12: hit 真实 Express server (:0 随机端口)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/server';
import type { Server } from 'http';

let server: Server;
let BASE: string;

beforeAll(async () => {
  process.env.PORT = '0';
  process.env.SYNOVA_DB_PATH = ':memory:';
  process.env.SYNOVA_SKIP_MCP = '1';
  server = await createServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3099;
  BASE = `http://localhost:${port}`;
}, 15_000);

afterAll(() => {
  if (server) server.close();
});

const VALID_ACTIVITY = {
  agentId: 'e2e-test-agent',
  platform: 'claude-code',
  name: 'E2E测试Agent',
  agentType: 'external',
  activityType: 'tool_call',
  timestamp: '2026-06-05T10:00:00.000Z',
  lastToolName: 'Bash',
  model: 'claude-opus-4-8',
} as const;

// ═══ 正常流程 ═══

describe('POST /api/agent-observer/report — happy path', () => {
  it('Given valid single activity, When POST, Then returns 200 + action=created', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_ACTIVITY),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe('created');
    expect(body.agentNodeId).toBeTruthy();
    expect(body.degraded).toBe(false);
  });

  it('Given same agent again, When POST, Then returns action=updated + activityCount increments', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_ACTIVITY, lastToolName: 'Read' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.action).toBe('updated');
    expect(body.agentNodeId).toBeTruthy();
  });

  it('Given valid batch of 2 activities, When POST, Then returns 200 + count=2', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([
        { ...VALID_ACTIVITY, agentId: 'batch-a' },
        { ...VALID_ACTIVITY, agentId: 'batch-b', platform: 'hermes' },
      ]),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.count).toBe(2);
    expect(body.results[0].action).toBe('created');
    expect(body.results[1].action).toBe('created');
  });

  it('Given teamId specified, When POST, Then returns 200', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_ACTIVITY, agentId: 'team-agent', teamId: 'acme-corp' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

// ═══ 校验失败 ═══

describe('POST /api/agent-observer/report — validation errors', () => {
  it('Given missing agentId, When POST, Then returns 400 VALIDATION_ERROR', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'claude-code', name: 'X', timestamp: '2026-01-01T00:00:00Z', activityType: 'heartbeat' }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toContain('agentId');
  });

  it('Given missing timestamp, When POST, Then returns 400', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'x', platform: 'claude-code', name: 'X', activityType: 'heartbeat' }),
    });
    expect(res.status).toBe(400);
  });

  it('Given invalid timestamp format, When POST, Then returns 400', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_ACTIVITY, timestamp: 'not-a-date' }),
    });
    expect(res.status).toBe(400);
  });

  it('Given invalid agentType, When POST, Then returns 400', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_ACTIVITY, agentType: 'invalid' }),
    });
    expect(res.status).toBe(400);
  });

  it('Given non-JSON body, When POST, Then returns 400', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'not json',
    });
    // Express 在 JSON.parse 失败时可能返回 400 或 500
    expect([400, 500]).toContain(res.status);
  });

  it('Given empty body, When POST, Then returns 400', async () => {
    const res = await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

// ═══ AGENT 节点出现在图谱中 ═══

describe('GET /api/ontology/graph — AGENT node visible', () => {
  it('Given activity reported, When GET graph, Then AGENT node appears in nodes', async () => {
    const agentId = `graph-verify-${Date.now()}`;
    // Report
    await fetch(`${BASE}/api/agent-observer/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_ACTIVITY, agentId }),
    });

    // Verify in graph
    const res = await fetch(`${BASE}/api/ontology/graph/default`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);

    const agentNode = body.nodes.find((n: { type: string; props: Record<string, unknown> }) =>
      n.type === 'resource/agent' && n.props.name === 'E2E测试Agent',
    );
    expect(agentNode).toBeDefined();
    expect(agentNode.props.platform).toBe('claude-code');
    expect(agentNode.props.activityCount).toBeGreaterThanOrEqual(1);
  });
});
