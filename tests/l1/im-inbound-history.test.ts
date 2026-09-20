/**
 * tests/l1/im-inbound-history.test.ts — D823 穿真实入口集成测试（IM 通道会话历史连续）
 *
 * 卡: D823（T-D6 im-inbound 调不存在的方法 / IM 历史恢复静默空转）｜规格: .claude/task-briefs/2026-09-20-D823-im-inbound-history.md
 * 队长裁定: (a′) 会话级引擎复用（批准，附 6 条硬条件）；(b) 否决
 *
 * 铁律 12（集成测试 cover 真实入口，不 mock 管线）具体化:
 *   入口 = 真实 express 路由 `POST /api/im/feishu/webhook`（listen(0) + 真实 fetch）
 *   中间 = 真实 handleInboundMessage → 真实 SessionStore(better-sqlite3 :memory:) → 真实 ConversationEngine
 *   出口 = 真实 createProvider('deepseek') 经**真实 HTTP** 打**本机替身 LLM 端点**（POST /chat/completions）
 *   ⇒ 不 vi.mock providers、不 mock 管线、不在 src/** 加测试专用开关（四条禁止）
 *   ⇒ 唯一替身是「外部 LLM 端点」（网络边界）与「日志接收器」（可观测边界，用于断言降级非静默）
 *
 * 说明: 消息文本经真实 PIIScrubber(S2) 后落库/入模（PII 边界是产品行为）→ 内容断言一律经 scrub() 取期望值；
 *       「到达替身」的匹配用洗不掉的 ASCII 标记（D823..）。
 *
 * red→green: 修复前 D823-1 必红（第 2 轮模型上下文不含第 1 轮、两轮 sessionId 不同）；
 *           修复后全绿。反向验收 = 抽掉修复后 D823-1 再次报红（见交付报告两次原始输出）。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import express from 'express';
import type { Server } from 'node:http';

// ── 可观测边界替身：日志接收器（断言「降级非静默」；不是管线替身）──
const logSink = vi.hoisted(() => ({
  warn: [] as Array<Record<string, unknown>>,
  error: [] as Array<Record<string, unknown>>,
}));

vi.mock('@synova/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@synova/logger')>();
  const record = (bucket: Array<Record<string, unknown>>) => (...args: unknown[]) => {
    const fields = typeof args[0] === 'object' && args[0] !== null ? (args[0] as Record<string, unknown>) : {};
    const msg = typeof args[1] === 'string' ? args[1] : typeof args[0] === 'string' ? args[0] : '';
    bucket.push({ ...fields, msg });
  };
  return {
    ...actual,
    createLogger: () => ({
      info: () => {}, debug: () => {}, trace: () => {}, fatal: () => {},
      warn: record(logSink.warn),
      error: record(logSink.error),
    }),
  };
});

// ═══ 替身 LLM 端点（本机 HTTP，OpenAI 兼容）═══

interface StubCall { messages: Array<{ role: string; content: string }>; }

const stub = {
  calls: [] as StubCall[],
  /** 命中该标记的请求被闸住（用于「跨用户不阻塞」用例） */
  gateMarker: null as string | null,
  held: [] as Array<() => void>,
};

function stubBodyText(call: StubCall): string {
  return call.messages.map(m => m.content).join('\n');
}

function startStubServer(): Promise<Server> {
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      let call: StubCall = { messages: [] };
      try {
        const parsed = JSON.parse(raw) as { messages?: Array<{ role: string; content: string }> };
        call = { messages: (parsed.messages ?? []).map(m => ({ role: String(m.role), content: String(m.content ?? '') })) };
      } catch { /* 非 JSON 请求体 → 记空 messages，仍回 200（本替身只关心 messages） */ }
      stub.calls.push(call);
      const reply = `D823-REPLY-${stub.calls.length}`;
      const respond = (): void => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          id: `chatcmpl-d823-${stub.calls.length}`,
          object: 'chat.completion',
          model: 'deepseek-v4-flash',
          choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 3 },
        }));
      };
      if (stub.gateMarker !== null && stubBodyText(call).includes(stub.gateMarker)) {
        stub.held.push(respond);   // 闸住：等用例显式放行（证明等待期间其他用户不被阻塞）
        return;
      }
      respond();
    });
  });
  return new Promise(resolve => { server.listen(0, '127.0.0.1', () => resolve(server)); });
}

function releaseGated(): void {
  const held = stub.held.splice(0, stub.held.length);
  for (const respond of held) respond();
}

// ═══ 通用等待器（禁 sleep 式轮询猜测；只等物理事件；超时带诊断）═══

