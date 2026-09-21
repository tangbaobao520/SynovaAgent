/**
 * providers/http-exit.ts — 出站 HTTP 唯一出口（D821 / P-1 前提清单第 1 项）
 *
 * ## 契约（冻结 v1，2026-09-20 CTO 裁决；API 名与语义不得改）
 *
 * **本文件是全仓库唯一读代理环境变量的文件。** 任何其它文件读取
 * `http_proxy` / `https_proxy` / `all_proxy` / `no_proxy` 都是回归。
 *
 * ### 输入
 * - env（**调用时读取**，不在模块加载时缓存）：
 *   - `http_proxy` / `HTTP_PROXY`
 *   - `https_proxy` / `HTTPS_PROXY`
 *   - `all_proxy` / `ALL_PROXY`
 *   - `no_proxy` / `NO_PROXY`
 *   - 大小写两种都支持；小写优先（与 undici 一致，空值视为未设置）
 * - 解析顺序（对齐 DSH `dsh-http-proxy/lib/index.js:237`）：
 *   目标 scheme 自己的变量 → `ALL_PROXY` →（**仅 https**）回退 `HTTP_PROXY`
 * - 传输：
 *   - https 目标 + 代理 → `CONNECT` 隧道（`http.request({method:'CONNECT'})`
 *     → `tls.connect({socket})` → `https.request({agent:false, createConnection:()=>tlsSocket})`）
 *   - http 目标 + 代理 → 绝对 URI 请求（path = 完整 URL，Host 头 = 目标 host）
 *
 * ### 输出
 * - `outboundFetch(url, init)` → **真** `Response`（node `IncomingMessage` →
 *   `Readable.toWeb`）：status / headers / 流式 body 全真，尊重 `init.signal`。
 * - `getProxyStatus()` → 配置快照（`variables` **只含变量名，永不含值**）。
 * - `OutboundHttpError` → 调用方按 `code` / `phase` / `retryable` / `degraded` 消费（铁律 31/32）。
 *
 * **公开面（队长 2026-09-20 收窄裁决）**：仅 `outboundFetch` / `getProxyStatus` /
 * `OutboundHttpError` + 类型。解析与匹配策略（scheme 解析顺序、loopback 判定、
 * `NO_PROXY` 匹配、CIDR）全部为**模块内部实现**，不导出 —— 消费方只应经由
 * `outboundFetch` 的真实行为与 `getProxyStatus()` 的快照判断，避免第三处解析器出现。
 *
 * ### 降级契约（不阻断启动）
 * - `socks:` / `socks4:` / `socks4a:` / `socks5:` / `socks5h:` → `kind='socks'`
 * - URL 畸形 → `kind='invalid'`
 * - 二者 `degraded=true` + `log.warn`（每变量一次）+ 出站**直连**（不 fallback 到其它变量）
 * - loopback 恒绕过：`127.0.0.0/8` **整段**（127.0.0.2 也算）、`::1`、`localhost`、
 *   `*.localhost`、`::ffff:127.*`
 * - `NO_PROXY`：逗号分隔；`host`、`host:port`、`.suffix` / `*.suffix`、**IPv4 CIDR**、`*`；大小写不敏感
 *
 * ### 错误契约（铁律 32：错误分类强制）
 * - 代理已选中（`useProxy=true`）后失败 → **禁止静默直连回退**，一律抛
 *   `OutboundHttpError`（`code` / `phase` / `retryable` / `degraded` / `proxyKind`）。
 * - 连代理失败 → `PROXY_UNREACHABLE`（phase `connect`，retryable，degraded）+ `log.warn`
 * - CONNECT 非 200 / 隧道建立后 socket 提前关闭 / TLS 握手失败 → `PROXY_TUNNEL_FAILED`
 * - 直连上游失败 → `UPSTREAM_UNREACHABLE`；socket 超时 → `UPSTREAM_TIMEOUT`
 * - `init.signal` 主动 abort → **不包装**，原样传播（尊重调用方 abort 语义）
 *
 * ### 安全契约
 * - 代理 URL 内 `user:pass` → `Proxy-Authorization: Basic`（base64），
 *   **永不**进日志 / `getProxyStatus()`；请求头 / 体**永不**进日志。
 *
 * ### 边界（本卡不做）
 * - **出口自身零重试**（归 `src/services/retry.ts` 与调用方），只做错误分类。
 * - **零新依赖**：只用 `node:http` / `node:https` / `node:tls` / `node:net` /
 *   `node:stream` + 全局 `Response`。
 * - 不实现 SOCKS5 协议；不引 undici / node-fetch / axios。
 */

import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import { Readable } from 'node:stream';
import type { Socket } from 'node:net';
import { createLogger } from '@synova/logger';

const log = createLogger('providers/http-exit');

// ═══════════════════════════════════════════════════════════════
// 冻结类型（一个字都不能改）
// ═══════════════════════════════════════════════════════════════

export type ProxyKind = 'none' | 'http' | 'https' | 'socks' | 'invalid';

