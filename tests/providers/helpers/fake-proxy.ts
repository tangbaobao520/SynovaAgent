/**
 * tests/providers/helpers/fake-proxy.ts — D821 假代理桩（HTTP 代理 + CONNECT 隧道）
 *
 * 角色：一个**真实监听 127.0.0.1 的 HTTP 代理**，服务于「穿真实入口」的出站代理验收
 * （`docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md` §六「代理类」样板：
 * 在只允许代理出网的环境跑一次真实 LLM 调用 → 断言成功**且直连会失败**）。
 *
 * 它替换的不是管线——被替换的只有「企业内网代理 + 不可解析的私有域名」这一外部条件：
 *   客户端（真实 provider.chat → 真实 outboundFetch）→ **本桩** → 本地 origin（真实 HTTP 上游）。
 *
 * 契约（铁律 47）:
 * @input  — FakeProxyOptions
 *            · mode?: 'forward' | 'bad-gateway' | 'hang'
 *                forward     = 正常转发（默认）
 *                bad-gateway = 对每个请求直接回 `HTTP/1.1 502 Bad Gateway`（模拟代理侧故障）
 *                hang        = 收到请求**不响应**、保持连接（模拟代理挂起 → 调用方超时）
 *            · targets?: Record<string, ProxyTarget>
 *                目标改写表。键 = `host`（按主机名命中，忽略端口）或 `host:port`（精确命中）；
 *                值 = 真实可达地址（通常是 `{ host: '127.0.0.1', port: <originPort> }`）。
 *                用途：把**不可解析**的伪造主机名（如 `llm-intranet.invalid`）落到本地 origin。
 *            · defaultTarget?: ProxyTarget
 *                未命中 targets 时的兜底转发目标（缺省 = 不兜底 → 502，避免静默连到别处）
 *            · logFile?: string
 *                请求行到达时**逐行追加**写盘（UTF-8，每行一条原始请求行）
 * @output — Promise<FakeProxy>
 *            · url: `http://127.0.0.1:<port>` —— 直接喂 `HTTP_PROXY` / `HTTPS_PROXY`
 *            · port: number
 *            · entries: ProxyEntry[] —— 实时引用（按到达顺序）
 *            · rawLines(): string[] —— **逐字节**原始请求行
 *              （`CONNECT llm-intranet.invalid:1234 HTTP/1.1` / `GET http://llm-intranet.invalid:1234/v1/models HTTP/1.1`）
 *            · connectLines(): string[] —— 仅 CONNECT 的原始请求行
 *            · hasConnect(): boolean
 *            · forwardedCount: number —— 已完成转发的条数
 *            · writeRawLinesToFile(path): Promise<void> —— 把内存日志整段落盘
 *            · close(): Promise<void> —— 关闭监听 + 销毁在途连接（**调用方 afterAll 必须调**，否则 vitest 句柄不释放）
 * @degraded — 目标不可达 / 目标未配置 / 绝对 URI 非法 → 502 + `entry.error` + `log.warn(degraded:true)`
 *             （**不静默**、不伪装成功，铁律 24/31）；挂起模式显式 `proxyStatusLine = null`
 * @error   — 监听绑定失败 → 抛（调用方 beforeAll 失败即测试失败）；close() 失败 → log.warn + reject
 * @side    — `rawLine` 用 latin1 解码（1 字节 ↔ 1 字符，逐字节可复原）；
 *             `rawHead` 中 `authorization` / `proxy-authorization` 头部值写为 `<redacted>`（永不落凭据原文）
 * @boundary— CONNECT 是**字节透传**（不终止 TLS）：本桩的职责是记录 CONNECT 原始行并把隧道字节送到
 *             改写后的目标。若目标不是 TLS 服务，隧道内的 TLS 握手由客户端侧自行失败——那是客户端的判定，
 *             不是本桩的职责（本桩对 CONNECT 的断言面 = 原始行 + 隧道字节到达目标）。
 */
