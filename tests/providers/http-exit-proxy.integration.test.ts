/**
 * tests/providers/http-exit-proxy.integration.test.ts — D821 穿真实入口集成用例（代理出网）
 *
 * 判定口径来源：`docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md`
 *   §三「前提清单」= **反向验证**：只允许代理出网的环境跑真实调用**成功**且**直连会失败**；
 *   §四 三问自查；§五 四条禁止（禁 grep 命中当完成、禁「表已建」式判据）；
 *   §六「代理类」样板；§十二 证据硬要求（数字给原始输出、判别性夹具「删掉修复即报红」）。
 *
 * 契约（铁律 47）:
 * @input  — 进程 env（`HTTP_PROXY`/`HTTPS_PROXY`/`NO_PROXY` 等）+ 本地真服务（假代理 + origin）
 * @output — 真实出站行为与**可断言证据**：假代理逐字节原始请求行、origin 命中、真 `Response`、
 *           `provider.chat()` 的 content、`getProxyStatus()` 快照、`OutboundHttpError` 的 code/phase/degraded
 * @degraded— 本文件不断言降级静默；④ 专测「不可用代理值 → degraded=true 且直连可用、进程不崩」
 * @error  — 期望的失败路径（②真 ENOTFOUND / ⑥PROXY_UNREACHABLE）必须**抛错**，抛错本身即判据
 * @side   — 全部真服务跑在 127.0.0.1 / 本机非 loopback IPv4；**零 vi.mock**（禁 mock 管线，铁律 12）；
 *           env 改动一律 `withProxyEnv` 快照 + `finally` 还原（防跨用例污染）
 *
 * ★ 本文件覆盖（穿真实入口，非 grep）:
 *   ① 主证 https：`createOpenAICompatibleProvider` → `CONNECT llm-intranet.invalid:443` → 隧道 → **真 TLS 往返** → content
 *   ② 次证 http ：同一真入口 → 代理**绝对 URI** 形态 → origin 应答 → content
 *   ③ 负证：不设代理 → 真 `getaddrinfo ENOTFOUND`（反证「直连会失败」）
 *   ④ loopback 整段绕过：`127.0.0.1` 传输层取证 + `127.0.0.2` 决策面/传输层替代取证（见该用例注释）+ 非 loopback 对照
 *   ⑤ 不可用值（`socks5://`）降级：不阻断、status 只含变量名、出站直连可用
 *   ⑥ 无静默回退：代理端口关闭 → `PROXY_UNREACHABLE` + `degraded=true`，且**不得**直连成功
 *
 * ★ 本文件**未覆盖**（据实标注，禁声称）:
 *   1. **Win 实机**行为（本机 macOS；`domain: win` 由 Mac 代行 — 见 `Win域代行安排-20260918.md`）；
 *   2. **真实客户内网拓扑**（真实企业代理的 PAC/认证网关/多级跳转）；
 *   3. **SOCKS5 真转发**（契约把 `socks5://` 判为不可用值 → 降级直连，本卡不做真转发）；
 *   4. **per-request CA 缝**：本文件的 TLS 信任链靠把**测试自签 CA 注入进程默认信任库**
 *      （`tls.setDefaultCACertificates`，等价生产侧的 `NODE_EXTRA_CA_CERTS`/企业 CA 安装）。
 *      v1 契约**没有** per-request CA 通道；生产换证书需进程重启。此缝列本卡遗留项。
 *   5. 真实外部 LLM 调用（离线环境：用本地真 origin 顶替"模型本身"，生产管线（provider.chat →
 *      outboundFetch → 代理 → TLS）全程真实执行）。
 *   6. **Node < 22.15 / CI 的 node 20 job**：主证依赖 `tls.setDefaultCACertificates`（22.15+），
 *      该平台整块 `describe` **跳过可见**（skip ≠ pass）→ 「https CONNECT 真 TLS 往返」在这些平台未覆盖；
 *      ②–⑥（http 绝对 URI / ENOTFOUND / loopback 整段 / socks 降级 / 无静默回退）不受影响，仍全跑。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import { createOpenAICompatibleProvider } from '../../src/providers/base';
import { getProxyStatus, outboundFetch, OutboundHttpError } from '../../src/providers/http-exit';
import { getClosedPort, startFakeProxy, type FakeProxy } from './helpers/fake-proxy';
import { startFakeLlmUpstream, type FakeLlmUpstream } from '../helpers/fake-llm-upstream';

// ═══════════════════════════════════════════════════════════════
// 夹具与工具
// ═══════════════════════════════════════════════════════════════

/** 不可解析的伪造企业内网主机名（RFC 2606 保留 TLD `.invalid`，永不解析） */
const INTRANET_HOST = 'llm-intranet.invalid';
const TLS_DIRECTIVE = 'D821 经 CONNECT 隧道返回';

