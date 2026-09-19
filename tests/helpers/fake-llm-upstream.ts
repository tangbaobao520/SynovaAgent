/**
 * tests/helpers/fake-llm-upstream.ts — D817 假上游（「生产入口级对话」验证基建）
 *
 * 角色：一个**真实跑在 127.0.0.1 上**的 OpenAI 兼容 HTTP 上游。它替换的不是管线——
 * 生产管线（createServer bootstrap → express 真实路由 → ConversationEngine → tool-loop →
 * provider.chat → fetch）全部真实执行；被替换的只有「模型本身」（外网、要 key、要钱、不确定）。
 *
 * 契约（铁律 47）:
 * @input  — FakeUpstreamOptions
 *            · script?: ScriptedRound[]  按到达顺序脚本化响应（首轮常带 tool_calls，让工具循环真的转起来）
 *            · fallbackContent?: string  script 耗尽/缺省时的默认文本
 *            · modelId?: string          /models 与默认响应里的模型名
 * @output — Promise<FakeLlmUpstream>
 *            · baseUrl: string                http://127.0.0.1:<port>/v1 —— 直接喂 createProvider 的 config.baseUrl
 *            · requests: CapturedRequest[]    每个出站请求体（解析后）+ bodyKeys（P0-1 机器判据来源）
 *            · port / callCount / close()
 * @degraded — 请求体非 JSON / 读取失败 → log.warn + 记录 parseError + bodyKeys=[]，
 *             响应 400（**不静默**、不伪装成成功，铁律 24/31）
 * @error   — 端口绑定失败 → 抛出（调用方 beforeAll 失败即测试失败，不静默）；未知路径 → 404 JSON
 * @side    — 只记录 Authorization 的**存在性**（布尔），永不落 key 原文
 */
import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createLogger } from '@synova/logger';

const log = createLogger('tests/fake-llm-upstream');

/** 一轮脚本化响应（OpenAI chat.completion 语义子集） */
export interface ScriptedRound {
  /** assistant 文本内容（空串 + toolCalls 也可，但生产 chat() 对空 content 抛 EMPTY_RESPONSE，见 D817 证据） */
  content: string;
  /** 非空 → 响应的 choices[0].message.tool_calls 带上它（驱动工具循环） */
  toolCalls?: Array<{ name: string; arguments?: string; id?: string }>;
  /** 供 token 计量观察的 usage（缺省给一组固定值） */
  usage?: { promptTokens?: number; completionTokens?: number };
}

/** 一次出站请求的抓取快照——证据文件的唯一事实源 */
export interface CapturedRequest {
  index: number;
  method: string;
  path: string;
  /** host[:port]（127.0.0.1 判据；不落 query/凭据） */
  host: string;
  contentType: string;
  /** 只记存在性，永不落 key 原文 */
  authorizationPresent: boolean;
  /** 出站请求体的 Object.keys() —— P0-1「工具字段缺失」的机器判据 */
  bodyKeys: string[];
  body: Record<string, unknown>;
  /** 出站 messages 的角色序列（工具循环的端到端证据：出现 'tool' = 工具结果被喂回模型） */
  messagesRoles: string[];
  hasToolsField: boolean;
  hasToolResultMessage: boolean;
  parseError: string | null;
}

export interface FakeUpstreamOptions {
  script?: ScriptedRound[];
  fallbackContent?: string;
  modelId?: string;
}

export interface FakeLlmUpstream {
  baseUrl: string;
  port: number;
  requests: CapturedRequest[];
  readonly callCount: number;
  close(): Promise<void>;
}

/** 证据落盘用的归一化快照（剥掉端口/时间/凭据等易变面，保证证据文件可复核、可入库） */
export interface UpstreamSnapshot {
  kind: 'fake-llm-upstream';
  host: '127.0.0.1';
  request_count: number;
  /** 全部出站请求体字段的并集（有序、去重）——「出站体字段清单」 */
  body_keys_union: string[];
  /** 工具循环端到端判据：任一出站 messages 中出现 role='tool' */
  saw_tool_result_message: boolean;
  requests: Array<{
    index: number;
    method: string;
    path: string;
    body_keys: string[];
    messages_roles: string[];
    has_tools_field: boolean;
    has_tool_result_message: boolean;
  }>;
}

const DEFAULT_MODEL = 'd817-fake-model';
const DEFAULT_ROUND: ScriptedRound = { content: 'D817 假上游默认响应' };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

/** 读取请求体全文（http.IncomingMessage 是 AsyncIterable<Buffer>） */
async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function buildCompletion(
  round: ScriptedRound,
  model: string,
  requestIndex: number,
): Record<string, unknown> {
  const usage = round.usage ?? { promptTokens: 41, completionTokens: 7 };
  const message: Record<string, unknown> = { role: 'assistant', content: round.content };
  if (round.toolCalls && round.toolCalls.length > 0) {
    message.tool_calls = round.toolCalls.map((tc, i) => ({
      id: tc.id ?? `call_d817_${requestIndex}_${i}`,
      type: 'function',
      function: { name: tc.name, arguments: tc.arguments ?? '{}' },
    }));
  }
  return {
    id: `chatcmpl-d817-${requestIndex}`,
    object: 'chat.completion',
    created: 1_760_000_000,
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: message.tool_calls ? 'tool_calls' : 'stop',
      },
    ],
    usage: {
      prompt_tokens: usage.promptTokens ?? 41,
      completion_tokens: usage.completionTokens ?? 7,
      total_tokens: (usage.promptTokens ?? 41) + (usage.completionTokens ?? 7),
    },
  };
}

