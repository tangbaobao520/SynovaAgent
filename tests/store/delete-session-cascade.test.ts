/**
 * tests/store/delete-session-cascade.test.ts — D820 删会话级联（诊断报告不再残留）集成测试
 *
 * 判据 D（客户数据资产/隐私）：删了会话，诊断报告必须**真删**，且报告列表 API 不再列出。
 *
 * 缺陷基线（origin/main@4f3bb21c 实测）:
 *   - deleteSession 只删 agent_messages + agent_sessions（session-store.ts:355-358）
 *   - deleteDiagnosisCheckpoints 已存在但全仓零调用者（:581-583）
 *   - listDiagnosisReports 不 join agent_sessions（:598-639）→ 删会话后报告仍被 GET 列出
 *   - **关键事实**：phase=5 归档行的 session_id 存的是 **reportId**（consult 路线
 *     diagnosis.ts:600-602、对话桥路线 conversations.ts:307-309），且该表无 FK/CASCADE
 *     → 只把 deleteDiagnosisCheckpoints 接进 deleteSession 是空操作，必须补
 *     `origin_session_id` 归属链（D820 修复）。
 *
 * 铁律 12：集成测试走真实路由（express + listen(0) + fetch + 真实 better-sqlite3 ':memory:'），
 * 不 mock 管线——vi.mock 仅四处既有配置缝（providers / providers/detect / config / 诊断引擎工厂，
 * 与 tests/routes/diagnosis-report-persistence.test.ts 同型，非本卡对象）。
 *
 * 穿真实入口:
 *   建会话/落报告 = POST /api/conversations ×3（第 3 轮 phaseComplete → 诊断桥落盘）
 *   删会话       = DELETE /api/sessions/:id（routes/sessions.ts:110-118）
 *   报告列表     = GET /api/diagnosis/reports（routes/diagnosis.ts:935）
 *
 * red→green：修复前用例 1/2 必红（归档行残留 + 列表仍列出）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import type { Server } from 'http';
import { SessionStore } from '../../src/store/session-store';

// ═══ hoisted mock 状态 ═══
const mocks = vi.hoisted(() => ({
  /** 每次诊断完成的序号 → 确定性 reportId（rpt_cascade_1, rpt_cascade_2, ...） */
  consultSeq: { n: 0 },
}));

// ── 配置缝 ① 诊断引擎工厂：确定性 reportId + 一个阶段事件（spec §7 既有模式）──
vi.mock('../../src/l3/synova-diagnosis-engine-impl', () => ({
  createSynovaDiagnosisEngine: () => ({
    async runConsultation(
      teamId: string,
      _initiator: unknown,
      _scope: unknown,
      onEvent?: (event: { type: string; phase: number; label?: string; confidence?: number }) => void,
    ) {
      onEvent?.({ type: 'phase_started', phase: 1, label: '数据采集', confidence: 0.9 });
      mocks.consultSeq.n += 1;
      return {
        teamId,
        report: { reportId: `rpt_cascade_${mocks.consultSeq.n}`, summary: 'D820 级联测试报告' },
        totalDurationMs: 5,
        degradedModules: [],
      };
    },
  }),
}));