/** openssl 守卫：缺 openssl 的平台**显式跳过**（跳过可见），不让用例假绿。 */
const HAS_OPENSSL = ((): boolean => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

/**
 * 默认信任库注入能力守卫（主证 TLS 往返的前置）。
 * `tls.getCACertificates` / `tls.setDefaultCACertificates` 是 **Node ≥ 22.15** 才有；
 * CI 有多个 job 跑 node 20（`.github/workflows/ci.yml` 的 `node-version: 20`）→ 那里必须**跳过可见**，
 * **不得**静默通过（跳过 = 该平台属未覆盖，不是"通过"）。
 */
const HAS_CA_INJECTION = typeof (tls as { setDefaultCACertificates?: unknown }).setDefaultCACertificates === 'function';

/** 本机非 loopback IPv4（用于「代理不可达且不得直连」的强判别夹具；无则跳过该强断言） */
const LAN_IPV4 = ((): string | undefined => {
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family === 'IPv4' && !a.internal) return a.address;
    }
  }
  return undefined;
})();

const PROXY_ENV_KEYS = [
  'http_proxy', 'HTTP_PROXY',
  'https_proxy', 'HTTPS_PROXY',
  'all_proxy', 'ALL_PROXY',
  'no_proxy', 'NO_PROXY',
] as const;

type EnvSnapshot = Map<string, string | undefined>;

function snapshotProxyEnv(): EnvSnapshot {
  const snap: EnvSnapshot = new Map();
  for (const k of PROXY_ENV_KEYS) snap.set(k, process.env[k]);
  return snap;
}