import { createServer as createNetServer, connect as netConnect, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';
import { appendFile, writeFile } from 'node:fs/promises';
import { createLogger } from '@synova/logger';

const log = createLogger('tests/fake-proxy');

/** 转发目标（真实可达地址） */
export interface ProxyTarget {
  host: string;
  port: number;
}

/** 桩行为模式 */
export type FakeProxyMode = 'forward' | 'bad-gateway' | 'hang';

export interface FakeProxyOptions {
  mode?: FakeProxyMode;
  /** 目标改写表：键 = `host` 或 `host:port`，值 = 真实可达地址 */
  targets?: Record<string, ProxyTarget>;
  /** 未命中 targets 时的兜底目标（缺省不兜底 → 502） */
  defaultTarget?: ProxyTarget;
  /** 请求行逐行追加落盘的文件路径 */
  logFile?: string;
}

/** 一条到达的代理请求（记录面；不含请求体内容、不含凭据原文） */
export interface ProxyEntry {
  /** 1-based 到达序号 */
  index: number;
  /** 逐字节原始请求行（latin1 解码，不含 CRLF） */
  rawLine: string;
  /** 原始头部块（latin1 解码；凭据头部值已脱敏为 `<redacted>`） */
  rawHead: string;
  method: string;
  /** 绝对 URI（非 CONNECT）或 `host:port`（CONNECT） */
  target: string;
  httpVersion: string;
  /** 是否 CONNECT 隧道请求 */
  isConnect: boolean;
  /** 实际转发到的 `host:port`（未转发 = null） */
  forwardedTo: string | null;
  /** **本桩**应答的状态行（CONNECT 的 `HTTP/1.1 200 Connection Established` / 502；转发与挂起 = null） */
  proxyStatusLine: string | null;
  /** 从上游/隧道回传字节里解出的首个状态行（仅 `HTTP/` 开头时记录；否则 null） */
  upstreamStatusLine: string | null;
  /** 失败原因（成功 = null） */
  error: string | null;
  /** 到达时刻（Date.now()） */
  receivedAt: number;
}

export interface FakeProxy {
  url: string;
  port: number;
  /** 实时引用（按到达顺序追加） */
  entries: ProxyEntry[];
  rawLines(): string[];
  connectLines(): string[];
  hasConnect(): boolean;
  readonly forwardedCount: number;
  writeRawLinesToFile(filePath: string): Promise<void>;
  close(): Promise<void>;
}

const HEAD_END = Buffer.from('\r\n\r\n');

/** 解析出的请求头（最小必要面） */
interface ParsedHead {
  rawLine: string;
  rawHead: string;
  method: string;
  target: string;
  httpVersion: string;
  /** 小写名 → 原值（保序：用 [name, value] 数组） */
  headerPairs: Array<[string, string]>;
}

/** 只脱敏凭据类头部值；请求行与其余头部逐字节保留 */
function redactHead(rawHead: string): string {
  return rawHead
    .split('\r\n')
    .map((line, i) => {
      if (i === 0) return line;
      const idx = line.indexOf(':');
      if (idx <= 0) return line;
      const name = line.slice(0, idx).trim().toLowerCase();
      if (name === 'authorization' || name === 'proxy-authorization') {
        return `${line.slice(0, idx)}: <redacted>`;
      }
      return line;
    })
    .join('\r\n');
}

function parseHead(headBytes: Buffer): ParsedHead {
  const rawHead = headBytes.toString('latin1');
  const lines = rawHead.split('\r\n');
  const requestLine = lines[0] ?? '';
  const parts = requestLine.split(' ');
  const method = parts[0] ?? '';
  const target = parts[1] ?? '';
  const httpVersion = (parts[2] ?? '').replace(/^HTTP\//, '');
  const headerPairs: Array<[string, string]> = [];
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    headerPairs.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
  }
  return { rawLine: requestLine, rawHead: redactHead(rawHead), method, target, httpVersion, headerPairs };
}

function headerValue(pairs: Array<[string, string]>, name: string): string | null {
  const hit = pairs.find(([n]) => n.toLowerCase() === name);
  return hit ? hit[1] : null;
}

/** 非 CONNECT 请求的「主机 + 端口」判定：绝对 URI 优先，其次 Host 头 */
function resolveHostPort(parsed: ParsedHead): { host: string; port: number } | { invalid: string } {
  const absolute = /^https?:\/\//i.test(parsed.target);
  if (absolute) {
    try {
      const u = new URL(parsed.target);
      const port = u.port.length > 0 ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
      return { host: u.hostname, port };
    } catch (err: unknown) {
      return { invalid: err instanceof Error ? err.message : String(err) };
    }
  }
  const hostHeader = headerValue(parsed.headerPairs, 'host');
  if (hostHeader === null || hostHeader.length === 0) {
    return { invalid: '既非绝对 URI，也无 Host 头（无法判定目标）' };
  }
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(hostHeader);
  if (m === null) return { invalid: `Host 头无法解析: ${hostHeader}` };
  const host = (m[1] ?? '').replace(/^\[|\]$/g, '');
  const port = m[2] !== undefined ? Number(m[2]) : 80;
  return { host, port };
}

/** 绝对 URI → origin-form（转发给 origin 的请求行；origin 不是代理，不认绝对 URI） */
function toOriginForm(target: string): string {
  if (!/^https?:\/\//i.test(target)) return target.length > 0 ? target : '/';
  try {
    const u = new URL(target);
    return `${u.pathname.length > 0 ? u.pathname : '/'}${u.search}`;
  } catch {
    return '/';
  }
}

function statusLineOf(chunk: Buffer): string | null {
  const end = chunk.indexOf('\r\n');
  if (end <= 0) return null;
  const line = chunk.subarray(0, end).toString('latin1');
  return line.startsWith('HTTP/') ? line : null;
}

/**
 * 取一个「当前没人监听」的本地端口（先绑 0 取号再关闭）。
 * 用途：验收项「代理端口关闭 → 不得静默回退直连」需要一个确定不可达的代理地址。
 * @degraded 无（绑定失败 → 抛，不静默返回假端口）
 */
export async function getClosedPort(): Promise<number> {
  const probe: Server = createNetServer();
  const port = await new Promise<number>((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address() as AddressInfo | null;
      if (addr === null || typeof addr === 'string') {
        reject(new Error('getClosedPort: 监听成功但拿不到端口'));
        return;
      }
      resolve(addr.port);
    });
  });
  await new Promise<void>((resolve, reject) => {
    probe.close((err?: Error) => (err ? reject(err) : resolve()));
  });
  return port;
}