/**
 * 状态快照（冻结 API，队长 2026-09-20 裁决语义）。
 *
 * **`kind` = 本次实际生效 / 被记录的代理机制**（规则表）：
 * | 情形 | `useProxy` | `kind` | `degraded` |
 * |---|---|---|---|
 * | 正常走代理 | true | `'http'` / `'https'` | false |
 * | loopback / `NO_PROXY` 绕过（代理**不参与**） | false | `'none'` | false |
 * | 配置了但**不可用**（socks / 畸形） | false | `'socks'` / `'invalid'` | true |
 *
 * 为什么绕过时报 `'none'` 而不是配置类型：只读 `kind` 的消费方（如 D862 的健康暴露）
 * 会把 loopback 流量误报成"代理生效"；`'none'` 让 `useProxy` 与 `kind` 这对字段自洽。
 */
export interface ProxyStatus {
  configured: boolean;
  active: boolean;
  kind: ProxyKind;
  variables: string[];
  degraded: boolean;
  reason?: string;
  loopbackBypass: true;
}

export interface OutboundRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export type OutboundErrorCode =
  | 'INVALID_URL'
  | 'PROXY_UNREACHABLE'
  | 'PROXY_TUNNEL_FAILED'
  | 'UPSTREAM_UNREACHABLE'
  | 'UPSTREAM_TIMEOUT';

export type OutboundPhase = 'connect' | 'tunnel' | 'tls' | 'request' | 'response';

/**
 * 出站错误 — 铁律 32 的 `code` + `phase` + `retryable` 三元组。
 * `degraded=true` 表示本次失败伴随降级配置（socks / 畸形值），而非纯网络抖动。
 */
export class OutboundHttpError extends Error {
  readonly code: OutboundErrorCode;
  readonly phase: OutboundPhase;
  readonly retryable: boolean;
  readonly degraded: boolean;
  readonly proxyKind: ProxyKind;

  constructor(detail: {
    code: OutboundErrorCode;
    phase: OutboundPhase;
    message: string;
    retryable: boolean;
    degraded: boolean;
    proxyKind: ProxyKind;
    cause?: unknown;
  }) {
    super(detail.message);
    this.name = 'OutboundHttpError';
    this.code = detail.code;
    this.phase = detail.phase;
    this.retryable = detail.retryable;
    this.degraded = detail.degraded;
    this.proxyKind = detail.proxyKind;
    if (detail.cause !== undefined) this.cause = detail.cause;
  }
}

// ═══════════════════════════════════════════════════════════════
// env 读取（本仓库唯一读代理 env 的地方）
// ═══════════════════════════════════════════════════════════════

/** env 名按字段分组，小写在前（undici 优先读小写；空值视为未设置）。 */
const ENV_NAMES = {
  httpProxy: ['http_proxy', 'HTTP_PROXY'],
  httpsProxy: ['https_proxy', 'HTTPS_PROXY'],
  allProxy: ['all_proxy', 'ALL_PROXY'],
  noProxy: ['no_proxy', 'NO_PROXY'],
} as const;

/** 全部代理 env 名 — `getProxyStatus().variables` 的唯一数据源。 */
const ALL_PROXY_ENV_NAMES: readonly string[] = [
  ...ENV_NAMES.httpProxy,
  ...ENV_NAMES.httpsProxy,
  ...ENV_NAMES.allProxy,
  ...ENV_NAMES.noProxy,
];

/** 支持路由的代理 URL scheme。 */
const SUPPORTED_PROXY_PROTOCOLS = new Set(['http:', 'https:']);

/** 认得出来但本模块不实现的 scheme — 报名字而不是笼统判"畸形"。 */
const SOCKS_PROTOCOLS = new Set(['socks:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:']);

interface EnvValue {
  /** 变量名（用于诊断与 `variables`）。 */
  name: string;
  /** trim 后的值。 */
  value: string;
}

/**
 * 读一个字段的 env：小写优先，大写兜底，空串视为未设置。
 * **每次调用都重新读 `process.env`**（契约：调用时读取，不在加载时缓存）。
 */
function readEnv(names: readonly string[]): EnvValue | undefined {
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined) continue;
    const value = raw.trim();
    if (value !== '') return { name, value };
  }
  return undefined;
}

/**
 * 已告警过的降级配置（避免每次出站刷同一行日志）。
 *
 * **dedup key = 变量名 + 解析出的形态判定 + 原因**（不含凭据）：
 * 同一个坏配置只告警一次；换成另一个坏值（另一端口、另一畸形串）会各自告警一次。
 * 这样"降级可见"（铁律 11/24）与"不刷屏"同时成立，且**不需要任何 test-only 开关**
 * （验收标准 §五 禁止 `src/**` 测试专用开关）。
 */
const degradedWarned = new Set<string>();

/**
 * 降级告警（铁律 11：降级必须可见）。`dedupKey` 已含形态判定，日志内不含 env 值。
 */
function warnDegraded(dedupKey: string, variable: string, kind: ProxyKind, reason: string): void {
  if (degradedWarned.has(dedupKey)) return;
  degradedWarned.add(dedupKey);
  log.warn({ variable, kind, degraded: true, reason }, '出站代理配置不可用 — 降级为直连（不阻断启动）');
}

// ═══════════════════════════════════════════════════════════════
// 代理值分类
// ═══════════════════════════════════════════════════════════════