// ── 配置缝 ② providers（importOriginal spread：sever import 链上其他导出保真）──
vi.mock('../../src/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/providers')>();
  return {
    ...actual,
    createProvider: () => ({
      name: 'fake-d820-provider',
      baseUrl: 'fake://d820-test',
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

// ── 配置缝 ③ config：定值 ──
vi.mock('../../src/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/config')>();
  return {
    ...actual,
    loadConfig: () => ({
      llmApiKey: 'test-key',
      llmBaseUrl: 'http://localhost:1',
      llmModel: 'test-model',
      dbPath: ':memory:',
      devMode: false,
      diagnosis: { maxToolRounds: 2, gateDataCompleteness: 0.3, gateMinHypothesisConfidence: 0.5 },
    }),
  };
});

// ═══ helpers ═══

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

interface ChatDiagnosisResult { sessionId: string; reportId: string }

/** 走真实对话入口跑到 phaseComplete → 诊断桥落盘（D593 用例 8 同型三轮访谈） */
async function runChatDiagnosis(baseUrl: string): Promise<ChatDiagnosisResult> {
  const r1 = await fetch(`${baseUrl}/api/conversations`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '我们是 50 人的制造企业' }),
  });
  expect(r1.status).toBe(200);
  const open = parseSseFrames(await r1.text()).find(f => f.type === 'open');
  const sessionId = typeof open?.sessionId === 'string' ? open.sessionId : '';
  expect(sessionId).not.toBe('');

  await (await fetch(`${baseUrl}/api/conversations/${sessionId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '团队分生产/销售/研发三块' }),
  })).text();

  const r3 = await fetch(`${baseUrl}/api/conversations/${sessionId}/messages`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: '没有了，开始诊断' }),
  });
  expect(r3.status).toBe(200);
  const complete = parseSseFrames(await r3.text()).find(f => f.type === 'complete');
  const report = complete?.report as { reportId?: string } | undefined;
  const reportId = typeof report?.reportId === 'string' ? report.reportId : '';
  expect(reportId, '对话桥未落盘 reportId 时本用例不成立').not.toBe('');
  return { sessionId, reportId };
}

/** 走真实 GA consult 入口（该路线手上只有 consultId，归档行无会话链可记） */
async function runConsult(baseUrl: string, teamId: string): Promise<string> {
  const res = await fetch(`${baseUrl}/api/diagnosis/consult`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ teamId, initiator: { role: 'GA', name: '测试GA' } }),
  });
  expect(res.status).toBe(200);
  const complete = parseSseFrames(await res.text()).find(f => f.type === 'complete');
  const report = complete?.report as { reportId?: string } | undefined;
  const reportId = typeof report?.reportId === 'string' ? report.reportId : '';
  expect(reportId).not.toBe('');
  return reportId;
}

interface ReportListBody { ok: boolean; total: number; reports: Array<{ reportId: string }> }

async function listReports(baseUrl: string): Promise<ReportListBody> {
  const res = await fetch(`${baseUrl}/api/diagnosis/reports`);
  expect(res.status).toBe(200);
  return await res.json() as ReportListBody;
}

async function deleteSession(baseUrl: string, sessionId: string): Promise<number> {
  const res = await fetch(`${baseUrl}/api/sessions/${sessionId}`, { method: 'DELETE' });
  await res.text().catch(() => '');
  return res.status;
}

interface CheckpointRow { session_id: string; phase: number; origin_session_id: string | null }
interface CountRow { c: number }

// ═══ tests ═══

describe('D820: 删会话级联——诊断报告真删 + 列表不再列出（穿真实入口）', () => {
  let server: Server | undefined;
  let baseUrl = '';
  let db: Database.Database;

  const countCheckpoints = (sql: string, ...params: string[]): number =>
    (db.prepare(sql).get(...params) as CountRow).c;

  beforeAll(async () => {
    const diagnosisRouter = (await import('../../src/routes/diagnosis')).default;
    const conversationsRouter = (await import('../../src/routes/conversations')).default;
    const sessionsRouter = (await import('../../src/routes/sessions')).default;

    db = new Database(':memory:');
    const app = express();
    app.use(express.json());
    app.locals.orchestration = { db };
    // routes/sessions.ts:getStore 优先取注入实例（未注入会装配真实 dbPath——测试必须注入，
    // 与 conversations.ts 的 orchestration.db 指向同一句柄 → 两入口看到同一份数据）
    app.locals.sessionStore = new SessionStore(db);
    app.use(diagnosisRouter);
    app.use(conversationsRouter);
    app.use(sessionsRouter);
    server = app.listen(0);
    baseUrl = await waitListening(server);
  });

  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server?.close(() => resolve()));
    db.close();
  });

  it('用例 1: 建会话 → 落报告（归档行带归属链）→ 删会话 → 归档行物理消失（真删，非软删）', async () => {
    const { sessionId, reportId } = await runChatDiagnosis(baseUrl);

    // 落盘 + 归属链（修复前 origin_session_id 列不存在 → 本断言即红）
    const row = db.prepare(
      'SELECT session_id, phase, origin_session_id FROM diagnosis_checkpoints WHERE session_id = ? AND phase = 5',
    ).get(reportId) as CheckpointRow | undefined;
    expect(row, 'phase=5 归档行应存在').toBeTruthy();
    expect((row as CheckpointRow).origin_session_id, '归档行必须记归属会话 id（删会话级联的物理依据）').toBe(sessionId);

    const before = countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE session_id = ?', reportId);
    expect(before).toBe(1);

    expect(await deleteSession(baseUrl, sessionId)).toBe(200);

    // 真删证据①：按两个键查都为零（origin 链 + reportId 键）
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE origin_session_id = ?', sessionId)).toBe(0);
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE session_id = ?', reportId)).toBe(0);
    // 真删证据②：不是软删除——表结构里没有 deleted_at / is_deleted 之类的墓碑列
    const cols = (db.prepare('PRAGMA table_info(diagnosis_checkpoints)').all() as Array<{ name: string }>).map(c => c.name);
    expect(cols).not.toContain('deleted_at');
    expect(cols).not.toContain('is_deleted');
    // 会话本体也确实没了
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM agent_sessions WHERE id = ?', sessionId)).toBe(0);
  });

  it('用例 2: GET /api/diagnosis/reports 不再列出已删会话的报告（不是只在库里删了、列表还在）', async () => {
    const { sessionId, reportId } = await runChatDiagnosis(baseUrl);

    const beforeList = await listReports(baseUrl);
    expect(beforeList.reports.map(r => r.reportId), '删除前应在列表中').toContain(reportId);

    expect(await deleteSession(baseUrl, sessionId)).toBe(200);

    const afterList = await listReports(baseUrl);
    expect(afterList.ok).toBe(true);
    expect(afterList.reports.map(r => r.reportId), '删除后不得再列出').not.toContain(reportId);
    expect(afterList.total).toBe(beforeList.total - 1);
    expect(afterList.total).toBe(
      countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints c WHERE c.phase = 5'),
    );
  });

  it('用例 3（反向·不误删）: 未删会话的报告仍列出；consult 报告（无会话链）不被过滤', async () => {
    const kept = await runChatDiagnosis(baseUrl);          // 未删会话的报告
    const consultReportId = await runConsult(baseUrl, 'org-d820');  // consult 报告（origin NULL）
    const doomed = await runChatDiagnosis(baseUrl);        // 待删会话的报告

    // consult 归档行确实没有会话链（如实记录：该路线手上只有 consultId）
    const consultRow = db.prepare(
      'SELECT session_id, origin_session_id FROM diagnosis_checkpoints WHERE session_id = ? AND phase = 5',
    ).get(consultReportId) as CheckpointRow | undefined;
    expect(consultRow).toBeTruthy();
    expect((consultRow as CheckpointRow).origin_session_id).toBeNull();

    expect(await deleteSession(baseUrl, doomed.sessionId)).toBe(200);

    const afterList = await listReports(baseUrl);
    const ids = afterList.reports.map(r => r.reportId);
    expect(ids, '未删会话的报告必须仍在（不误删）').toContain(kept.reportId);
    expect(ids, 'consult 报告（session_id=reportId、无 agent_sessions 行）必须仍在——裸 EXISTS 谓词会把它抹掉').toContain(consultReportId);
    expect(ids, '已删会话的报告必须不在').not.toContain(doomed.reportId);
    // 反向：被删会话的归档行在库中也真的没了
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE session_id = ?', doomed.reportId)).toBe(0);
  });

  it('用例 4: 级联同时清除键=sessionId 的 resume 检查点行（phase<5）', async () => {
    const { sessionId } = await runChatDiagnosis(baseUrl);
    // 会话级 resume 检查点（launcher 写入形态：sessionId = chat 会话 id）
    const store = new SessionStore(db);
    store.saveDiagnosisCheckpoint({
      sessionId, phase: 2, completedModules: ['M1'], partialReport: { partial: true }, savedAt: new Date().toISOString(),
    });
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE session_id = ?', sessionId)).toBe(1);

    expect(await deleteSession(baseUrl, sessionId)).toBe(200);
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE session_id = ?', sessionId)).toBe(0);
  });

  it('用例 5（边界）: 删未知会话 → 404（不谎报删除成功）', async () => {
    expect(await deleteSession(baseUrl, 'sess_does_not_exist')).toBe(404);
  });

  it('用例 6（契约）: 同键重写不携带归属链时，已有链被保留（COALESCE 保链）', async () => {
    const store = new SessionStore(db);
    const key = 'rpt_cascade_upsert_probe';
    store.saveDiagnosisCheckpoint({
      sessionId: key, phase: 5, completedModules: [], partialReport: { reportId: key }, savedAt: new Date().toISOString(), originSessionId: 'sess_keep_me',
    });
    store.saveDiagnosisCheckpoint({
      sessionId: key, phase: 5, completedModules: [], partialReport: { reportId: key }, savedAt: new Date().toISOString(),
    });
    const row = db.prepare(
      'SELECT origin_session_id FROM diagnosis_checkpoints WHERE session_id = ? AND phase = 5',
    ).get(key) as CheckpointRow | undefined;
    expect((row as CheckpointRow).origin_session_id, '后写不带来源不得抹掉已有归属链').toBe('sess_keep_me');
    db.prepare('DELETE FROM diagnosis_checkpoints WHERE session_id = ?').run(key);
  });

  it('用例 7（旧库迁移·N2）: 手搓「无 origin_session_id 列」的存量库 → new SessionStore 自动补列，列表不 fail-closed', () => {
    // 旧库形态（tests/e2e/checkpoint-e2e.test.ts:14-21 同型：手搓旧表，不含新列）
    // 若只把新列写进 CREATE TABLE IF NOT EXISTS，存量库（data/synova.db）永远没有该列
    // → 任何引用该列的查询抛错 → listDiagnosisReports 走 catch → GET /api/diagnosis/reports 503。
    const legacy = new Database(':memory:');
    try {
      legacy.exec(`CREATE TABLE IF NOT EXISTS diagnosis_checkpoints (
        session_id TEXT NOT NULL, phase INTEGER DEFAULT 0,
        completed_modules TEXT DEFAULT '[]', partial_report TEXT DEFAULT 'null',
        saved_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (session_id, phase)
      )`);
      legacy.prepare(
        'INSERT INTO diagnosis_checkpoints (session_id, phase, completed_modules, partial_report, saved_at) VALUES (?,?,?,?,?)',
      ).run('rpt_legacy_1', 5, '[]', JSON.stringify({
        reportId: 'rpt_legacy_1', teamId: 'org-legacy', completedAt: '2026-09-20T00:00:00.000Z',
        report: { summary: '存量旧行' }, source: 'consult',
      }), '2026-09-20T00:00:00.000Z');

      const store = new SessionStore(legacy); // initSchema 幂等 ALTER 迁移点

      const cols = (legacy.prepare('PRAGMA table_info(diagnosis_checkpoints)').all() as Array<{ name: string }>).map(c => c.name);
      expect(cols, '存量库必须被补上 origin_session_id 列').toContain('origin_session_id');

      const res = store.listDiagnosisReports({ limit: 50, offset: 0 });
      expect(res.ok, '补列后列表不得 fail-closed（否则桌面恢复入口 503）').toBe(true);
      if (res.ok) {
        expect(res.reports.map(r => r.reportId), '存量旧行（无链）照旧列出').toContain('rpt_legacy_1');
      }
    } finally {
      legacy.close();
    }
  });

  it('用例 8（读侧谓词·纵深防御）: 存量孤儿归档行（链到已不存在会话）不列出——但库内仍在（证明是谓词在挡，不是级联）', async () => {
    // 场景：老库/旧二进制删过会话，归档行没被级联清掉（本卡修复前就存在的数据形态）。
    // 级联删除挡不住它（会话早已不存在，deleteSession 不会再被调用）→ 只有读侧谓词能挡。
    const store = new SessionStore(db);
    const orphanKey = 'rpt_cascade_orphan_legacy';
    store.saveDiagnosisCheckpoint({
      sessionId: orphanKey, phase: 5, completedModules: [],
      partialReport: {
        reportId: orphanKey, teamId: 'org-d820', completedAt: '2026-09-19T00:00:00.000Z',
        report: { summary: '存量孤儿报告' }, source: 'conversation',
      },
      savedAt: '2026-09-19T00:00:00.000Z',
      originSessionId: 'sess_deleted_long_ago', // ← 该会话在 agent_sessions 里不存在
    });
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM agent_sessions WHERE id = ?', 'sess_deleted_long_ago')).toBe(0);
    expect(countCheckpoints('SELECT COUNT(*) AS c FROM diagnosis_checkpoints WHERE session_id = ?', orphanKey),
      '库内确实还有这行（级联挡不住已不存在的会话）').toBe(1);

    const list = await listReports(baseUrl);
    expect(list.reports.map(r => r.reportId), '读侧谓词必须挡住它（否则列表会泄露已删会话的报告）').not.toContain(orphanKey);

    // 会话"复活"（重新建出同 id 的行）→ 该行重新可见（谓词只挡不存在的会话，不误伤正常数据）
    db.prepare('INSERT INTO agent_sessions (id, org_id) VALUES (?,?)').run('sess_deleted_long_ago', 'org-d820');
    const list2 = await listReports(baseUrl);
    expect(list2.reports.map(r => r.reportId), '会话存在时该归档行照旧列出').toContain(orphanKey);

    db.prepare('DELETE FROM diagnosis_checkpoints WHERE session_id = ?').run(orphanKey);
    db.prepare('DELETE FROM agent_sessions WHERE id = ?').run('sess_deleted_long_ago');
  });
});