/**
 * 启动假代理。调用方必须在 afterAll 里 close()（否则 vitest 因句柄未释放无法退出）。
 */
export async function startFakeProxy(options: FakeProxyOptions = {}): Promise<FakeProxy> {
  const mode: FakeProxyMode = options.mode ?? 'forward';
  const targets = options.targets ?? {};
  const defaultTarget = options.defaultTarget;
  const entries: ProxyEntry[] = [];
  const openSockets = new Set<Socket>();

  function resolveDestination(host: string, port: number): ProxyTarget | null {
    return targets[`${host}:${port}`] ?? targets[host] ?? defaultTarget ?? null;
  }

  function appendLogLine(rawLine: string): void {
    if (options.logFile === undefined) return;
    void appendFile(options.logFile, `${rawLine}\n`, 'utf8').catch((err: unknown) => {
      log.warn({ err: err instanceof Error ? err.message : String(err), degraded: true }, '假代理请求行落盘失败');
    });
  }

  function respond(socket: Socket, statusLine: string, body: string, entry: ProxyEntry): void {
    const payload = Buffer.from(body, 'utf8');
    entry.proxyStatusLine = statusLine;
    socket.end(
      `${statusLine}\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ${payload.length}\r\nConnection: close\r\n\r\n${body}`,
    );
  }

  async function tunnel(
    socket: Socket,
    dest: ProxyTarget,
    rest: Buffer,
    entry: ProxyEntry,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false;
      const upstream = netConnect({ host: dest.host, port: dest.port }, () => {
        settled = true;
        const statusLine = 'HTTP/1.1 200 Connection Established';
        entry.proxyStatusLine = statusLine;
        socket.write(`${statusLine}\r\n\r\n`);
        if (rest.length > 0) upstream.write(rest);
        socket.pipe(upstream);
        upstream.pipe(socket);
        resolve();
      });
      upstream.on('error', (err: Error) => {
        log.warn(
          { err: err.message, target: `${dest.host}:${dest.port}`, degraded: true },
          '假代理 CONNECT 目标不可达 — 502（不静默）',
        );
        entry.error = `CONNECT 目标不可达 ${dest.host}:${dest.port}: ${err.message}`;
        if (!settled) {
          settled = true;
          respond(socket, 'HTTP/1.1 502 Bad Gateway', `fake-proxy: CONNECT 目标不可达 ${dest.host}:${dest.port}\n`, entry);
          resolve();
        }
      });
      socket.on('error', () => { upstream.destroy(); });
    });
  }

  async function forward(
    socket: Socket,
    parsed: ParsedHead,
    dest: ProxyTarget,
    rest: Buffer,
    entry: ProxyEntry,
  ): Promise<void> {
    await new Promise<void>((resolve) => {
      let settled = false;
      const upstream = netConnect({ host: dest.host, port: dest.port }, () => {
        settled = true;
        const lines = [`${parsed.method} ${toOriginForm(parsed.target)} HTTP/1.1`];
        for (const [name, value] of parsed.headerPairs) {
          const lower = name.toLowerCase();
          // Host 重写为目标地址；逐跳头部（Connection/Proxy-*）不转发
          if (lower === 'host' || lower === 'connection' || lower === 'proxy-connection' || lower === 'proxy-authorization') {
            continue;
          }
          lines.push(`${name}: ${value}`);
        }
        lines.push(`Host: ${dest.host}:${dest.port}`);
        lines.push('Connection: close');
        upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
        if (rest.length > 0) upstream.write(rest);
        upstream.on('data', (chunk: Buffer) => {
          if (entry.upstreamStatusLine === null) entry.upstreamStatusLine = statusLineOf(chunk);
        });
        socket.pipe(upstream);
        upstream.pipe(socket);
        resolve();
      });
      upstream.on('error', (err: Error) => {
        log.warn(
          { err: err.message, target: `${dest.host}:${dest.port}`, degraded: true },
          '假代理转发目标不可达 — 502（不静默）',
        );
        entry.error = `转发目标不可达 ${dest.host}:${dest.port}: ${err.message}`;
        if (!settled) {
          settled = true;
          respond(socket, 'HTTP/1.1 502 Bad Gateway', `fake-proxy: 转发目标不可达 ${dest.host}:${dest.port}\n`, entry);
          resolve();
        }
      });
      socket.on('error', () => { upstream.destroy(); });
    });
  }

  async function handleRequest(
    socket: Socket,
    parsed: ParsedHead,
    rest: Buffer,
    entry: ProxyEntry,
  ): Promise<void> {
    if (mode === 'hang') {
      // 显式挂起：不响应、不关闭（调用方超时/中断由客户端侧判定）
      log.warn({ rawLine: parsed.rawLine, mode, degraded: true }, '假代理 hang 模式 — 请求已记录但不响应');
      return;
    }
    if (mode === 'bad-gateway') {
      log.warn({ rawLine: parsed.rawLine, mode, degraded: true }, '假代理 bad-gateway 模式 — 502');
      respond(socket, 'HTTP/1.1 502 Bad Gateway', 'fake-proxy: bad-gateway 模式\n', entry);
      return;
    }

    let host: string;
    let port: number;
    if (parsed.method === 'CONNECT') {
      const m = /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(parsed.target);
      if (m === null) {
        entry.error = `CONNECT 目标无法解析: ${parsed.target}`;
        log.warn({ target: parsed.target, degraded: true }, '假代理 CONNECT 目标无法解析 — 502');
        respond(socket, 'HTTP/1.1 502 Bad Gateway', `fake-proxy: CONNECT 目标无法解析 ${parsed.target}\n`, entry);
        return;
      }
      host = (m[1] ?? '').replace(/^\[|\]$/g, '');
      port = Number(m[2]);
    } else {
      const hp = resolveHostPort(parsed);
      if ('invalid' in hp) {
        entry.error = `目标判定失败: ${hp.invalid}`;
        log.warn({ rawLine: parsed.rawLine, degraded: true }, '假代理无法判定目标主机 — 502');
        respond(socket, 'HTTP/1.1 502 Bad Gateway', `fake-proxy: ${hp.invalid}\n`, entry);
        return;
      }
      host = hp.host;
      port = hp.port;
    }

    const dest = resolveDestination(host, port);
    if (dest === null) {
      entry.error = `未配置目标映射: ${host}:${port}`;
      log.warn({ host, port, degraded: true }, '假代理未配置目标映射 — 502（不静默改道）');
      respond(socket, 'HTTP/1.1 502 Bad Gateway', `fake-proxy: 未配置目标映射 ${host}:${port}\n`, entry);
      return;
    }

    entry.forwardedTo = `${dest.host}:${dest.port}`;
    if (parsed.method === 'CONNECT') await tunnel(socket, dest, rest, entry);
    else await forward(socket, parsed, dest, rest, entry);
  }

  const server: Server = createNetServer((socket: Socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
    socket.on('error', (err: Error) => {
      log.warn({ err: err.message, degraded: true }, '假代理客户端连接错误');
    });
    let buffered = Buffer.alloc(0);
    let parsed = false;
    socket.on('data', (chunk: Buffer) => {
      if (parsed) return; // 头部已解析 → 之后走 pipe，不再经此累加
      buffered = Buffer.concat([buffered, chunk]);
      const headEnd = buffered.indexOf(HEAD_END);
      if (headEnd < 0) return;
      parsed = true;
      const headBytes = buffered.subarray(0, headEnd);
      const rest = Buffer.from(buffered.subarray(headEnd + HEAD_END.length));
      buffered = Buffer.alloc(0);

      const head = parseHead(headBytes);
      const entry: ProxyEntry = {
        index: entries.length + 1,
        rawLine: head.rawLine,
        rawHead: head.rawHead,
        method: head.method,
        target: head.target,
        httpVersion: head.httpVersion,
        isConnect: head.method === 'CONNECT',
        forwardedTo: null,
        proxyStatusLine: null,
        upstreamStatusLine: null,
        error: null,
        receivedAt: Date.now(),
      };
      entries.push(entry);
      appendLogLine(head.rawLine);
      void handleRequest(socket, head, rest, entry).catch((err: unknown) => {
        entry.error = err instanceof Error ? err.message : String(err);
        log.warn({ err: entry.error, degraded: true }, '假代理处理请求抛出 — 502');
        if (!socket.destroyed) respond(socket, 'HTTP/1.1 502 Bad Gateway', `fake-proxy: ${entry.error}\n`, entry);
      });
    });
  });

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
    throw new Error('假代理监听成功但拿不到端口（AddressInfo 缺失）');
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    port: address.port,
    entries,
    rawLines(): string[] {
      return entries.map(e => e.rawLine);
    },
    connectLines(): string[] {
      return entries.filter(e => e.isConnect).map(e => e.rawLine);
    },
    hasConnect(): boolean {
      return entries.some(e => e.isConnect);
    },
    get forwardedCount(): number {
      return entries.filter(e => e.forwardedTo !== null).length;
    },
    async writeRawLinesToFile(filePath: string): Promise<void> {
      await writeFile(filePath, entries.map(e => `${e.rawLine}\n`).join(''), 'utf8');
    },
    close(): Promise<void> {
      for (const s of openSockets) s.destroy();
      openSockets.clear();
      return new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) {
            log.warn({ err: err.message, degraded: true }, '假代理关闭失败');
            reject(err);
            return;
          }
          resolve();
        });
      });
    },
  };
}
