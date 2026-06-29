/**
 * mcp/index.ts — SynovaAgent MCP Server (双轨策略 #2)
 *
 * 以 stdio 协议暴露诊断工具：
 *   diagnose_organization — 运行六阶段诊断
 *   query_ontology       — 查询本体图
 *   ingest_document      — 文档录入本体
 *   get_session          — 查询历史会话
 *
 * 对标 Claw-Code MCP 集成模式。NemoClaw 可通过 MCP 工具调用 Synova。
 *
 * 用法: npx tsx src/mcp/index.ts
 */
import * as readline from 'readline';
import { createProvider } from '../providers';
import { detectProvider } from '../providers/detect';
import { ConversationEngine } from '../agent/conversation-engine';

// ═══ MCP Protocol ═══

interface MCPRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

// ═══ Tool Definitions ═══

const TOOLS = [
  {
    name: 'sentinel_list',
    description: '列出所有哨兵 (ID/名称/层/状态/数据依赖满足度)',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'sentinel_run',
    description: '运行指定哨兵',
    inputSchema: { type: 'object', properties: { sentinelId: { type: 'string', description: '哨兵 ID' } }, required: ['sentinelId'] },
  },
  {
    name: 'sentinel_run_all',
    description: '运行全量哨兵并返回结果',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'flywheel_speeds',
    description: '获取三飞轮当前转速 + 瓶颈维度',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'data_source_status',
    description: '数据源连接状态 + 字段覆盖度',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'diagnose_organization',
    description: '对指定组织运行六阶段诊断分析，返回结构化诊断报告',
    inputSchema: {
      type: 'object',
      properties: {
        orgName: { type: 'string', description: '组织名称' },
        initiatorRole: { type: 'string', description: '发起人角色 (CEO/Manager/HR等)', default: '管理者' },
      },
      required: ['orgName'],
    },
  },
  {
    name: 'query_ontology',
    description: '查询组织的本体图（节点数、边数、实体类型分布）',
    inputSchema: {
      type: 'object',
      properties: {
        orgId: { type: 'string', description: '组织 ID' },
      },
      required: ['orgId'],
    },
  },
  {
    name: 'ingest_document',
    description: '将文档录入本体图（支持 PRD、会议纪要、报告等）',
    inputSchema: {
      type: 'object',
      properties: {
        orgId: { type: 'string', description: '组织 ID' },
        name: { type: 'string', description: '文档名称' },
        type: { type: 'string', description: '文档类型 (prd/meeting_notes/report/contract/other)' },
        content: { type: 'string', description: '文档内容' },
      },
      required: ['orgId', 'name', 'type', 'content'],
    },
  },
  {
    name: 'get_session',
    description: '获取历史诊断会话',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: '会话 ID（不提供则列出所有会话）' },
      },
    },
  },
];

// ═══ Tool Handlers ═══

