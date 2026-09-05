/**
 * tests/routes/diagnosis-consult-events.test.ts — D489 (D394 片2-B): consult 路由事件化接线
 *
 * 验证 POST /api/diagnosis/consult 生产路径经 DiagnosisLauncher 落 session_events（D500 地基 + D487 落流机制）:
 *   ① consult 后 session_events 含 diagnosis_phase/module/report（red=现状直建引擎零事件 → green）
 *   ② SSE onEvent 透传仍触发（launcher 双写不吞事件流）
 *   ③ 无 db（orchestration.db 缺失）时降级不崩（无 sessionStore 跳过落流，诊断仍返回结果，铁律 24/31）
 *   ④ report 缓存 + GET /consult/:id/report 行为零回归（D480 语义不变）
 *
 * 铁律 12: 集成测试走真实路由（express app + listen(0) + fetch），不 mock 管线——
 *          仅 mock 引擎工厂（避免真实 LLM 调用）与 provider/config 构造（保持测试密闭）。
 * Given/When/Then；fake 引擎确定性发射 阶段→模块 事件后返回报告。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import type { Server } from 'http';
import { SessionStore } from '../../src/store/session-store';

// ═══ Mock 引擎工厂 — 路由 import('../l3/synova-diagnosis-engine-impl') 拿到 fake 引擎 ═══
// 确定性发射 phase_started → interim_finding 后返回报告；断言不触真实 LLM。
vi.mock('../../src/l3/synova-diagnosis-engine-impl', () => ({
  createSynovaDiagnosisEngine: () => ({
    async runConsultation(
      teamId: string,
      _initiator: unknown,
      _scope: unknown,
      onEvent?: (event: { type: string; phase: number; label?: string; message?: string; confidence?: number }) => void,
    ) {
      onEvent?.({ type: 'phase_started', phase: 1, label: '数据采集', confidence: 0.9 });
      onEvent?.({ type: 'interim_finding', phase: 2, message: '客户集中度过高', confidence: 0.7 });
      return { teamId, report: { summary: 'D489 测试诊断报告' }, totalDurationMs: 7, degradedModules: [] };
    },
  }),
}));

// provider/config 仅被路由构造（fake 引擎从不调用 chat）——mock 掉保持密闭，不触真实网关
vi.mock('../../src/providers', () => ({
  createProvider: () => ({ name: 'fake-d489-provider' }),
}));
vi.mock('../../src/providers/detect', () => ({
  detectProvider: () => 'deepseek',
}));
vi.mock('../../src/config', () => ({
  loadConfig: () => ({
    llmApiKey: 'test-key',
    llmBaseUrl: 'http://localhost:1',
    llmModel: 'test-model',
    diagnosis: { maxToolRounds: 2, gateDataCompleteness: 0.3, gateMinHypothesisConfidence: 0.5 },
  }),
}));

function parseSseFrames(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter(chunk => chunk.startsWith('data: '))
    .map(chunk => JSON.parse(chunk.replace(/^data: /, '')) as Record<string, unknown>);
}

async function postConsult(baseUrl: string, teamId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/diagnosis/consult`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, initiator: { role: 'GA', name: '测试GA' } }),
  });
}

describe('D489: consult 路由事件化接线（D394 片2-B）', () => {
  let server: Server;
  let serverNoDb: Server;
  let baseUrl: string;
  let baseUrlNoDb: string;
  let db: Database.Database;

  beforeAll(async () => {
    const diagnosisRouter = (await import('../../src/routes/diagnosis')).default;

    // app1: orchestration.db 在场（事件落流目标库）
    const app = express();
    app.use(express.json());
    db = new Database(':memory:');
    app.locals.orchestration = { db };
    app.use(diagnosisRouter);
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr !== 'string') baseUrl = `http://localhost:${addr.port}`;
    });
    await new Promise<void>(resolve => { const t = setInterval(() => { if (baseUrl) { clearInterval(t); resolve(); } }, 10); });

    // app2: orchestration 在场但 db 缺失（降级路径：无 sessionStore 跳过落流）
    const appNoDb = express();
    appNoDb.use(express.json());
    appNoDb.locals.orchestration = {};
    appNoDb.use(diagnosisRouter);
    serverNoDb = appNoDb.listen(0, () => {
      const addr = serverNoDb.address();
      if (addr && typeof addr !== 'string') baseUrlNoDb = `http://localhost:${addr.port}`;
    });
    await new Promise<void>(resolve => { const t = setInterval(() => { if (baseUrlNoDb) { clearInterval(t); resolve(); } }, 10); });
  });

  afterAll(() => {
    return new Promise<void>(resolve => {
      let closed = 0;
      const done = () => { closed += 1; if (closed >= 2) resolve(); };
      server.close(() => done());
      serverNoDb.close(() => done());
    });
  });

  it('① consult 后 session_events 含诊断事件流 diagnosis_phase/module/report（red=直建引擎零事件）', async () => {
    const res = await postConsult(baseUrl, 'org-d489-a');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('complete');

    // 路由应经 createSession 建会话（本测试库唯一会话行）
    const rows = db.prepare('SELECT id FROM agent_sessions').all() as Array<{ id: string }>;
    expect(rows.length).toBe(1);
    const sessionId = rows[0].id;
    expect(sessionId).not.toBe('');

    // 事件落流: 阶段/模块/报告三类齐全，报告事件为回放终点
    const store = new SessionStore(db);
    const events = store.getEvents(sessionId);
    const types = events.map(e => e.eventType);
    expect(types).toContain('diagnosis_phase');
    expect(types).toContain('diagnosis_module');
    expect(types).toContain('diagnosis_report');
    expect(types.indexOf('diagnosis_report')).toBe(types.length - 1);
    // 空 sessionId 桶缺陷防线（D487）: 全部事件归属真实会话
    for (const ev of events) {
      expect(ev.sessionId).toBe(sessionId);
    }
  });

  it('② SSE onEvent 透传仍触发（launcher 双写不吞事件流）', async () => {
    const res = await postConsult(baseUrl, 'org-d489-b');
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    const types = frames.map(f => f.type);
    expect(types).toContain('phase_started');
    expect(types).toContain('interim_finding');
    expect(types).toContain('complete');
    // 引擎原始事件内容透传无损（launcher 只双写，不改写 SSE 载荷）
    const finding = frames.find(f => f.type === 'interim_finding');
    expect(finding?.message).toBe('客户集中度过高');
  });

  it('③ 无 db（orchestration.db 缺失）降级不崩——诊断仍返回结果', async () => {
    const res = await postConsult(baseUrlNoDb, 'org-d489-c');
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    const types = frames.map(f => f.type);
    expect(types).toContain('complete');
    expect(types).not.toContain('error');
    const complete = frames.find(f => f.type === 'complete') as { report?: { summary?: string } } | undefined;
    expect(complete?.report?.summary).toBe('D489 测试诊断报告');
  });

  it('④ report 缓存 + GET /consult/:id/report 行为零回归（D480）', async () => {
    const res = await postConsult(baseUrl, 'org-d489-d');
    const consultId = res.headers.get('X-Consult-Id');
    expect(consultId).toBeTruthy();
    await res.text();

    const rep = await fetch(`${baseUrl}/api/diagnosis/consult/${consultId}/report`);
    expect(rep.status).toBe(200);
    const body = (await rep.json()) as { ok: boolean; teamId: string; report: { summary?: string } };
    expect(body.ok).toBe(true);
    expect(body.teamId).toBe('org-d489-d');
    expect(body.report.summary).toBe('D489 测试诊断报告');
  });
});
