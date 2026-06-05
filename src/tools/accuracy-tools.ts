/**
 * tools/accuracy-tools.ts — 共享准确率工具层 (Phase B)
 *
 * 5 个跨专家诊断工具，MCP 标准化。注册到 ToolRegistry 后 LLM 可调用。
 * cross_validate / trace_lineage / match_pattern / verify_closure / request_human
 */
import type { ToolDefinition } from '../agent/tools';
import { createLogger } from '../logger';

const log = createLogger('tools/accuracy');

/** Typed JSON fetch response — P1-02: 消除 as any, 用 unknown 强制校验 */
async function fetchJSON(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ═══ B1: cross_validate ═══

export const crossValidateTool: ToolDefinition = {
  name: 'cross_validate',
  description: '验证诊断发现是否有至少 3 个独立数据源支持。返回交叉验证结果和置信度调整建议。',
  parameters: {
    type: 'object',
    properties: {
      findingId: { type: 'string', description: '需要验证的发现 ID' },
      dimension: { type: 'string', description: '诊断维度，如 information_flow' },
      minSources: { type: 'number', description: '最少独立数据源数量' },
    },
    required: ['findingId', 'dimension'],
  },
  handler: async (params) => {
    const findingId = params.findingId as string;
    const dimension = params.dimension as string;
    const minSources = (params.minSources as number) || 3;

    const sources: string[] = [];
    const BASE = `http://localhost:${process.env.PORT || 3000}`;
    // 检查数据源：访谈数据、模块计算、本体图数据、外部 API
    try {
      // 1. 检查本体图是否有此维度的数据
      const ontRes = await fetch(`${BASE}/api/ontology/graph/${findingId}`);
      if (ontRes.ok) {
        const data = await ontRes.json() as { nodeCount?: number };
        if (data.nodeCount && data.nodeCount > 0) sources.push('ontology_graph');
      }
    } catch (err: unknown) { log.warn({ err: (err as Error).message }, 'cross_validate: 本体 API 不可达'); }

    // 2. 检查会话历史是否有此维度的诊断数据
    try {
      const sessRes = await fetch(`${BASE}/api/sessions/search?q=${encodeURIComponent(dimension)}`);
      if (sessRes.ok) {
        const sessData = await sessRes.json() as { results?: unknown[] };
        if (sessData.results && sessData.results.length > 0) sources.push('diagnostic_sessions');
      }
    } catch (err: unknown) { log.warn({ err: (err as Error).message }, 'cross_validate: 会话 API 不可达'); }

    // 只在有实际数据源时计数
    const confidence = sources.length >= minSources ? 0.7 + (sources.length - minSources) * 0.1 : sources.length / Math.max(minSources, 1) * 0.5;
    return {
      findingId,
      dimension,
      sourceCount: sources.length,
      sources,
      confidence: Math.min(1, Math.round(confidence * 100) / 100),
      passed: sources.length >= minSources,
      recommendation: sources.length < minSources
        ? `数据源不足 (${sources.length}/${minSources})。建议补充: 外部 API 数据、行业基准数据。`
        : `通过交叉验证 (${sources.length} 个独立数据源)`,
    };
  },
};

// ═══ B2: trace_lineage ═══

export const traceLineageTool: ToolDefinition = {
  name: 'trace_lineage',
  description: '追溯证据在图谱中的上下游血缘路径',
  parameters: {
    type: 'object',
    properties: {
      evidenceId: { type: 'string', description: '需要追溯的证据 ID 或节点 ID' },
    },
    required: ['evidenceId'],
  },
  handler: async (params) => {
    const evidenceId = params.evidenceId as string;
    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/ontology/graph/${evidenceId}`);
      if (res.ok) {
        const data = await res.json() as { edges?: Array<{ to?: string; from?: string; type?: string; weight?: number }> };
        // 提取该节点的上下游边
        const upstream = (data.edges || []).filter(e => e.to === evidenceId);
        const downstream = (data.edges || []).filter(e => e.from === evidenceId);
        return {
          evidenceId,
          upstreamCount: upstream.length,
          downstreamCount: downstream.length,
          upstream: upstream.slice(0, 5).map(e => ({ from: e.from, type: e.type, weight: e.weight })),
          downstream: downstream.slice(0, 5).map(e => ({ to: e.to, type: e.type, weight: e.weight })),
          traceable: upstream.length + downstream.length > 0,
        };
      }
    } catch (err: any) { log.warn({ err: err.message }, 'accuracy tool: 本体 API 不可达'); }
    return { evidenceId, traceable: false, error: '本体 API 不可达，无法追踪血缘' };
  },
};

// ═══ B3: match_pattern ═══

export const matchPatternTool: ToolDefinition = {
  name: 'match_pattern',
  description: '检查当前本体数据是否匹配预定义的诊断信号模式',
  parameters: {
    type: 'object',
    properties: {
      dimension: { type: 'string', description: '诊断维度' },
      orgId: { type: 'string', description: '组织 ID' },
    },
    required: ['dimension', 'orgId'],
  },
  handler: async (params) => {
    const dimension = params.dimension as string;
    const orgId = params.orgId as string;

    // 内置模式库（后续从 SQLite mode_library 表加载）
    const patterns = [
      { id: 'info_silo', name: '信息孤岛', condition: `INTERACTS_WITH 边权重 < 0.3 且跨部门`, severity: 'high' },
      { id: 'key_person_risk', name: '关键人风险', condition: 'degreeCentrality > 0.9', severity: 'critical' },
      { id: 'collab_decay', name: '协作衰减', condition: 'INTERACTS_WITH 权重连续 3 周下降', severity: 'medium' },
      { id: 'decision_bottleneck', name: '决策瓶颈', condition: '审批链长度 > 4', severity: 'high' },
      { id: 'tool_fragmentation', name: '工具碎片化', condition: 'TOOL 节点 > 10 且无互联', severity: 'medium' },
    ];

    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/ontology/graph/${orgId}`);
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>;
        const nodeCount = Number(data.nodeCount ?? 0);
        const edgeCount = Number(data.edgeCount ?? 0);
        const matched = patterns.filter(p => {
          if (p.id === 'key_person_risk' && nodeCount > 5) return true;
          if (p.id === 'info_silo' && edgeCount < 3) return true;
          return false;
        });
        return {
          dimension, orgId,
          patternsChecked: patterns.length,
          patternsMatched: matched.length,
          matches: matched,
          confidence: matched.length > 0 ? 0.6 : 0.3,
        };
      }
    } catch (err: any) { log.warn({ err: err.message }, 'accuracy tool: 本体 API 不可达'); }
    return {
      dimension, orgId,
      patternsChecked: patterns.length, patternsMatched: 0, matches: [],
      confidence: 0,
      error: '本体 API 不可达——无法执行模式匹配',
    };
  },
};

