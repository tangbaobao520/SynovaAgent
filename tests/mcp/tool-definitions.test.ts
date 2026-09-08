/**
 * tests/mcp/tool-permissions.test.ts — D595 MCP 工具权限模型单元测试（L1，直接 import tool-definitions.ts，不 spawn）
 *
 * 铁律 0-2/48: 测试先行（spec §7 T1-T10 red→green）+ 三路径覆盖（正常/降级/边界）
 * 铁律 33: *.test.ts 单元测试
 * 契约: spec §5.3/§5.4（权限模型 / listSentinels 出口）/ §8（DS4 白名单断言归属本文件——
 *       写集精确性：白名单前缀因 MCP 桥接工具而生，单测随 tests/mcp/ 目录级条目交付）
 *
 * 契约:
 *   @input  — src/mcp/tool-definitions.ts（TOOLS / filterToolsByMode / resolveMcpMode /
 *             assertToolAllowed / handleToolCall / buildInstructions / buildServerInfo）；
 *             src/agent/sentinel-service.ts（部分 mock）；src/middleware/auth.ts（jwtAuthMiddleware）
 *   @output — T1-T10 + DS4 断言全绿 = spec §10 DS1/DS3/DS4/DS5/DS6(部分)/DS11 的单测收口
 *   @degraded — T3 的 log.warn 行为不在此断言（pino 直写 fd2，进程内不可拦截）——
 *               由 server-smoke S7 以真实 stderr 捕获收口（分层验证，无缺口）
 *   @error  — 断言失败即红（不吞）
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../..');

// L2 部分 mock：listSentinels / getSentinelFindings / getSentinelExpertReports 保持真实
// （T4 走真实 L2 出口），runSentinelOnce / getSentinelTickets 用 vi.fn 注入桩值（T5/T7）。
vi.mock('../../src/agent/sentinel-service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/agent/sentinel-service')>();
  return {
    ...actual,
    runSentinelOnce: vi.fn(),
    getSentinelTickets: vi.fn(),
  };
});

import {
  TOOLS,
  filterToolsByMode,
  resolveMcpMode,
  assertToolAllowed,
  handleToolCall,
  buildInstructions,
  buildServerInfo,
  MCP_CONTRACT,
} from '../../src/mcp/tool-definitions';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { runSentinelOnce, getSentinelTickets } from '../../src/agent/sentinel-service';
import { jwtAuthMiddleware } from '../../src/middleware/auth';
import type { SentinelFinding, SentinelCheckResult } from '../../src/sentinel/types';

/** 全类型 finding 桩（零类型断言，CT-46） */
function findingStub(severity: SentinelFinding['severity'], id: string): SentinelFinding {
  return { id, severity, title: `stub ${id}`, description: 'stub finding', evidence: [], suggestion: 'none', detectedAt: '2026-09-09T00:00:00Z' };
}

/** 全类型 SentinelCheckResult 桩（零类型断言，CT-46） */
function checkResultStub(sentinelId: string, severities: SentinelFinding['severity'][]): SentinelCheckResult {
  return {
    sentinelId,
    ok: true,
    findings: severities.map((sev, i) => findingStub(sev, `${sentinelId}-f${i + 1}`)),
    durationMs: 1,
    checkedAt: '2026-09-09T00:00:00Z',
  };
}

/** 写工具集合（spec §5.3：LLM 花费或写库副作用） */
const EXPECTED_WRITE_TOOLS = ['sentinel_run', 'sentinel_run_all', 'diagnose_organization', 'ingest_document'];
/** 12 工具全名单（spec §5.5 补 3 + flywheel_speeds 改名 sentinel_summary） */
const EXPECTED_ALL_TOOLS = [
  'sentinel_list', 'sentinel_run', 'sentinel_run_all', 'sentinel_summary', 'data_source_status',
  'diagnose_organization', 'query_ontology', 'ingest_document', 'get_session',
  'sentinel_reports', 'sentinel_tickets', 'knowledge_ask',
];

// ═══ T1 — 12 工具全含 permission 元数据；write 集合恰为四写工具 ═══

describe('T1: TOOLS permission 元数据（DS1）', () => {
  it('12 工具、名字与 spec §5.5 完全一致', () => {
    expect(TOOLS).toHaveLength(12);
    expect(TOOLS.map(t => t.name).sort()).toEqual([...EXPECTED_ALL_TOOLS].sort());
  });

  it('每个工具都带 permission: read | write（无缺省、无第三个值）', () => {
    for (const tool of TOOLS) {
      expect(['read', 'write']).toContain(tool.permission);
    }
  });

  it('write 集合恰为 {sentinel_run, sentinel_run_all, diagnose_organization, ingest_document}', () => {
    const writeTools = TOOLS.filter(t => t.permission === 'write').map(t => t.name).sort();
    expect(writeTools).toEqual([...EXPECTED_WRITE_TOOLS].sort());
  });
});