async function handleToolCall(name: string, params: Record<string, unknown>): Promise<string> {
  switch (name) {
    case 'sentinel_list': {
      try {
        const { getSentinelRegistry } = await import('../sentinel/registry');
        const reg = getSentinelRegistry();
        const list = reg.list().map(s => ({
          id: s.config.id, name: s.config.name, layer: (s.config as unknown as Record<string, unknown>).layer || s.config.category,
          priority: s.config.priority, mode: s.config.mode,
        }));
        return JSON.stringify({ ok: true, total: list.length, sentinels: list });
      } catch (err: unknown) {
        return JSON.stringify({ ok: false, error: String(err) });
      }
    }
    case 'sentinel_run': {
      try {
        const sentinelId = params.sentinelId as string;
        const { runSentinelForTeam } = await import('../sentinel/sentinel-runner');
        // 用默认 db 构造 store
        const { getDatabase, initEngineContext } = await import('../init/engine-context');
        const { createSynovaGraphStore } = await import('@synova/graph-store');
        try { getDatabase(); } catch { initEngineContext(); }
        const store = createSynovaGraphStore(getDatabase() as never);
        const findings = await runSentinelForTeam(sentinelId, store);
        return JSON.stringify({ ok: true, sentinelId, findings: findings.length });
      } catch (err: unknown) {
        return JSON.stringify({ ok: false, error: String(err) });
      }
    }
    case 'sentinel_run_all': {
      try {
        const { getSentinelRegistry } = await import('../sentinel/registry');
        const registry = getSentinelRegistry();
        const context = { db: undefined, now: new Date(), registry };
        const allResults = await Promise.allSettled(registry.list().map(s => s.check(context)));
        const results = allResults.map((r, i) => ({ sentinelId: registry.list()[i].config.id, ok: r.status === 'fulfilled' }));
        return JSON.stringify({ ok: true, total: results.length, results });
      } catch (err: unknown) {
        return JSON.stringify({ ok: false, error: String(err) });
      }
    }
    case 'flywheel_speeds': {
      try {
        const { getGlobalSentinelRunner } = await import('../sentinel/runner');
        const runner = getGlobalSentinelRunner();
        const allFindings: import('../sentinel/types').SentinelFinding[] = [];
        if (runner) {
          for (const runs of runner.getRecentResults().values()) {
            for (const run of runs) {
              if (run.result.findings) allFindings.push(...run.result.findings);
            }
          }
        }
        if (allFindings.length === 0) {
          return JSON.stringify({ ok: true, valueCreation: 50, valueCapture: 50, valueRegeneration: 50, bottleneck: 'environment', findings: 0 });
        }
        // 按严重度汇总
        const sev: Record<string, number> = { emergency: 0, critical: 0, warning: 50, info: 100 };
        const score = Math.round(allFindings.reduce((s, f) => s + (sev[f.severity] ?? 50), 0) / allFindings.length);
        return JSON.stringify({ ok: true, overall: score, critical: allFindings.filter(f => f.severity === 'critical').length, warning: allFindings.filter(f => f.severity === 'warning').length, findings: allFindings.length });
      } catch (err: unknown) {
        return JSON.stringify({ ok: false, error: String(err) });
      }
    }
    case 'data_source_status': {
      try {
        const { getDatabase, initEngineContext } = await import('../init/engine-context');
        try { getDatabase(); } catch { initEngineContext(); }
        const db = getDatabase();
        const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
        return JSON.stringify({ ok: true, connected: true, tables: tables.map(t => t.name) });
      } catch (err: unknown) {
        return JSON.stringify({ ok: false, error: String(err), connected: false });
      }
    }
    case 'diagnose_organization': {
      const orgName = params.orgName as string;
      const provider = createProvider(detectProvider(), {
        apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
        gatewayHost: process.env.OPENCLAW_GATEWAY_HOST,
      });
      const conv = new ConversationEngine(provider, { orgId: orgName, maxTurns: 3 });
      const result = await conv.processMessage(
        `我的组织"${orgName}"需要诊断。角色: ${params.initiatorRole || '管理者'}`,
      );
      return JSON.stringify({
        orgName,
        phase: conv.getPhase(),
        reply: result.reply.slice(0, 2000),
        messageCount: conv.getMessages().length,
      });
    }
    case 'query_ontology': {
      const orgId = params.orgId as string;
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      try {
        const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
        return await res.text();
      } catch (err: any) {
        process.stderr.write(`[mcp] query_ontology fetch failed: ${err.message?.slice(0, 80)}\n`);
        return JSON.stringify({ error: '本体 API 不可达——请确保 SynovaAgent 服务已启动' });
      }
    }
    case 'ingest_document': {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      try {
        const res = await fetch(`${BASE}/api/ontology/ingest`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        return await res.text();
      } catch (err: any) {
        process.stderr.write(`[mcp] ingest_document fetch failed: ${err.message?.slice(0, 80)}\n`);
        return JSON.stringify({ error: '本体 API 不可达' });
      }
    }
    case 'get_session': {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const sessionId = params.sessionId as string;
      try {
        const res = await fetch(sessionId ? `${BASE}/api/sessions/${sessionId}` : `${BASE}/api/sessions`);
        return await res.text();
      } catch (err: any) {
        process.stderr.write(`[mcp] get_session fetch failed: ${err.message?.slice(0, 80)}\n`);
        return JSON.stringify({ error: '会话 API 不可达' });
      }
    }
    default:
      return JSON.stringify({ error: `未知工具: ${name}` });
  }
}

// ═══ MCP Message Loop ═══

function send(response: MCPResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const req: MCPRequest = JSON.parse(line);

      if (req.method === 'initialize') {
        send({
          jsonrpc: '2.0', id: req.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'synova-agent', version: '0.1.0' },
            capabilities: { tools: {} },
          },
        });
      } else if (req.method === 'tools/list') {
        send({ jsonrpc: '2.0', id: req.id, result: { tools: TOOLS } });
      } else if (req.method === 'tools/call') {
        const params = req.params as { name: string; arguments: Record<string, unknown> };
        const result = await handleToolCall(params.name, params.arguments);
        send({
          jsonrpc: '2.0', id: req.id,
          result: { content: [{ type: 'text', text: result }] },
        });
      } else {
        send({ jsonrpc: '2.0', id: req.id, error: { code: -32601, message: `未知方法: ${req.method}` } });
      }
    } catch (err: any) {
      // 无法解析 JSON 的行——写入 stderr 便于运维排查
      process.stderr.write(`[mcp] JSON parse error: ${err.message?.slice(0, 80)}\n`);
    }
  }
}

main().catch((err) => {
  process.stderr.write(`MCP Fatal: ${err.message}\n`);
  process.exit(1);
});