type ProxyValue =
  | { kind: 'none' }
  | { kind: 'usable'; kindOf: 'http' | 'https'; variable: string; url: URL; href: string }
  | { kind: 'rejected'; kindOf: 'socks' | 'invalid'; variable: string; reason: string };

/** 判一个 env 值是否可用：`http:`/`https:` 可用；socks 家族与畸形值各自登记后拒绝。 */
function classifyEnvValue(entry: EnvValue | undefined): ProxyValue {
  if (entry === undefined) return { kind: 'none' };
  let url: URL;
  try {
    url = new URL(entry.value);
  } catch {
    const reason = `${entry.name} 不是合法 URL — 直连`;
    // 原因里带"畸形值摘要"作 dedup 维度（只取前 24 字符，且值可能是凭据 → 摘要不入日志）
    warnDegraded(`${entry.name}|not-a-url|${entry.value.slice(0, 24)}`, entry.name, 'invalid', 'not-a-url');
    return { kind: 'rejected', kindOf: 'invalid', variable: entry.name, reason };
  }
  if (SOCKS_PROTOCOLS.has(url.protocol)) {
    const reason = `${entry.name} 是 SOCKS 代理（本模块不支持）— 该 scheme 直连；请改用 http:// 或 https:// 代理 URL`;
    warnDegraded(`${entry.name}|socks|${url.host}`, entry.name, 'socks', 'socks-unsupported');
    return { kind: 'rejected', kindOf: 'socks', variable: entry.name, reason };
  }
  if (!SUPPORTED_PROXY_PROTOCOLS.has(url.protocol)) {
    const reason = `${entry.name} 使用了不支持的 ${url.protocol}// scheme — 该 scheme 直连`;
    warnDegraded(`${entry.name}|scheme|${url.protocol}//${url.host}`, entry.name, 'invalid', 'unsupported-scheme');
    return { kind: 'rejected', kindOf: 'invalid', variable: entry.name, reason };
  }
  return {
    kind: 'usable',
    kindOf: url.protocol === 'https:' ? 'https' : 'http',
    variable: entry.name,
    url,
    href: entry.value,
  };
}

/** 解析顺序：own → ALL_PROXY →（仅 https 才有的）HTTP_PROXY。rejected 的 own 保持直连，不 fallback。 */
function resolveSchemeValue(
  target: 'http' | 'https',
  entries: {
    httpProxy: EnvValue | undefined;
    httpsProxy: EnvValue | undefined;
    allProxy: EnvValue | undefined;
  },
): ProxyValue {
  const own = classifyEnvValue(target === 'https' ? entries.httpsProxy : entries.httpProxy);
  if (own.kind === 'usable') return own;
  if (own.kind === 'rejected') return own; // 拒绝即保持直连（对齐 DSH resolveScheme）

  const viaAll = classifyEnvValue(entries.allProxy);
  if (viaAll.kind !== 'none') return viaAll;
  if (target === 'https') {
    return classifyEnvValue(entries.httpProxy);
  }
  return { kind: 'none' };
}

// ═══════════════════════════════════════════════════════════════
// loopback / NO_PROXY 判定
// ═══════════════════════════════════════════════════════════════

/** 一个 IPv4 八位组 — 防止把 `127.999.1.1` 判成 loopback。 */
const OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
/** `127.0.0.0/8` 整段（DSH `lib/index.js:187` 同式）。 */
const LOOPBACK_IPV4 = new RegExp(`^127\\.${OCTET}\\.${OCTET}\\.${OCTET}$`);

/** 去掉 IPv6 方括号与尾点后小写。 */
function normalizeHost(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase();
}

/**
 * 是否本机地址 —— loopback 必须**恒绕过**，不允许代理转发。
 * 覆盖：`localhost`、`*.localhost`、`127.0.0.0/8` 整段、`::1`、`::`、`0.0.0.0`、
 * `::ffff:127.*`（IPv4-mapped）。
 */
function isLoopbackHost(hostname: string): boolean {
  return isLocalPrivateHost(hostname) !== 'no';
}

/** 判一个 host 是否为点分十进制 IPv4。 */
function isIpv4(host: string): boolean {
  const parts = host.split('.');
  if (parts.length !== 4) return false;
  return parts.every((p) => new RegExp(`^${OCTET}$`).test(p));
}

/**
 * 是否"本机私有目标" —— 必须绕过代理，且**不得交给 DNS 解析**（会解析到本机）。
 *
 * 拆两档是为了让测试与运维能区分"loopback"与"未指定地址"：
 * - `loopback`：`localhost` / `*.localhost` / `127.0.0.0/8` / `::1` / `::ffff:127.*`
 * - `wildcard`：`0.0.0.0` / `::`（通配绑定地址 — 远程解释无意义，但常被用作 loopback 别名）
 *
 * 二者都直接 `connect` 到字面地址（`lookup: false`），因此在无 DNS 的环境里也能验证
 * "代理被绕过 / 代理被使用"的反例，不会因解析失败把结论搅浑。
 */
