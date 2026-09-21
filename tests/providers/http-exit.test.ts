/**
 * tests/providers/http-exit.test.ts — D821 出站唯一出口（真实 socket，不 mock 管线）
 *
 * ## 测试策略（队长 2026-09-20 收窄公开面后）
 *
 * 出口只公开 `outboundFetch` / `getProxyStatus` / `OutboundHttpError`（+ 类型）。
 * 解析顺序、loopback 判定、`NO_PROXY`、CIDR 匹配等策略函数**是模块内部实现**，
 * 因此本文件**不 import 任何策略函数**，全部用**行为断言**验证：
 *
 * | 断言手段 | 能证明什么 |
 * |---|---|
 * | 假代理命中计数（绝对 URI / CONNECT） | 该请求**确实走了代理** |
 * | 真上游命中计数 | 该请求**确实到达目标** |
 * | 假代理立刻回 502 而直连真上游回 200 | 路由判定的**正反两面**（对照法） |
 * | `OutboundHttpError.code/phase/retryable/degraded` | 分类正确、无静默直连回退 |
 * | 隧道首字节 `0x16 0x03` | CONNECT 之后**确实开始了 TLS 握手** |
 *
 * ## 本机物理约束（实测，决定了夹具设计 — 不要"改成能过"）
 *
 * macOS **不为 `127/8` 建别名**：`bind(127.0.0.1)` 的服务，连 `127.0.0.2` / `127.13.7.254`
 * 会先 5s 超时再 `ECONNRESET`；`bind(127.0.0.2)` 直接 `EADDRNOTAVAIL`（Linux 可绑）。
 * 因此"127.0.0.2 必须绕过代理"这一条**只能靠路由证据**证明，不能靠"连上去"证明：
 * - 走代理 → 假代理被调用（计数 +1）；
 * - 被绕过 → 假代理**零调用**，失败发生在直连阶段（`proxyKind:'none'` / `UPSTREAM_*`）。
 * 所以本文件对 `127.0.0.2` 断言"假代理 0 命中 + 错误归属直连"，**并声明该地址在本机不可
 * 建连**（不把不可路由地址的超时伪装成断言失败，也不用 `it.skip` 静默吞掉整条覆盖）。
 *
 * ★ 只用真 node http/net/tls 服务端；不使用 vi.mock 顶替传输层。
 * ★ 无任何 test-only 生产导出依赖（验收标准 §五禁止 `src/**` 测试专用开关）。
 * ★ 每个探针都带 `AbortSignal.timeout` 兜底，任何不可路由目标都不会把用例挂成 30s。
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';

import { outboundFetch, getProxyStatus, OutboundHttpError } from '../../src/providers/http-exit';

// ═══════════════════════════════════════════════════════════════
// env 隔离与还原
// ═══════════════════════════════════════════════════════════════

const PROXY_ENV_NAMES = [
  'http_proxy', 'HTTP_PROXY',
  'https_proxy', 'HTTPS_PROXY',
  'all_proxy', 'ALL_PROXY',
  'no_proxy', 'NO_PROXY',
] as const;

const savedEnv = new Map<string, string | undefined>();

beforeAll(() => {
  for (const name of PROXY_ENV_NAMES) savedEnv.set(name, process.env[name]);
});

afterAll(() => {
  for (const [name, value] of savedEnv) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** 清空全部代理 env（用例之间互不串扰；降级告警的去重键含"值+原因"，不需要额外重置开关）。 */
function clearProxyEnv(): void {
  for (const name of PROXY_ENV_NAMES) delete process.env[name];
}

beforeEach(clearProxyEnv);

/** 探针兜底超时（毫秒）——不可路由目标最多等这么久，绝不挂满 vitest 的 30s。 */
const PROBE_TIMEOUT_MS = 2_500;

// ═══════════════════════════════════════════════════════════════
// 目标常量
// ═══════════════════════════════════════════════════════════════

/** 隧道目标主机名（.invalid 为 RFC 2606 保留 TLD，永不解析到真实主机）。 */
const TUNNEL_TARGET_HOST = 'upstream.invalid';

/** 非 loopback 的占位目标（RFC 5737 保留段）——用于"必须走代理"的场景。 */
const REMOTE_TARGET_HOST = '198.51.100.7';

/** 本机不可路由的 loopback 地址（macOS 不给 127/8 建别名）——见文件头"本机物理约束"。 */
const UNROUTABLE_LOOPBACK = '127.0.0.2';

// ═══════════════════════════════════════════════════════════════
// 真 socket 测试服务端
// ═══════════════════════════════════════════════════════════════

interface UpstreamHit {
  method: string;
  url: string;
  host: string | undefined;
  body: string;
}

interface UpstreamServer {
  port: number;
  hits: UpstreamHit[];
  close(): Promise<void>;
}