function restoreProxyEnv(snap: EnvSnapshot): void {
  for (const [k, v] of snap) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/**
 * 在指定代理 env 下跑一段逻辑；**finally 还原全部代理 env**（防跨用例污染）。
 * 先清空全部代理 env，再设 `vars` —— 保证"设了什么就是什么"，不受外层残留影响。
 */
async function withProxyEnv<T>(vars: Record<string, string>, fn: () => Promise<T>): Promise<T> {
  const snap = snapshotProxyEnv();
  try {
    for (const k of PROXY_ENV_KEYS) delete process.env[k];
    for (const [k, v] of Object.entries(vars)) process.env[k] = v;
    return await fn();
  } finally {
    restoreProxyEnv(snap);
  }
}

/** 拍平错误链（err / cause / AggregateError）——用于断言底层真 errno（如 ENOTFOUND）。 */
function flattenError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur !== undefined && cur !== null; depth += 1) {
    if (cur instanceof Error) {
      parts.push(`${cur.name}: ${cur.message}`);
      cur = (cur as { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(cur));
    break;
  }
  return parts.join(' | ');
}

interface HttpOrigin {
  port: number;
  hits: string[];
  close(): Promise<void>;
}

/** 真 http origin（记录路径；返回 JSON）——用于 http 直连 / 非 loopback 对照的落地目标。 */
async function startHttpOrigin(bind: string): Promise<HttpOrigin> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? '');
    const body = JSON.stringify({ ok: true, path: req.url ?? '' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, bind, resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    hits,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

interface TlsOrigin extends HttpOrigin {
  /** 自签证书 PEM（用于注入默认信任库） */
  certPem: string;
}

/**
 * 真 https origin（自签证书，openssl 现生成，**不入库**）。
 * SAN 必须含 `llm-intranet.invalid`：hostname 校验不放宽，靠 SAN 匹配通过。
 */
async function startTlsOrigin(): Promise<TlsOrigin> {
  const dir = mkdtempSync(path.join(tmpdir(), 'd821-tls-origin-'));
  const certPath = path.join(dir, 'cert.pem');
  const keyPath = path.join(dir, 'key.pem');
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPath, '-out', certPath,
    '-days', '1',
    '-subj', `/CN=${INTRANET_HOST}`,
    '-addext', `subjectAltName=DNS:${INTRANET_HOST}`,
  ], { stdio: 'ignore' });
  const key = readFileSync(keyPath);
  const certPem = readFileSync(certPath, 'utf8');
  const hits: string[] = [];
  const server = https.createServer({ key, cert: certPem }, (req, res) => {
    hits.push(req.url ?? '');
    if (req.method === 'GET' && (req.url ?? '').includes('/models')) {
      const body = JSON.stringify({ object: 'list', data: [{ id: 'd821-tls-model', object: 'model' }] });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      res.end(body);
      return;
    }
    const body = JSON.stringify({
      id: 'chatcmpl-d821-tls',
      object: 'chat.completion',
      created: 1_760_000_000,
      model: 'd821-tls-model',
      choices: [{ index: 0, message: { role: 'assistant', content: TLS_DIRECTIVE }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 5, completion_tokens: 7, total_tokens: 12 },
    });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    hits,
    certPem,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => {
        rmSync(dir, { recursive: true, force: true });
        resolve();
      });
    }),
  };
}

/** 真入口（`src/providers/base.ts:113`）——不 mock 管线，只换上游地址。 */
function makeProbeProvider(baseUrl: string) {
  return createOpenAICompatibleProvider({
    name: 'd821-integration-probe',
    baseUrl,
    model: 'd821-probe-model',
    apiKey: 'd821-probe-key',
    getHeaders: () => ({ Authorization: 'Bearer d821-probe-key', 'Content-Type': 'application/json' }),
  });
}

// ═══════════════════════════════════════════════════════════════
// ① 主证：https 目标 → CONNECT 隧道 → 真 TLS 往返 → provider.chat() 返回 content
//    **跳过可见**：缺 openssl 或 Node < 22.15（无 `tls.setDefaultCACertificates`）时整块 skip
//    —— CI 的 node 20 job 因此属"未覆盖"，不是"通过"；Win 实机同样未覆盖。
// ═══════════════════════════════════════════════════════════════

