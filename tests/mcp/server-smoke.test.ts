/**
 * tests/mcp/server-smoke.test.ts — D595 MCP server stdio 全链路冒烟（S1-S7）
 *
 * 铁律 12: 不 mock 协议管线——spawn 真实 `tsx src/mcp/index.ts` 子进程，
 *          经真实 stdio JSON-RPC 帧收发（initialize → tools/list → tools/call）。
 * 铁律 33: 命名为 *.test.ts（spec §5.1 明示文件名；语义为集成冒烟，随 vitest 全量跑）。
 *
 * 平台兼容（bridge.ts:23-28 同款关注点）: 不经 shell、不依赖 npx/.cmd——
 * 直接 spawn `node <node_modules/tsx/dist/cli.mjs> src/mcp/index.ts`（tsx 官方 CLI 入口），
 * process.execPath 在 win32/mac/linux 均为绝对路径，天然跨平台。
 *
 * 契约:
 *   @input  — src/mcp/index.ts（真实 server 进程）；env SYNOVA_MCP_MODE
 *   @output — S1 信任声明/契约广告、S2 read-only 诚实过滤、S3 写工具 -32000 拒绝、
 *             S4 sentinel_list 经 L2 全链路取数（诚实绿：进程内 registry，无需 HTTP/LLM）、
 *             S5 full 模式 12 工具全广告、S6 边界（未知工具/非法 JSON/缺参 → SDK 标准错误码，
 *             进程不崩 + stdout 纯度）、S7 非法模式 fail-closed（stderr warn + 行为=read-only）
 *   @degraded — 无（冒烟不允许降级放行；断言失败即红）
 *   @error  — 子进程 10s 内未响应 → 测试失败（含 stderr 尾部便于排查）
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');
const TSX_CLI = path.join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const SERVER_ENTRY = path.join(REPO_ROOT, 'src', 'mcp', 'index.ts');

/** 单条 JSON-RPC 响应/请求（测试视角最小形状） */
interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
  method?: string;
  params?: Record<string, unknown>;
}

const WRITE_TOOLS = ['sentinel_run', 'sentinel_run_all', 'diagnose_organization', 'ingest_document'];
const READ_ONLY_TOOL_COUNT = 8;
const FULL_TOOL_COUNT = 12;

/** 真实 stdio MCP 子进程客户端（不 mock 协议——逐行收发 JSON-RPC） */
class McpSmokeClient {
  private proc: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<number, (msg: JsonRpcMessage) => void>();
  private buffer = '';
  readonly stderrChunks: string[] = [];
  /** stdout 全量行（保真留证 + 纯度断言） */
  readonly stdoutLines: string[] = [];

  constructor(env: Record<string, string>) {
    this.proc = spawn(process.execPath, [TSX_CLI, SERVER_ENTRY], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.proc.stdout.setEncoding('utf8');
    this.proc.stderr.setEncoding('utf8');
    this.proc.stdout.on('data', (chunk: string) => {
      this.buffer += chunk;
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (!line) continue;
        this.stdoutLines.push(line);
        try {
          const msg = JSON.parse(line) as JsonRpcMessage;
          if (typeof msg.id === 'number') {
            const resolve = this.pending.get(msg.id);
            if (resolve) {
              this.pending.delete(msg.id);
              resolve(msg);
            }
          }
        } catch {
          // 非 JSON 行：留存在 stdoutLines 中供纯度断言，不在此抛（S6 负责断言）
        }
      }
    });
    this.proc.stderr.on('data', (chunk: string) => this.stderrChunks.push(chunk));
  }

  /** 发任意消息（通知或请求） */
  send(msg: Omit<JsonRpcMessage, 'jsonrpc'> & { id?: number }): void {
    this.proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
  }

  /** 发请求并等待同 id 响应 */
  request(method: string, params: Record<string, unknown>, timeoutMs = 10_000): Promise<JsonRpcMessage> {
    const id = this.nextId++;
    const p = new Promise<JsonRpcMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`请求 ${method} (id=${id}) ${timeoutMs}ms 未响应。stderr 尾部: ${this.stderrTail()}`));
      }, timeoutMs);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
    this.send({ id, method, params });
    return p;
  }

  /** 发裸行（非法 JSON 用） */
  sendRaw(line: string): void {
    this.proc.stdin.write(line + '\n');
  }

  stderrTail(max = 400): string {
    return this.stderrChunks.join('').slice(-max);
  }

  async initialize(): Promise<JsonRpcMessage> {
    const resp = await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'd595-smoke', version: '0.0.0' },
    });
    // 协议纪律：initialize 后发 initialized 通知（SDK 消费）
    this.send({ method: 'notifications/initialized', params: {} });
    return resp;
  }

  async listTools(): Promise<Array<{ name: string; [k: string]: unknown }>> {
    const resp = await this.request('tools/list', {});
    expect(resp.error).toBeUndefined();
    const tools = (resp.result?.tools ?? []) as Array<{ name: string }>;
    return tools;
  }

  kill(): void {
    this.proc.kill();
  }
}

const clients: McpSmokeClient[] = [];
function startClient(env: Record<string, string>): McpSmokeClient {
  const c = new McpSmokeClient(env);
  clients.push(c);
  return c;
}

afterAll(() => {
  for (const c of clients) c.kill();
});

// ═══ 场景组 1: read-only 模式（S1-S4 共用一进程）═══