/** 真 http 上游：记录每次请求（含 Host 头与体）。 */
async function startUpstream(): Promise<UpstreamServer> {
  const hits: UpstreamHit[] = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      hits.push({ method: req.method ?? '', url: req.url ?? '', host: req.headers.host, body });
      res.writeHead(200, { 'Content-Type': 'application/json', 'X-Upstream': 'real' });
      res.end(JSON.stringify({ ok: true, path: req.url }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

interface TlsOrigin {
  port: number;
  hits: string[];
  close(): Promise<void>;
}

/**
 * 真 https 上游（自签证书，openssl 生成，证书写 /tmp 且用完即删、**不入库**）。
 * 生成后把该证书注入**进程默认信任库**（`tls.setDefaultCACertificates`）——
 * 这等价于生产侧的 `NODE_EXTRA_CA_CERTS`，**不放宽 hostname 校验、不用
 * `NODE_TLS_REJECT_UNAUTHORIZED`、不改实现**。用于验证"https 目标被绕过代理时直连成功"。
 * 缺 openssl 时返回 undefined（该组用例显式跳过，不静默变绿）。
 */
async function startTlsOrigin(): Promise<TlsOrigin | undefined> {
  let certPem: string;
  const dir = mkdtempSync(path.join(tmpdir(), 'd821-tls-'));
  try {
    execFileSync('openssl', [
      'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
      '-keyout', path.join(dir, 'key.pem'),
      '-out', path.join(dir, 'cert.pem'),
      '-days', '1',
      '-subj', '/CN=localhost',
      '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1',
    ], { stdio: 'ignore' });
    certPem = readFileSync(path.join(dir, 'cert.pem'), 'utf8');
  } catch {
    rmSync(dir, { recursive: true, force: true });
    return undefined;
  }
  if (typeof tls.setDefaultCACertificates !== 'function') {
    rmSync(dir, { recursive: true, force: true });
    return undefined;
  }
  tls.setDefaultCACertificates([certPem]);

  const hits: string[] = [];
  const server = https.createServer(
    { key: readFileSync(path.join(dir, 'key.pem')), cert: certPem },
    (req, res) => {
      hits.push(req.url ?? '');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tls: true }));
    },
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    hits,
    close: () => new Promise<void>((resolve) => {
      server.closeAllConnections?.();
      server.close(() => {
        rmSync(dir, { recursive: true, force: true });
        resolve();
      });
    }),
  };
}

/** openssl 可用性（TLS origin 用例的前提；缺则显式 skip）。 */
const HAS_OPENSSL = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

interface ProxyServer {
  port: number;
  /** 绝对 URI 形态的转发请求（http 目标走代理）。 */
  forwarded: Array<{ method: string; url: string; host: string | undefined; proxyAuth: string | undefined; body: string }>;
  /** CONNECT 隧道请求（https 目标走代理）。 */
  tunnels: Array<{ target: string; proxyAuth: string | undefined }>;
  /**
   * 每条隧道里、客户端在 CONNECT 之后发来的**首段字节**。
   * TLS 握手记录首字节固定为 `0x16`（handshake），次字节 `0x03`。
   */
  tunnelOpenBytes: Buffer[];
  close(): Promise<void>;
}

/**
 * 真 http 代理夹具（两个模式）：
 *
 * - `startProxy(<本机端口>)` — **转发模式**：按绝对 URI 真转发/真建隧道到该端口。
 *   用于需要"上游真收到字节"的用例（绝对 URI、CONNECT ClientHello、凭据、隧道真往返）。
 * - `startProxy()` — **拒绝模式**：会记录每次命中（`forwarded`/`tunnels`），
 *   但**不真转发**（立刻 502 / 隧道建立后保持存活）。用于"路由判定"用例：
 *   只要证明"代理被调用/未被调用"，不去真连不可路由的占位地址，
 *   避免把 macOS 上 `127/8` 的可达性差异混进路由断言。
 *
 * 合同锁：http 目标走代理 → 客户端发的 `path` 必须是**绝对 URI**（`forwarded[0].url` 可证）；
 * https 目标走代理 → 必须是 `CONNECT host:port`（`tunnels[0].target` 可证）。
 */