async function waitFor(pred: () => boolean, timeoutMs = 15_000, label = 'condition'): Promise<void> {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > timeoutMs) {
      throw new Error(
        `waitFor 超时: ${label} | 替身 LLM 调用数=${stub.calls.length} | 最近 error 日志=${JSON.stringify(logSink.error.slice(-3))} | 最近 warn 日志=${JSON.stringify(logSink.warn.slice(-3))}`,
      );
    }
    await new Promise(r => setTimeout(r, 20));
  }
}

function callsWith(marker: string): StubCall[] {
  return stub.calls.filter(c => stubBodyText(c).includes(marker));
}

// ═══ 测试主体 ═══

interface WebhookResult { ok?: boolean; sessionId?: string; degraded?: boolean; error?: string; }

describe('D823: IM 通道会话历史连续（穿真实 webhook 入口）', () => {
  let stubServer: Server;
  let app: Server;
  let baseUrl = '';
  let store: import('../../src/store/session-store').SessionStore;
  let scrubber: import('../../src/security/pii-scrubber').PIIScrubber;
  let handleInboundMessage: typeof import('../../src/l1/im-inbound').handleInboundMessage;
  let startSessionCleanup: typeof import('../../src/l1/im-inbound').startSessionCleanup;
  let stopSessionCleanup: typeof import('../../src/l1/im-inbound').stopSessionCleanup;

  /** 期望值 = 真实 PII 边界（S2）处理后的文本（产品行为：入模/落库均用脱敏文本） */
  function scrub(text: string): string {
    return scrubber.scrub(text, 'S2').cleaned || text;
  }

  async function postWebhook(text: string, openId: string): Promise<WebhookResult> {
    const res = await fetch(`${baseUrl}/api/im/feishu/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: { sender: { open_id: openId }, message: { content: text } } }),
    });
    expect(res.status).toBe(200);
    return await res.json() as WebhookResult;
  }

  beforeAll(async () => {
    // ── 环境：内存库 + LLM 指向本机替身（清掉其他 provider 凭据 → detectProvider() 确定性 = deepseek）
    stubServer = await startStubServer();
    const addr = stubServer.address();
    const stubPort = typeof addr === 'object' && addr !== null ? addr.port : 0;
    process.env.SYNOVA_DB_PATH = ':memory:';
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_BASE_URL = `http://127.0.0.1:${stubPort}/v1`;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.QWEN_API_KEY;
    delete process.env.DASHSCOPE_API_KEY;
    delete process.env.GLM_API_KEY;
    delete process.env.MOONSHOT_API_KEY;
    delete process.env.OPENCLAW_GATEWAY_HOST;

    // ── 真实依赖装配
    const { initEngineContext, getDatabase } = await import('../../src/init/engine-context');
    initEngineContext();
    const { SessionStore } = await import('../../src/store/session-store');
    const { PIIScrubber } = await import('../../src/security/pii-scrubber');
    const inbound = await import('../../src/l1/im-inbound');
    const imRouter = (await import('../../src/routes/im')).default;

    store = new SessionStore(getDatabase());
    scrubber = new PIIScrubber();
    handleInboundMessage = inbound.handleInboundMessage;
    startSessionCleanup = inbound.startSessionCleanup;
    stopSessionCleanup = inbound.stopSessionCleanup;

    const expressApp = express();
    expressApp.use(express.json());
    expressApp.locals.container = { piiScrubber: scrubber };
    expressApp.use(imRouter);
    app = expressApp.listen(0);
    await new Promise<void>(resolve => { app.once('listening', () => resolve()); });
    const appAddr = app.address();
    const appPort = typeof appAddr === 'object' && appAddr !== null ? appAddr.port : 0;
    baseUrl = `http://127.0.0.1:${appPort}`;
  });

  afterAll(async () => {
    stopSessionCleanup?.();
    releaseGated();
    await new Promise<void>(resolve => { app.close(() => resolve()); });
    await new Promise<void>(resolve => { stubServer.close(() => resolve()); });
  });

  it('D823-1 两轮上下文连续（第 2 轮模型上下文含第 1 轮）+ 消息真落库', async () => {
    const openId = 'ou_d823_roundtrip';
    const firstText = 'D823RT1 第一轮：我们团队 8 个人，增长卡在获客成本';
    const secondText = 'D823RT2 第二轮：我上一条说的团队规模是多少？';

    const r1 = await postWebhook(firstText, openId);
    expect(r1.ok).toBe(true);
    expect(typeof r1.sessionId).toBe('string');
    await waitFor(() => callsWith('D823RT1').length >= 1, 15_000, '第 1 轮到达替身 LLM');

    const r2 = await postWebhook(secondText, openId);
    expect(r2.ok).toBe(true);
    await waitFor(() => callsWith('D823RT2').length >= 1, 15_000, '第 2 轮到达替身 LLM');

    // ① 同一发送者 → 同一会话（修复前：每轮新建会话）
    expect(r2.sessionId).toBe(r1.sessionId);

    // ② 第 2 轮模型上下文含第 1 轮（卡面主判据）
    const call2 = callsWith('D823RT2')[0];
    const context2 = stubBodyText(call2);
    expect(context2).toContain(scrub(firstText));
    expect(call2.messages.map(m => m.role)).toEqual(['system', 'user', 'assistant', 'user']);

    // ③ 含第 1 轮的 assistant 回复（读真实 store 落库行比对，不猜文本）
    const storedBefore = store.getMessages(r1.sessionId as string);
    const firstAssistant = storedBefore.find(m => m.role === 'assistant');
    expect(firstAssistant).toBeDefined();
    expect(context2).toContain(firstAssistant?.content ?? '');

    // ④ 真落库（队长条件 4）：user + assistant 经真实 store API 落库，按序
    await waitFor(() => store.getMessages(r2.sessionId as string).filter(m => m.role === 'assistant').length >= 2, 15_000, '第 2 轮回复落库');
    const rows = store.getMessages(r2.sessionId as string);
    expect(rows.map(m => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(rows[0]?.content).toBe(scrub(firstText));
    expect(rows[2]?.content).toBe(scrub(secondText));
  }, 60_000);

  it('D823-2 边界：不同发送者不串上下文、会话各自独立', async () => {
    const textA = 'D823ISOA 用户甲的独立上下文';
    const textB = 'D823ISOB 用户乙的独立上下文';

    const rA = await postWebhook(textA, 'ou_d823_iso_a');
    await waitFor(() => callsWith('D823ISOA').length >= 1, 15_000, 'A 轮到达替身 LLM');
    const rB = await postWebhook(textB, 'ou_d823_iso_b');
    await waitFor(() => callsWith('D823ISOB').length >= 1, 15_000, 'B 轮到达替身 LLM');

    expect(rB.sessionId).not.toBe(rA.sessionId);
    expect(rB.sessionId).not.toBeUndefined();
    // B 的模型上下文不含 A 的文本（反向断言：串号即失败）
    expect(stubBodyText(callsWith('D823ISOB')[0])).not.toContain(scrub(textA));
    // 各自落库到各自会话
    await waitFor(() => store.getMessages(rA.sessionId as string).length >= 1 && store.getMessages(rB.sessionId as string).length >= 1, 15_000, '两会话各自落库');
    expect(store.getMessages(rA.sessionId as string)[0]?.content).toBe(scrub(textA));
    expect(store.getMessages(rB.sessionId as string)[0]?.content).toBe(scrub(textB));
  }, 60_000);

  it('D823-3 降级非静默：store.db 缺失 → log.error（带 degraded）+ 消息仍处理', async () => {
    const rows: Array<{ sessionId: string; role: string; content: string }> = [];
    const text = 'D823NODB 降级路径消息';
    // 真实 store 接口形状的替身，但**不提供 db 句柄** → 触发「无法装配事件流/内置工具」的显式降级路径
    const storeNoDb: Parameters<typeof handleInboundMessage>[0] = {
      listSessions: () => [],
      createSession: (_teamId: string, _userId: string) => ({ id: 'sess_d823_no_db' }),
      deleteSession: () => {},
      addMessage: (sessionId: string, role: string, content: string) => { rows.push({ sessionId, role, content }); },
    };

    const before = logSink.error.length;
    const res = handleInboundMessage(storeNoDb, scrubber, {
      platform: 'feishu',
      senderId: 'ou_d823_no_db',
      content: text,
      timestamp: new Date().toISOString(),
      rawPayload: { event: { sender: { open_id: 'ou_d823_no_db' }, message: { content: text } } },
    });

    expect(res.ok).toBe(true);
    expect(res.sessionId).toBe('sess_d823_no_db');
    // 用户消息同步落库（降级不丢消息）
    expect(rows.some(r => r.role === 'user' && r.content === scrub(text))).toBe(true);

    // 显式降级信号（铁律 24/31）：log.error 有记录且带 degraded 标记 —— 修复前该路径是静默 no-op
    await waitFor(
      () => logSink.error.slice(before).some(e => String(e.msg).includes('store.db') && e.degraded === true),
      15_000,
      'log.error(store.db 缺失 + degraded)',
    );
    // 回复仍生成（降级不阻断）
    await waitFor(() => rows.some(r => r.role === 'assistant' && r.sessionId === 'sess_d823_no_db'), 15_000, '降级路径仍产出回复');
  }, 60_000);

  it('D823-9 并发：同一用户轮次串行、不同用户互不阻塞（队长条件 3）', async () => {
    const gatedText = 'D823GATEA 被闸住的第一轮';
    let aSessionId = '';
    stub.gateMarker = 'D823GATEA';
    try {
      const aPromise = postWebhook(gatedText, 'ou_d823_gate_a');
      await waitFor(() => callsWith('D823GATEA').length >= 1, 15_000, 'A 已被替身端点闸住');
      const aResult = await aPromise;
      expect(aResult.ok).toBe(true);
      aSessionId = aResult.sessionId ?? '';

      // A 的 LLM 调用仍挂起时发 B：若存在跨用户串行，B 的生成会排在 A 后面 → B 的调用永不出现
      const bText = 'D823GATEB 不受 A 阻塞';
      const bResult = await postWebhook(bText, 'ou_d823_gate_b');
      expect(bResult.ok).toBe(true);
      await waitFor(() => callsWith('D823GATEB').length >= 1, 10_000, 'B 在 A 挂起期间完成 LLM 调用');
      expect(bResult.sessionId).not.toBe(aSessionId);

      // 放行后 A 正常收尾：一次调用 + 回复落库
      releaseGated();
      await waitFor(
        () => callsWith('D823GATEA').length === 1 && store.getMessages(aSessionId).some(m => m.role === 'assistant'),
        15_000,
        'A 放行后收尾（一次调用 + 回复落库）',
      );
    } finally {
      stub.gateMarker = null;
      releaseGated();
    }
  }, 60_000);

  it('D823-8 上界：注册表有界 + FIFO 逐出最旧（队长条件 1/2）', async () => {
    const users = Array.from({ length: 201 }, (_, i) => `ou_d823_bound_${i}`);
    const firstText = 'D823BOUNDFIRST 最早用户（应被逐出）';
    const r0 = await postWebhook(firstText, users[0]);
    await waitFor(() => callsWith('D823BOUNDFIRST').length >= 1, 15_000, '最早用户轮次完成');

    const firstSessionIds = new Map<number, string>();
    for (const [i, openId] of users.slice(1).entries()) {
      const res = await postWebhook(`D823BOUNDBATCH 批次用户 ${i + 1}`, openId);
      expect(res.ok).toBe(true);
      firstSessionIds.set(i + 1, res.sessionId ?? '');
    }
    // 灌满 201 个用户后：只有一次逐出（上限 200），最旧 = users[0]
    const r0again = await postWebhook('D823BOUNDFIRST 最早用户第二轮（应新建会话）', users[0]);
    expect(r0again.ok).toBe(true);
    expect(r0again.sessionId).not.toBe(r0.sessionId);

    // 末位用户（插入晚于被逐出者）仍复用同一会话 → 证明逐出是 FIFO 且上界生效
    const last = 200;
    const rLast = await postWebhook('D823BOUNDLAST 末位用户第二轮（应复用会话）', users[last]);
    expect(rLast.sessionId).toBe(firstSessionIds.get(last));
    // 收尾：末位会话确有回复落库
    await waitFor(
      () => store.getMessages(firstSessionIds.get(last) ?? '').some(m => m.role === 'assistant'),
      30_000,
      '末位用户回复落库',
    );
  }, 180_000);

  it('D823-5 边界：会话清理后不复用已删会话（不向已删 session 写消息）', async () => {
    const openId = 'ou_d823_cleanup';
    const text = 'D823CLEAN1 清理前消息';
    const r1 = await postWebhook(text, openId);
    await waitFor(() => callsWith('D823CLEAN1').length >= 1, 15_000, '清理前轮次完成');
    const originalSessionId = r1.sessionId as string;
    expect(store.getSession(originalSessionId)).not.toBeNull();

    // 真实清理器：timeoutMs=0（全部视为空闲超时）+ 50ms 扫描
    startSessionCleanup(store, 0, 50);
    await waitFor(() => store.getSession(originalSessionId) === null, 15_000, '清理器已删除原会话');
    stopSessionCleanup();

    const r2 = await postWebhook('D823CLEAN2 清理后消息', openId);
    expect(r2.ok).toBe(true);
    expect(r2.sessionId).not.toBe(originalSessionId);
    // 新会话必须真实存在（注册表已回收旧条目 → 不向已删会话写消息）
    expect(store.getSession(r2.sessionId as string)).not.toBeNull();
    await waitFor(() => store.getMessages(r2.sessionId as string).length >= 1, 15_000, '新会话落库');
  }, 60_000);
});