describe('S1-S4: SYNOVA_MCP_MODE=read-only（stdio 全链路）', () => {
  const client = startClient({ SYNOVA_MCP_MODE: 'read-only' });

  it('S1: initialize → serverInfo.name=synova-agent + instructions 含 SYNOVA-MCP-CONTRACT: 1（DS2/DS6）', async () => {
    const resp = await client.initialize();
    expect(resp.error).toBeUndefined();
    const serverInfo = (resp.result?.serverInfo ?? {}) as { name?: string; version?: string };
    expect(serverInfo.name).toBe('synova-agent');
    expect(typeof serverInfo.version).toBe('string');
    expect((serverInfo.version ?? '').length).toBeGreaterThan(0);
    const instructions = String(resp.result?.instructions ?? '');
    expect(instructions).toContain('SYNOVA-MCP-CONTRACT: 1');
    expect(instructions).toContain('stdio 本机信任');
  });

  it('S2: tools/list → 全部为 read 工具（8 个，零 write 工具广告——诚实能力广告）', async () => {
    const tools = await client.listTools();
    expect(tools).toHaveLength(READ_ONLY_TOOL_COUNT);
    const names = tools.map(t => t.name);
    for (const w of WRITE_TOOLS) expect(names).not.toContain(w);
    // 每个广告工具都带 inputSchema（客户端可调用性契约）
    for (const t of tools) {
      expect(t.inputSchema).toBeDefined();
    }
  });

  it('S3: tools/call sentinel_run（write）→ JSON-RPC error -32000（DS1 权限拒绝指纹）', async () => {
    const resp = await client.request('tools/call', { name: 'sentinel_run', arguments: { sentinelId: 'F1' } });
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32000);
    expect(resp.error?.message).toContain('PERMISSION_DENIED');
    expect(resp.error?.message).toContain('sentinel_run');
  });

  it('S4: tools/call sentinel_list → content[0].text 解析 ok:true 且 total≥0（L2 全链路诚实绿）', async () => {
    const resp = await client.request('tools/call', { name: 'sentinel_list', arguments: {} });
    expect(resp.error).toBeUndefined();
    const content = (resp.result?.content ?? []) as Array<{ type: string; text?: string }>;
    expect(content.length).toBeGreaterThan(0);
    expect(content[0].type).toBe('text');
    const parsed = JSON.parse(content[0].text ?? '{}') as { ok: boolean; total: number };
    expect(parsed.ok).toBe(true);
    expect(parsed.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray((parsed as { sentinels?: unknown[] }).sentinels)).toBe(true);
  });
});

// ═══ 场景组 2: full 模式（S5 + S6 边界共用一进程）═══

describe('S5-S6: SYNOVA_MCP_MODE=full（12 工具 + 边界）', () => {
  const client = startClient({ SYNOVA_MCP_MODE: 'full' });

  it('S5: tools/list → 12 工具全广告（含 4 个 write 工具）', async () => {
    await client.initialize();
    const tools = await client.listTools();
    expect(tools).toHaveLength(FULL_TOOL_COUNT);
    const names = tools.map(t => t.name);
    for (const w of WRITE_TOOLS) expect(names).toContain(w);
    // permission 元数据随 tools/list 下发（客户端可据此预判权限）
    for (const t of tools) {
      expect(['read', 'write']).toContain(t.permission);
    }
  });

  it('S6a: 未知工具 → SDK 标准错误码 -32601（MethodNotFound）', async () => {
    const resp = await client.request('tools/call', { name: 'no_such_tool', arguments: {} });
    expect(resp.error).toBeDefined();
    expect(resp.error?.code).toBe(-32601);
  });

  it('S6b: 缺参调用（无 name）→ JSON-RPC 标准错误码（-32602/-32603 区间），进程不崩', async () => {
    const resp = await client.request('tools/call', {});
    expect(resp.error).toBeDefined();
    expect([-32600, -32602, -32603]).toContain(resp.error?.code);
  });

  it('S6c: 非法 JSON 行 → 不产生响应、不崩进程；后续合法请求照常应答；stdout 纯度保持', async () => {
    const linesBefore = client.stdoutLines.length;
    client.sendRaw('this is not json {{{');
    // 给协议层留出处理窗口
    await new Promise(r => setTimeout(r, 300));
    // 进程仍存活并应答合法请求
    const resp = await client.request('tools/list', {});
    expect(resp.error).toBeUndefined();
    // stdout 纯度：全部行均为合法 JSON（协议面无污染——日志必须走 stderr）
    for (const line of client.stdoutLines.slice(linesBefore)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    // stderr 有日志（协议层错误可见，铁律 24 不静默）
    expect(client.stderrChunks.join('').length).toBeGreaterThan(0);
  });
});

// ═══ 场景组 3: 非法模式 fail-closed（S7，独立进程）═══

describe('S7: SYNOVA_MCP_MODE=bogus（DS11 fail-closed）', () => {
  const client = startClient({ SYNOVA_MCP_MODE: 'bogus' });

  it('启动 stderr 含 fail-closed warn；行为=read-only（tools/list 无 write 工具）', async () => {
    const resp = await client.initialize();
    expect(resp.error).toBeUndefined();
    const tools = await client.listTools();
    const names = tools.map(t => t.name);
    for (const w of WRITE_TOOLS) expect(names).not.toContain(w);
    expect(tools).toHaveLength(READ_ONLY_TOOL_COUNT);
    // stderr 有 fail-closed 警告（resolveMcpMode log.warn 经 pino → fd2）
    expect(client.stderrChunks.join('')).toContain('fail-closed');
  });
});
