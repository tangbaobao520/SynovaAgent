/**
 * tests/routes/llm-config.test.ts — D575 LLM 配置 API 集成测试（L2a 接线 + L2b 降级 + L2c 边界）
 *
 * 契约来源: SYNOVA-IMPL-DSH-D575-llm-first-run-config-20260904.md §4.3（契约 B 原文）+ §7 测试分层。
 * 路径说明: pre-commit 组 2b 配对映射 src/routes/llm-config.ts → tests/routes/llm-config.test.ts
 * （tests/routes/ 既有惯例 *.test.ts，同 tests/sessions-api.test.ts 先例）——spec 写集路径
 * tests/llm-config-api.integration.test.ts 的登记偏差，见 task-state/D575.json + evidence。
 *
 * 铁律 12: createServer() + PORT=0 + 真实 fetch 走真实路由，不 mock 管线。
 * Stub 上游 = node http.createServer 按 Authorization 分支返回（真实 HTTP 全链路，不 mock fetch）。
 * 环境隔离: SYNOVA_DATA_DIR 注入 tmp——严禁写真实 data/（spec §三-6）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../src/server';
import { loadConfig } from '../../src/config';
import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo, Server } from 'http';

let server: Server;
let BASE: string;
let upstream: HttpServer;
let UPSTREAM_BASE: string;
let refusedPort: number;
let tmpDataDir: string;
const savedEnv: Record<string, string | undefined> = {};

const KEY_GOOD = 'sk-good-1234567890';
const KEY_NEW = 'sk-new-9999999999';

function credentialFilePath(): string {
  return join(tmpDataDir, 'llm-credentials.json');
}

beforeAll(async () => {
  savedEnv.SYNOVA_DATA_DIR = process.env.SYNOVA_DATA_DIR;
  savedEnv.DEV_MODE = process.env.DEV_MODE;
  savedEnv.LLM_API_KEY = process.env.LLM_API_KEY;
  savedEnv.SYNOVA_LLM_TEST_TIMEOUT_MS = process.env.SYNOVA_LLM_TEST_TIMEOUT_MS;

  process.env.DEV_MODE = 'true';
  process.env.PORT = '0';
  process.env.SYNOVA_DB_PATH = ':memory:';
  delete process.env.LLM_API_KEY;
  delete process.env.SYNOVA_LLM_TEST_TIMEOUT_MS;
  tmpDataDir = mkdtempSync(join(tmpdir(), 'synova-d575-api-'));
  process.env.SYNOVA_DATA_DIR = tmpDataDir;

  // ── stub 上游: node http server，按 Authorization 分支（真实 HTTP，不 mock fetch）──
  upstream = createHttpServer((req, res) => {
    const auth = req.headers.authorization ?? '';
    const url = req.url ?? '';
    if (url.startsWith('/hang-base')) {
      return; // 永不响应 → TIMEOUT
    }
    if (auth === `Bearer ${KEY_GOOD}`) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }));
      return;
    }
    if (auth.startsWith('Bearer sk-bad')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Invalid API key provided' } }));
      return;
    }
    if (auth.startsWith('Bearer sk-quota')) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'rate limited' } }));
      return;
    }
    if (auth.startsWith('Bearer sk-server')) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'internal error' } }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'not found' } }));
  });
  await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
  UPSTREAM_BASE = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`;

  // 拒连端口: 短暂 listen 后关闭，拿到一个空闲端口号
  const refused = createHttpServer();
  await new Promise<void>((resolve) => refused.listen(0, '127.0.0.1', resolve));
  refusedPort = (refused.address() as AddressInfo).port;
  await new Promise<void>((resolve) => refused.close(() => resolve()));

  server = await createServer();
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 3098;
  BASE = `http://localhost:${port}`;
});

afterAll(async () => {
  if (server) server.close();
  if (upstream) upstream.close();
  if (tmpDataDir && tmpDataDir.startsWith(tmpdir())) rmSync(tmpDataDir, { recursive: true, force: true });
  if (savedEnv.SYNOVA_DATA_DIR === undefined) delete process.env.SYNOVA_DATA_DIR;
  else process.env.SYNOVA_DATA_DIR = savedEnv.SYNOVA_DATA_DIR;
  if (savedEnv.DEV_MODE !== undefined) process.env.DEV_MODE = savedEnv.DEV_MODE;
  if (savedEnv.LLM_API_KEY !== undefined) process.env.LLM_API_KEY = savedEnv.LLM_API_KEY;
  if (savedEnv.SYNOVA_LLM_TEST_TIMEOUT_MS !== undefined) process.env.SYNOVA_LLM_TEST_TIMEOUT_MS = savedEnv.SYNOVA_LLM_TEST_TIMEOUT_MS;
});

/** 重置凭证存储状态（删文件 = 空值语义，store 每次调用重读路径） */
function resetStore(): void {
  rmSync(credentialFilePath(), { force: true });
}