describe.skipIf(!HAS_OPENSSL || !HAS_CA_INJECTION)('① 主证 https：真入口经 CONNECT 隧道完成 TLS 往返', () => {
  let tlsOrigin: TlsOrigin;
  let proxy: FakeProxy;

  beforeAll(async () => {
    tlsOrigin = await startTlsOrigin();
    // 夹具把**不可解析**的 llm-intranet.invalid:443 改连本机 https origin（离线可复现）
    proxy = await startFakeProxy({
      targets: { [`${INTRANET_HOST}:443`]: { host: '127.0.0.1', port: tlsOrigin.port } },
    });
  });

  afterAll(async () => {
    await proxy.close();
    await tlsOrigin.close();
  });

  it('provider.chat() 走 CONNECT 隧道 → TLS 握手成功 → 返回 content（且原文请求行在盘）', async () => {
    // 信任链：把测试自签 CA 注入**进程默认信任库**（等价生产侧 NODE_EXTRA_CA_CERTS / 企业 CA 安装）。
    // 注意：**没有**放宽 hostname 校验、**没有**用 NODE_TLS_REJECT_UNAUTHORIZED 关校验。
    const defaultCAs = tls.getCACertificates('default');
    tls.setDefaultCACertificates([...defaultCAs, tlsOrigin.certPem]);
    try {
      expect(process.env.NODE_TLS_REJECT_UNAUTHORIZED).toBeUndefined();

      const result = await withProxyEnv({ HTTPS_PROXY: proxy.url }, async () => {
        const provider = makeProbeProvider(`https://${INTRANET_HOST}`);
        return provider.chat([{ role: 'user', content: 'ping via CONNECT tunnel' }]);
      });

      expect(result.content).toBe(TLS_DIRECTIVE);
      // 证据 1：假代理逐字节原始请求行（CONNECT 形态）
      expect(proxy.connectLines()).toEqual([`CONNECT ${INTRANET_HOST}:443 HTTP/1.1`]);
      // 证据 2：TLS 往返真的落到 origin（明文绝对 URI 未被使用）
      expect(tlsOrigin.hits).toEqual(['/chat/completions']);
      expect(proxy.rawLines().every(l => l.startsWith('CONNECT '))).toBe(true);
      // 证据留痕（§十二 证据硬要求）：把原始日志打进测试输出，便于贴进交付/审计
      console.log('[D821 证据①主证] 假代理原始请求行 =', JSON.stringify(proxy.rawLines()));
      console.log('[D821 证据①主证] origin 命中 =', JSON.stringify(tlsOrigin.hits), '| content =', JSON.stringify(result.content));
    } finally {
      tls.setDefaultCACertificates(defaultCAs);
    }
  }, 20_000);

  it('healthCheck() 同样经隧道（GET /models 的 TLS 往返证据）', async () => {
    const defaultCAs = tls.getCACertificates('default');
    tls.setDefaultCACertificates([...defaultCAs, tlsOrigin.certPem]);
    try {
      const health = await withProxyEnv({ HTTPS_PROXY: proxy.url }, async () => {
        const provider = makeProbeProvider(`https://${INTRANET_HOST}`);
        return provider.healthCheck();
      });
      expect(health.healthy).toBe(true);
      expect(tlsOrigin.hits).toContain('/models');
    } finally {
      tls.setDefaultCACertificates(defaultCAs);
    }
  }, 20_000);
});

// ═══════════════════════════════════════════════════════════════
// ② 次证：http 目标 → 代理**绝对 URI** 形态 → origin 应答 → content
// ═══════════════════════════════════════════════════════════════

describe('② 次证 http：真入口经代理绝对 URI（另一条传输路径）', () => {
  let upstream: FakeLlmUpstream;
  let proxy: FakeProxy;

  beforeAll(async () => {
    upstream = await startFakeLlmUpstream({ script: [{ content: 'D821 经绝对 URI 返回' }] });
    proxy = await startFakeProxy({
      targets: { [`${INTRANET_HOST}:${upstream.port}`]: { host: '127.0.0.1', port: upstream.port } },
    });
  });

  afterAll(async () => {
    await proxy.close();
    await upstream.close();
  });

  it('provider.chat() 经代理绝对 URI 返回 content，且 origin 真收到 /chat/completions', async () => {
    const result = await withProxyEnv({ HTTP_PROXY: proxy.url }, async () => {
      const provider = makeProbeProvider(`http://${INTRANET_HOST}:${upstream.port}/v1`);
      return provider.chat([{ role: 'user', content: 'ping via absolute URI' }]);
    });

    expect(result.content).toBe('D821 经绝对 URI 返回');
    expect(proxy.rawLines()).toEqual([`POST http://${INTRANET_HOST}:${upstream.port}/v1/chat/completions HTTP/1.1`]);
    expect(upstream.requests.map(r => r.path)).toEqual(['/v1/chat/completions']);
    expect(upstream.requests[0]?.hasToolsField).toBe(false);
  }, 20_000);
});

// ═══════════════════════════════════════════════════════════════
// ③ 负证：同一 URL **不设**代理 → 真 getaddrinfo ENOTFOUND（「直连会失败」）
// ═══════════════════════════════════════════════════════════════