// ═══ T2 — filterToolsByMode: read-only 诚实广告（不广告调用不了的写工具）═══

describe('T2: filterToolsByMode 模式过滤（DS1）', () => {
  it("mode='read-only' 排除全部 write 工具，只留 8 个 read 工具", () => {
    const listed = filterToolsByMode(TOOLS, 'read-only');
    expect(listed).toHaveLength(8);
    for (const tool of listed) {
      expect(tool.permission).toBe('read');
      expect(EXPECTED_WRITE_TOOLS).not.toContain(tool.name);
    }
  });

  it("mode='full' 返回全部 12 个工具", () => {
    expect(filterToolsByMode(TOOLS, 'full')).toHaveLength(12);
  });
});

// ═══ T3 — resolveMcpMode: 非法 env fail-closed → read-only；缺省 → full ═══
// （warn 行为由 server-smoke S7 以真实 stderr 捕获——见文件头 @degraded）

describe('T3: resolveMcpMode fail-closed（DS11）', () => {
  it("缺省（undefined）→ 'full'", () => {
    expect(resolveMcpMode(undefined)).toBe('full');
  });

  it("空串 → 'full'", () => {
    expect(resolveMcpMode('')).toBe('full');
  });

  it.each(['bogus', 'FULL', 'write', '0', 'read_only'])('非法值 %s → read-only（不静默回 full）', (bad) => {
    expect(resolveMcpMode(bad)).toBe('read-only');
  });

  it("显式 'read-only' → 'read-only'", () => {
    expect(resolveMcpMode('read-only')).toBe('read-only');
  });
});

// ═══ T6 — assertToolAllowed: read-only 写工具 -32000 / read 放行 / full 写工具放行 ═══

