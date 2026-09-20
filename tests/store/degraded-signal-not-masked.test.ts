/**
 * tests/store/degraded-signal-not-masked.test.ts — D822 降级信号自遮蔽（穿真实入口）
 *
 * 缺陷（origin/main 基线实测）：
 *   `addMessage` 写成功即把 `lastDegraded` 重置 false（`src/store/session-store.ts:375-382`），
 *   而路由层在**第 2 次写之后**才检查该标志（`src/routes/conversations.ts:260-262`）
 *   ⇒ 同一轮内「用户消息写失败 → 助手回复写成功」→ 失败事实被抹掉 → **STORE_DEGRADED 帧漏发**
 *   （用户看到"一切正常"，实际模型上下文与落库日志已断裂）。
 *   且缺陷被测试固化：`tests/store/session-event-log.test.ts:146-164`（本卡已改写）。
 *
 * 范式（①范式复用，零依赖，不引包）：`@deepseek-ai/dsh-session-stats/lib/index.js:11,103,129`
 *   —— 事件流**逐条累计落账**（`steps: state.steps + 1` / `llmMs: state.llmMs + ...`），
 *   每个事件独立入账、不被后续事件覆盖（其 step/end 放在 finally，四种结束状态都留一条）。
 *   对照我们的缺陷：用一个**会被后续成功重置的瞬时布尔**承载降级事实 ⇒ 失败被覆盖。
 *
 * 注入手法（既有配置缝，**不在 src/** 加测试专用开关**，四条禁止之一**）：
 *   SQLite 触发器按 **payload 角色**选择性拒绝（`tests/routes/conversations.test.ts:602` 的 trigger 缝同源）。
 *   ⚠️ 不能用 `WHEN NEW.seq = 1`：seq 由 `SELECT MAX(seq)+1` 算（`session-store.ts:498-500`），
 *   第一条被 ABORT 后 MAX 仍是 0 → 下一条又算 seq=1 → 触发器持续命中，构不成「一失败一成功」（实测）。
 *
 * 铁律 12：集成测试走真实路由（express + listen(0) + fetch + 真实 better-sqlite3 ':memory:'），
 * 不 mock 管线——vi.mock 仅四处既有配置缝（providers / providers/detect / config / 诊断引擎工厂）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import type { Server } from 'http';
import { SessionStore } from '../../src/store/session-store';

// ── 配置缝 ① providers ──
vi.mock('../../src/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers')>();
  return {
    ...actual,
    createProvider: () => ({
      name: 'fake-d822-provider',
      baseUrl: 'fake://d822-test',
      async chat() { return { content: '收到。', model: 'fake' }; },
      async healthCheck() { return { healthy: true, latencyMs: 1 }; },
      listModels() { return ['fake']; },
    }),
  };
});
vi.mock('../../src/providers/detect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers/detect')>();
  return { ...actual, detectProvider: () => 'deepseek' };
});

// ── 配置缝 ② config ──
vi.mock('../../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config')>();
  return {
    ...actual,
    loadConfig: () => ({
      llmApiKey: 'test-key', llmBaseUrl: 'http://localhost:1', llmModel: 'test-model',
      dbPath: ':memory:', devMode: false,
      diagnosis: { maxToolRounds: 2, gateDataCompleteness: 0.3, gateMinHypothesisConfidence: 0.5 },
    }),
  };
});

// ── 配置缝 ③ 诊断引擎工厂（本用例不触发诊断桥，仍 mock 以免真引擎装载） ──
vi.mock('../../src/l3/synova-diagnosis-engine-impl', () => ({
  createSynovaDiagnosisEngine: () => ({
    async runConsultation() {
      return { teamId: 't', report: { reportId: 'rpt_d822', summary: 'unused' }, totalDurationMs: 1, degradedModules: [] };
    },
  }),
}));

function parseSseFrames(text: string): Array<Record<string, unknown>> {
  return text
    .split('\n\n')
    .filter(block => block.includes('data: '))
    .map(block => {
      const dataLine = block.split('\n').find(l => l.startsWith('data: ')) ?? '';
      return JSON.parse(dataLine.replace('data: ', '')) as Record<string, unknown>;
    });
}

async function waitListening(srv: Server): Promise<string> {
  const addr = srv.address();
  if (addr && typeof addr !== 'string') return `http://localhost:${addr.port}`;
  return await new Promise<string>((resolve) => {
    const t = setInterval(() => {
      const a = srv.address();
      if (a && typeof a !== 'string') { clearInterval(t); resolve(`http://localhost:${a.port}`); }
    }, 10);
  });
}

interface CountRow { c: number }
interface EventRow { seq: number; payload_json: string }

const D822_TRIGGER = "CREATE TRIGGER d822_fail_user_event BEFORE INSERT ON session_events " +
  "WHEN json_extract(NEW.payload_json, '$.role') = 'user' BEGIN SELECT RAISE(ABORT, 'd822-injected'); END";

describe('D822: 降级信号自遮蔽（穿 POST /api/conversations 真实入口）', () => {
  let server: Server | undefined;
  let baseUrl = '';
  let db: Database.Database;

  beforeAll(async () => {
    const conversationsRouter = (await import('../../src/routes/conversations')).default;
    db = new Database(':memory:');
    const app = express();
    app.use(express.json());
    app.locals.orchestration = { db };
    app.locals.sessionStore = new SessionStore(db);
    app.use(conversationsRouter);
    server = app.listen(0);
    baseUrl = await waitListening(server);
  });

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server?.close(() => resolve()));
    db.close();
  });

  it('用例 1（核心）: 一次写失败 + 一次写成功 → STORE_DEGRADED 仍被发出（修复前无此帧）', async () => {
    db.exec(D822_TRIGGER);
    try {
      const res = await fetch(`${baseUrl}/api/conversations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '降级自遮蔽验证' }),
      });
      expect(res.status).toBe(200);
      const frames = parseSseFrames(await res.text());
      const sessionId = typeof frames.find(f => f.type === 'open')?.sessionId === 'string'
        ? frames.find(f => f.type === 'open')?.sessionId as string : '';
      expect(sessionId).not.toBe('');

      // ① 注入必须真实发生（防"触发器没生效"的假绿）：
      //    兼容表 agent_messages 有 2 行（两条都写成功），事件流**恰好 1 行且 role=assistant**
      const msgRow = db.prepare('SELECT COUNT(*) AS c FROM agent_messages WHERE session_id = ?').get(sessionId) as CountRow;
      expect(msgRow.c, '兼容表两条都写成功').toBe(2);
      const events = db.prepare('SELECT seq, payload_json FROM session_events WHERE session_id = ? ORDER BY seq').all(sessionId) as EventRow[];
      expect(events.length, '事件流只落了 1 条（user 那条被物理拒绝）').toBe(1);
      expect(JSON.parse(events[0].payload_json).role, '缺的正是 user → model-visible⟺logged 断裂成立').toBe('assistant');

      // ② 用户可见信号：STORE_DEGRADED 帧必须存在（修复前：同一轮后一次成功把 lastDegraded 复位 → 帧丢失）
      const degradedFrame = frames.find(f => f.type === 'error') as { code?: string; degraded?: boolean } | undefined;
      expect(degradedFrame, '本轮发生过写失败 → 必须发 error 帧').toBeTruthy();
      expect(degradedFrame?.code).toBe('STORE_DEGRADED');
      expect(degradedFrame?.degraded).toBe(true);

      // ③ 降级诚实但不崩流：正常帧照常交付，末帧 end
      const types = frames.map(f => f.type);
      expect(types).toContain('agent_message');
      expect(types[types.length - 1]).toBe('end');
    } finally {
      db.exec('DROP TRIGGER IF EXISTS d822_fail_user_event');
    }
  });

  it('用例 2（不误报）: 两次写都成功 → 不发 STORE_DEGRADED（修复不得把降级做成常态）', async () => {
    const res = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '正常轮次' }),
    });
    expect(res.status).toBe(200);
    const frames = parseSseFrames(await res.text());
    expect(frames.find(f => f.type === 'error'), '正常轮次不得有 error 帧').toBeUndefined();
    const sessionId = frames.find(f => f.type === 'open')?.sessionId as string;
    expect((db.prepare('SELECT COUNT(*) AS c FROM session_events WHERE session_id = ?').get(sessionId) as CountRow).c).toBe(2);
  });

  it('用例 3（不误报·历史失败不复燃）: 上一轮的失败不得让下一轮报降级（lastDegraded 逐条语义保留）', async () => {
    // 先制造一次失败（同一个 store 实例语义在会话级缓存下由新请求新实例承载，
    // 故此处用真实路由复现"同一轮失败后，下一轮干净"：上一轮注入失败 → 下一轮无注入）
    db.exec(D822_TRIGGER);
    await (await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '脏轮次' }),
    })).text();
    db.exec('DROP TRIGGER IF EXISTS d822_fail_user_event');

    const res = await fetch(`${baseUrl}/api/conversations`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '干净轮次' }),
    });
    const frames = parseSseFrames(await res.text());
    expect(frames.find(f => f.type === 'error'), '上一轮的失败不得粘滞到本轮（D500 复核修复语义保持）').toBeUndefined();
  });
});
