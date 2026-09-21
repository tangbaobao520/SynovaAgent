# Reference Map

| 符号 | 文件 | 行 | 内容 |
|------|------|-----|------|

## outboundFetch
| `outboundFetch` | src/connectors/ima.ts | 15 | `// D862/P-1: 出站走唯一出口 outboundFetch（loopback/代理由出口统一裁决；` |
| `outboundFetch` | src/connectors/ima.ts | 17 | `import { outboundFetch, OutboundHttpError } from '../providers/http-exit';` |
| `outboundFetch` | src/connectors/ima.ts | 118 | `      const response = await outboundFetch(`${this.config.baseUrl}/v1/auth`, {` |
| `outboundFetch` | src/connectors/ima.ts | 148 | `      const response = await outboundFetch(` |
| `outboundFetch` | src/connectors/ima.ts | 164 | `      const response = await outboundFetch(`${this.config.baseUrl}/v1/documents/${documentId}/content`, {` |
| `outboundFetch` | src/connectors/ima.ts | 184 | `      const response = await outboundFetch(`${this.config.baseUrl}/v1/health`, { signal: AbortSignal.timeout(5000) });` |
| `outboundFetch` | src/providers/base.ts | 19 | `import { outboundFetch, getProxyStatus, OutboundHttpError } from './http-exit';` |
| `outboundFetch` | src/providers/base.ts | 180 | `    return outboundFetch(`${baseUrl}${chatPath}`, {` |
| `outboundFetch` | src/providers/base.ts | 243 | `      const res = await outboundFetch(`${baseUrl}${modelsPath}`, {` |
| `outboundFetch` | src/providers/ernie.ts | 14 | `import { outboundFetch, OutboundHttpError } from './http-exit';` |
| `outboundFetch` | src/providers/ernie.ts | 44 | `    res = await outboundFetch(`${AUTH_URL}?${params}`, {` |
| `outboundFetch` | src/providers/ernie.ts | 136 | `        res = await outboundFetch(url, {` |
| `outboundFetch` | src/providers/http-exit.ts | 24 | ` * - `outboundFetch(url, init)` → **真** `Response`（node `IncomingMessage` →` |
| `outboundFetch` | src/providers/http-exit.ts | 29 | ` * **公开面（队长 2026-09-20 收窄裁决）**：仅 `outboundFetch` / `getProxyStatus` /` |
| `outboundFetch` | src/providers/http-exit.ts | 32 | ` * `outboundFetch` 的真实行为与 `getProxyStatus()` 的快照判断，避免第三处解析器出现。` |
| `outboundFetch` | src/providers/http-exit.ts | 411 | ` * 解析一个目标 URL 的出站路由（内部单源，`resolveProxyForTarget` 与 `outboundFetch` 共用）。` |
| `outboundFetch` | src/providers/http-exit.ts | 948 | `export async function outboundFetch(url: string, init: OutboundRequestInit = {}): Promise<Response> {` |
| `outboundFetch` | tests/providers/helpers/fake-proxy.ts | 9 | ` *   客户端（真实 provider.chat → 真实 outboundFetch）→ **本桩** → 本地 origin（真实 HTTP 上游）。` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 34 | ` *      outboundFetch → 代理 → TLS）全程真实执行）。` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 51 | `import { getProxyStatus, outboundFetch, OutboundHttpError } from '../../src/providers/http-exit';` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 347 | `        await outboundFetch(`http://${INTRANET_HOST}:11451/v1/chat/completions`);` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 390 | `      outboundFetch(`http://127.0.0.1:${origin.port}/loopback-a`));` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 412 | `        await outboundFetch(`http://127.0.0.2:${origin.port}/loopback-b`, {` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 440 | `        await outboundFetch(`http://127.0.0.1:${closedPort}/refused`);` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 458 | `      outboundFetch('http://10.0.0.1:11451/non-loopback-control'));` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 476 | `        const response = await outboundFetch(`http://127.0.0.1:${origin.port}/after-degrade`);` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 525 | `          await outboundFetch(`http://${INTRANET_HOST}:${origin.port}/must-not-fallback`);` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 557 | `        const direct = await withProxyEnv({}, async () => outboundFetch(`http://${ip}:${origin.port}/direct-control`));` |
| `outboundFetch` | **tests/providers/http-exit-proxy.integration.test.ts** 📋 | 563 | `            await outboundFetch(`http://${ip}:${origin.port}/must-not-fallback-strong`);` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 6 | ` * 出口只公开 `outboundFetch` / `getProxyStatus` / `OutboundHttpError`（+ 类型）。` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 44 | `import { outboundFetch, getProxyStatus, OutboundHttpError } from '../../src/providers/http-exit';` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 338 | `// 行为探针（全部经 outboundFetch，带兜底超时）` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 368 | `    const res = await outboundFetch(target, { ...init, signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 636 | `      const res = await outboundFetch(`http://[::1]:${port}/v6`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 752 | `      const res = await outboundFetch(`https://localhost:${origin.port}/bypassed`, {` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 776 | `      const res = await outboundFetch(`https://localhost:${origin.port}/cidr`, {` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 999 | `      const res = await outboundFetch(target, {` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 1027 | `      const res = await outboundFetch(`http://127.0.0.1:${origin.port}/direct`, {` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 1066 | `      const res = await outboundFetch(`http://${REMOTE_TARGET_HOST}/authed`, {` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 1154 | `      await outboundFetch(`https://${TUNNEL_TARGET_HOST}/hang`, {` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 1231 | `      await outboundFetch(target, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 1263 | `      const promise = outboundFetch(`http://127.0.0.1:${origin.port}/slow`, { signal: controller.signal });` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 1274 | `  it('outboundFetch 返回 Promise 且解析为真 Response', async () => {` |
| `outboundFetch` | **tests/providers/http-exit.test.ts** 📋 | 1277 | `      const p = outboundFetch(`http://127.0.0.1:${origin.port}/shape`, {` |
| `outboundFetch` | **tests/errors/llm-error-taxonomy.test.ts** 📋 | 18 | `import { outboundFetch } from '../../src/providers/http-exit';` |
| `outboundFetch` | **tests/errors/llm-error-taxonomy.test.ts** 📋 | 23 | ` * `src/providers/base.ts` 的出站已从裸 `fetch` 收敛到唯一出口 `outboundFetch`` |
| `outboundFetch` | **tests/errors/llm-error-taxonomy.test.ts** 📋 | 28 | ` * 因此改为对**真 seam** 打桩：`vi.mock` 只替换 `outboundFetch` 一个导出，` |
| `outboundFetch` | **tests/errors/llm-error-taxonomy.test.ts** 📋 | 35 | `  return { ...actual, outboundFetch: vi.fn() };` |
| `outboundFetch` | **tests/errors/llm-error-taxonomy.test.ts** 📋 | 37 | `const mockOutboundFetch = vi.mocked(outboundFetch);` |
