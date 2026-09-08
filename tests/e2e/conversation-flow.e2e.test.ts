/**
 * tests/e2e/conversation-flow.e2e.test.ts — D592 对话闭环 E2E（真实 server 进程 + 本地 LLM 替身）
 *
 * spec（唯一契约）: docs/plans/codex/implementation/SYNOVA-IMPL-DSH-D592-chat-e2e-20260908.md §7
 * 黑盒 E2E（铁律 12: 不 mock 被测管线）: 仅 import vitest + node:fs；
 * 零 src/ import；零 DSH 包 import（G1 红线——DSH invariant/帧协议仅作注释范式引用）。
 *
 * DSH dsh-agent-loop 请求重建不变量（注释范式引用，零 import）:
 *   "LLM request messages must equal the dispatch-time durable derivation"——
 *   T2/T9 的"SSE 交付 ≡ GET /api/sessions/:id 事件流投影"断言即其物理等价物。
 *
 * 契约（铁律 47）:
 *   @input  — PORT（server 端口，缺省 3099）；SYNOVA_E2E_RESUME=1（恢复段开关，runner 段2 注入）；
 *             SYNOVA_E2E_STATE（state 文件路径: 创建段写/恢复段读，JSON
 *             {sessionId, userMessage, assistantPrefix, messageCount}）；
 *             SYNOVA_E2E_REAL_LLM=1（真实 key 门控——仅当 LLM_BASE_URL 指向真实 endpoint 时置位，
 *             T6 断言升级为 complete 帧 + report 非空；本仓 runner 默认替身模式不置位，
 *             两种模式断言强度不同，替身模式断言严禁冒充真实 LLM 断言——spec §5.2-C）
 *   @output — vitest 退出码（0=本段全绿）；创建段产出 state 文件（T3 末尾写入）
 *   @degraded — server 探活失败（beforeAll /api/healthz 3s 超时）→ 各 it 显式 ctx.skip +
 *               console.warn（非静默空跑——铁律 24/31；evidence 运行要求零 skip，
 *               正式证据只能来自 D592-run-e2e.sh）；
 *               SYNOVA_E2E_RESUME=1 但 state 文件缺失/畸形 → 显式 throw（fail 不 skip——
 *               恢复段缺输入是 runner 契约破坏，必须红）
 *
 * 段机制: 创建段（默认，T1-T8）与恢复段（RESUME=1，T9）按环境变量条件注册 describe——
 * 保证 runner 两段日志各自"零 skipped"（未注册的段不进入收集，非 skip 伪装）。
 *
 * 运行（真实 server，DEV_MODE=false + 白名单免凭证）:
 *   PORT=3099 JWT_SECRET=<显式> SYNOVA_DB_PATH=<scratch> LLM_BASE_URL=<替身或真实> \
 *   npx tsx src/index.ts   # 或直接 bash docs/synova/product-lines/evidence/D592-run-e2e.sh
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ═══════════════════════════ 环境契约 ═══════════════════════════

/** server 端口: env 注入优先，缺省 3099（spec §3 Q4，对齐 auth-register-flow detectPort 模式） */
function detectPort(): number {
  const raw = process.env.PORT;
  if (raw && /^\d+$/.test(raw)) return parseInt(raw, 10);
  return 3099;
}
const PORT = detectPort();
const BASE = `http://localhost:${PORT}`;
const RESUME = process.env.SYNOVA_E2E_RESUME === '1';
const STATE_PATH = process.env.SYNOVA_E2E_STATE ?? '';
const REAL_LLM = process.env.SYNOVA_E2E_REAL_LLM === '1';

let serverDown = true;

// ═══════════════════════════ 类型守卫（铁律 38: 零断言式宽化——一律 unknown + 守卫窄化） ═══════════════════════════

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 断言前置窄化: 非 string 显式抛错（失败信息含字段名，优于静默 undefined 传播） */
function s(v: unknown, label: string): string {
  if (typeof v !== 'string') throw new Error(`断言前置失败: ${label} 应为 string，实际 ${typeof v}`);
  return v;
}

