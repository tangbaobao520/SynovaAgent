/**
 * tests/integration/production-entry-conversation.integration.test.ts — D817 第 0 项
 * 「CI 能跑一次生产入口级对话」（全部 15 项任务书验收的公共前置）
 *
 * 铁律 12：起**真实** createServer（src/server.ts:124 真实 bootstrap + 真实 SQLite + 真实 express 路由）
 * + listen(0) + 真实 fetch，打真实路由 POST /api/conversations/:id/messages
 * （src/routes/conversations.ts:359）。**不 mock 管线**——唯一被替换的是「模型本身」：
 * tests/helpers/fake-llm-upstream.ts 起一个 127.0.0.1 的 OpenAI 兼容假上游，并逐请求记录出站请求体。
 *
 * 上游指向走**既有配置缝**（零 src/** 改动，红线 1）：
 *   routes/llm-config.ts（GA 首次配置的真实写入面）→ SYNOVA_DATA_DIR/llm-credentials.json
 *   → src/config.ts:90-94 storedLlmRuntime.baseUrl → config.llmBaseUrl
 *   → src/routes/conversations.ts:192 createProvider(detectProvider(), {apiKey, baseUrl, model})
 *   → src/providers/index.ts:54 → src/providers/base.ts:148 fetch(`${baseUrl}${chatPath}`)
 * 且**只写凭证文件、不设 env LLM_API_KEY/DEEPSEEK_API_KEY/OPENAI_API_KEY**——于是
 * buildFallbackProvider（conversation-engine.ts:323-339）返回 null：物理上不存在指向真实 API 的
 * failover 分支，零外网可证（另见本文件 installFetchObserver 的全程出站观测）。
 *
 * 三条**证词**（it.fails，当前预期失败；修好后会翻转为红 → 必须删除 it.fails 改正向断言）：
 *   ① P0-1：出站请求体应含 tools            （src/providers/base.ts:139-146 不落 tools）
 *   ② D817-F1：工具循环应被真实驱动          （src/providers/base.ts:215-238 chat() 未映射响应侧
 *      tool_calls → ChatResult.toolCalls 恒 undefined → tool-loop-executor.ts:265 恒走「无工具调用」分支）
 *   ③ D817-F2：出站上下文不得重复 assistant  （tool-loop-executor.ts:270 + conversation-engine.ts:785 双推）
 *   ②③ 是本次执行时**新发现**的缺陷（派单只列了 ①）；本卡按红线只证词化，不私自改产品代码。
 *
 * 铁律 24/31/33/47/48 + 验收标准《穿真实入口 v1》四条禁止（grep 当完成 / 文件存在当验收 /
 * src/** 测试开关 / 放宽排除清单）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createLogger } from '@synova/logger';
import { createServer } from '../../src/server';
import { setLlmCredential } from '../../src/services/llm-credential-store';
import { startFakeLlmUpstream, snapshotUpstream, type FakeLlmUpstream } from '../helpers/fake-llm-upstream';

const log = createLogger('tests/d817-production-entry');

/** 证据落盘路径（派单 §B-3 / 写集） */
const EVIDENCE_PATH = join(process.cwd(), 'docs/synova/product-lines/evidence/D817-capture-20260918.json');

/** 工具名必须真实存在（src/agent/builtin-tools.ts:61 register），否则工具循环的续轮证据会失真 */
const SCRIPTED_TOOL = 'show_diagnosis_progress';

/** 环境隔离：逐个 delete 会让 buildFallbackProvider / detectProvider 落到真实 provider */
const ENV_KEYS = [
  'DEV_MODE', 'PORT', 'SYNOVA_DB_PATH', 'SYNOVA_DATA_DIR', 'SYNOVA_SKIP_MCP', 'SYNOVA_ORG_ID',
  'LLM_API_KEY', 'LLM_BASE_URL', 'LLM_MODEL', 'DEEPSEEK_API_KEY', 'DEEPSEEK_BASE_URL', 'OPENAI_API_KEY',
  'QWEN_API_KEY', 'DASHSCOPE_API_KEY', 'GLM_API_KEY', 'ZHIPU_API_KEY', 'MOONSHOT_API_KEY', 'KIMI_API_KEY',
  'YI_API_KEY', 'LINGYI_API_KEY', 'MINIMAX_API_KEY', 'STEP_API_KEY', 'ERNIE_API_KEY', 'ERNIE_SECRET_KEY',
  'OPENCLAW_GATEWAY_HOST', 'ENGINE_TOKENS',
] as const;

