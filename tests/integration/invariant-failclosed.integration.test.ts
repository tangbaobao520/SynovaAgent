/**
 * tests/integration/invariant-failclosed.integration.test.ts — D865 P0-1
 * 「注入违约 → 真实 HTTP 入口 5xx（fail-closed）」
 *
 * 铁律 12：起**真实** createServer（src/server.ts 真实 bootstrap——Phase 6 在启动序列内
 * 真装 3 条不变量 wrap globalThis.fetch）+ 真实 SQLite + 真实 express 路由 + 真实 fetch，
 * 打真实路由 POST /api/conversations。**不 mock 管线**——被替换的只有「模型本身」
 * （tests/helpers/fake-llm-upstream.ts，K3 PROBE-B 同法）。
 *
 * 注入方式（K3 §4.2 等价）：在 createServer 之后**再包一层 fetch**，把出站
 * chat/completions 请求体的 tools 摘掉/置空——请求到达不变量 wrap 的 fetch 时
 * tools 已不在 body（忠实等价于 provider 组装请求丢 tools）。
 *
 * 判据（D831 卡 acceptance_points[0] / K3 §18.1）:
 *   ① 首轮违约（tools 置空，无任何 token 流出，响应头未发出）→ **HTTP ≥500**，
 *      body 含 owner 名 + invariant code（不是 200+SSE 降级文案）
 *   ② 中途违约（已发头后第 2 轮违约）→ 流内 INVARIANT_VIOLATED 帧 + 断流（行为声明，
 *      M6「中途违约=断流」）
 *   ③ 探针可见：/api/healthz/invariants lastFailure 非空 + hitCount 增加
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createServer } from '../../src/server';
import { setLlmCredential } from '../../src/services/llm-credential-store';
import { startFakeLlmUpstream, type FakeLlmUpstream } from '../helpers/fake-llm-upstream';

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
/** 注入模式：'empty' = tools 置空数组（首轮即违约，无 token）；'strip' = 删除 tools（首轮放行，第 2 轮违约） */
let injectMode: 'empty' | 'strip' | 'off' = 'off';
const realFetch = globalThis.fetch;

/** 违约注入器：包在不变量 wrap 之外（后装=外层）——出站 body 在到达检查缝前被摘/置空 tools。
 * 必须调用**安装时刻**的 globalThis.fetch（= 不变量 wrap），而非模块加载时的原生 fetch——
 * 否则绕过检查缝，注入无效。 */
function installToolsInjector(): void {
  const beneath = globalThis.fetch;
  const patched: typeof fetch = async (input, init) => {
    if (injectMode !== 'off') {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (/\/chat\/completions\/?$/.test(url) && init?.method?.toUpperCase() === 'POST' && typeof init.body === 'string') {
        try {
          const parsed: unknown = JSON.parse(init.body);
          if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const body = parsed as Record<string, unknown>;
            if (injectMode === 'empty') body.tools = [];
            else if (injectMode === 'strip') delete body.tools;
            init = { ...init, body: JSON.stringify(body) };
          }
        } catch {
          // 非 JSON body 不在注入面（与 notChecked #4 同口径）
        }
      }
    }
    return beneath(input, init);
  };
  globalThis.fetch = patched;
}

interface InvariantProbeBody {
  registered: number;
  invariants: Array<{ code: string; owner: string; hitCount: number; lastFailure: string | null }>;
}

async function readProbe(): Promise<InvariantProbeBody> {
  const res = await realFetch(`${base}/api/healthz/invariants`);
  expect(res.status).toBe(200);
  return JSON.parse(await res.text()) as InvariantProbeBody;
}

/** SSE 帧解析（web-adapter 契约） */
function parseSseFrames(text: string): Array<Record<string, unknown>> {
  const frames: Array<Record<string, unknown>> = [];
  for (const block of text.split('\n\n')) {
    const dataLine = block.split('\n').find(l => l.startsWith('data: '));
    if (dataLine === undefined) continue;
    frames.push(JSON.parse(dataLine.slice(6)) as Record<string, unknown>);
  }
  return frames;
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
  tmpDataDir = mkdtempSync(join(tmpdir(), 'synova-d865-'));
  process.env.SYNOVA_DATA_DIR = tmpDataDir;

  fake = await startFakeLlmUpstream({
    script: [
      // 首轮带 tool_calls（工具循环转起来 → 第 2 轮出站含 role=tool 消息，strip 模式下触发违约）
      { content: 'D865 首轮', toolCalls: [{ name: 'show_diagnosis_progress', arguments: '{}' }] },
      { content: 'D865 续轮' },
      { content: 'D865 末轮' },
    ],
  });
  setLlmCredential({
    provider: 'deepseek',
    apiKey: 'd865-fake-key-not-a-real-secret',
    model: 'd865-fake-model',
    baseUrl: fake.baseUrl,
  });

  // 先起真实服务器（Phase 6 在 createServer 内真装不变量 wrap），再装注入器（外层）
  server = await createServer();
  installToolsInjector();
  const addr = server.address() as AddressInfo | null;
  if (addr === null || typeof addr === 'string') throw new Error('createServer 未返回可解析的监听地址');
  base = `http://127.0.0.1:${addr.port}`;
}, 60_000);