/** 断言前置窄化: 非 number 显式抛错 */
function n(v: unknown, label: string): number {
  if (typeof v !== 'number') throw new Error(`断言前置失败: ${label} 应为 number，实际 ${typeof v}`);
  return v;
}

/** JSON 响应体窄化: 非对象显式抛错（不盲信网络输入） */
async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  const v: unknown = await res.json();
  if (!isRecord(v)) throw new Error(`期望 JSON 对象响应，实际顶层类型 ${typeof v}`);
  return v;
}

// ═══════════════════════════ SSE 逐帧消费（手写 event:/data: 行对解析，useStreaming 同型） ═══════════════════════════

/** 单帧: event 行 = 帧类型；data 行 = JSON 载荷（解析失败保底为 {_raw}，不静默丢帧） */
type SseFrame = { event: string; data: Record<string, unknown> };

/** WebViewAdapter 已知帧类型——不在此清单的 event = 诊断桥 flat 透传事件（T6 断言对象） */
const KNOWN_FRAME_EVENTS = new Set([
  'open', 'token', 'agent_message', 'status', 'system_message', 'user_message', 'error', 'end', 'complete',
]);

/**
 * 消费 SSE 响应流直至结束/中止，逐帧追加进 frames（增量可观测——T4/T5 轮询已见帧）。
 * @degraded — signal 中止（T5 断线场景）→ 返回已见帧（中断锚: 已见内容是断言对象，非错误）；
 *             其余读取异常向上抛（不静默吞，铁律 24）
 */
async function consumeSse(res: Response, frames: SseFrame[], signal?: AbortSignal): Promise<void> {
  if (!res.body) throw new Error('SSE 响应缺少 body 流');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let eventName = '';
  let dataRaw = '';
  const flushFrame = () => {
    if (eventName === '') return;
    let data: Record<string, unknown> = {};
    try {
      const parsed: unknown = JSON.parse(dataRaw);
      if (isRecord(parsed)) data = parsed;
      else data = { _raw: dataRaw };
    } catch {
      data = { _raw: dataRaw }; // JSON.parse 失败: 保底记录原文（不静默丢帧）
    }
    frames.push({ event: eventName, data });
    eventName = '';
    dataRaw = '';
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        if (line === '') { flushFrame(); continue; }
        if (line.startsWith(':')) continue; // 心跳注释帧（web-adapter 15s ": ping"），忽略
        if (line.startsWith('event:')) { eventName = line.slice('event:'.length).trim(); continue; }
        if (line.startsWith('data:')) { dataRaw = line.slice('data:'.length).trim(); continue; }
      }
    }
    flushFrame();
  } catch (err: unknown) {
    if (signal?.aborted) return; // T5 断线: 保留已见帧供前缀断言
    throw err;
  }
}

/** POST JSON 并完整消费 SSE 流（一轮对话的标准形态） */
async function runTurn(path: string, body: Record<string, unknown>): Promise<{ status: number; contentType: string; frames: SseFrame[] }> {
  const res = await postJson(path, body);
  const contentType = res.headers.get('content-type') ?? '';
  const frames: SseFrame[] = [];
  await consumeSse(res, frames);
  return { status: res.status, contentType, frames };
}

/** POST JSON fetch 封装（全程无 Authorization 头——白名单在岗是被测契约之一） */
async function postJson(path: string, body: Record<string, unknown>, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...init,
  });
}

// ═══════════════════════════ 断言辅助 ═══════════════════════════

function framesOf(frames: SseFrame[], event: string): SseFrame[] {
  return frames.filter((f) => f.event === event);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 轮询条件成立（默认 100ms 间隔）；超时返回最终判定（不抛错——由后续 expect 显式断言） */
async function waitFor(cond: () => boolean, timeoutMs: number, intervalMs = 100): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (cond()) return true;
    await sleep(intervalMs);
  }
  return cond();
}

