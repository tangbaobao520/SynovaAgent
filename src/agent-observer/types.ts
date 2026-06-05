/**
 * agent-observer/types.ts — Agent Observer 统一数据格式
 *
 * 铁律 39: L4 本体层。定义外部 Agent 上报活动的数据类型。
 * 所有适配器 (MCP/Python/Hook/SDK) 共用此格式。
 *
 * 参考: docs/research/SYNOVA-AgentObserver-框架适配执行指引-20260605.html
 */

/** 支持的 Agent 平台标识 */
export type AgentPlatform =
  | 'claude-code'
  | 'cline'
  | 'cursor'
  | 'windsurf'
  | 'openclaw'
  | 'langchain'
  | 'crewai'
  | 'autogen'
  | 'hermes'
  | 'mcp'
  | 'custom';

/** Agent 运行状态 */
export type AgentStatus = 'active' | 'idle' | 'error' | 'offline';

/** 活动类型 */
export type ActivityType =
  | 'tool_call'
  | 'llm_call'
  | 'subagent_spawn'
  | 'task_complete'
  | 'error'
  | 'heartbeat'
  | 'lifecycle'
  | 'custom';

/**
 * 一次 Agent 活动事件。
 * 外部适配器通过 POST /api/agent-observer/report 上报。
 */
export interface AgentActivity {
  /** Agent 唯一标识 (同平台内不重复) */
  agentId: string;
  /** 来源平台 */
  platform: AgentPlatform | string;
  /** 可读名称 */
  name: string;
  /** 内部/外部 Agent */
  agentType: 'internal' | 'external';
  /** 活动类型 */
  activityType: ActivityType;
  /** ISO 8601 时间戳 */
  timestamp: string;
  /** 所属团队 (决定 graph namespace，缺省='default') */
  teamId?: string;
  /** 模型名 (如 claude-opus-4-8) */
  model?: string;
  /** Agent 状态 */
  status?: AgentStatus;
  /** 工具名 (如果是 tool_call) */
  lastToolName?: string;
  /** 附加信息 (工具参数/错误消息/自定义 JSON) */
  detail?: string | Record<string, unknown>;
  /** 会话 ID (如果有) */
  sessionId?: string;
  /** 操作是否成功 */
  success?: boolean;
  /** 耗时 (ms) */
  durationMs?: number;
  /** LLM 输入 token */
  tokenIn?: number;
  /** LLM 输出 token */
  tokenOut?: number;
  /** 成本 (USD) */
  costUsd?: number;
}

/**
 * 上报 API 响应
 * POST /api/agent-observer/report
 */
export interface ReportResponse {
  ok: boolean;
  /** 创建/更新的 AGENT 节点 ID */
  agentNodeId: string;
  /** 'created' | 'updated' */
  action: 'created' | 'updated';
  /** 是否降级 (铁律 31: 降级信号传播) */
  degraded: boolean;
  /** 错误列表 */
  errors: string[];
}

/** 批量上报响应 */
export interface BatchReportResponse {
  ok: boolean;
  results: ReportResponse[];
  count: number;
  degraded: boolean;
}