const savedEnv = new Map<string, string | undefined>();

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

async function postConversation(message: string): Promise<{ status: number; contentType: string; text: string }> {
  const res = await realFetch(`${base}/api/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  return { status: res.status, contentType: res.headers.get('content-type') ?? '', text: await res.text() };
}

describe('D865 P0-1: 注入违约 → 真实 HTTP 入口 fail-closed', () => {
  it('① 首轮违约（tools 置空数组，响应头未发出）→ HTTP 500 + body 含 owner/invariant code（不是 200+降级文案）', async () => {
    injectMode = 'empty';
    const { status, contentType, text } = await postConversation('D865 fail-closed 探针：首轮即违约');
    injectMode = 'off';
    // D865 P0-1 端到端原始输出（写入 M6 文档 §D865；K3 复审复跑本用例可得同一形态输出）
    console.log('[D865-E2E] REQUEST  POST /api/conversations  body={"message":"D865 fail-closed 探针：首轮即违约"}');
    console.log(`[D865-E2E] RESPONSE status=${status} content-type=${contentType}`);
    console.log(`[D865-E2E] RESPONSE-BODY ${text}`);
    expect(status).toBeGreaterThanOrEqual(500);
    expect(contentType).toContain('application/json');
    const body = JSON.parse(text) as { ok: boolean; code: string; invariant: string; owner: string; message: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe('INVARIANT_VIOLATED');
    expect(body.invariant).toBe('INV-TOOL-SCHEMA-SENT');
    expect(body.owner).toBe('squad-b/coding'); // 「知道是谁的锅」
    expect(body.message).toContain('tools');
  }, 30_000);

  it('② 探针可见：违约被真不变量记录（hitCount 增加 + lastFailure 非空 + owner 正确）', async () => {
    const probe = await readProbe();
    console.log(`[D865-E2E] PROBE GET /api/healthz/invariants status=200 body=${JSON.stringify(probe)}`);
    expect(probe.registered).toBe(3);
    const inv = probe.invariants.find(i => i.code === 'INV-TOOL-SCHEMA-SENT');
    expect(inv).toBeDefined();
    expect(inv!.hitCount).toBeGreaterThan(0);
    expect(inv!.lastFailure).toContain('tools');
    expect(inv!.owner).toBe('squad-b/coding');
  });

  it('③ 中途违约（已发头后第 2 轮违约）→ 流内 INVARIANT_VIOLATED 帧 + 断流（M6 行为声明）', async () => {
    injectMode = 'strip';
    const { status, contentType, text } = await postConversation('D865 中途违约探针：先转一轮工具再违约');
    injectMode = 'off';
    // 已发头（首轮 token 已流出）→ 状态码不可再改（HTTP 语义），行为=流内违约帧+断流
    expect(status).toBe(200);
    expect(contentType).toContain('text/event-stream');
    const frames = parseSseFrames(text);
    expect(frames[0].type).toBe('open');
    expect(frames.some(f => f.type === 'token')).toBe(true); // 首轮 token 真实流出
    const violation = frames.find(f => f.type === 'error' && f.code === 'INVARIANT_VIOLATED');
    expect(violation).toBeDefined();
    expect(String(violation!.owner)).toBe('squad-b/coding');
    expect(frames[frames.length - 1].type).toBe('end'); // 断流收束
    // 不再出现旧形态的「抱歉，调用失败」降级文案帧
    expect(text).not.toContain('抱歉，调用失败');
  }, 30_000);

  it('④ 注入解除后恢复：正常轮次 200 + SSE 正常收束（fail-closed 不误伤健康路径）', async () => {
    injectMode = 'off';
    const { status, contentType, text } = await postConversation('D865 健康路径探针');
    expect(status).toBe(200);
    expect(contentType).toContain('text/event-stream');
    const frames = parseSseFrames(text);
    expect(frames[0].type).toBe('open');
    expect(frames[frames.length - 1].type).toBe('end');
    expect(frames.filter(f => f.type === 'error')).toEqual([]);
  }, 30_000);
});