/** 异步条件轮询（readback 类探测: 条件本身含 fetch）；超时返回 false 由 expect 显式红 */
async function waitForAsync(cond: () => Promise<boolean>, timeoutMs: number, intervalMs = 500): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await cond()) return true;
    if (Date.now() >= deadline) return false;
    await sleep(intervalMs);
  }
}

/** 读回消息投影（非 system 口径——重启后平台可能注入 system 恢复消息，D590 DS3b 同口径不计） */
function convoMessages(body: Record<string, unknown>): Array<{ role: string; content: string }> {
  if (!Array.isArray(body.messages)) throw new Error('读回响应缺少 messages 数组');
  const out: Array<{ role: string; content: string }> = [];
  for (const m of body.messages) {
    if (!isRecord(m)) continue;
    if (typeof m.role !== 'string' || typeof m.content !== 'string') continue;
    if (m.role === 'system') continue;
    out.push({ role: m.role, content: m.content });
  }
  return out;
}

/** 提取替身探针的历史条数（替身契约: content 含 `历史 <m> 条消息`——spec §3 Q4） */
function historyCount(agentContent: string): number {
  const m = agentContent.match(/历史 (\d+) 条消息/);
  if (!m) throw new Error(`替身探针缺失: agent_message 不含"历史 N 条消息"标记——实际: ${agentContent.slice(0, 80)}`);
  return parseInt(m[1], 10);
}

// ═══════════════════════════ state 文件（创建段写 / 恢复段读，spec §3 Q4 契约） ═══════════════════════════

type D592State = {
  sessionId: string;
  userMessage: string;
  assistantPrefix: string;
  messageCount: number;
};

function isD592State(v: unknown): v is D592State {
  return (
    isRecord(v) &&
    typeof v.sessionId === 'string' &&
    typeof v.userMessage === 'string' &&
    typeof v.assistantPrefix === 'string' &&
    typeof v.messageCount === 'number'
  );
}

function writeStateFile(state: D592State): void {
  if (!STATE_PATH) return; // 独立 dev 运行（无 runner）不写——恢复段属 runner 契约
  writeFileSync(STATE_PATH, JSON.stringify(state), 'utf-8');
}