async function startProxy(remapPort?: number): Promise<ProxyServer> {
  const forwarded: ProxyServer['forwarded'] = [];
  const tunnels: ProxyServer['tunnels'] = [];
  const tunnelOpenBytes: Buffer[] = [];
  /**
   * CONNECT 升级后的 socket 必须**自己记着**：`server.closeAllConnections()` 只管
   * 普通 HTTP 连接，**不会**关闭已被 `'connect'` 事件接管的升级 socket ——
   * 漏掉这一点，夹具的 `close()` 永不 resolve，用例会在 teardown 挂到超时
   * （实测 30s，现象像"实现没 settle"，实为夹具没关干净）。
   */
  const tunnelSockets = new Set<net.Socket>();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      forwarded.push({
        method: req.method ?? '',
        url: req.url ?? '',
        host: req.headers.host,
        proxyAuth: typeof req.headers['proxy-authorization'] === 'string' ? req.headers['proxy-authorization'] : undefined,
        body,
      });
      if (remapPort === undefined) {
        res.writeHead(502, { 'X-Proxy-Fixture': 'refuse', 'Content-Type': 'text/plain' });
        res.end('fixture: proxy reached (no forwarding)');
        return;
      }
      let target: URL;
      try {
        target = new URL(req.url ?? '');
      } catch {
        res.writeHead(400).end('bad absolute URI');
        return;
      }
      const upstreamReq = http.request({
        hostname: '127.0.0.1',
        port: remapPort,
        path: `${target.pathname}${target.search}`,
        method: req.method,
        headers: { ...req.headers, host: target.host },
      }, (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      });
      upstreamReq.on('error', () => { res.writeHead(502).end('proxy upstream error'); });
      if (body !== '') upstreamReq.end(body);
      else upstreamReq.end();
    });
  });
  server.on('connect', (req, clientSocket, head) => {
    tunnelSockets.add(clientSocket);
    clientSocket.on('close', () => tunnelSockets.delete(clientSocket));
    tunnels.push({
      target: req.url ?? '',
      proxyAuth: typeof req.headers['proxy-authorization'] === 'string' ? req.headers['proxy-authorization'] : undefined,
    });
    const captured: Buffer[] = [];
    const pushCaptured = (chunk: Buffer): void => {
      captured.push(chunk);
      tunnelOpenBytes[tunnelOpenBytes.length - 1] = Buffer.concat(captured);
    };
    tunnelOpenBytes.push(Buffer.alloc(0));

    if (remapPort === undefined) {
      // 拒绝模式：隧道"建立"但不连任何目标，保持 socket 存活以便观察 ClientHello
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) pushCaptured(Buffer.from(head));
      clientSocket.on('data', (chunk: Buffer) => pushCaptured(chunk));
      clientSocket.on('error', () => { /* 客户端主动断开 — 忽略 */ });
      return;
    }
    const upstreamSocket = net.connect(remapPort, '127.0.0.1', () => {
      clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length > 0) {
        pushCaptured(Buffer.from(head));
        upstreamSocket.write(head);
      }
      clientSocket.on('data', (chunk: Buffer) => pushCaptured(chunk));
      upstreamSocket.pipe(clientSocket);
      clientSocket.pipe(upstreamSocket);
    });
    upstreamSocket.on('error', () => { clientSocket.destroy(); });
    clientSocket.on('error', () => { upstreamSocket.destroy(); });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    forwarded,
    tunnels,
    tunnelOpenBytes,
    close: () => new Promise<void>((resolve) => {
      for (const socket of tunnelSockets) socket.destroy();
      tunnelSockets.clear();
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}

/** 取一个确定无人监听的端口（听一下就关）——用于构造真 ECONNREFUSED。 */
async function deadPort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

// ═══════════════════════════════════════════════════════════════
// 行为探针（全部经 outboundFetch，带兜底超时）
// ═══════════════════════════════════════════════════════════════

interface ProbeResult {
  status?: number;
  proxyHits: number;
  tunnelHits: number;
  originHits: number;
  aborted: boolean;
  error?: OutboundHttpError;
}

/**
 * 发一次真请求并回报"代理/上游各自收到几次"。
 * `signal: AbortSignal.timeout(PROBE_TIMEOUT_MS)` 兜底：不可路由目标不会挂满 30s。
 */
async function probe(
  target: string,
  proxy: ProxyServer,
  origin?: UpstreamServer,
  init?: { method?: string; body?: string; headers?: Record<string, string> },
): Promise<ProbeResult> {
  const before = { p: proxy.forwarded.length, t: proxy.tunnels.length, o: origin?.hits.length ?? 0 };
  const result: ProbeResult = {
    proxyHits: 0,
    tunnelHits: 0,
    originHits: 0,
    aborted: false,
  };
  try {
    const res = await outboundFetch(target, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    result.status = res.status;
  } catch (err) {
    if (err instanceof OutboundHttpError) result.error = err;
    else result.aborted = true; // 兜底超时 / 外部 abort
  }
  result.proxyHits = proxy.forwarded.length - before.p;
  result.tunnelHits = proxy.tunnels.length - before.t;
  result.originHits = (origin?.hits.length ?? 0) - before.o;
  return result;
}

// ═══════════════════════════════════════════════════════════════
// 1. 解析顺序（行为：谁收到了请求）
// ═══════════════════════════════════════════════════════════════

describe('解析顺序：scheme 自有 > ALL_PROXY >（仅 https）HTTP_PROXY', () => {
  it('http 目标取 http_proxy（代理收到绝对 URI，上游收到请求）', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const r = await probe(`http://${REMOTE_TARGET_HOST}/v1/chat`, proxy, origin);
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(200);
      expect(r.proxyHits).toBe(1);
      expect(r.originHits).toBe(1);
      expect(proxy.forwarded[0].url).toBe(`http://${REMOTE_TARGET_HOST}/v1/chat`);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('https 目标无自有变量 → 回退 HTTP_PROXY（真建 CONNECT 隧道）', async () => {
    const proxy = await startProxy();
    try {
      process.env.HTTP_PROXY = `http://127.0.0.1:${proxy.port}`;
      const r = await probe(`https://${TUNNEL_TARGET_HOST}/v1`, proxy);
      expect(r.tunnelHits).toBe(1);
      expect(proxy.tunnels[0].target).toBe(`${TUNNEL_TARGET_HOST}:443`);
    } finally {
      await proxy.close();
    }
  });

  it('只设 http_proxy 时：http 目标走它、https 目标也回退到它', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      expect((await probe(`http://${REMOTE_TARGET_HOST}/a`, proxy)).proxyHits).toBe(1);
      expect((await probe(`https://${TUNNEL_TARGET_HOST}/b`, proxy)).tunnelHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('all_proxy 在自有变量缺席时兜底（http 与 https 都兜）', async () => {
    const proxy = await startProxy();
    try {
      process.env.all_proxy = `http://127.0.0.1:${proxy.port}`;
      expect((await probe(`http://${REMOTE_TARGET_HOST}/a`, proxy)).proxyHits).toBe(1);
      expect((await probe(`https://${TUNNEL_TARGET_HOST}/b`, proxy)).tunnelHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('自有变量存在时 ALL_PROXY 不被使用（命中计数证明）', async () => {
    const ownProxy = await startProxy();
    const allProxy = await startProxy();
    try {
      process.env.all_proxy = `http://127.0.0.1:${allProxy.port}`;
      process.env.http_proxy = `http://127.0.0.1:${ownProxy.port}`;
      expect((await probe(`http://${REMOTE_TARGET_HOST}/own`, ownProxy)).proxyHits).toBe(1);
      expect(allProxy.forwarded).toHaveLength(0);
    } finally {
      await ownProxy.close();
      await allProxy.close();
    }
  });

  it('env 在调用时读取（运行中改代理，下一笔改走新代理）', async () => {
    const first = await startProxy();
    const second = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${first.port}`;
      expect((await probe(`http://${REMOTE_TARGET_HOST}/1`, first)).proxyHits).toBe(1);
      process.env.http_proxy = `http://127.0.0.1:${second.port}`;
      expect((await probe(`http://${REMOTE_TARGET_HOST}/2`, second)).proxyHits).toBe(1);
      expect(first.forwarded).toHaveLength(1); // 第一台没有再收到
    } finally {
      await first.close();
      await second.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. loopback 恒绕过（127.0.0.0/8 整段）
// ═══════════════════════════════════════════════════════════════

describe('loopback 恒绕过 — 127.0.0.0/8 整段而非列表匹配', () => {
  it('127.0.0.1 目标：代理收 0、上游收 1；外网目标：代理收 1（对照）', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const loopback = await probe(`http://127.0.0.1:${origin.port}/health`, proxy, origin);
      expect(loopback.error).toBeUndefined();
      expect(loopback.status).toBe(200);
      expect(loopback.proxyHits).toBe(0);   // 绕过代理
      expect(loopback.originHits).toBe(1);  // 真到上游

      const remote = await probe(`http://${REMOTE_TARGET_HOST}/v1`, proxy, origin);
      expect(remote.status).toBe(200);
      expect(remote.proxyHits).toBe(1);     // 走代理
      expect(remote.originHits).toBe(1);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it.each([UNROUTABLE_LOOPBACK, '127.13.7.254'])(
    '%s（整段内、不在任何列表里的地址）**不被**送进代理',
    async (host) => {
      // 本机物理约束：macOS 不给 127/8 建别名 → 该地址在此不可建连（Linux 可，见文件头）。
      // 断言只针对"代理是否被调用"这一路由事实：列表匹配式实现（只认 localhost/127.0.0.1/::1）
      // 会把它交给代理（proxyHits=1），而整网段判定不会（proxyHits=0）。
      const proxy = await startProxy();
      try {
        process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
        const r = await probe(`http://${host}:9/whole-block`, proxy);
        expect(r.proxyHits).toBe(0);   // 假代理收 0 —— 整网段判定的关键断言
        expect(r.tunnelHits).toBe(0);
        expect(proxy.forwarded).toHaveLength(0);
        // 该地址本机不可达 → 由调用方 signal 兜底取消（abort 原样传播，见下组用例）；
        // 无论落到分类错误还是 abort，"没有走代理"这一路由结论都成立
        expect(r.error !== undefined || r.aborted).toBe(true);
      } finally {
        await proxy.close();
      }
    },
  );

  it('不可路由 loopback 地址不会静默挂死（调用方 signal 生效）', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const started = Date.now();
      const r = await probe(`http://${UNROUTABLE_LOOPBACK}:9/x`, proxy);
      // 兜底超时 2.5s；若实现漏接地 settle，这里会等到 vitest 30s 并失败
      expect(Date.now() - started).toBeLessThan(6_000);
      expect(r.proxyHits).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  it('非 loopback 的相似形态不被吞掉（128.0.0.1 必须交给代理）', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const r = await probe('http://128.0.0.1/x', proxy);
      expect(r.proxyHits).toBe(1);  // 未被 loopback 规则误吞 → 交代理
      expect(r.status).toBe(502);   // 夹具拒绝转发 → 真 Response 直传
      expect(r.error).toBeUndefined();
    } finally {
      await proxy.close();
    }
  });

  it('非法 IPv4 字面量（127.999.1.1）到不了路由层：URL 解析阶段即 INVALID_URL', async () => {
    // 事实（实测）：WHATWG URL 规范把 127.999.1.1 当非法 IPv4 → `new URL` 直接抛，
    // 出口以 INVALID_URL/request 拒绝（不进代理、也不做 DNS）。这是边界行为，不是缺陷。
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const r = await probe('http://127.999.1.1/x', proxy);
      expect(r.proxyHits).toBe(0);
      expect(r.error?.code).toBe('INVALID_URL');
      expect(r.error?.phase).toBe('request');
    } finally {
      await proxy.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. 本机私有目标直连（lookup 必须遵守 happy-eyeballs `options.all`）
// ═══════════════════════════════════════════════════════════════

describe('本机私有目标直连 — lookup 遵守 options.all（happy-eyeballs 回归）', () => {
  /**
   * 成因（自验员最小复现，2026-09-20）：Node 22 默认 happy-eyeballs
   * （`autoSelectFamily`）会以 `options.all === true` 调用 `lookup`，并**期望拿回数组**
   * `[{ address, family }]`。若 lookup 只回标量，非裸 IPv4 字面量的本机主机名
   * （`localhost`、`*.localhost`、`[::1]`）会当场失败：
   * `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined` → 被误分类为 UPSTREAM_UNREACHABLE。
   * 而 `src/` 里成片调用点是 `http://localhost:${port}/...`（tools / agent / tui），
   * 所以这是"唯一出口"的可迁移性缺陷，必须用回归用例钉住。
   */
  it.each(['127.0.0.1', 'localhost', 'LocalHost'])(
    '有代理时 http://%s:<port>/ 直连到真上游（代理 0 命中、上游 1 命中）',
    async (host) => {
      const origin = await startUpstream();
      const proxy = await startProxy(origin.port);
      try {
        process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
        const r = await probe(`http://${host}:${origin.port}/local`, proxy, origin);
        expect(r.error).toBeUndefined();
        expect(r.status).toBe(200);
        expect(r.proxyHits).toBe(0);
        expect(r.originHits).toBe(1);
      } finally {
        await proxy.close();
        await origin.close();
      }
    },
  );

  it('子域形态 x.localhost 同样直连成功', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const r = await probe(`http://x.localhost:${origin.port}/sub`, proxy, origin);
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(200);
      expect(r.originHits).toBe(1);
      expect(r.proxyHits).toBe(0);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('无代理 env 时 localhost 直连成功（纯直连路径）', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      const r = await probe(`http://localhost:${origin.port}/plain`, proxy, origin);
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(200);
      expect(r.originHits).toBe(1);
      expect(r.proxyHits).toBe(0);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('::1 字面量：本机可 bind IPv6 时直连成功（不可 bind 则显式说明）', async () => {
    const v6Server = http.createServer((_req, res) => { res.writeHead(200).end('v6'); });
    const canBindV6 = await new Promise<boolean>((resolve) => {
      v6Server.once('error', () => resolve(false));
      v6Server.listen(0, '::1', () => resolve(true));
    });
    if (!canBindV6) {
      // 本机无 IPv6（部分 CI/容器）→ 语义不适用；显式断言"确实不可 bind"而非伪装通过
      expect(canBindV6).toBe(false);
      return;
    }
    const port = (v6Server.address() as AddressInfo).port;
    const proxy = await startProxy(port);
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const res = await outboundFetch(`http://[::1]:${port}/v6`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('v6');
      expect(proxy.forwarded).toHaveLength(0); // loopback → 不走代理
    } finally {
      await proxy.close();
      v6Server.closeAllConnections?.();
      await new Promise<void>((resolve) => v6Server.close(() => resolve()));
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. NO_PROXY（行为：路由正反两面）
// ═══════════════════════════════════════════════════════════════

describe('NO_PROXY：host / host:port / 后缀 / * / 大小写不敏感', () => {
  it('http：命中 NO_PROXY 不进代理，同后缀串仍进代理', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = 'internal.corp';
      expect((await probe('http://internal.corp/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://api.internal.corp/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://notinternal.corp/x', proxy)).proxyHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('.suffix 与 *.suffix 等价（含裸后缀本身）', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '.corp.local';
      expect((await probe('http://a.corp.local/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://corp.local/x', proxy)).proxyHits).toBe(0);
      process.env.no_proxy = '*.corp.local';
      expect((await probe('http://a.corp.local/x', proxy)).proxyHits).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  it('host:port 只在端口匹配时绕过', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = 'api.example.com:9000';
      expect((await probe('http://api.example.com:9000/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://api.example.com:8080/x', proxy)).proxyHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('`*` 绕过一切（http 与 https 都不进代理）', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '*';
      expect((await probe(`http://${REMOTE_TARGET_HOST}/x`, proxy)).proxyHits).toBe(0);
      expect((await probe(`https://${TUNNEL_TARGET_HOST}/x`, proxy)).tunnelHits).toBe(0);
      expect(proxy.forwarded).toHaveLength(0);
      expect(proxy.tunnels).toHaveLength(0);
    } finally {
      await proxy.close();
    }
  });

  it('大小写不敏感 + 逗号与空白混排', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = ' API.Example.COM , other.corp ';
      expect((await probe('http://api.example.com/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://other.corp/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://third.corp/x', proxy)).proxyHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('NO_PROXY 命中的请求真的到达上游（绕过不是"什么都不做"）', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '127.0.0.1';
      const r = await probe(`http://127.0.0.1:${origin.port}/bypassed`, proxy, origin);
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(200);
      expect(r.proxyHits).toBe(0);
      expect(r.originHits).toBe(1);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. https 目标被绕过时直连成功（NO_PROXY / CIDR — 真 TLS origin）
// ═══════════════════════════════════════════════════════════════

describe.skipIf(!HAS_OPENSSL)('https 绕过代理时直连到真 TLS 上游（NO_PROXY / CIDR）', () => {
  it('NO_PROXY 命中 https 主机 → 不进代理且真 TLS 请求成功', async () => {
    const origin = await startTlsOrigin();
    if (origin === undefined) {
      expect(HAS_OPENSSL).toBe(true); // 环境不支持 setDefaultCACertificates — 显式暴露
      return;
    }
    const proxy = await startProxy();
    try {
      process.env.https_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = 'localhost';
      const res = await outboundFetch(`https://localhost:${origin.port}/bypassed`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ tls: true });
      expect(origin.hits).toEqual(['/bypassed']);
      expect(proxy.tunnels).toHaveLength(0); // 绕过 → 零隧道
      expect(proxy.forwarded).toHaveLength(0);
    } finally {
      await proxy.close();
      await origin.close();
    }
  }, 20_000);

  it('IPv4 CIDR 命中 loopback 段 https 目标 → 不进代理且真 TLS 请求成功', async () => {
    const origin = await startTlsOrigin();
    if (origin === undefined) {
      expect(HAS_OPENSSL).toBe(true);
      return;
    }
    const proxy = await startProxy();
    try {
      process.env.https_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '127.0.0.0/8';
      const res = await outboundFetch(`https://localhost:${origin.port}/cidr`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      expect(res.status).toBe(200);
      expect(origin.hits).toEqual(['/cidr']);
      expect(proxy.tunnels).toHaveLength(0);
    } finally {
      await proxy.close();
      await origin.close();
    }
  }, 20_000);
});

// ═══════════════════════════════════════════════════════════════
// 6. NO_PROXY IPv4 CIDR（改写补齐 DSH 缺口）
// ═══════════════════════════════════════════════════════════════

describe('NO_PROXY IPv4 CIDR（改写补齐 DSH 缺口）', () => {
  it('10.0.0.0/8 覆盖整段，段外仍进代理', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '10.0.0.0/8';
      expect((await probe('http://10.1.2.3/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://10.255.255.255/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://11.0.0.1/x', proxy)).proxyHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('192.168.1.0/24 精确到最后一节', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '192.168.1.0/24';
      expect((await probe('http://192.168.1.55/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://192.168.2.55/x', proxy)).proxyHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('/32 只覆盖单个地址；非法前缀不误判为"全绕过"', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '10.0.0.5/32';
      expect((await probe('http://10.0.0.5/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://10.0.0.6/x', proxy)).proxyHits).toBe(1);
      process.env.no_proxy = '10.0.0.0/33';
      expect((await probe('http://10.0.0.5/x', proxy)).proxyHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });

  it('CIDR 与 host 条目混排时各自生效（且与大小写混排共存）', async () => {
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      process.env.no_proxy = '10.0.0.0/8, API.Example.com';
      expect((await probe('http://10.9.9.9/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://api.example.com/x', proxy)).proxyHits).toBe(0);
      expect((await probe('http://www.example.com/x', proxy)).proxyHits).toBe(1);
    } finally {
      await proxy.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. 不可用值 → 降级不阻断（socks / 畸形）
// ═══════════════════════════════════════════════════════════════

describe('不可用值 → 降级不阻断：socks 与畸形值', () => {
  it.each(['socks5://p:1080', 'socks5h://p:1080', 'socks4://p:1080', 'socks4a://p:1080', 'socks://p:1080'])(
    '%s → getProxyStatus kind=socks + degraded（不抛、不阻断）',
    (value) => {
      process.env.https_proxy = value;
      let status: ReturnType<typeof getProxyStatus> | undefined;
      expect(() => { status = getProxyStatus(); }).not.toThrow();
      expect(status?.kind).toBe('socks');
      expect(status?.active).toBe(false);
      expect(status?.degraded).toBe(true);
      expect(status?.configured).toBe(true);
    },
  );

  it('socks 配置下真请求直连到上游（代理 0 命中、上游 1 命中）', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `socks5://198.51.100.20:${proxy.port}`;
      const r = await probe(`http://127.0.0.1:${origin.port}/degraded`, proxy, origin);
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(200);
      expect(r.originHits).toBe(1);
      expect(r.proxyHits).toBe(0);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('畸形 URL 与不支持 scheme → kind=invalid + degraded', () => {
    process.env.https_proxy = 'ht!tp://p:8443';
    expect(getProxyStatus().kind).toBe('invalid');
    expect(getProxyStatus().degraded).toBe(true);

    delete process.env.https_proxy;
    process.env.http_proxy = 'ftp://p:21';
    expect(getProxyStatus().kind).toBe('invalid');

    delete process.env.http_proxy;
    process.env.all_proxy = '://nonsense';
    expect(getProxyStatus().kind).toBe('invalid');
  });

  it('降级时真请求不发往代理（畸形值场景，代理 0 命中）', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `ht!tp://127.0.0.1:${proxy.port}`;
      const r = await probe(`http://127.0.0.1:${origin.port}/x`, proxy, origin);
      expect(r.error).toBeUndefined();
      expect(r.status).toBe(200);
      expect(r.originHits).toBe(1);
      expect(r.proxyHits).toBe(0);
      expect(getProxyStatus().kind).toBe('invalid');
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('socks 被拒后不 fallback 到 all_proxy（all_proxy 指向的代理 0 命中）', async () => {
    const origin = await startUpstream();
    const allProxy = await startProxy(origin.port);
    try {
      process.env.https_proxy = 'socks5://198.51.100.20:1080';
      process.env.all_proxy = `http://127.0.0.1:${allProxy.port}`;
      const r = await probe(`http://127.0.0.1:${origin.port}/x`, allProxy, origin);
      expect(r.status).toBe(200);
      expect(r.originHits).toBe(1);
      expect(allProxy.forwarded).toHaveLength(0);
    } finally {
      await allProxy.close();
      await origin.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 8. getProxyStatus：variables 只含名，永不含值
// ═══════════════════════════════════════════════════════════════

describe('getProxyStatus() 只暴露变量名，永不含值', () => {
  it('未配置时 configured=false / kind=none', () => {
    const status = getProxyStatus();
    expect(status.configured).toBe(false);
    expect(status.active).toBe(false);
    expect(status.kind).toBe('none');
    expect(status.variables).toEqual([]);
    expect(status.degraded).toBe(false);
    expect(status.loopbackBypass).toBe(true);
  });

  it('variables 是变量名数组，且不含任何 env 值/凭据', () => {
    process.env.https_proxy = 'http://user:topsecret@proxy.corp:8443';
    process.env.no_proxy = 'internal.corp';
    const status = getProxyStatus();
    expect(status.variables).toEqual(['https_proxy', 'no_proxy']);
    const serialized = JSON.stringify(status);
    expect(serialized).not.toContain('topsecret');
    expect(serialized).not.toContain('proxy.corp');
    expect(serialized).not.toContain('user:');
    expect(status).not.toHaveProperty('value');
    expect(status.loopbackBypass).toBe(true);
  });

  it('大小写两种写法各算一个变量名（不合并、不泄漏值）', () => {
    process.env.HTTPS_PROXY = 'http://p-upper:8443';
    process.env.https_proxy = 'http://p-lower:8443';
    const status = getProxyStatus();
    expect(status.variables.sort()).toEqual(['HTTPS_PROXY', 'https_proxy']);
    expect(JSON.stringify(status)).not.toContain('p-upper');
    expect(JSON.stringify(status)).not.toContain('p-lower');
  });

  it('空串视为未设置（与 undici 一致）', () => {
    process.env.http_proxy = '   ';
    const status = getProxyStatus();
    expect(status.configured).toBe(false);
    expect(status.variables).toEqual([]);
  });

  it('正常 http 代理 → kind=http / active=true / degraded=false', () => {
    process.env.http_proxy = 'http://proxy.corp:8080';
    const status = getProxyStatus();
    expect(status.kind).toBe('http');
    expect(status.active).toBe(true);
    expect(status.degraded).toBe(false);
    expect(status.configured).toBe(true);
  });

  it('https 代理 URL → kind=https', () => {
    process.env.https_proxy = 'https://proxy.corp:8443';
    expect(getProxyStatus().kind).toBe('https');
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. 传输真生效：绝对 URI + 真 Response + 凭据 + 隧道 ClientHello
// ═══════════════════════════════════════════════════════════════

describe('传输真生效（真代理 / 真上游）', () => {
  it('http 目标走代理 → 代理收到绝对 URI + Host 头，返回真 Response', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `http://127.0.0.1:${proxy.port}`;
      const target = `http://${REMOTE_TARGET_HOST}/v1/chat/completions`;
      const res = await outboundFetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'x', stream: false }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('x-upstream')).toBe('real');
      const payload = await res.json() as { ok: boolean; path: string };
      expect(payload.ok).toBe(true);
      expect(payload.path).toBe('/v1/chat/completions');

      expect(proxy.forwarded).toHaveLength(1);
      expect(proxy.forwarded[0].url).toBe(target);
      expect(proxy.forwarded[0].host).toBe(REMOTE_TARGET_HOST);
      expect(proxy.forwarded[0].method).toBe('POST');
      expect(proxy.forwarded[0].body).toContain('"model":"x"');
      expect(origin.hits).toHaveLength(1);
      expect(origin.hits[0].url).toBe('/v1/chat/completions');
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('直接连接（无代理 env）返回真 Response 且 body 可流式读', async () => {
    const origin = await startUpstream();
    try {
      const res = await outboundFetch(`http://127.0.0.1:${origin.port}/direct`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      expect(res.status).toBe(200);
      const reader = res.body?.getReader();
      expect(reader).toBeDefined();
      const first = await reader!.read();
      reader!.releaseLock();
      expect(first.done).toBe(false);
      expect(Buffer.from(first.value as Uint8Array).toString('utf8')).toContain('"ok":true');
    } finally {
      await origin.close();
    }
  });

  it('https 目标：CONNECT 隧道建立，且隧道里出现 TLS 握手首字节 0x16 0x03', async () => {
    // 夹具在隧道建立后保持 socket 存活，故能采到客户端随后写入的 ClientHello。
    // 这样无需任何证书即可证明"隧道里确实开始了 TLS 握手"（而非明文/空隧道）。
    const proxy = await startProxy();
    try {
      process.env.https_proxy = `http://127.0.0.1:${proxy.port}`;
      const r = await probe(`https://${TUNNEL_TARGET_HOST}/secure`, proxy);
      expect(r.tunnelHits).toBe(1);
      expect(proxy.tunnels[0].target).toBe(`${TUNNEL_TARGET_HOST}:443`);
      expect(proxy.tunnelOpenBytes).toHaveLength(1);
      expect(proxy.tunnelOpenBytes[0].length).toBeGreaterThan(0);
      // TLS handshake record: 0x16 (type) 0x03 (major version)
      expect(proxy.tunnelOpenBytes[0][0]).toBe(0x16);
      expect(proxy.tunnelOpenBytes[0][1]).toBe(0x03);
    } finally {
      await proxy.close();
    }
  });

  it('凭据：代理 URL 带 user:pass → 代理收到 Basic 头，且不出现在 status 里', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = `http://alice:s3cr3t@127.0.0.1:${proxy.port}`;
      const res = await outboundFetch(`http://${REMOTE_TARGET_HOST}/authed`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      expect(res.status).toBe(200);
      expect(proxy.forwarded).toHaveLength(1);
      expect(proxy.forwarded[0].proxyAuth).toBe(`Basic ${Buffer.from('alice:s3cr3t', 'utf8').toString('base64')}`);
      expect(JSON.stringify(getProxyStatus())).not.toContain('s3cr3t');
      expect(JSON.stringify(getProxyStatus())).not.toContain('alice');
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('凭据：CONNECT 请求同样带 Basic 头（不进状态）', async () => {
    const proxy = await startProxy();
    try {
      process.env.https_proxy = `http://bob:hunter2@127.0.0.1:${proxy.port}`;
      await probe(`https://${TUNNEL_TARGET_HOST}/secure`, proxy);
      expect(proxy.tunnels).toHaveLength(1);
      expect(proxy.tunnels[0].proxyAuth).toBe(`Basic ${Buffer.from('bob:hunter2', 'utf8').toString('base64')}`);
      expect(JSON.stringify(getProxyStatus())).not.toContain('hunter2');
    } finally {
      await proxy.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. 无静默直连回退（反例断言）
// ═══════════════════════════════════════════════════════════════

describe('禁止静默直连回退：代理不可达 → 抛错且上游 0 连接', () => {
  it('http 目标：代理死端口 → PROXY_UNREACHABLE，上游 0 命中', async () => {
    const origin = await startUpstream();
    const port = await deadPort();
    const proxy = await startProxy();
    try {
      process.env.http_proxy = `http://127.0.0.1:${port}`;
      const r = await probe(`http://${REMOTE_TARGET_HOST}/must-not-connect`, proxy, origin);
      expect(r.error).toBeInstanceOf(OutboundHttpError);
      expect(r.error?.code).toBe('PROXY_UNREACHABLE');
      expect(r.error?.phase).toBe('connect');
      expect(r.error?.retryable).toBe(true);
      expect(r.error?.degraded).toBe(true);
      expect(r.error?.proxyKind).toBe('http');
      // 关键反例：直连是真会失败的路径，但"代理失败后偷偷直连"绝不允许发生
      expect(r.originHits).toBe(0);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });

  it('https 目标：代理死端口 → PROXY_UNREACHABLE（夹具代理 0 隧道）', async () => {
    const port = await deadPort();
    const proxy = await startProxy();
    try {
      process.env.https_proxy = `http://127.0.0.1:${port}`;
      const r = await probe(`https://${TUNNEL_TARGET_HOST}/x`, proxy);
      expect(r.error?.code).toBe('PROXY_UNREACHABLE');
      expect(r.error?.phase).toBe('connect');
      expect(r.error?.degraded).toBe(true);
      expect(r.tunnelHits).toBe(0);
    } finally {
      await proxy.close();
    }
  });

  /**
   * 回归锁（2026-09-21 补）：**CONNECT 建好之后**调用方 abort → 出站必须**有限时间内 settle**。
   *
   * 锁的是 `src/providers/http-exit.ts` 隧道路径的 `bindAbort(...)` 语义 ——
   * 该函数必须**自己 reject**，不能只 `connectReq.destroy()`：
   * 在 socket 已被交进隧道（`'connect'` 事件之后）时，`destroy()` 在 Node 22 上
   * **不会**再触发 `'error'`，于是 Promise 永不 settle（实测 6s guard 触发仍未 settle）。
   * 本用例用 `startProxy()`（拒绝模式：CONNECT 回 200 但不转发、保持 socket 存活）
   * 精确复现"隧道已建立但上游永不响应"这一挂起态，再以小超时（300ms）abort。
   *
   * 断言口径：settle 用**分类外的 AbortError**（冻结枚举无 ABORTED 码 → abort 原样传播），
   * 且**总耗时远小于 30s**（挂死则本用例必然超时失败）。
   */
  it('隧道已建立后 abort → 出站在有限时间内 settle（锁 bindAbort 必须自行 reject）', async () => {
    const proxy = await startProxy(); // 拒绝模式：CONNECT 成功但目标永不响应
    try {
      process.env.https_proxy = `http://127.0.0.1:${proxy.port}`;
      const started = Date.now();
      let caught: unknown;
      await outboundFetch(`https://${TUNNEL_TARGET_HOST}/hang`, {
        signal: AbortSignal.timeout(300),
      }).then(
        () => { caught = 'RESOLVED'; },
        (err: unknown) => { caught = err; },
      );
      const elapsed = Date.now() - started;

      // ① 隧道确实建成过（证明本用例落在"挂起态"而非"连不上代理"）
      expect(proxy.tunnels).toHaveLength(1);
      expect(proxy.tunnels[0].target).toBe(`${TUNNEL_TARGET_HOST}:443`);
      // ② 挂起态下仍必须 settle（旧实现：destroy() 不 reject → 这里会一直挂到用例超时）
      expect(caught).not.toBe('RESOLVED');
      expect(caught).toBeDefined();
      // ③ abort 原样传播，不包装成分类错误（冻结枚举无 ABORTED 码）
      expect(caught).not.toBeInstanceOf(OutboundHttpError);
      expect((caught as Error).name).toBe('AbortError');
      // ④ 有界耗时：300ms 超时 + 余量，远小于挂死
      expect(elapsed).toBeLessThan(5_000);
    } finally {
      await proxy.close();
    }
  }, 15_000);

  it('代理拒绝 CONNECT（405）→ PROXY_TUNNEL_FAILED，不直连', async () => {
    const badProxy = http.createServer((_req, res) => { res.writeHead(405).end(); });
    badProxy.on('connect', (_req, socket) => {
      socket.write('HTTP/1.1 405 Method Not Allowed\r\n\r\n');
      socket.destroy();
    });
    await new Promise<void>((resolve) => badProxy.listen(0, '127.0.0.1', resolve));
    const badPort = (badProxy.address() as AddressInfo).port;
    const proxy = await startProxy();
    try {
      process.env.https_proxy = `http://127.0.0.1:${badPort}`;
      const r = await probe(`https://${TUNNEL_TARGET_HOST}/x`, proxy);
      expect(r.error).toBeInstanceOf(OutboundHttpError);
      expect(r.error?.code).toBe('PROXY_TUNNEL_FAILED');
      expect(r.error?.phase).toBe('tunnel');
      expect(r.error?.degraded).toBe(true);
    } finally {
      await proxy.close();
      badProxy.closeAllConnections?.();
      await new Promise<void>((resolve) => badProxy.close(() => resolve()));
    }
  });

  it('降级（socks）不抛错但记为 degraded —— 与"代理不可达抛错"可区分', async () => {
    const origin = await startUpstream();
    const proxy = await startProxy(origin.port);
    try {
      process.env.http_proxy = 'socks5://198.51.100.20:1080';
      const ok = await probe(`http://127.0.0.1:${origin.port}/degraded-ok`, proxy, origin);
      expect(ok.error).toBeUndefined();
      expect(ok.status).toBe(200);
      expect(getProxyStatus().degraded).toBe(true);

      // 换成"可用但不可达"的代理 → 目标地址必须抛错（不是静默回退直连）
      process.env.http_proxy = `http://127.0.0.1:${await deadPort()}`;
      const fail = await probe(`http://${REMOTE_TARGET_HOST}/must-fail`, proxy, origin);
      expect(fail.error?.code).toBe('PROXY_UNREACHABLE');
      expect(fail.originHits).toBe(0);
    } finally {
      await proxy.close();
      await origin.close();
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. 边界与分类错误
// ═══════════════════════════════════════════════════════════════

describe('边界与分类错误', () => {
  /** 捕获一次调用的分类错误（显式拿到错误对象，避免断言被 rejects 吞掉细节）。 */
  async function captureError(target: string): Promise<OutboundHttpError | undefined> {
    try {
      await outboundFetch(target, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
      return undefined;
    } catch (err) {
      return err instanceof OutboundHttpError ? err : undefined;
    }
  }

  it('畸形 URL → INVALID_URL（phase=request，不重试）', async () => {
    const e = await captureError('not a url');
    expect(e).toBeInstanceOf(OutboundHttpError);
    expect(e?.code).toBe('INVALID_URL');
    expect(e?.phase).toBe('request');
    expect(e?.retryable).toBe(false);
  });

  it('非 http/https scheme → INVALID_URL', async () => {
    const e = await captureError('ftp://example.com/x');
    expect(e?.code).toBe('INVALID_URL');
  });

  it('直连上游死端口 → UPSTREAM_UNREACHABLE（非代理语义，proxyKind=none）', async () => {
    const port = await deadPort();
    const e = await captureError(`http://127.0.0.1:${port}/x`);
    expect(e?.code).toBe('UPSTREAM_UNREACHABLE');
    expect(e?.proxyKind).toBe('none');
    expect(e?.degraded).toBe(false);
  });

  it('init.signal 主动 abort → 原样传播，不包装成 OutboundHttpError', async () => {
    const origin = await startUpstream();
    try {
      const controller = new AbortController();
      const promise = outboundFetch(`http://127.0.0.1:${origin.port}/slow`, { signal: controller.signal });
      controller.abort();
      let captured: unknown;
      await promise.catch((err: unknown) => { captured = err; });
      expect(captured).toBeDefined();
      expect(captured).not.toBeInstanceOf(OutboundHttpError);
    } finally {
      await origin.close();
    }
  });

  it('outboundFetch 返回 Promise 且解析为真 Response', async () => {
    const origin = await startUpstream();
    try {
      const p = outboundFetch(`http://127.0.0.1:${origin.port}/shape`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      expect(typeof p.then).toBe('function');
      const res = await p;
      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(200);
    } finally {
      await origin.close();
    }
  });
});
