/**
 * sentinel/adapters/protocol-coverage-sentinel.ts — 协议覆盖哨兵 (D5)
 * @state: real
 *
 * 检测 MCP/标准 API 协议的覆盖率。不需要外部连接器——统计 SOG 图中已注册的工具/系统。
 * 每周一 9:00 巡检。
 */

import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../types';
import { createLogger } from '../../logger';

const log = createLogger('sentinel/protocol-coverage');

const config: SentinelConfig = {
  id: 'sentinel-protocol-coverage', name: '协议覆盖', description: '检测 MCP/API 标准协议的覆盖率。数据源: SOG图+工具注册表。', category: 'health', priority: 'P1', mode: 'cron', cron: '0 9 * * 1', requiredDataSources: ['sog_graph', 'tool_registry'], confidenceModel: 'deterministic', version: '1.0.0',
};

// 已知的标准协议
const STANDARD_PROTOCOLS = ['MCP', 'REST', 'GraphQL', 'gRPC', 'WebSocket', 'OData'];

export const protocolCoverageSentinel: Sentinel = {
  config,
  async check(context: SentinelContext): Promise<SentinelCheckResult> {
    const { now } = context; const checkedAt = now.toISOString(); const startTime = Date.now();
    try {
      const db = context.db as { prepare(sql: string): { all(): Array<Record<string, unknown>> } } | null;
      const tools: Array<{ id: string; name: string; protocol?: string }> = [];
      if (db) {
        try {
          const rows = db.prepare("SELECT id, props FROM graph_nodes WHERE type = 'TOOL' AND props IS NOT NULL").all();
          for (const r of rows) {
            const props = typeof r.props === 'string' ? JSON.parse(r.props as string) : (r.props || {});
            tools.push({ id: r.id as string, name: (props.name || r.id) as string, protocol: props.protocol as string | undefined });
          }
        } catch { log.debug('协议覆盖: 表不存在或无数据'); }
      }
      if (tools.length === 0) {
        return { sentinelId: config.id, ok: true, findings: [], durationMs: Date.now() - startTime, checkedAt, degraded: true };
      }
      // 统计协议覆盖
      const coveredProtocols = new Set<string>();
      const customTools: string[] = [];
      for (const t of tools) {
        if (t.protocol && STANDARD_PROTOCOLS.some(p => t.protocol!.toUpperCase().includes(p.toUpperCase()))) {
          coveredProtocols.add(t.protocol);
        } else if (t.protocol) {
          customTools.push(`${t.name} (${t.protocol})`);
        } else {
          customTools.push(`${t.name} (未标注协议)`);
        }
      }
      const coverage = coveredProtocols.size / STANDARD_PROTOCOLS.length;
      const findings: SentinelFinding[] = [];
      if (coverage < 0.3) {
        findings.push({ id: `pc-low-${now.getTime()}`, severity: 'critical', title: `协议覆盖率过低 (${(coverage * 100).toFixed(0)}%)`, description: `${tools.length} 个工具中仅覆盖 ${coveredProtocols.size}/${STANDARD_PROTOCOLS.length} 种标准协议。自定义工具: ${customTools.join(', ')}`, evidence: [`标准协议覆盖: ${[...coveredProtocols].join(', ')}`, `自定义/未标注: ${customTools.join(', ')}`], suggestion: '将高频工具接入 MCP 标准协议，降低 Agent 集成成本。', detectedAt: checkedAt });
      } else if (coverage < 0.6) {
        findings.push({ id: `pc-warn-${now.getTime()}`, severity: 'warning', title: `协议覆盖率不足 (${(coverage * 100).toFixed(0)}%)`, description: `还有 ${STANDARD_PROTOCOLS.length - coveredProtocols.size} 种标准协议未覆盖。`, evidence: [`未覆盖: ${STANDARD_PROTOCOLS.filter(p => !coveredProtocols.has(p)).join(', ')}`], suggestion: '扩展工具协议支持，优先 MCP 和 REST。', detectedAt: checkedAt });
      }
      return { sentinelId: config.id, ok: true, findings, durationMs: Date.now() - startTime, checkedAt, degraded: false };
    } catch (err: unknown) {
      return { sentinelId: config.id, ok: false, findings: [], durationMs: Date.now() - startTime, checkedAt, error: (err as Error)?.message || String(err), degraded: true };
    }
  },
};