let server: Server;
let fake: FakeLlmUpstream;
let base: string;
let tmpDataDir: string;
let sessionId = '';
let firstTurnFrames: Array<Record<string, unknown>> = [];
let firstTurnSseText = '';
const externalCalls: string[] = [];
const savedEnv = new Map<string, string | undefined>();
const realFetch = globalThis.fetch;

/** 出站观测器：包一层真实 fetch（**观测**，非替身——请求仍真实发出），记录非 127.0.0.1 的 URL */
function installFetchObserver(): void {
  const patched: typeof fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?([/?#]|$)/.test(url)) {
      externalCalls.push(url);
    }
    return realFetch(input, init);
  };
  globalThis.fetch = patched;
}

/** SSE 帧解析（web-adapter.ts:89 契约：`event: <type>` + `data: {json}` + 空行） */
function parseSseFrames(text: string): Array<Record<string, unknown>> {
  const frames: Array<Record<string, unknown>> = [];
  for (const block of text.split('\n\n')) {
    const dataLine = block.split('\n').find(l => l.startsWith('data: '));
    if (dataLine === undefined) continue;
    const raw = dataLine.slice(6);
    try {
      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`SSE data 行不是 JSON 对象: ${raw.slice(0, 120)}`);
      }
      frames.push(parsed as Record<string, unknown>);
    } catch (err: unknown) {
      // 帧不可解析 = 契约破坏 → 立刻炸（测试里静默吞掉才是假绿）
      throw new Error(`SSE 帧 JSON 解析失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return frames;
}

function frameTypes(frames: Array<Record<string, unknown>>): string[] {
  return frames.map(f => (typeof f.type === 'string' ? f.type : '(no-type)'));
}

async function postMessage(path: string, body: Record<string, unknown>): Promise<{ res: Response; text: string }> {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { res, text };
}

/** 证据落盘（机器生成，不手写；含出站请求体字段清单 = P0-1 的机器判据来源） */
function writeEvidence(mainRequestIndex: number): void {
  const snap = snapshotUpstream(fake);
  const mainRequest = snap.requests[mainRequestIndex];
  const evidence = {
    schema: 1,
    record_type: 'production-entry-capture',
    task: 'D817',
    title: 'CI 能跑一次生产入口级对话（验证基础设施，全部验收的公共前置）',
    captured_at: new Date().toISOString(),
    generated_by: 'tests/integration/production-entry-conversation.integration.test.ts',
    entry: {
      server: 'src/server.ts:124 createServer()（真实 bootstrap；app.locals.orchestration 由 server.ts:286 装配）',
      routes: ['POST /api/conversations', 'POST /api/conversations/:id/messages (src/routes/conversations.ts:359)'],
      listen: 'PORT=0 + server.address()（listen(0) 语义：OS 分配随机端口）',
      upstream_seam: 'SYNOVA_DATA_DIR/llm-credentials.json → src/config.ts:90-94 → src/routes/conversations.ts:192 createProvider(detectProvider(), {baseUrl}) → src/providers/index.ts:54 → base.ts:148 fetch',
    },
    upstream: snap,
    conversation: {
      session_id: sessionId,
      sse_frame_types: frameTypes(firstTurnFrames),
      sse_token_frame_count: firstTurnFrames.filter(f => f.type === 'token').length,
      sse_converged: firstTurnFrames.length > 0 && firstTurnFrames[firstTurnFrames.length - 1].type === 'end',
      sse_error_frames: firstTurnFrames.filter(f => f.type === 'error').map(f => f.code ?? 'unknown'),
    },
    assertions: {
      http_status: 200,
      content_type: 'text/event-stream',
      upstream_request_count: snap.request_count,
      outbound_body_keys: mainRequest?.body_keys ?? [],
      outbound_messages_roles: mainRequest?.messages_roles ?? [],
      external_network_calls: externalCalls,
    },
    testimonies: {
      p0_1_tools_field: {
        assertion: '出站请求体含 tools（工具 schema 进请求体）',
        machine_criterion: "upstream.body_keys_union 含 'tools'",
        observed: snap.body_keys_union.includes('tools'),
        expected_now: 'false —— P0-1 未修；本卡以 it.fails 证词化，修好后必须删除 it.fails 改正向断言',
        evidence_source: 'src/providers/base.ts:139-146（body 只落 model/messages/temperature/max_tokens）',
      },
      d817_f1_tool_loop_not_driven: {
        assertion: '工具循环被真实驱动（工具被真实执行且结果喂回模型）',
        machine_criterion: "任一出站请求 messages 含 role='tool'（或 SSE token 帧含 '[工具调用: '）",
        observed: snap.saw_tool_result_message,
        expected_now: 'false —— 响应侧 tool_calls 未映射到 ChatResult.toolCalls；it.fails 证词化',
        evidence_source: 'src/providers/base.ts:215-238（chat() 只取 choices[0].message.content）+ tool-loop-executor.ts:265',
        note: 'D817 执行时新发现（派单只列了 request 侧 P0-1）；产物零 src/** 改动，留证待 CTO/创始人裁决',
      },
      d817_f2_duplicate_assistant: {
        assertion: '出站上下文不得重复 assistant 回复（同一条助手消息只应入上下文一次）',
        machine_criterion: "任一出站请求 messages 角色序列不含 'assistant,assistant'（连续两条 assistant）",
        observed: snap.requests.some(r => r.messages_roles.join(',').includes('assistant,assistant')),
        expected_now: 'true（重复存在）—— it.fails 证词化；修好后翻转为红，必须删除 it.fails',
        evidence_source: 'tool-loop-executor.ts:270 推 assistant + conversation-engine.ts:785 再推一次（streaming 路径双推）',
        note: 'D817 执行时新发现：出站上下文膨胀一倍（第 1 轮 = [system,user]；第 2 轮 = [system,user,assistant,assistant,user]）',
      },
    },
  };
  mkdirSync(dirname(EVIDENCE_PATH), { recursive: true });
  writeFileSync(EVIDENCE_PATH, `${JSON.stringify(evidence, null, 2)}\n`, 'utf-8');
}

beforeAll(async () => {
  for (const k of ENV_KEYS) {
    savedEnv.set(k, process.env[k]);
    delete process.env[k];
  }
  process.env.DEV_MODE = 'true';
  process.env.PORT = '0';
  process.env.SYNOVA_DB_PATH = ':memory:';
  process.env.SYNOVA_SKIP_MCP = '1';
  tmpDataDir = mkdtempSync(join(tmpdir(), 'synova-d817-'));
  process.env.SYNOVA_DATA_DIR = tmpDataDir;

  fake = await startFakeLlmUpstream({
    script: [
      // 首轮：带一次 tool_calls —— 让工具循环真的转起来（派单 §B-4）
      { content: 'D817 假上游首轮', toolCalls: [{ name: SCRIPTED_TOOL, arguments: '{}' }] },
      { content: 'D817 假上游续轮' },
      { content: 'D817 假上游末轮' },
    ],
  });

  // 既有配置缝：走 GA 首次配置的真实写入面（routes/llm-config.ts 同源 API）
  setLlmCredential({
    provider: 'deepseek',
    apiKey: 'd817-fake-key-not-a-real-secret',
    model: 'd817-fake-model',
    baseUrl: fake.baseUrl,
  });

  installFetchObserver();
  server = await createServer();
  const addr = server.address() as AddressInfo | null;
  if (addr === null || typeof addr === 'string') throw new Error('createServer 未返回可解析的监听地址');
  base = `http://127.0.0.1:${addr.port}`;
}, 60_000);