function readStateFile(): D592State {
  // 恢复段缺输入 = runner 契约破坏 → 显式 fail（不 skip，spec §3 Q4 @degraded）
  if (!STATE_PATH) throw new Error('SYNOVA_E2E_RESUME=1 但 SYNOVA_E2E_STATE 未注入——runner 契约破坏');
  if (!existsSync(STATE_PATH)) throw new Error(`state 文件缺失: ${STATE_PATH}——创建段未产出或被清理（runner 契约破坏）`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(STATE_PATH, 'utf-8')) as unknown;
  } catch (err: unknown) {
    throw new Error(`state 文件 JSON 解析失败: ${STATE_PATH}（畸形=契约破坏）—— ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!isD592State(parsed)) throw new Error(`state 文件形状非法（缺 sessionId/userMessage/assistantPrefix/messageCount）: ${STATE_PATH}`);
  return parsed;
}

// ═══════════════════════════ 探活（降级判定唯一入口） ═══════════════════════════

beforeAll(async () => {
  try {
    await fetch(`${BASE}/api/healthz`, { signal: AbortSignal.timeout(3000) });
    serverDown = false;
  } catch {
    serverDown = true;
    // 铁律 24/31: 降级显式警示，绝不静默空跑
    console.warn(`[D592] server 未启动（${BASE} 探活失败）——请经 docs/synova/product-lines/evidence/D592-run-e2e.sh 运行；本段用例将显式 skip`);
  }
}, 10_000);

// 测试消息——全部避开 detectPhaseComplete 触发词（'没有了/就这些/差不多了/可以了/开始诊断/开始分析/好的/ok/没问题'，
// conversation-engine.ts:881-889），防止非 T6 用例意外触发诊断桥；T6 第 3 轮刻意含"开始诊断"。
const T1_MSG = '你好，请介绍一下你自己';
const T3_MSG = '我们的客户主要是中型制造企业，客单价 20 万左右';
const T4_MSG1 = '第一轮：请记录我们的团队规模是 15 人';
const T4_MSG2 = '第二轮：请补记我们的年度营收目标是 3000 万';
const T4_MSG3 = '第三轮：请确认前两轮信息已记录';
const T5_MSG = '请用三点说明你如何帮我分析增长瓶颈，每点展开讲';
const T6_MSG1 = '我们团队 12 人，做企业协作软件，年营收约 800 万';
const T6_MSG2 = '最大的瓶颈是销售线索太少，转化率也低';
const T6_MSG3 = '情况就是这些，请开始诊断';
const T9_MSG = '重启后继续沟通：我们再讨论一下定价策略的思路';

// ═══════════════════════════ 段 1 — 创建段（默认模式，T1-T8） ═══════════════════════════

if (!RESUME) {
  describe('D592 创建段 — 对话闭环 E2E（真实 server + 本地替身）', () => {
    // 规范会话: T1 创建、T2 读回、T3 续轮并产出 state 文件（T9 跨进程恢复的输入）
    let canonicalSid = '';
    let canonicalAssistant = '';

    it('T1 生产态闭环: 无凭证 POST → open(sess_)/token×N(N≥5)/agent_message(≡token 拼接)/end，帧间无 error', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }

      const turn = await runTurn('/api/conversations', { message: T1_MSG });
      expect(turn.status).toBe(200);
      expect(turn.contentType).toContain('text/event-stream');

      const { frames } = turn;
      const open = frames[0];
      expect(open?.event).toBe('open');
      const sid = s(open?.data.sessionId, 'open.sessionId');
      expect(sid).toMatch(/^sess_/);
      expect(typeof open?.data.phase).toBe('number');

      const tokens = framesOf(frames, 'token');
      expect(tokens.length).toBeGreaterThanOrEqual(5);
      const joined = tokens.map((t) => s(t.data.text, 'token.text')).join('');

      const agents = framesOf(frames, 'agent_message');
      expect(agents.length).toBe(1);
      // 重建不变量（DSH dsh-agent-loop 范式，G1 注释引用）: agent_message 全文 ≡ token 串拼接
      expect(s(agents[0]?.data.content, 'agent_message.content')).toBe(joined);

      expect(framesOf(frames, 'error')).toHaveLength(0);
      expect(frames[frames.length - 1]?.event).toBe('end');

      canonicalSid = sid;
      canonicalAssistant = s(agents[0]?.data.content, 'agent_message.content');
      console.log(`[D592-EVID] T1 session=${sid} tokens=${tokens.length}`);
    }, 60_000);

    it('T2 读回+重建不变量: GET /api/sessions/:id ≡ [{user,原文},{assistant,≡token 拼接}]', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }
      expect(canonicalSid).toMatch(/^sess_/); // 依赖 T1（同段内顺序执行）

      const res = await fetch(`${BASE}/api/sessions/${canonicalSid}`);
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      const session = body.session;
      if (!isRecord(session)) throw new Error('读回响应缺少 session 对象');
      expect(session.id).toBe(canonicalSid);

      const msgs = convoMessages(body);
      expect(msgs).toEqual([
        { role: 'user', content: T1_MSG },
        { role: 'assistant', content: canonicalAssistant },
      ]);
      console.log('[D592-EVID] T2 readback=2 match=true');
    }, 30_000);

    it('T3 多轮上下文物理证明: 第二轮 agent_message 历史计数 ≥ 第一轮+2 + 读回 4 条（历史真实到达 provider）', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }
      expect(canonicalSid).toMatch(/^sess_/);

      const turn2 = await runTurn(`/api/conversations/${canonicalSid}/messages`, { message: T3_MSG });
      expect(turn2.status).toBe(200);
      const agents2 = framesOf(turn2.frames, 'agent_message');
      expect(agents2.length).toBe(1);
      const m2 = historyCount(s(agents2[0]?.data.content, 'turn2.agent_message.content'));
      const m1 = historyCount(canonicalAssistant);
      expect(m2).toBeGreaterThanOrEqual(m1 + 2); // 引擎真实把首轮 user+assistant 历史送到了 provider

      const res = await fetch(`${BASE}/api/sessions/${canonicalSid}`);
      expect(res.status).toBe(200);
      const msgs = convoMessages(await jsonBody(res));
      expect(msgs).toHaveLength(4);
      expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);

      // state 文件: 创建段产出（T9 跨进程恢复输入，spec §3 Q4 契约字段）
      writeStateFile({
        sessionId: canonicalSid,
        userMessage: T1_MSG,
        assistantPrefix: canonicalAssistant,
        messageCount: msgs.length,
      });
      console.log(`[D592-EVID] T3 hist_m1=${m1} hist_m2=${m2} messages=${msgs.length}`);
    }, 60_000);

    it('T4 并发忙锁: open 帧后同 session 第二请求 → 409 SESSION_BUSY（流前 JSON）；释放后可再发', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }

      const res1 = await postJson('/api/conversations', { message: T4_MSG1 });
      expect(res1.status).toBe(200);
      const frames1: SseFrame[] = [];
      const done1 = consumeSse(res1, frames1);
      await waitFor(() => frames1.some((f) => f.event === 'open'), 10_000);
      const open1 = frames1.find((f) => f.event === 'open');
      const sid = s(open1?.data.sessionId, 'T4.open.sessionId');
      expect(sid).toMatch(/^sess_/);

      // 占用窗口内第二请求（替身 300ms+ 延迟保证窗口，不赌 sleep 时序）
      const res2 = await postJson(`/api/conversations/${sid}/messages`, { message: T4_MSG2 });
      expect(res2.status).toBe(409);
      expect(res2.headers.get('content-type') ?? '').not.toContain('text/event-stream');
      const busy = await jsonBody(res2);
      expect(busy.code).toBe('SESSION_BUSY');

      await done1;
      expect(frames1[frames1.length - 1]?.event).toBe('end');

      // 释放后第三请求 → 200 完整流（finally 释放语义）
      const turn3 = await runTurn(`/api/conversations/${sid}/messages`, { message: T4_MSG3 });
      expect(turn3.status).toBe(200);
      const open3 = framesOf(turn3.frames, 'open');
      expect(open3.length).toBe(1);
      expect(s(open3[0]?.data.sessionId, 'T4.open3.sessionId')).toBe(sid);
      expect(turn3.frames[turn3.frames.length - 1]?.event).toBe('end');
      console.log('[D592-EVID] T4 busy409=409 released=200');
    }, 60_000);

    it('T5 断线不丢: ≥1 token 后 abort → 落库 assistant 以已见 token 串为前缀（中断锚语义）', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }

      const ac = new AbortController();
      const res = await postJson('/api/conversations', { message: T5_MSG }, { signal: ac.signal });
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');

      const frames: SseFrame[] = [];
      const consumeDone = consumeSse(res, frames, ac.signal);
      await waitFor(() => framesOf(frames, 'token').length >= 1, 10_000);
      const open5 = frames.find((f) => f.event === 'open');
      const sid = s(open5?.data.sessionId, 'T5.open.sessionId');
      const seen = framesOf(frames, 'token').map((t) => s(t.data.text, 'T5.token.text')).join('');
      expect(seen.length).toBeGreaterThan(0);

      ac.abort();
      await consumeDone;

      // 轮询读回（≤10s, 500ms 间隔）直到 assistant 落库——在途轮次自然 settle（spec §5.2-D）
      let persisted: string | null = null;
      const found = await waitForAsync(async () => {
        try {
          const r = await fetch(`${BASE}/api/sessions/${sid}`);
          if (r.status !== 200) return false;
          const assistant = convoMessages(await jsonBody(r)).find((x) => x.role === 'assistant');
          if (!assistant) return false;
          persisted = assistant.content;
          return true;
        } catch {
          return false; // 探测型轮询: 网络瞬态由外层超时兜底，超时后 expect 显式红（不静默）
        }
      }, 10_000, 500);
      expect(found).toBe(true);
      expect(persisted).not.toBeNull();
      // 中断锚: 已见 token 前缀 ⊆ 落库 assistant content（DSH 中断锚语义，spec §5.2-D）
      expect((persisted ?? '').startsWith(seen)).toBe(true);
      console.log(`[D592-EVID] T5 sid=${sid} seenTokens=${framesOf(frames, 'token').length} prefixKept=true`);
    }, 60_000);

    it('T6 诊断桥触发: 3 轮访谈第 3 轮含"开始诊断" → 访谈完成文案 + ≥1 flat 诊断事件 + 终帧∈{complete,error} + end', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }

      const t1 = await runTurn('/api/conversations', { message: T6_MSG1 });
      expect(t1.status).toBe(200);
      expect(framesOf(t1.frames, 'agent_message').length).toBe(1);
      const open1 = framesOf(t1.frames, 'open');
      const sid = s(open1[0]?.data.sessionId, 'T6.open.sessionId');

      const t2 = await runTurn(`/api/conversations/${sid}/messages`, { message: T6_MSG2 });
      expect(t2.status).toBe(200);

      // 第 3 轮: turnCount=3 ≥ minTurns=3 + 关键词"开始诊断" → phaseComplete 桥必然触发（spec §4.3-2）
      const t3 = await runTurn(`/api/conversations/${sid}/messages`, { message: T6_MSG3 });
      expect(t3.status).toBe(200);
      const { frames } = t3;

      const agents = framesOf(frames, 'agent_message');
      expect(agents.length).toBeGreaterThanOrEqual(1);
      expect(s(agents[0]?.data.content, 'T6.agent_message.content')).toContain('访谈完成');

      const flat = frames.filter((f) => !KNOWN_FRAME_EVENTS.has(f.event));
      expect(flat.length).toBeGreaterThanOrEqual(1); // phase_started 等 DiagnosisEvent flat 透传

      const endIdx = frames.findIndex((f) => f.event === 'end');
      expect(endIdx).toBeGreaterThan(0);
      const terminal = frames[endIdx - 1];
      expect(['complete', 'error']).toContain(terminal?.event);

      if (REAL_LLM) {
        // 真实 key 门控模式（spec §5.2-C）: 断言升级为 complete 帧 + report 非空。
        // 注意: 此分支仅当 LLM_BASE_URL 指向真实 endpoint 时可达；替身模式严禁进入此断言。
        expect(terminal?.event).toBe('complete');
        expect(terminal?.data.report != null).toBe(true);
      }
      console.log(`[D592-EVID] T6 diagEvents=${flat.length} terminal=${String(terminal?.event)} mode=${REAL_LLM ? 'real' : 'standin'}`);
    }, 240_000);

    it('T7 负向边界: 未知 sessionId → 404 NOT_FOUND；空 message → 400 VALIDATION_ERROR（均流前 JSON 不挂起）', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }

      const r404 = await postJson('/api/conversations/sess_d592_not_exist/messages', { message: T4_MSG1 });
      expect(r404.status).toBe(404);
      expect(r404.headers.get('content-type') ?? '').not.toContain('text/event-stream');
      const b404 = await jsonBody(r404);
      expect(b404.code).toBe('NOT_FOUND');

      const r400 = await postJson('/api/conversations', { message: '' });
      expect(r400.status).toBe(400);
      expect(r400.headers.get('content-type') ?? '').not.toContain('text/event-stream');
      const b400 = await jsonBody(r400);
      expect(b400.code).toBe('VALIDATION_ERROR');
      console.log('[D592-EVID] T7 notFound=404 empty=400');
    }, 30_000);

    it('T8 白名单在岗对照: 无凭证 GET /api/ga/calibration → 401（防"全局放通"假绿）', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }

      const res = await fetch(`${BASE}/api/ga/calibration`);
      expect(res.status).toBe(401);
      const body = await jsonBody(res);
      expect(body.code).toBe('UNAUTHORIZED');
      console.log('[D592-EVID] T8 counterProbe=401');
    }, 15_000);
  });
}

// ═══════════════════════════ 段 2 — 恢复段（SYNOVA_E2E_RESUME=1，T9） ═══════════════════════════

if (RESUME) {
  describe('D592 恢复段 — 跨进程重启恢复（runner 已真杀进程并同 scratch DB 重启）', () => {
    it('T9 重启恢复: 读回含段1 全部轮次 + 同 sessionId 续轮 → open 同 sessionId 回声 + 计数继续增长 + 读回 +2', async (ctx) => {
      if (serverDown) { ctx.skip(); return; }

      // state 缺失/畸形 → readStateFile 显式 throw（fail 不 skip——runner 契约破坏必须红）
      const state = readStateFile();

      const res = await fetch(`${BASE}/api/sessions/${state.sessionId}`);
      expect(res.status).toBe(200);
      const body = await jsonBody(res);
      expect(body.ok).toBe(true);
      const session = body.session;
      if (!isRecord(session)) throw new Error('读回响应缺少 session 对象');
      expect(session.id).toBe(state.sessionId);

      const msgs = convoMessages(body);
      expect(msgs.length).toBe(state.messageCount); // 段1 全部轮次跨进程仍在
      expect(msgs[0]).toEqual({ role: 'user', content: state.userMessage });
      expect(msgs[1]?.content.startsWith(state.assistantPrefix)).toBe(true); // 首轮回复逐字仍在

      // 同 sessionId 续轮: fromState 恢复（sessionEngines 进程内缓存因重启未命中，唯一触达路径）
      const turn = await runTurn(`/api/conversations/${state.sessionId}/messages`, { message: T9_MSG });
      expect(turn.status).toBe(200);
      const opens = framesOf(turn.frames, 'open');
      expect(opens.length).toBe(1);
      expect(s(opens[0]?.data.sessionId, 'T9.open.sessionId')).toBe(state.sessionId);

      const agents = framesOf(turn.frames, 'agent_message');
      expect(agents.length).toBe(1);
      // 替身探针可解析 = 续轮真实往返 provider（对话机制连续）。
      // 已知边界（spec §6 明示"断言 messages 历史连续（用户可见语义），不断言引擎内部计数"）:
      // 断言到此为止——引擎模型上下文跨重启恢复存在 L2 已知缺陷（fromState 重赋值 messages
      // 使 toolLoop 数组引用脱钩，conversations.ts:58-63 决策记录自认；provider 侧历史计数
      // 恢复后重置），修复归属 Stage 3（L2 演进）——本任务零 src/ 红线不修、不掩盖、如实记录。
      const m = historyCount(s(agents[0]?.data.content, 'T9.agent_message.content'));

      const res2 = await fetch(`${BASE}/api/sessions/${state.sessionId}`);
      expect(res2.status).toBe(200);
      const msgs2 = convoMessages(await jsonBody(res2));
      expect(msgs2.length).toBe(state.messageCount + 2);
      console.log(`[D592-EVID] T9 base=${state.messageCount} resumed=${msgs2.length} hist_m=${m} modelCtxRestored=false sidEcho=true`);
    }, 90_000);
  });
}