function isLocalPrivateHost(hostname: string): 'loopback' | 'wildcard' | 'no' {
  const host = normalizeHost(hostname);
  if (host === 'localhost' || host.endsWith('.localhost')) return 'loopback';
  if (host === '::1') return 'loopback';
  if (host === '::' || host === '0.0.0.0') return 'wildcard';
  if (host.startsWith('::ffff:')) {
    const rest = host.slice('::ffff:'.length);
    if (rest.includes(':')) {
      const high = rest.split(':')[0];
      if (/^[0-9a-f]{1,4}$/.test(high) && (Number.parseInt(high, 16) >>> 8) === 127) return 'loopback';
      return 'no';
    }
    return LOOPBACK_IPV4.test(rest) ? 'loopback' : 'no';
  }
  return LOOPBACK_IPV4.test(host) ? 'loopback' : 'no';
}

/** host 转 32 位无符号整数（仅当是合法 IPv4）。 */
function ipv4ToInt(host: string): number | undefined {
  if (!isIpv4(host)) return undefined;
  const [a, b, c, d] = host.split('.').map((p) => Number.parseInt(p, 10));
  return ((a << 24) >>> 0) + (b << 16) + (c << 8) + d;
}

/**
 * 目标是否命中一条 `NO_PROXY` 条目。
 * 支持：`*`、`host`、`host:port`（含 `[::1]:port`）、`.suffix` / `*.suffix`（含子域）、
 * **IPv4 CIDR**（`10.0.0.0/8` — DSH 不支持，本模块改写补齐）。
 */
function matchesNoProxyEntry(hostname: string, port: string, rawEntry: string): boolean {
  const entry = rawEntry.trim().toLowerCase();
  if (entry === '') return false;
  if (entry === '*') return true;

  // host[:port] — 裸 IPv6 有多个冒号，只在单冒号或方括号形态拆端口
  let entryHost = entry;
  let entryPort: string | undefined;
  if (entry.startsWith('[')) {
    const close = entry.indexOf(']');
    if (close !== -1) {
      entryHost = entry.slice(1, close);
      const rest = entry.slice(close + 1);
      if (rest.startsWith(':')) entryPort = rest.slice(1);
    }
  } else {
    const first = entry.indexOf(':');
    if (first !== -1 && entry.indexOf(':', first + 1) === -1) {
      entryHost = entry.slice(0, first);
      entryPort = entry.slice(first + 1);
    }
  }
  if (entryPort !== undefined && entryPort !== port) return false;

  // IPv4 CIDR
  const cidr = /^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec(entryHost);
  if (cidr !== null) {
    const target = ipv4ToInt(hostname);
    const base = ipv4ToInt(cidr[1]);
    const prefix = Number.parseInt(cidr[2], 10);
    if (target === undefined || base === undefined || prefix < 0 || prefix > 32) return false;
    if (prefix === 0) return true;
    const mask = prefix === 32 ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
    return ((target & mask) >>> 0) === ((base & mask) >>> 0);
  }

  const candidate = entryHost.replace(/^\*?\./, '').replace(/\.$/, '');
  if (candidate === '') return false;
  const host = normalizeHost(hostname);
  return host === candidate || host.endsWith(`.${candidate}`);
}

/** `NO_PROXY` 整体判定（逗号 / 空白分隔）。 */
function isBypassedByNoProxy(url: URL, noProxy: string): boolean {
  const host = normalizeHost(url.hostname);
  const port = url.port !== '' ? url.port : url.protocol === 'https:' ? '443' : '80';
  return noProxy.split(/[,\s]+/).some((entry) => matchesNoProxyEntry(host, port, entry));
}

// ═══════════════════════════════════════════════════════════════
// 路由决策
// ═══════════════════════════════════════════════════════════════

interface RouteDecision {
  /** http / https 目标 + 可用代理。 */
  route: 'direct' | 'proxy' | 'tunnel';
  /** 选中代理时才有（`proxy` / `tunnel`）。 */
  proxyUrl?: URL;
  proxyKind: ProxyKind;
  degraded: boolean;
  reason?: string;
  /** 命中的代理 env 变量名（供 `getProxyStatus` 计数/展示）。 */
  variable?: string;
  /** 代理已配置但因 loopback / NO_PROXY 而绕过。 */
  bypassed?: boolean;
}

/**
 * 解析一个目标 URL 的出站路由（内部单源，`resolveProxyForTarget` 与 `outboundFetch` 共用）。
 * 保证：**不可能出现 `useProxy=true` 却无代理 URL 的决策**（禁止静默直连回退的物理前提）。
 */