describe('③ 负证：不设代理变量 → 真 DNS 失败（ENOTFOUND）', () => {
  it('直连 llm-intranet.invalid → 抛错且错误链含 getaddrinfo ENOTFOUND', async () => {
    const failure = await withProxyEnv({}, async () => {
      try {
        await outboundFetch(`http://${INTRANET_HOST}:11451/v1/chat/completions`);
        return null;
      } catch (err: unknown) {
        return err;
      }
    });

    expect(failure).not.toBeNull();
    const text = flattenError(failure);
    // 真 DNS 失败原文（判据：底层 errno，不是"某个错误被抛出"）
    expect(text).toContain('ENOTFOUND');
    if (failure instanceof OutboundHttpError) {
      expect(failure.code).toBe('UPSTREAM_UNREACHABLE');
      expect(failure.phase).toBe('connect');
      expect(failure.degraded).toBe(false);
    }
  }, 20_000);
});

// ═══════════════════════════════════════════════════════════════
// ④ loopback 整段绕过（传输层取证）
// ═══════════════════════════════════════════════════════════════

describe('④ loopback 整段绕过 + 非 loopback 对照（设代理前提下）', () => {
  let origin: HttpOrigin;
  let proxy: FakeProxy;

  beforeAll(async () => {
    origin = await startHttpOrigin('127.0.0.1');
    proxy = await startFakeProxy({
      // 非 loopback 对照：把伪造公网地址改连本机 origin（证明代理链路本身可用）
      targets: { '10.0.0.1:11451': { host: '127.0.0.1', port: origin.port } },
    });
  });

  afterAll(async () => {
    await proxy.close();
    await origin.close();
  });

  it('④a 127.0.0.1：假代理收 0、本机 origin 收 1（真直连）', async () => {
    const before = origin.hits.length;
    const res = await withProxyEnv({ HTTP_PROXY: proxy.url, ALL_PROXY: proxy.url }, async () =>
      outboundFetch(`http://127.0.0.1:${origin.port}/loopback-a`));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, path: '/loopback-a' });
    expect(origin.hits.length - before).toBe(1);
    expect(proxy.rawLines()).toHaveLength(0);
  }, 20_000);

  it('④b 127.0.0.2：假代理收 0 + 直连尝试签名（本机不可 bind，替代取证）', async () => {
    // ── 环境事实（本机实测，写进用例以免被误读为"没测"）：
    //   ① `ifconfig lo0` 只挂 127.0.0.1（netmask 0xff000000），无 127.0.0.2；
    //   ② `listen(0,'127.0.0.2')` → EADDRNOTAVAIL；
    //   ③ 把 origin 绑 `0.0.0.0` 后连 127.0.0.2 / 127.0.0.3 / 127.255.255.254 → **全部 TIMEOUT**（包被丢弃）。
    //   ⇒ 卡面字面要求的「127.0.0.2 上游真实收 1」**在本机不可实现**，属**环境未覆盖**
    //     （自验员 `docs/plans/2026-09-20-D821-自验记录.md` §0.7 同结论）。
    //   ⇒ 改用替代判据（队长裁决）：**假代理收 0** + **直连尝试签名**（取数在途、包被丢弃 → 超时）
    //     + 错误**不是** `PROXY_UNREACHABLE`（证明没被代理接管，也没静默改道）。
    const proxyLinesBefore = proxy.rawLines().length;
    const startedAt = Date.now();
    const failure = await withProxyEnv({ HTTP_PROXY: proxy.url, ALL_PROXY: proxy.url }, async () => {
      try {
        // 用 caller signal 限时：127.0.0.2 的 SYN 被丢弃，内核默认要 ~75s 才 ETIMEDOUT
        await outboundFetch(`http://127.0.0.2:${origin.port}/loopback-b`, {
          signal: AbortSignal.timeout(1500),
        });
        return null;
      } catch (err: unknown) {
        return err;
      }
    });
    const elapsed = Date.now() - startedAt;

    expect(failure).not.toBeNull();
    // 签名 1：真的发起过直连尝试并卡在网络上（不是被立即拒绝/绕过）
    expect(elapsed).toBeGreaterThanOrEqual(1000);
    // 签名 2：错误**不是**代理类（代理接管会走 CONNECT/绝对 URI 并可能回 502）
    if (failure instanceof OutboundHttpError) {
      expect(failure.code).not.toBe('PROXY_UNREACHABLE');
      expect(failure.code).not.toBe('PROXY_TUNNEL_FAILED');
    }
    // 签名 3：假代理一条都没收到（整段判定，而非四字面量列表）
    expect(proxy.rawLines().length - proxyLinesBefore).toBe(0);
  }, 20_000);

  it('④b-对照 loopback 直连的确定性拒绝签名（127.0.0.1:closed → ECONNREFUSED）', async () => {
    // 对照：loopback 目标在直连路径上给出**确定性**上游错误（与 ④b 的"包被丢弃"区分开），
    // 证明 ④a/④b 的取数确实发生在直连路径（被代理接管的话这里会是 PROXY_* 错误）。
    const closedPort = await getClosedPort();
    const failure = await withProxyEnv({ HTTP_PROXY: proxy.url, ALL_PROXY: proxy.url }, async () => {
      try {
        await outboundFetch(`http://127.0.0.1:${closedPort}/refused`);
        return null;
      } catch (err: unknown) {
        return err;
      }
    });

    expect(failure).toBeInstanceOf(OutboundHttpError);
    const classified = failure as OutboundHttpError;
    expect(classified.code).toBe('UPSTREAM_UNREACHABLE');
    expect(classified.phase).toBe('connect');
    expect(flattenError(classified)).toContain('ECONNREFUSED');
    expect(proxy.rawLines()).toHaveLength(0);
  }, 20_000);

  it('④c 非 loopback 对照 10.0.0.1：假代理收 1（证明代理链路不是整体失效）', async () => {
    const before = origin.hits.length;
    const res = await withProxyEnv({ HTTP_PROXY: proxy.url }, async () =>
      outboundFetch('http://10.0.0.1:11451/non-loopback-control'));

    expect(res.status).toBe(200);
    expect(origin.hits.length - before).toBe(1);
    expect(proxy.rawLines()).toEqual(['GET http://10.0.0.1:11451/non-loopback-control HTTP/1.1']);
  }, 20_000);
});