// ═══ L2a 接线 — 真实路由（铁律 12）═══

describe('GET /api/llm/config — 空值语义与预填（L2a）', () => {
  it('未配置 → 200 + configured:false + source:null（空值=未配置，非错误，A1）', async () => {
    resetStore();
    const res = await fetch(`${BASE}/api/llm/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['configured']).toBe(false);
    expect(body['source']).toBeNull();
    expect(body['maskedKey']).toBeNull();
  });

  it('未配置时 provider/model/baseUrl 预填自 synova.json llm 段（决策 4: 预填 deepseek-chat）', async () => {
    resetStore();
    const res = await fetch(`${BASE}/api/llm/config`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['provider']).toBe('deepseek');
    expect(body['model']).toBe('deepseek-chat');
    expect(typeof body['baseUrl']).toBe('string');
  });
});

describe('POST /api/llm/config — 保存序列（L2a）', () => {
  it('合法保存 → 200 {ok, maskedKey}；响应体零 key 原文；凭证文件 0600 落盘', async () => {
    resetStore();
    const res = await fetch(`${BASE}/api/llm/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'deepseek', model: 'deepseek-chat', apiKey: KEY_GOOD }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['ok']).toBe(true);
    expect(body['maskedKey']).toBe('****7890');
    expect(JSON.stringify(body)).not.toContain(KEY_GOOD); // A2 不回显

    expect(existsSync(credentialFilePath())).toBe(true);
    if (process.platform !== 'win32') {
      expect(statSync(credentialFilePath()).mode & 0o777).toBe(0o600);
    }
  });

  it('保存后 GET → configured:true + source:"stored" + maskedKey', async () => {
    const res = await fetch(`${BASE}/api/llm/config`);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['configured']).toBe(true);
    expect(body['source']).toBe('stored');
    expect(body['maskedKey']).toBe('****7890');
    expect(JSON.stringify(body)).not.toContain(KEY_GOOD);
  });

  it('热重载同进程断言（DS3 自动化代理）: POST 新 key → 同一进程 loadConfig() 立即读到新值', async () => {
    const pidBefore = process.pid;
    const res = await fetch(`${BASE}/api/llm/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'deepseek', model: 'deepseek-chat', apiKey: KEY_NEW }),
    });
    expect(res.status).toBe(200);
    expect(process.pid).toBe(pidBefore); // 进程未重启（PID 不变）
    const cfg = loadConfig(); // 每请求 loadConfig 的生产路径（diagnosis-upload-v2 L526 同款）
    expect(cfg.llmApiKey).toBe(KEY_NEW); // 热生效——下一请求即用新 key
    expect(cfg.llmConfigured).toBe(true);
  });
});

// ═══ L2b 降级 — stub 上游错误码分类（A3 稳定错误码，route on code never message）═══

describe('POST /api/llm/test — 上游错误码分类（L2b）', () => {
  async function testWithKey(key: string, baseUrl: string = UPSTREAM_BASE): Promise<Record<string, unknown>> {
    const res = await fetch(`${BASE}/api/llm/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: 'deepseek', model: 'deepseek-chat', baseUrl, apiKey: key }),
    });
    expect(res.status).toBe(200); // 测试结果是数据非服务端错误（契约 B degraded）
    return (await res.json()) as Record<string, unknown>;
  }

  it('上游 401 → {ok:false, code:"INVALID_CREDENTIAL"} + 人话 message 零堆栈', async () => {
    const body = await testWithKey('sk-bad-1234567890');
    expect(body['ok']).toBe(false);
    expect(body['code']).toBe('INVALID_CREDENTIAL');
    expect(typeof body['message']).toBe('string');
    expect(String(body['message'])).not.toContain('Invalid API key provided'); // 零上游 body 透传
    expect(JSON.stringify(body)).not.toContain('sk-bad-1234567890'); // 零 key 原文
  });

  it('上游 429 → RATE_LIMIT', async () => {
    const body = await testWithKey('sk-quota-1234567890');
    expect(body['code']).toBe('RATE_LIMIT');
  });

  it('上游 500 → SERVER', async () => {
    const body = await testWithKey('sk-server-1234567890');
    expect(body['code']).toBe('SERVER');
  });

  it('其他 4xx（404）→ INVALID_REQUEST', async () => {
    const body = await testWithKey('sk-other-1234567890');
    expect(body['code']).toBe('INVALID_REQUEST');
  });

  it('连接拒绝 → NETWORK', async () => {
    const body = await testWithKey(KEY_GOOD, `http://127.0.0.1:${refusedPort}`);
    expect(body['ok']).toBe(false);
    expect(body['code']).toBe('NETWORK');
  });

  it('上游挂起 → AbortController 超时 → TIMEOUT（注入缝缩短等待，默认 10s 不变）', async () => {
    process.env.SYNOVA_LLM_TEST_TIMEOUT_MS = '300';
    try {
      const body = await testWithKey(KEY_GOOD, `${UPSTREAM_BASE}/hang-base`);
      expect(body['ok']).toBe(false);
      expect(body['code']).toBe('TIMEOUT');
    } finally {
      delete process.env.SYNOVA_LLM_TEST_TIMEOUT_MS;
    }
  });

  it('上游 200 → {ok:true, latencyMs>0, maskedKey}', async () => {
    const body = await testWithKey(KEY_GOOD);
    expect(body['ok']).toBe(true);
    expect(typeof body['latencyMs']).toBe('number');
    expect(Number(body['latencyMs'])).toBeGreaterThan(0);
    expect(body['maskedKey']).toBe('****7890');
  });
});