function decideRoute(targetUrl: string): RouteDecision {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new OutboundHttpError({
      code: 'INVALID_URL',
      phase: 'request',
      message: `出站 URL 无法解析: ${targetUrl.slice(0, 120)}`,
      retryable: false,
      degraded: false,
      proxyKind: 'none',
    });
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundHttpError({
      code: 'INVALID_URL',
      phase: 'request',
      message: `出站仅支持 http/https，收到 ${url.protocol}//`,
      retryable: false,
      degraded: false,
      proxyKind: 'none',
    });
  }

  const entries = {
    httpProxy: readEnv(ENV_NAMES.httpProxy),
    httpsProxy: readEnv(ENV_NAMES.httpsProxy),
    allProxy: readEnv(ENV_NAMES.allProxy),
  };
  const scheme: 'http' | 'https' = url.protocol === 'https:' ? 'https' : 'http';
  const resolved = resolveSchemeValue(scheme, entries);

  if (resolved.kind === 'rejected') {
    // 降级：可用值缺失 / 不可用 → 直连（不 fallback），degraded 显式上报
    return { route: 'direct', proxyKind: resolved.kindOf, degraded: true, reason: resolved.reason };
  }
  if (resolved.kind === 'none') {
    return { route: 'direct', proxyKind: 'none', degraded: false };
  }

  const noProxy = readEnv(ENV_NAMES.noProxy);

  // loopback 恒绕过（先于 NO_PROXY 判定）
  if (isLoopbackHost(url.hostname)) {
    // kind 语义（队长 2026-09-20 裁决）：kind = 本次**实际生效/被记录**的代理机制。
    // 代理不参与 → kind='none'（不用配置类型，否则只读 kind 的消费方会把 loopback 误报成"代理生效"）。
    return {
      route: 'direct',
      proxyKind: 'none',
      degraded: false,
      reason: '目标为本机 loopback 地址 — 恒绕过代理',
      variable: resolved.variable,
      bypassed: true,
    };
  }
  if (noProxy !== undefined && isBypassedByNoProxy(url, noProxy.value)) {
    return {
      route: 'direct',
      proxyKind: 'none',
      degraded: false,
      reason: `目标命中 NO_PROXY（${noProxy.name}）`,
      variable: resolved.variable,
      bypassed: true,
    };
  }

  return {
    route: url.protocol === 'https:' ? 'tunnel' : 'proxy',
    proxyUrl: resolved.url,
    proxyKind: resolved.kindOf,
    degraded: false,
    variable: resolved.variable,
  };
}

/**
 * 当前进程的代理配置快照。
 *
 * **`variables` 只含变量名，永不含值**（值可能带凭据）。
 * `active` 表示"有一个可用代理值"（不是"本次请求走了代理" — 后者要看目标）。
 */
export function getProxyStatus(): ProxyStatus {
  const entries = {
    httpProxy: readEnv(ENV_NAMES.httpProxy),
    httpsProxy: readEnv(ENV_NAMES.httpsProxy),
    allProxy: readEnv(ENV_NAMES.allProxy),
  };
  const configured = ALL_PROXY_ENV_NAMES.filter((name) => {
    const raw = process.env[name];
    return raw !== undefined && raw.trim() !== '';
  });

  const httpValue = resolveSchemeValue('http', entries);
  const httpsValue = resolveSchemeValue('https', entries);
  const usable = httpValue.kind === 'usable' ? httpValue : httpsValue.kind === 'usable' ? httpsValue : undefined;
  const rejected = httpValue.kind === 'rejected' ? httpValue : httpsValue.kind === 'rejected' ? httpsValue : undefined;

  // 代理值存在但因 loopback / NO_PROXY 被绕过时，说明具体是哪条规则
  const noProxy = readEnv(ENV_NAMES.noProxy);
  let bypassReason: string | undefined;
  if (usable !== undefined) {
    bypassReason = `本机 loopback 目标恒绕过（127.0.0.0/8 整段 / ::1 / localhost）`;
    if (noProxy !== undefined) bypassReason += `；另有 ${noProxy.name} 生效`;
  }

  const status: ProxyStatus = {
    configured: configured.length > 0,
    active: usable !== undefined,
    kind: usable !== undefined ? usable.kindOf : rejected !== undefined ? rejected.kindOf : 'none',
    variables: [...configured],
    degraded: usable === undefined && rejected !== undefined,
    loopbackBypass: true,
  };
  if (usable === undefined && rejected !== undefined) {
    status.reason = rejected.reason;
  } else if (usable !== undefined) {
    status.reason = bypassReason;
  } else if (configured.length === 0) {
    status.reason = '未设置任何代理环境变量 — 全量直连';
  }
  return status;
}

// ═══════════════════════════════════════════════════════════════
// 凭证（永不进日志 / 状态）
// ═══════════════════════════════════════════════════════════════

