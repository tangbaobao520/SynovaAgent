/**
 * src/growth/goal-types.ts — Goal 类型定义
 *
 * 第13份权威文档（增长导航系统工程规范）第一章 §3.1-§3.3。
 * Goal = 增长导航系统中可追踪、可闭环、可审计的改进项。
 *
 * @wire-target — D72 (Proposal引擎) 消费 Goal 类型定义
 * @wire-target — D77 (主Agent集成) 消费 StandardExpertReport→Goal 映射
 * @wire-target — D73 (方案哨兵) 消费 Goal.goalId 注册方案哨兵
 *
 * 契约:
 *   @input  — 28字段完整定义，全部字段 JSDoc 标注
 *   @output — 类型安全的封闭枚举
 *   @degraded — 不适用（纯类型定义，无运行时逻辑）
 */

// ═══ Goal 7态状态机 ═══

/**
 * Goal 的 7 种生命周期状态。
 *
 * 状态转换规则（共17条，详见 goal-store.ts 的 TRANSITION_RULES）:
 *   draft → pending_ga → active ⇄ paused
 *                      ↘ abandoned
 *   draft → abandoned
 *   active → completed → archived
 *   active → abandoned → archived
 *   paused → active | abandoned
 *
 * 废弃和归档不可逆：abandoned → * 和 archived → * 均不允许。
 */
export type GoalStatus = 'draft' | 'pending_ga' | 'active' | 'completed' | 'abandoned' | 'paused' | 'archived';

/** 全部 7 个有效 GoalStatus 值 */
export const VALID_GOAL_STATUSES: readonly GoalStatus[] = [
  'draft', 'pending_ga', 'active', 'completed', 'abandoned', 'paused', 'archived',
];

// ═══ GoalMetric ═══

/**
 * 可量化指标 — 绑定 compute 函数的具体测量。
 *
 * @contract currentValue ≤ targetValue 表示正向指标（如营收），反之亦然。
 */
export interface GoalMetric {
  /** 指标名称（如 "营收增长率", "利润率"） */
  metricName: string;
  /** 当前实测值 */
  currentValue: number;
  /** 目标值 */
  targetValue: number;
  /** 单位（如 "万元", "%", "人天"） */
  unit: string;
  /** 对应的 compute 契约 ID（如 COMPUTE-BREAK-EVEN-v1） */
  computeContractId: string;
  /** 基线时段（可选） */
  baselinePeriod?: { start: string; end: string };
}

// ═══ SuccessCriterion ═══

/**
 * 完成条件 — 判定 Goal 是否达成的标准。
 */
export interface SuccessCriterion {
  /** 条件描述（如 "月度营收 ≥ 500 万元"） */
  criterion: string;
  /** 验证方式 */
  verificationMethod: 'metric_threshold' | 'manual_review' | 'external_audit';
  /** 是否已验证通过 */
  verified: boolean;
  /** 验证通过时间戳 */
  verifiedAt?: string;
}

// ═══ Goal 28字段接口 ═══

/**
 * Goal — 增长导航系统中的改进项。
 *
 * 共 28 个字段，与权威文档第一章 §3.1 完全对齐。
 * 通过 GraphStore.createNode(type='GOAL') 持久化。
 *
 * @contract goalId 全局唯一，由 createGoal 生成
 * @contract status 只能是 7 态之一，受 17 条转换规则约束
 * @contract createdAt/lastModifiedAt 为 ISO-8601 字符串
 */