// ═══ L2c 边界 — 400 不回显 / 白名单 / 枚举 / retryPolicy 预留 / 短 key 全掩 ═══

describe('POST /api/llm/config — 校验边界（L2c）', () => {
  async function postConfig(payload: Record<string, unknown>): Promise<{ status: number; body: Record<string, unknown> }> {
    const res = await fetch(`${BASE}/api/llm/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  }

  it('空 key → 400 INVALID_API_KEY，错误消息零 key 原文', async () => {
    const { status, body } = await postConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: '  ' });
    expect(status).toBe(400);
    expect(body['ok']).toBe(false);
    expect(body['code']).toBe('INVALID_API_KEY');
    expect(typeof body['error']).toBe('string');
  });

  it('含空白字符的 key → 400 INVALID_API_KEY（A2 词汇，不回显）', async () => {
    const { status, body } = await postConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk has space' });
    expect(status).toBe(400);
    expect(body['code']).toBe('INVALID_API_KEY');
    expect(JSON.stringify(body)).not.toContain('sk has space');
  });

  it('白名单外未知字段 → 400 VALIDATION_ERROR', async () => {
    const { status, body } = await postConfig({
      provider: 'deepseek', model: 'deepseek-chat', apiKey: KEY_GOOD, evilField: 'x',
    });
    expect(status).toBe(400);
    expect(body['code']).toBe('VALIDATION_ERROR');
  });

  it('provider 非 10 值枚举 → 400 VALIDATION_ERROR', async () => {
    const { status, body } = await postConfig({ provider: 'not-a-provider', model: 'm', apiKey: KEY_GOOD });
    expect(status).toBe(400);
    expect(body['code']).toBe('VALIDATION_ERROR');
  });

  it('model 为空 → 400 VALIDATION_ERROR', async () => {
    const { status, body } = await postConfig({ provider: 'deepseek', model: '', apiKey: KEY_GOOD });
    expect(status).toBe(400);
    expect(body['code']).toBe('VALIDATION_ERROR');
  });

  it('baseUrl 非 http(s) → 400 VALIDATION_ERROR', async () => {
    const { status, body } = await postConfig({
      provider: 'deepseek', model: 'deepseek-chat', apiKey: KEY_GOOD, baseUrl: 'ftp://x.example.com',
    });
    expect(status).toBe(400);
    expect(body['code']).toBe('VALIDATION_ERROR');
  });

  it('retryPolicy 字段收下不炸（A5/B-02 预留词汇，不消费）', async () => {
    resetStore();
    const { status, body } = await postConfig({
      provider: 'deepseek', model: 'deepseek-chat', apiKey: KEY_GOOD,
      retryPolicy: { maxRetries: 5, retryableCodes: ['RATE_LIMIT', 'SERVER'] },
    });
    expect(status).toBe(200);
    expect(body['ok']).toBe(true);
  });

  it('短 key（<8）GET 返回全掩 ********（不泄露长度信息以上内容）', async () => {
    resetStore();
    const { status } = await postConfig({ provider: 'deepseek', model: 'deepseek-chat', apiKey: 'sk1' });
    expect(status).toBe(200);
    const getRes = await fetch(`${BASE}/api/llm/config`);
    const body = (await getRes.json()) as Record<string, unknown>;
    expect(body['maskedKey']).toBe('********');
  });

  it('凭证文件损坏后 GET 仍 200（降级链: stored 损坏 → env 链 → 空值语义，不 500）', async () => {
    writeFileSync(credentialFilePath(), 'corrupted{{', 'utf-8');
    const res = await fetch(`${BASE}/api/llm/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body['configured']).toBe(false); // 无 env 回退 → 空值=未配置（degraded 已在服务端 log.warn）
  });
});