describe('T6: assertToolAllowed 权限拒绝（DS1）', () => {
  it("read-only 下调写工具 → McpError code -32000 且 message 含 PERMISSION_DENIED + 工具名 + 模式", () => {
    for (const name of EXPECTED_WRITE_TOOLS) {
      let caught: unknown;
      try {
        assertToolAllowed(name, 'read-only');
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(McpError);
      const mcpErr = caught as McpError;
      expect(mcpErr.code).toBe(-32000);
      expect(mcpErr.message).toContain('PERMISSION_DENIED');
      expect(mcpErr.message).toContain(name);
      expect(mcpErr.message).toContain('read-only');
    }
  });

  it('read-only 下 read 工具放行（不抛）', () => {
    expect(() => assertToolAllowed('sentinel_list', 'read-only')).not.toThrow();
    expect(() => assertToolAllowed('knowledge_ask', 'read-only')).not.toThrow();
  });

  it("full 下写工具放行（不抛）", () => {
    for (const name of EXPECTED_WRITE_TOOLS) {
      expect(() => assertToolAllowed(name, 'full')).not.toThrow();
    }
  });

  it('未知工具 → McpError -32601（SDK MethodNotFound 标准映射）', () => {
    let caught: unknown;
    try {
      assertToolAllowed('no_such_tool', 'full');
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(McpError);
    expect((caught as McpError).code).toBe(-32601);
  });
});

// ═══ T4 — sentinel_list 处理器经新 L2 listSentinels 返回真实形状 ═══

describe('T4: sentinel_list 处理器（DS3）', () => {
  it("返回 { ok, total≥0, sentinels 数组 }（经 L2 listSentinels，进程内 registry）", async () => {
    const text = await handleToolCall('sentinel_list', {});
    const parsed = JSON.parse(text) as { ok: boolean; total: number; sentinels: Array<Record<string, unknown>> };
    expect(parsed.ok).toBe(true);
    expect(parsed.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(parsed.sentinels)).toBe(true);
    // 形状契约：有哨兵时每项含 id/name/layer/priority/mode
    for (const s of parsed.sentinels) {
      expect(typeof s.id).toBe('string');
      expect(typeof s.name).toBe('string');
      expect(typeof s.layer).toBe('string');
      expect(typeof s.mode).toBe('string');
    }
  });
});

// ═══ T5 — sentinel_run 处理器委托 L2 runSentinelOnce 且单哨兵语义（缺陷 A 修复收口）═══

describe('T5: sentinel_run 单哨兵语义（DS3，缺陷 A）', () => {
  beforeEach(() => {
    vi.mocked(runSentinelOnce).mockReset();
  });

  it('sentinelId 原样传递给 L2 runSentinelOnce（不再误当 teamId / 跑全量）', async () => {
    vi.mocked(runSentinelOnce).mockResolvedValue({
      ok: true,
      sentinelId: 'F1',
      result: checkResultStub('F1', ['warning', 'info', 'info']),
    });
    const text = await handleToolCall('sentinel_run', { sentinelId: 'F1' });
    expect(vi.mocked(runSentinelOnce)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(runSentinelOnce)).toHaveBeenCalledWith('F1');
    const parsed = JSON.parse(text) as { ok: boolean; sentinelId: string; findings: number };
    expect(parsed).toEqual({ ok: true, sentinelId: 'F1', findings: 3 });
  });

  it('L2 降级（ok:false + error）→ 输出透传 error 且 findings=0（铁律 31）', async () => {
    vi.mocked(runSentinelOnce).mockResolvedValue({ ok: false, sentinelId: 'ghost', result: null, error: '哨兵不存在: ghost' });
    const text = await handleToolCall('sentinel_run', { sentinelId: 'ghost' });
    const parsed = JSON.parse(text) as { ok: boolean; findings: number; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.findings).toBe(0);
    expect(parsed.error).toContain('不存在');
  });

  it('缺 sentinelId 参数 → 不打 L2、返回 ok:false + 参数错误', async () => {
    const text = await handleToolCall('sentinel_run', {});
    expect(vi.mocked(runSentinelOnce)).not.toHaveBeenCalled();
    const parsed = JSON.parse(text) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('sentinelId');
  });
});

// ═══ T7 — sentinel_tickets 透传 L2 degraded 标记（铁律 31 全链传播）═══

describe('T7: sentinel_tickets degraded 传播（DS5/DS11）', () => {
  beforeEach(() => {
    vi.mocked(getSentinelTickets).mockReset();
  });

  it('L2 memory-fallback（degraded:true）→ 工具输出含 degraded:true', async () => {
    vi.mocked(getSentinelTickets).mockReturnValue({
      ok: true, source: 'memory-fallback', degraded: true, tickets: [],
    });
    const text = await handleToolCall('sentinel_tickets', {});
    expect(vi.mocked(getSentinelTickets)).toHaveBeenCalledWith(undefined);
    const parsed = JSON.parse(text) as { ok: boolean; degraded?: boolean; source: string };
    expect(parsed.ok).toBe(true);
    expect(parsed.source).toBe('memory-fallback');
    expect(parsed.degraded).toBe(true);
  });

  it('status 参数透传 L2（表路径真实过滤）', async () => {
    vi.mocked(getSentinelTickets).mockReturnValue({ ok: true, source: 'table', tickets: [] });
    await handleToolCall('sentinel_tickets', { status: 'open' });
    expect(vi.mocked(getSentinelTickets)).toHaveBeenCalledWith('open');
  });
});

// ═══ T8 — knowledge_ask: API 不可达 → { ok:false, error 含 不可达 }，不抛不挂 ═══

describe('T8: knowledge_ask HTTP 桥降级（DS5/DS11）', () => {
  const ORIGINAL_PORT = process.env.PORT;

  afterEach(() => {
    if (ORIGINAL_PORT === undefined) delete process.env.PORT;
    else process.env.PORT = ORIGINAL_PORT;
  });

  it('PORT 指向关闭端口 → ok:false + error 含"不可达"（不抛）', async () => {
    process.env.PORT = '1'; // 端口 1 本机几乎必然关闭 → ECONNREFUSED 立即返回
    const text = await handleToolCall('knowledge_ask', { q: '现金流分析怎么做' });
    const parsed = JSON.parse(text) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain('不可达');
  });

  it('q 缺失或过短 → ok:false + 参数提示（不打 HTTP）', async () => {
    process.env.PORT = '1';
    const short = JSON.parse(await handleToolCall('knowledge_ask', { q: 'a' })) as { ok: boolean };
    const missing = JSON.parse(await handleToolCall('knowledge_ask', {})) as { ok: boolean };
    expect(short.ok).toBe(false);
    expect(missing.ok).toBe(false);
  });
});

// ═══ T9 — initialize 构造块: instructions 含契约串；version 读 package.json（消双源）═══

describe('T9: initialize 构造块（DS2/DS6）', () => {
  it('buildInstructions 含信任模型说明 + SYNOVA-MCP-CONTRACT: 1', () => {
    const instructions = buildInstructions();
    expect(instructions).toContain(MCP_CONTRACT);
    expect(instructions).toContain('SYNOVA-MCP-CONTRACT: 1');
    expect(instructions).toContain('stdio 本机信任');
    expect(instructions).toContain('read-only');
  });

  it('serverInfo.name = synova-agent；version 与 package.json 同源（非硬编码字面量）', () => {
    const info = buildServerInfo();
    expect(info.name).toBe('synova-agent');
    const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as { version: string };
    expect(info.version).toBe(pkg.version);
  });

  it('源代码零 "version: 0.1.0" 硬编码字面量（旧 :321 双源缺陷根除）', () => {
    for (const rel of ['src/mcp/index.ts', 'src/mcp/tool-definitions.ts']) {
      const src = readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      expect(src).not.toMatch(/version['"]?\s*[:=]\s*['"]0\.1\.0['"]/);
    }
  });
});

// ═══ T10 — sentinel_summary 诚实化：零捏造字段（缺陷：flywheel_speeds 捏造 valueCreation:50）═══

describe('T10: sentinel_summary 诚实输出（DS3）', () => {
  it('输出不含 valueCreation/valueCapture/valueRegeneration 捏造字段', async () => {
    const text = await handleToolCall('sentinel_summary', {});
    const parsed = JSON.parse(text) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('valueCreation');
    expect(parsed).not.toHaveProperty('valueCapture');
    expect(parsed).not.toHaveProperty('valueRegeneration');
    expect(parsed).not.toHaveProperty('bottleneck');
  });

  it('输出契约 { ok, total, critical, warning, info, overall }（零发现 overall=null 不捏造分数）', async () => {
    const text = await handleToolCall('sentinel_summary', {});
    const parsed = JSON.parse(text) as { ok: boolean; total: number; critical: number; warning: number; info: number; overall: number | null };
    // ok 透传 L2 getSentinelFindings：runner 未初始化环境（本单测进程）诚实返回 ok:false，
    // 不伪造 ok:true（铁律 24——断言的是"诚实"而非"必有数据"）
    expect(typeof parsed.ok).toBe('boolean');
    expect(parsed.total).toBeGreaterThanOrEqual(0);
    expect(typeof parsed.critical).toBe('number');
    expect(typeof parsed.warning).toBe('number');
    expect(typeof parsed.info).toBe('number');
    if (parsed.total === 0) {
      expect(parsed.overall).toBeNull(); // 无数据不伪造评分（铁律 5/24）
    } else {
      expect(typeof parsed.overall).toBe('number');
    }
  });

  it('旧名 flywheel_speeds 已移除（改名后 grep 级收口）', () => {
    expect(TOOLS.map(t => t.name)).not.toContain('flywheel_speeds');
  });
});

// ═══ DS4 — 白名单三前缀（auth.ts isWhitelisted 经 jwtAuthMiddleware 行为收口，spec §8）═══

describe('DS4: auth.ts 白名单三前缀（D595 MCP HTTP 桥）', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = 'd595-whitelist-test-secret';
    process.env.DEV_MODE = 'false';
  });

  /** 行为探针：无 Authorization 头时中间件是否放行（放行=白名单命中）。
   *  桩对象经 Parameters<> 结构化断言进入中间件签名（CT-46：零 any/never/双断言）。 */
  type MwArgs = Parameters<typeof jwtAuthMiddleware>;

  function probe(pathname: string): { nextCalled: boolean; statusCode?: number } {
    const req = { path: pathname, headers: {} } as MwArgs[0];
    const res = {
      statusCode: undefined as number | undefined,
      status(this: { statusCode?: number }, code: number) { this.statusCode = code; return this; },
      json() { return this; },
    } as MwArgs[1];
    let nextCalled = false;
    jwtAuthMiddleware(req, res, () => { nextCalled = true; });
    return { nextCalled, statusCode: res.statusCode };
  }

  it.each([
    '/api/ontology/graph/org-001',       // query_ontology HTTP 桥
    '/api/ontology/ingest',              // ingest_document HTTP 桥
    '/api/knowledge/ask?q=test-question', // knowledge_ask HTTP 桥
  ])('白名单命中 → pass through: %s', (pathname) => {
    const r = probe(pathname);
    expect(r.nextCalled).toBe(true);
  });

  it.each([
    '/api/ontology/other',   // 未声明前缀不放行（防前缀过宽）
    '/api/knowledge/other',
    '/api/workspaces',
  ])('白名单外 → 401: %s', (pathname) => {
    const r = probe(pathname);
    expect(r.nextCalled).toBe(false);
    expect(r.statusCode).toBe(401);
  });
});