/** 代理 URL 内 `user:pass` → `Proxy-Authorization: Basic`；无凭据返回 undefined。 */
function proxyAuthorization(proxyUrl: URL): string | undefined {
  if (proxyUrl.username === '' && proxyUrl.password === '') return undefined;
  const raw = `${decodeURIComponent(proxyUrl.username)}:${decodeURIComponent(proxyUrl.password)}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

// ═══════════════════════════════════════════════════════════════
// 错误分类
// ═══════════════════════════════════════════════════════════════

/** 网络层 errno 集合 — 只做分类，不做重试。 */
const TIMEOUT_CODES = new Set(['ETIMEDOUT', 'ESOCKETTIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT']);
const UNREACHABLE_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'EPIPE', 'EHOSTUNREACH', 'ENETUNREACH']);

function errnoOf(err: unknown): string {
  if (err !== null && typeof err === 'object' && 'code' in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return '';
}

/** 把网络层错误翻成分类错误（铁律 32）。 */
function classifyNetworkError(err: unknown, ctx: { route: 'direct' | 'proxy' | 'tunnel'; proxyKind: ProxyKind; degraded: boolean; host: string }): OutboundHttpError {
  const errno = errnoOf(err);
  const message = err instanceof Error ? err.message : String(err);
  const base = { degraded: ctx.degraded, proxyKind: ctx.proxyKind, cause: err };

  if (TIMEOUT_CODES.has(errno)) {
    return new OutboundHttpError({
      ...base,
      code: 'UPSTREAM_TIMEOUT',
      phase: ctx.route === 'tunnel' ? 'tunnel' : 'response',
      retryable: true,
      message: `出站超时（${ctx.host}${errno ? `, ${errno}` : ''}）: ${message}`,
    });
  }
  if (ctx.route === 'tunnel') {
    return new OutboundHttpError({
      ...base,
      code: 'PROXY_TUNNEL_FAILED',
      phase: 'tunnel',
      retryable: true,
      message: `代理隧道失败（${ctx.host}${errno ? `, ${errno}` : ''}）: ${message}`,
    });
  }
  if (ctx.route === 'proxy') {
    return new OutboundHttpError({
      ...base,
      code: 'PROXY_UNREACHABLE',
      phase: 'connect',
      retryable: true,
      // 代理不可达 → 本次失败属降级态；禁止在此静默改走直连
      degraded: true,
      message: `代理不可达（${ctx.host}${errno ? `, ${errno}` : ''}）: ${message}`,
    });
  }
  return new OutboundHttpError({
    ...base,
    code: 'UPSTREAM_UNREACHABLE',
    phase: 'connect',
    retryable: UNREACHABLE_CODES.has(errno) ? false : true,
    message: `上游不可达（${ctx.host}${errno ? `, ${errno}` : ''}）: ${message}`,
  });
}

// ═══════════════════════════════════════════════════════════════
// 传输
// ═══════════════════════════════════════════════════════════════

/** 把 node `IncomingMessage` 变成真 `Response`（status / headers / 流式 body 全真）。 */
function toResponse(res: http.IncomingMessage): Response {
  const headers = new Headers();
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, value);
  }
  const status = typeof res.statusCode === 'number' ? res.statusCode : 502;
  // `Readable.toWeb` 的 @types/node 声明返回宽泛的 `ReadableStream`；
  // 单次 `as` 收口为字节流（铁律 38 禁止 `as unknown as`）。
  const body = Readable.toWeb(res) as ReadableStream<Uint8Array>;
  return new Response(body, { status, statusText: res.statusMessage ?? '', headers });
}

/** 挂 abort 监听；返回摘除函数（防止 listener 泄漏）。 */
/**
 * 主动 abort 的判定。**禁止**把 abort 包装成 `OutboundHttpError`（冻结枚举无 ABORTED 码）：
 * 出口尊重调用方语义 —— abort 意味着"这次调用被取消"，不是"上游失败"。
 */
function isAbortError(err: unknown): boolean {
  if (err === null || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  const code = (err as { code?: unknown }).code;
  const message = (err as { message?: unknown }).message;
  if (name === 'AbortError' || code === 'ABORT_ERR') return true;
  return typeof message === 'string' && message.toLowerCase().includes('abort');
}

/**
 * 绑定 abort：立刻 reject + 销毁请求对象。
 *
 * ⚠️ 必须**自己 reject**，不能只依赖 `req.destroy()`：CONNECT 路径上 `destroy()` 在
 * socket 已交给隧道后**不会**再触发 `'error'` 事件（Node 22 实测，见自验记录），
 * 只 destroy 会让 Promise **永不 settle**（挂死到调用方超时）。
 */
function bindAbort(
  signal: AbortSignal | undefined,
  req: { destroy: (err?: Error) => void },
  reject: (reason: unknown) => void,
): () => void {
  if (signal === undefined) return () => undefined;
  const onAbort = (): void => {
    const abortError = new Error('outbound request aborted by caller signal');
    abortError.name = 'AbortError';
    req.destroy(abortError);
    reject(abortError);
  };
  if (signal.aborted) {
    onAbort();
    return () => undefined;
  }
  const handler = (): void => onAbort();
  signal.addEventListener('abort', handler, { once: true });
  return () => signal.removeEventListener('abort', handler);
}

/**
 * 目标地址的解析方式。
 *
 * 本机私有目标（loopback / 通配地址）**不得经过 DNS**：某些环境
 * （容器、企业内网、无 DNS 的验收环境）会把本机名字解析到别处，一旦如此
 * "绕过代理直连本机"的结论就会被解析结果搅浑。
 * 字面 IPv4/IPv6 直接用 `net.connect`；主机名仍走系统 DNS。
 */
function lookupForLocalHost(hostname: string): https.RequestOptions['lookup'] {
  const normalized = normalizeHost(hostname);
  if (isLocalPrivateHost(normalized) === 'no') return undefined;
  const literal = normalized === 'localhost' || normalized.endsWith('.localhost') ? '127.0.0.1' : normalized;
  const family: 4 | 6 = literal.includes(':') ? 6 : 4;
  // ⚠️ 必须遵守 `options.all`：Node 22 默认 happy-eyeballs（`autoSelectFamily`）会以
  // `all: true` 调用 lookup 并**期望拿回数组** `[{ address, family }]`。
  // 只回标量会得到 `ERR_INVALID_IP_ADDRESS: Invalid IP address: undefined`
  // ——这会让 `localhost` / `*.localhost` / `[::1]` 这类**非裸 IPv4 字面量**的本机目标
  // 直接连接失败（而它们正是 `src/` 里成片存在的调用形态）。
  const lookup: https.RequestOptions['lookup'] = (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: literal, family }]);
      return;
    }
    callback(null, literal, family);
  };
  return lookup;
}

/** 直连（http / https 各自选模块），不做任何代理回退。 */
function requestDirect(url: URL, init: OutboundRequestInit): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const headers = { ...(init.headers ?? {}) };
    if (init.body !== undefined && headers['Content-Length'] === undefined && headers['content-length'] === undefined) {
      headers['Content-Length'] = String(Buffer.byteLength(init.body, 'utf8'));
    }
    const localLookup = lookupForLocalHost(url.hostname);
    const options: https.RequestOptions = {
      method: init.method ?? 'GET',
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port !== '' ? url.port : undefined,
      path: `${url.pathname}${url.search}`,
      headers,
      ...(localLookup !== undefined ? { lookup: localLookup } : {}),
    };
    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options);
    const unbind = bindAbort(init.signal, req, reject);
    req.on('error', (err) => {
      unbind();
      if (init.signal?.aborted || isAbortError(err)) {
        reject(err);
        return;
      }
      const classified = classifyNetworkError(err, {
        route: 'direct',
        proxyKind: 'none',
        degraded: false,
        host: url.host,
      });
      log.warn({ code: classified.code, phase: classified.phase, errno: errnoOf(err) }, '出站直连失败');
      reject(classified);
    });
    req.on('response', (res) => {
      unbind();
      resolve(toResponse(res));
    });
    if (init.body !== undefined) req.end(init.body);
    else req.end();
  });
}

/** http 目标走代理：绝对 URI 请求（path = 完整 URL） + Host 头。 */
function requestViaHttpProxy(url: URL, init: OutboundRequestInit, decision: RouteDecision): Promise<Response> {
  const proxyUrl = decision.proxyUrl as URL;
  return new Promise<Response>((resolve, reject) => {
    const headers: Record<string, string> = {
      ...(init.headers ?? {}),
      Host: url.host,
    };
    const auth = proxyAuthorization(proxyUrl);
    if (auth !== undefined) headers['Proxy-Authorization'] = auth;
    if (init.body !== undefined && headers['Content-Length'] === undefined && headers['content-length'] === undefined) {
      headers['Content-Length'] = String(Buffer.byteLength(init.body, 'utf8'));
    }
    const options: https.RequestOptions = {
      method: init.method ?? 'GET',
      protocol: proxyUrl.protocol,
      hostname: proxyUrl.hostname,
      port: proxyUrl.port !== '' ? proxyUrl.port : proxyUrl.protocol === 'https:' ? '443' : '80',
      path: url.href, // 绝对 URI
      headers,
    };
    const client = proxyUrl.protocol === 'https:' ? https : http;
    const req = client.request(options);
    const unbind = bindAbort(init.signal, req, reject);
    req.on('error', (err) => {
      unbind();
      if (init.signal?.aborted || isAbortError(err)) {
        reject(err);
        return;
      }
      const classified = classifyNetworkError(err, {
        route: 'proxy',
        proxyKind: decision.proxyKind,
        degraded: true,
        host: `${proxyUrl.host}`,
      });
      log.warn(
        { code: classified.code, phase: classified.phase, proxyKind: classified.proxyKind, errno: errnoOf(err) },
        '代理不可达 — 抛错（禁止静默直连回退）',
      );
      reject(classified);
    });
    req.on('response', (res) => {
      unbind();
      resolve(toResponse(res));
    });
    if (init.body !== undefined) req.end(init.body);
    else req.end();
  });
}

/**
 * https 目标走代理：`CONNECT` 隧道。
 * `http.request({method:'CONNECT'})` → `tls.connect({socket})` → `https.request({createConnection})`。
 */
function requestViaTunnel(url: URL, init: OutboundRequestInit, decision: RouteDecision): Promise<Response> {
  const proxyUrl = decision.proxyUrl as URL;

  const connectOptions: http.RequestOptions = {
    method: 'CONNECT',
    protocol: proxyUrl.protocol,
    hostname: proxyUrl.hostname,
    port: proxyUrl.port !== '' ? proxyUrl.port : proxyUrl.protocol === 'https:' ? '443' : '80',
    path: `${url.hostname}:${url.port !== '' ? url.port : '443'}`,
    headers: { Host: `${url.hostname}:${url.port !== '' ? url.port : '443'}` },
    agent: false,
  };
  const auth = proxyAuthorization(proxyUrl);
  if (auth !== undefined) {
    (connectOptions.headers as Record<string, string>)['Proxy-Authorization'] = auth;
  }

  return new Promise<Response>((resolve, reject) => {
    const connectClient = proxyUrl.protocol === 'https:' ? https : http;
    const connectReq = connectClient.request(connectOptions);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const unbind = bindAbort(init.signal, connectReq, reject);

    connectReq.on('connect', (res, socket: Socket) => {
      if (res.statusCode !== 200) {
        unbind();
        socket.destroy();
        const err = new OutboundHttpError({
          code: 'PROXY_TUNNEL_FAILED',
          phase: 'tunnel',
          message: `代理拒绝 CONNECT（status ${res.statusCode ?? 'unknown'}）`,
          retryable: true,
          degraded: true,
          proxyKind: decision.proxyKind,
        });
        log.warn({ code: err.code, phase: err.phase, status: res.statusCode, proxyKind: decision.proxyKind }, 'CONNECT 隧道被拒');
        finish(() => reject(err));
        return;
      }

      // 证书校验**硬编码为 true**（安全默认，队长 2026-09-20 裁决）：
      // 企业内网 MITM 代理的 CA 由 `NODE_EXTRA_CA_CERTS` 在进程启动时注入默认信任库解决，
      // 与 rejectUnauthorized:true 完全兼容；反过来给实现开 false 缝 = 安全退化，
      // 不进 v1 契约。**不得**为让测试变绿而放宽本行。
      const tlsSocket = tls.connect({
        socket,
        servername: url.hostname,
        rejectUnauthorized: true,
      });
      tlsSocket.once('error', (err) => {
        unbind();
        socket.destroy();
        const classified = new OutboundHttpError({
          code: 'PROXY_TUNNEL_FAILED',
          phase: 'tls',
          message: `隧道 TLS 握手失败（${url.host}）: ${err instanceof Error ? err.message : String(err)}`,
          retryable: true,
          degraded: true,
          proxyKind: decision.proxyKind,
          cause: err,
        });
        log.warn({ code: classified.code, phase: classified.phase, proxyKind: decision.proxyKind }, '隧道 TLS 握手失败');
        finish(() => reject(classified));
      });
      tlsSocket.once('secureConnect', () => {
        if (settled) return;
        const headers = { ...(init.headers ?? {}) };
        if (init.body !== undefined && headers['Content-Length'] === undefined && headers['content-length'] === undefined) {
          headers['Content-Length'] = String(Buffer.byteLength(init.body, 'utf8'));
        }
        // ⚠️ 不能传 `agent: false`：Node 22 实测（`node -e` 可复现）在 `agent:false` 下
        // 仍会对 `host` 做 DNS 解析（ENOTFOUND），`createConnection` 退化为不被使用；
        // 去掉后 createConnection 正常接管 socket。隧道已由我们持有 socket，
        // 这里不需要（也不允许）再做一次解析。
        const inner = https.request({
          method: init.method ?? 'GET',
          host: url.hostname,
          servername: url.hostname,
          path: `${url.pathname}${url.search}`,
          headers,
          createConnection: () => tlsSocket,
        });
        inner.on('error', (err) => {
          unbind();
          if (init.signal?.aborted || isAbortError(err)) {
            tlsSocket.destroy();
            reject(err);
            return;
          }
          tlsSocket.destroy();
          const classified = classifyNetworkError(err, {
            route: 'tunnel',
            proxyKind: decision.proxyKind,
            degraded: false,
            host: url.host,
          });
          log.warn({ code: classified.code, phase: classified.phase, proxyKind: decision.proxyKind }, '隧道内请求失败');
          finish(() => reject(classified));
        });
        inner.on('response', (res) => {
          unbind();
          finish(() => resolve(toResponse(res)));
        });
        if (init.body !== undefined) inner.end(init.body);
        else inner.end();
      });
    });

    connectReq.on('error', (err) => {
      unbind();
      if (init.signal?.aborted || isAbortError(err)) {
        finish(() => reject(err));
        return;
      }
      const classified = new OutboundHttpError({
        code: 'PROXY_UNREACHABLE',
        phase: 'connect',
        message: `代理不可达（CONNECT ${proxyUrl.host}）: ${err instanceof Error ? err.message : String(err)}`,
        retryable: true,
        degraded: true,
        proxyKind: decision.proxyKind,
        cause: err,
      });
      log.warn(
        { code: classified.code, phase: classified.phase, proxyKind: decision.proxyKind, errno: errnoOf(err) },
        '代理不可达（CONNECT）— 抛错（禁止静默直连回退）',
      );
      finish(() => reject(classified));
    });

    connectReq.end();
  });
}

// ═══════════════════════════════════════════════════════════════
// 公开出口
// ═══════════════════════════════════════════════════════════════

/**
 * 出站 HTTP 请求 — 本仓库 LLM / 连接器出站的唯一入口（冻结 API）。
 *
 * @param url - 目标 URL（http/https；其余抛 `INVALID_URL`）。
 * @param init - method / headers / body / signal。**请求头与体永不进日志。**
 * @returns 真 `Response`（流式 body 未消费即未读）。
 * @throws {OutboundHttpError} 分类错误；代理已选中时**永不**静默改走直连。
 */
export async function outboundFetch(url: string, init: OutboundRequestInit = {}): Promise<Response> {
  const decision = decideRoute(url);
  if (decision.degraded) {
    log.warn({ proxyKind: decision.proxyKind, degraded: true }, '出站代理配置降级 — 本次直连');
  }
  if (decision.route === 'direct') return requestDirect(new URL(url), init);
  if (decision.route === 'tunnel') return requestViaTunnel(new URL(url), init, decision);
  return requestViaHttpProxy(new URL(url), init, decision);
}