/**
 * 启动假上游。调用方必须在 afterAll 里 close()（否则 vitest 因句柄未释放无法退出）。
 */
export async function startFakeLlmUpstream(options: FakeUpstreamOptions = {}): Promise<FakeLlmUpstream> {
  const script = options.script && options.script.length > 0 ? options.script : [DEFAULT_ROUND];
  const fallbackContent = options.fallbackContent ?? DEFAULT_ROUND.content;
  const modelId = options.modelId ?? DEFAULT_MODEL;

  const requests: CapturedRequest[] = [];
  let served = 0;

  const server: Server = createHttpServer((req, res) => {
    void handleRequest(req, res);
  });

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const path = req.url ?? '/';

    // 健康检查缝：provider.healthCheck() 打 GET /models —— 不接线会让 bootstrap 体检误判
    if (method === 'GET' && path.includes('/models')) {
      sendJson(res, 200, { object: 'list', data: [{ id: modelId, object: 'model', owned_by: 'd817-fake' }] });
      return;
    }

    if (method !== 'POST' || !path.includes('/chat/completions')) {
      log.warn({ method, path }, 'D817 假上游收到未接线路径 — 404（不伪装成功）');
      sendJson(res, 404, {
        error: { message: `D817 fake upstream: 未接线的路径 ${method} ${path}`, type: 'unknown_path' },
      });
      return;
    }

    let raw = '';
    try {
      raw = await readBody(req);
    } catch (err: unknown) {
      log.warn({ err, degraded: true }, 'D817 假上游读取请求体失败 — 400（不静默）');
      sendJson(res, 400, { error: { message: 'D817 fake upstream: 请求体读取失败', type: 'body_read_failed' } });
      return;
    }

    const index = requests.length;
    let body: Record<string, unknown> = {};
    let parseError: string | null = null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) throw new Error(`请求体不是 JSON 对象（${typeof parsed}）`);
      body = parsed;
    } catch (err: unknown) {
      // 铁律 24: JSON.parse 失败 ≠ 缺省——必须留痕并降级标记
      parseError = err instanceof Error ? err.message : String(err);
      log.warn({ err, index, degraded: true }, 'D817 假上游请求体 JSON 解析失败 — 记录并 400');
    }

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const messagesRoles = messages
      .map(m => (isRecord(m) && typeof m.role === 'string' ? m.role : 'unknown'));
    const contentType = typeof req.headers['content-type'] === 'string' ? req.headers['content-type'] : '';

    const captured: CapturedRequest = {
      index,
      method,
      path,
      host: typeof req.headers.host === 'string' ? req.headers.host : '',
      contentType,
      authorizationPresent: typeof req.headers.authorization === 'string' && req.headers.authorization.length > 0,
      bodyKeys: Object.keys(body),
      body,
      messagesRoles,
      hasToolsField: Object.prototype.hasOwnProperty.call(body, 'tools'),
      hasToolResultMessage: messagesRoles.includes('tool'),
      parseError,
    };
    requests.push(captured);

    if (parseError !== null) {
      sendJson(res, 400, { error: { message: `D817 fake upstream: 请求体解析失败 — ${parseError}`, type: 'invalid_json' } });
      return;
    }

    const round = script[Math.min(served, script.length - 1)] ?? { content: fallbackContent };
    served += 1;
    const model = typeof body.model === 'string' && body.model.length > 0 ? body.model : modelId;
    sendJson(res, 200, buildCompletion(round, model, index));
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo | null;
  if (address === null || typeof address === 'string') {
    await new Promise<void>(resolve => { server.close(() => resolve()); });
    throw new Error('D817 假上游监听成功但拿不到端口（AddressInfo 缺失）');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    port: address.port,
    requests,
    get callCount(): number {
      return requests.length;
    },
    close(): Promise<void> {
      return new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) {
            log.warn({ err, degraded: true }, 'D817 假上游关闭失败');
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}

/** 归一化快照（证据落盘用；不含端口/时间/凭据，保证证据可入库、可 diff） */
export function snapshotUpstream(upstream: FakeLlmUpstream): UpstreamSnapshot {
  const union: string[] = [];
  for (const r of upstream.requests) {
    for (const k of r.bodyKeys) {
      if (!union.includes(k)) union.push(k);
    }
  }
  return {
    kind: 'fake-llm-upstream',
    host: '127.0.0.1',
    request_count: upstream.requests.length,
    body_keys_union: union,
    saw_tool_result_message: upstream.requests.some(r => r.hasToolResultMessage),
    requests: upstream.requests.map(r => ({
      index: r.index,
      method: r.method,
      path: r.path,
      body_keys: r.bodyKeys,
      messages_roles: r.messagesRoles,
      has_tools_field: r.hasToolsField,
      has_tool_result_message: r.hasToolResultMessage,
    })),
  };
}