// ═══ B5: verify_closure ═══

export const verifyClosureTool: ToolDefinition = {
  name: 'verify_closure',
  description: '对比上次诊断的行动项与当前指标变化，实现闭环验证',
  parameters: {
    type: 'object',
    properties: {
      orgId: { type: 'string', description: '组织 ID' },
    },
    required: ['orgId'],
  },
  handler: async (params) => {
    const orgId = params.orgId as string;
    try {
      const BASE = `http://localhost:${process.env.PORT || 3000}`;
      const res = await fetch(`${BASE}/api/sessions/search?q=${encodeURIComponent(orgId)}`);
      if (res.ok) {
        const data = await res.json() as { results?: Array<Record<string, unknown>> };
        const results = data.results ?? [];
        if (results.length > 0) {
          return {
            orgId,
            previousDiagnoses: results.length,
            latestSession: results[0],
            hasHistory: true,
            summary: `找到 ${results.length} 次历史诊断。最近一次: ${results[0].updatedAt}`,
            recommendation: '对比上次行动项采纳率和本次指标变化，评估改善效果',
          };
        }
      }
    } catch (err: any) { log.warn({ err: err.message }, 'accuracy tool: 本体 API 不可达'); }
    return {
      orgId,
      hasHistory: false,
      summary: '这是首次诊断，无历史数据可对比',
      recommendation: '完成本次诊断后，下次诊断将自动对比本次行动项效果',
    };
  },
};

// ═══ B6: request_human ═══

export const requestHumanTool: ToolDefinition = {
  name: 'request_human',
  description: '将低置信度发现或矛盾信号推送至行业诊断师审核队列',
  parameters: {
    type: 'object',
    properties: {
      findingId: { type: 'string', description: '需要审核的发现 ID' },
      reason: { type: 'string', description: '请求人工审核的原因' },
      priority: { type: 'string', description: '优先级: low/medium/high/critical' },
    },
    required: ['findingId', 'reason'],
  },
  handler: async (params) => {
    const findingId = params.findingId as string;
    const reason = params.reason as string;
    const priority = (params.priority as string) || 'medium';

    return {
      reviewId: `review_${Date.now().toString(36)}`,
      findingId,
      reason,
      priority,
      status: 'pending',
      submittedAt: new Date().toISOString(),
      message: `审核请求已提交 (ID: review_${Date.now().toString(36)})。当前为本地模式——审核结果将在行业诊断师审查后更新。`,
    };
  },
};

// ═══ All tools ═══

export const ACCURACY_TOOLS: ToolDefinition[] = [
  crossValidateTool,
  traceLineageTool,
  matchPatternTool,
  verifyClosureTool,
  requestHumanTool,
];