export interface Goal {
  /** 唯一标识（由 createGoal 自动生成） */
  goalId: string;
  /** 所属组织 ID */
  orgId: string;
  /** 来源 Proposal ID（来自 D72，可选） */
  proposalId: string;
  /** 来源诊断报告 ID */
  diagnosisId: string;
  /** Goal 标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2';
  /** 当前生命周期状态 */
  status: GoalStatus;
  /** 负责部门 ID */
  ownerDeptId: string;
  /** 具体负责人（可选） */
  assignedTo?: string;
  /** 创建时间（ISO-8601） */
  createdAt: string;
  /** 截止日期（ISO-8601） */
  deadline: string;
  /** 绑定的可量化指标列表 */
  metrics: GoalMetric[];
  /** 完成条件清单 */
  successCriteria: SuccessCriterion[];
  /** 依赖的其他 Goal ID 列表 */
  dependsOn: string[];
  /** 冲突的其他 Goal ID 列表 */
  conflictsWith: string[];
  /** 轻量级再诊断次数（D75 使用） */
  reDiagnosisCount: number;
  /** 创建者信息 */
  createdBy: { role: string; departmentId?: string };
  /** 最后修改时间（ISO-8601） */
  lastModifiedAt: string;
  /** 计划持续天数 */
  plannedDurationDays: number;
  /** 实际持续天数（完成后设置） */
  actualDurationDays?: number;
  /** 从诊断报告继承的根因 */
  rootCause?: string;
  /** 自定义标签 */
  tags?: string[];
  /** 扩展属性 */
  props?: Record<string, unknown>;
}

// ═══ StandardExpertReport → Goal 字段映射（供 D77 集成使用） ═══

/**
 * StandardExpertReport → Goal 字段映射。
 *
 * 权威文档第五章 §2.1 定义。D77 将实现自动转换。
 *
 * | StandardExpertReport 字段 | Goal 字段 | 规则 |
 * |--------------------------|----------|------|
 * | diagnosisId              | diagnosisId | 直接复制 |
 * | actionRecommendations[selected].description | title | 提取前30字符 |
 * | actionRecommendations[selected].estimatedCost.timeline | deadline | ISO-8601 |
 * | actionRecommendations[selected].riskLevel | priority | high→P0, medium→P1, low→P2 |
 * | actionRecommendations[selected].expectedImpact | metrics[] | 每个受影响维度创建一个 GoalMetric |
 * | crossExpertContradictions | conflictsWith | 同部门内维度冲突 → Goal 冲突标记 |
 * | hypotheses[rootCause] | rootCause | 置信度最高的根因 |
 *
 * 注意: `actionRecommendations[selected]` 指 GA 选择的行动方案。
 * 当前 `actionRecommendations` 在 engine-core 中为 `string[]`。
 * D77 将处理此映射，D71 只定义映射表。
 */

// ═══ 状态转换规则类型定义 ═══

/**
 * 状态转换规则定义。
 * 每条规则标注 from→to 方向、前置条件和说明。
 */
export interface TransitionRule {
  from: GoalStatus;
  to: GoalStatus;
  /** 规则描述 */
  description: string;
  /** 前置条件检查函数名（在 goal-store.ts 中实现） */
  precondition?: string;
}

// ═══ GraphStore 轻量接口（供 goal-store 使用） ═══

/**
 * goal-store 所需的最小 GraphStore 接口。
 * 用于依赖注入，避免直接依赖 l4/graph-bridge 实现类。
 */
export interface GraphBridgeLike {
  createNode(type: string, props: Record<string, unknown>, graph: string): string;
  getNode(id: string, graph: string): unknown | null;
  updateNode(id: string, props: Record<string, unknown>, graph: string): void;
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
}

/**
 * goal-lifecycle 所需的最小 AuditStore 接口。
 */
export interface AuditStoreLike {
  write(entry: {
    orgId: string;
    actorId: string;
    actorRole: string;
    action: string;
    targetType?: string;
    targetId?: string;
    oldValue?: string;
    newValue?: string;
  }): Promise<string>;
}

/**
 * goal-lifecycle 所需的最小 PolicyEngine 接口。
 */
export interface PolicyEngineLike {
  evaluate(req: { role: string; dataLevel: string; soi: string }): { allow: boolean; denyReason?: string };
}
