/**
 * harness/team-observer-types.ts — Harness 运行时数据类型
 *
 * Team Observer、Team Controller、Evolution Engine 共享的类型定义。
 * 不依赖 OpenClaw 内部类型，保持运行时无关。
 */

// ================================================================
// 团队健康指标
// ================================================================

/** 6 缝隙维度的运行时统计 */
export interface GapHealthMetric {
  dimension: GapId;
  label: string;
  /** 总事件数 */
  totalEvents: number;
  /** 冲突率 = deadlocked / totalEvents */
  conflictRate: number;
  /** 升级率 = escalated / totalEvents */
  escalateRate: number;
  /** 人工干预率 = humanInterventions / totalEvents */
  interventionRate: number;
  /** 平均响应耗时 ms */
  avgResponseMs: number;
  /** 健康状态 */
  status: 'healthy' | 'degrading' | 'critical';
  /** 最后事件时间 */
  lastEventAt: string;
}

export type GapId =
  | 'division_of_labor'
  | 'information_flow'
  | 'authority_governance'
  | 'trust_incentive'
  | 'knowledge_sharing'
  | 'external_interface';

export const GAP_LABELS: Record<GapId, string> = {
  division_of_labor: '分工协作',
  information_flow: '信息流转',
  authority_governance: '权限治理',
  trust_incentive: '信任与激励',
  knowledge_sharing: '知识共享',
  external_interface: '外部接口',
};

// ================================================================
// 团队整体健康状态
// ================================================================

export interface TeamHealthSnapshot {
  blueprintId: string;
  teamName: string;
  timestamp: string;
  /** 整体健康分 0-100 */
  overallScore: number;
  /** 各维度健康指标 */
  gaps: GapHealthMetric[];
  /** 决策质量趋势 */
  decisionQuality: {
    avgLatencyMs: number;
    escalationRate: number;
    trend: 'improving' | 'stable' | 'declining';
  };
  /** 产出质量 */
  outputQuality: {
    currentScore: number | null;
    previousScore: number | null;
    trend: 'improving' | 'stable' | 'declining';
  };
  /** Agent 数量 */
  agentCount: number;
  /** 总消息数 */
  totalMessages: number;
  /** 运行时长（小时） */
  uptimeHours: number;
  /** 熔断触发次数 */
  circuitBreakerTrips: number;
  /** 活动退化警告 */
  degradationWarnings: DegradationWarning[];
}

export interface DegradationWarning {
  type: 'conflict_spike' | 'decision_stall' | 'quality_drop' | 'trust_decay' | 'info_silo';
  severity: 'warn' | 'critical';
  message: string;
  detectedAt: string;
  dimension?: GapId;
}

// ================================================================
// 优化建议
// ================================================================

export interface OptimizationSuggestion {
  id: string;
  type: 'mode_switch' | 'weight_adjust' | 'skill_swap' | 'protocol_tune' | 'role_replace';
  title: string;
  description: string;
  /** 触发此建议的退化模式 */
  triggeredBy: DegradationWarning;
  /** 建议的具体操作 */
  action: OptimizationAction;
  /** 预期效果 */
  expectedImprovement: string;
  /** 风险等级 */
  riskLevel: 'low' | 'medium' | 'high';
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 是否已应用 */
  applied: boolean;
  /** 忽略时间（7 天冷却期内不重复生成同类型建议） */
  dismissedAt?: string;
  /** 创建时间 */
  createdAt: string;
}

export interface OptimizationAction {
  /** 操作类型 */
  kind: 'update_protocol' | 'update_agent_file' | 'replace_skill' | 'trigger_re_pipeline';
  /** 目标 Agent（如果是团队级则为 null） */
  targetAgent?: string;
  /** 参数变更 */
  changes: Record<string, unknown>;
  /** 回滚信息 */
  rollback?: Record<string, unknown>;
}

// ================================================================
// 进化历史
// ================================================================

export interface EvolutionEvent {
  id: string;
  timestamp: string;
  type: 'suggestion_created' | 'suggestion_applied' | 'suggestion_dismissed' | 'rollback' | 'manual_override';
  suggestionId?: string;
  description: string;
  beforeState?: Record<string, unknown>;
  afterState?: Record<string, unknown>;
  /** 效果评估（应用后采集） */
  outcome?: {
    metric: string;
    before: number;
    after: number;
    improved: boolean;
    /** 效果方向 + 变化幅度 */
    effect?: {
      direction: 'improved' | 'degraded' | 'unchanged';
      delta: number;
    };
  };
}

/** 进化效果统计 */
export interface OutcomeStats {
  total: number;
  improved: number;
  degraded: number;
  unchanged: number;
  /** improved / total */
  improvementRate: number;
  /** 各维度统计 */
  byDimension: Record<string, { improved: number; degraded: number; unchanged: number }>;
  /** 最近一条已评估效果的建议 */
  lastEvaluated?: {
    suggestionId: string;
    description: string;
    before: number;
    after: number;
    delta: number;
    direction: 'improved' | 'degraded' | 'unchanged';
    evaluatedAt: string;
  };
}

// ================================================================
// API 请求/响应
// ================================================================

export interface ApplySuggestionRequest {
  suggestionId: string;
  /** 是否强制应用（跳过确认检查） */
  force?: boolean;
}

export interface ApplySuggestionResponse {
  success: boolean;
  applied: boolean;
  suggestion: OptimizationSuggestion;
  snapshotId?: string;
  message: string;
}

export interface RollbackResponse {
  success: boolean;
  snapshotId: string;
  message: string;
}

export interface TeamListEntry {
  blueprintId: string;
  teamName: string;
  agentCount: number;
  status: 'running' | 'degraded' | 'stopped';
  healthScore: number;
  lastActivityAt: string;
  uptimeHours: number;
}
