/**
 * sessions-api.test.ts — 会话 HTTP API 测试 (Era 3.1, iron law 0-2 Step 2)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../src/server';
import type { Server } from 'http';

let server: Server;
const PORT = 3098;
const BASE = `http://localhost:${PORT}`;

beforeAll(async () => {
  process.env.DEV_MODE = 'true';
  process.env.PORT = String(PORT);
  process.env.SYNOVA_DB_PATH = ':memory:';
  server = await createServer();
});

afterAll(() => { if (server) server.close(); });

describe('Sessions API', () => {
  let sessionId: string;

  it('POST /api/sessions → creates a session', async () => {
    const res = await fetch(`${BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: 'test-corp' }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.session.id).toBeTruthy();
    expect(body.session.orgId).toBe('test-corp');
    sessionId = body.session.id;
  });

  it('GET /api/sessions → lists sessions', async () => {
    const res = await fetch(`${BASE}/api/sessions`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sessions.length).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/sessions/:id → returns session with messages', async () => {
    const res = await fetch(`${BASE}/api/sessions/${sessionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.session.id).toBe(sessionId);
    expect(body.session.orgId).toBe('test-corp');
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it('GET /api/sessions/search?q= → searches messages', async () => {
    const res = await fetch(`${BASE}/api/sessions/search?q=test`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.results)).toBe(true);
  });

  it('DELETE /api/sessions/:id → deletes session', async () => {
    const res = await fetch(`${BASE}/api/sessions/${sessionId}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    // Verify gone
    const getRes = await fetch(`${BASE}/api/sessions/${sessionId}`);
    expect(getRes.status).toBe(404);
  });

  it('GET /api/sessions/:id for nonexistent → 404', async () => {
    const res = await fetch(`${BASE}/api/sessions/nonexistent`);
    expect(res.status).toBe(404);
  });
});