afterAll(async () => {
  globalThis.fetch = realFetch;
  await new Promise<void>(resolve => { server.close(() => resolve()); });
  if (fake) await fake.close();
  for (const [k, v] of savedEnv) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (tmpDataDir) rmSync(tmpDataDir, { recursive: true, force: true });
});

describe('D817 生产入口级对话（真实 createServer + 真实路由 + 假上游）', () => {
  it('① POST /api/conversations 建会话：SSE open 帧回声 sessionId（真实入口可达）', async () => {
    const { res, text } = await postMessage('/api/conversations', { message: 'D817 入口探针：先说说团队规模' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');

    const frames = parseSseFrames(text);
    expect(frames.length).toBeGreaterThan(0);
    const open = frames[0];
    expect(open.type).toBe('open');
    expect(typeof open.sessionId).toBe('string');
    sessionId = String(open.sessionId);
    expect(sessionId.length).toBeGreaterThan(0);
    // 收束：最后一帧必为 end（web-adapter 契约），且不得有 error 帧
    expect(frames[frames.length - 1].type).toBe('end');
    expect(frames.filter(f => f.type === 'error')).toEqual([]);
  }, 30_000);

  it('② POST /api/conversations/:id/messages：SSE 收束 + 假上游收到真实出站请求 + 证据落盘', async () => {
    const requestsBefore = fake.requests.length;
    const { res, text } = await postMessage(`/api/conversations/${sessionId}/messages`, {
      message: 'D817 入口探针：续一轮，说明当前进度',
    });
    firstTurnSseText = text;

    // ── HTTP/SSE 正常收束（不是只断言状态码）──
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type') ?? '').toContain('text/event-stream');
    firstTurnFrames = parseSseFrames(text);
    const types = frameTypes(firstTurnFrames);
    expect(types[0]).toBe('open');
    expect(types).toContain('token');
    expect(firstTurnFrames[firstTurnFrames.length - 1].type).toBe('end');
    expect(firstTurnFrames.filter(f => f.type === 'error')).toEqual([]);
    // 回复文本真的随 token 帧流出来了（内容面，不只是协议面）
    const streamed = firstTurnFrames.filter(f => f.type === 'token').map(f => String(f.text ?? '')).join('');
    expect(streamed.length).toBeGreaterThan(0);

    // ── 假上游真的收到了请求，且抓到了出站请求体 ──
    const newRequests = fake.requests.slice(requestsBefore);
    expect(newRequests.length).toBeGreaterThanOrEqual(1);
    const conversationRequest = newRequests.find(r => r.messagesRoles.includes('user'));
    expect(conversationRequest).toBeDefined();
    if (conversationRequest === undefined) throw new Error('未捕获到携带 user 消息的出站请求');
    expect(conversationRequest.host.startsWith('127.0.0.1')).toBe(true);
    expect(conversationRequest.authorizationPresent).toBe(true);
    expect(conversationRequest.bodyKeys).toContain('model');
    expect(conversationRequest.bodyKeys).toContain('messages');
    expect(conversationRequest.parseError).toBeNull();

    // ── 全程零外网（观测器记录的非 127.0.0.1 出站调用必须为空）──
    expect(externalCalls).toEqual([]);

    // ── 证据落盘（含出站请求体字段清单）──
    writeEvidence(conversationRequest.index);
    const evidenceRaw = readFileSync(EVIDENCE_PATH, 'utf-8');
    const evidence = JSON.parse(evidenceRaw) as {
      upstream: { request_count: number; body_keys_union: string[]; requests: Array<{ index: number; body_keys: string[] }> };
      assertions: { external_network_calls: string[] };
    };
    expect(evidence.upstream.request_count).toBeGreaterThanOrEqual(1);
    expect(evidence.upstream.body_keys_union.length).toBeGreaterThan(0);
    const mainFromEvidence = evidence.upstream.requests.find(r => r.index === conversationRequest.index);
    expect(mainFromEvidence?.body_keys).toEqual(conversationRequest.bodyKeys);
    expect(evidence.assertions.external_network_calls).toEqual([]);
  }, 30_000);

  it('③ 上游地址确实指向 127.0.0.1 假上游（配置缝生效，非真实 provider）', () => {
    expect(fake.baseUrl.startsWith('http://127.0.0.1:')).toBe(true);
    expect(fake.callCount).toBeGreaterThanOrEqual(1);
    expect(fake.requests.every(r => r.host.startsWith('127.0.0.1'))).toBe(true);
  });

  it.fails('④ P0-1 证词：出站请求体应含 tools（当前预期失败；修好后必须删除本 it.fails 改正向断言）', () => {
    const snap = snapshotUpstream(fake);
    expect(snap.body_keys_union).toContain('tools');
  });

  it.fails('⑤ D817-F1 证词：工具循环应被真实驱动（当前预期失败；修好后必须删除本 it.fails）', () => {
    const snap = snapshotUpstream(fake);
    const sawToolRoundTrip = snap.saw_tool_result_message;
    const sawToolAnnotation = firstTurnSseText.includes('[工具调用: ');
    expect({ sawToolRoundTrip, sawToolAnnotation }).toEqual({ sawToolRoundTrip: true, sawToolAnnotation: true });
  });

  it('⑥ CI 排除面不含本文件（负向对照：tests/e2e/** 仍在排除面内 = 检查不是空转）', () => {
    const selfPath = 'tests/integration/production-entry-conversation.integration.test.ts';
    const cfg = readFileSync(join(process.cwd(), 'vitest.config.ts'), 'utf-8');
    const ciStart = cfg.indexOf('process.env.CI');
    const ciEnd = cfg.indexOf('coverage:');
    expect(ciStart).toBeGreaterThan(-1);
    expect(ciEnd).toBeGreaterThan(ciStart);
    const ciBlock = cfg.slice(ciStart, ciEnd);
    const excludes = [...ciBlock.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(e => e.length > 0);
    expect(excludes).toContain('tests/e2e/**');

    /** 该排除项是否覆盖给定文件（覆盖 = 通配前缀/文件名/整串） */
    const covers = (pattern: string, file: string): boolean => {
      const wildcard = pattern.indexOf('*');
      if (wildcard === -1) return file === pattern;
      const head = pattern.slice(0, wildcard);
      const tail = pattern.slice(wildcard + 1).replace(/\*+$/, '');
      return file.startsWith(head) && (tail === '' || file.endsWith(tail));
    };
    // 机制自证：匹配器能真的判出排除（否则下面那条断言是空转）
    expect(covers('tests/e2e/**', 'tests/e2e/whatever.test.ts')).toBe(true);
    expect(covers('tests/acceptance/**', selfPath)).toBe(false);
    expect(excludes.filter(p => covers(p, selfPath))).toEqual([]);
  });

  it('⑦ 本文件确实在 vitest include 面内（tests/**/*.integration.test.ts）', () => {
    const selfRel = 'tests/integration/production-entry-conversation.integration.test.ts';
    const cfg = readFileSync(join(process.cwd(), 'vitest.config.ts'), 'utf-8');
    const includeLine = cfg.split('\n').find(l => l.includes('include:')) ?? '';
    const patterns = [...includeLine.matchAll(/'([^']+)'/g)].map(m => m[1]);
    expect(patterns.length).toBeGreaterThan(0);
    /** include 面匹配（本仓 include 仅用「目录前缀 + **」形态；前缀归一掉 './'） */
    const inScope = (pattern: string, file: string): boolean => {
      const head = pattern.slice(0, pattern.indexOf('*') === -1 ? pattern.length : pattern.indexOf('*'));
      return file.startsWith(head.startsWith('./') ? head.slice(2) : head);
    };
    expect(inScope('./src/**/*.ts', selfRel)).toBe(false);        // 机制自证：非空转
    expect(patterns.some(p => inScope(p, selfRel))).toBe(true);
  });

  it('⑧ 降级路径：假上游请求体非 JSON → 400 + parseError 留痕（不静默吞）', async () => {
    const before = fake.requests.length;
    const res = await fetch(`${fake.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(res.status).toBe(400);
    const captured = fake.requests[fake.requests.length - 1];
    expect(fake.requests.length).toBe(before + 1);
    expect(captured.parseError).not.toBeNull();
    expect(captured.bodyKeys).toEqual([]);
    log.info({ parseError: captured.parseError }, 'D817 假上游降级路径已验证（400 + parseError 留痕）');
  });

  it.fails('⑨ D817-F2 证词：出站上下文不得重复 assistant 回复（当前预期失败；修好后必须删除本 it.fails）', () => {
    const roleSequences = fake.requests
      .filter(r => r.messagesRoles.includes('user'))
      .map(r => r.messagesRoles.join(','));
    expect(roleSequences.length).toBeGreaterThan(0);
    for (const seq of roleSequences) {
      expect(seq).not.toContain('assistant,assistant');
    }
  });
});