// ═══════════════════════════════════════════════════════════════
// ⑤ 不可用代理值（socks5）→ 降级：不阻断、status 只含变量名、出站直连可用
// ═══════════════════════════════════════════════════════════════

describe('⑤ socks5:// 不可用值 → degraded 降级（不阻断、不泄值）', () => {
  it('getProxyStatus() kind=socks + degraded=true + variables 只含变量名；出站直连仍可用', async () => {
    const origin = await startHttpOrigin('127.0.0.1');
    try {
      const { status, res } = await withProxyEnv({ HTTPS_PROXY: 'socks5://127.0.0.1:1' }, async () => {
        const snapshot = getProxyStatus();
        const response = await outboundFetch(`http://127.0.0.1:${origin.port}/after-degrade`);
        return { status: snapshot, res: response };
      });

      // 降级可见（铁律 11/31）：认得出来是 socks，且明确 degraded
      expect(status.configured).toBe(true);
      expect(status.active).toBe(false);
      expect(status.kind).toBe('socks');
      expect(status.degraded).toBe(true);
      expect(status.loopbackBypass).toBe(true);
      // variables 只含**变量名**：纯大写/下划线标识符，不含 '='、'://'、主机:端口
      expect(status.variables).toContain('HTTPS_PROXY');
      expect(status.variables.every(v => /^[A-Za-z_][A-Za-z0-9_]*$/.test(v))).toBe(true);
      const serialized = JSON.stringify(status);
      expect(serialized).not.toContain('socks5://');
      expect(serialized).not.toContain('127.0.0.1:1');
      // reason 也不得回显值
      expect(status.reason ?? '').not.toContain('socks5://');

      // 进程没崩 + 出站按降级语义直连成功
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true, path: '/after-degrade' });
      expect(origin.hits).toEqual(['/after-degrade']);
    } finally {
      await origin.close();
    }
  }, 20_000);

  it('降级不改写 env（原值保留，供人工排查）', async () => {
    await withProxyEnv({ HTTPS_PROXY: 'socks5://127.0.0.1:1' }, async () => {
      expect(process.env.HTTPS_PROXY).toBe('socks5://127.0.0.1:1');
      getProxyStatus();
      expect(process.env.HTTPS_PROXY).toBe('socks5://127.0.0.1:1');
      return undefined;
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// ⑥ 无静默回退：代理端口关闭 → PROXY_UNREACHABLE（不得直连成功）
// ═══════════════════════════════════════════════════════════════

describe('⑥ 无静默直连回退：代理不可达必须抛错', () => {
  it('⑥a 代理端口关闭 + 不可解析目标 → PROXY_UNREACHABLE / degraded=true / origin 0 命中', async () => {
    const origin = await startHttpOrigin('127.0.0.1');
    const closedPort = await getClosedPort();
    try {
      const failure = await withProxyEnv({ HTTP_PROXY: `http://127.0.0.1:${closedPort}` }, async () => {
        try {
          await outboundFetch(`http://${INTRANET_HOST}:${origin.port}/must-not-fallback`);
          return null;
        } catch (err: unknown) {
          return err;
        }
      });

      expect(failure).toBeInstanceOf(OutboundHttpError);
      const classified = failure as OutboundHttpError;
      expect(classified.code).toBe('PROXY_UNREACHABLE');
      expect(classified.phase).toBe('connect');
      expect(classified.degraded).toBe(true);
      expect(classified.proxyKind).toBe('http');
      // 反例：直连在本机确实打得通 loopback origin，但"代理失败后偷偷直连"绝不允许发生
      expect(origin.hits).toHaveLength(0);
    } finally {
      await origin.close();
    }
  }, 20_000);

  it.skipIf(LAN_IPV4 === undefined)(
    '⑥b 强判别：目标直连**可达**（本机非 loopback IP）+ 代理端口关闭 → 仍必须失败、origin 0 命中',
    async () => {
      // 判别力来源：若实现"代理失败→静默直连"，本用例会 200 且 origin 命中 1（夹具会报红）。
      // 平台差异：LAN IP 随机器变化，取不到非 loopback 地址的平台（如纯 loopback 的 CI runner）
      // 本条**跳过可见** —— 该平台属未覆盖；⑥a（不可解析目标版）在所有平台仍会跑。
      const ip = LAN_IPV4 as string;
      const origin = await startHttpOrigin(ip);
      const closedPort = await getClosedPort();
      try {
        // 先证明"直连该目标确实可达"（否则本用例无判别力）
        const directHitsBefore = origin.hits.length;
        const direct = await withProxyEnv({}, async () => outboundFetch(`http://${ip}:${origin.port}/direct-control`));
        expect(direct.status).toBe(200);
        expect(origin.hits.length - directHitsBefore).toBe(1);

        const failure = await withProxyEnv({ HTTP_PROXY: `http://127.0.0.1:${closedPort}` }, async () => {
          try {
            await outboundFetch(`http://${ip}:${origin.port}/must-not-fallback-strong`);
            return null;
          } catch (err: unknown) {
            return err;
          }
        });

        expect(failure).toBeInstanceOf(OutboundHttpError);
        const classified = failure as OutboundHttpError;
        expect(classified.code).toBe('PROXY_UNREACHABLE');
        expect(classified.degraded).toBe(true);
        // 直连**可达**却没被走：origin 不得出现第二次命中
        expect(origin.hits).toEqual(['/direct-control']);
      } finally {
        await origin.close();
      }
    },
    20_000,
  );
});
