/**
 * evolution-types.ts — L0 自我进化引擎类型定义
 *
 * 三层进化结构:
 *   第一层: 会话内学习 (In-Session) — 仅内存，不持久化
 *   第二层: 组织自适应 (Org Adaptation) — 持久化到 AgentMemoryStore
 *   第三层: 全局进化 (Global Evolution) — 行业聚合 + 规则版本管理
 *
 * 所有 types 使用文件驱动，不硬编码枚举。
 * 新增进化维度 = 加 type 字符串，不改代码。
 */

// ═══ 通用 ═══

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  minCorrectionsForThresholdAdjustment: 3,
  thresholdAdjustmentRatio: 0.2,
  minOrgsForIndustryAggregation: 5,
};

export interface EvolutionConfig {
  /** 触发 org-adapter 的最小纠错次数 (默认 3) */
  minCorrectionsForThresholdAdjustment: number;
  /** 阈值上调幅度 (默认 0.2 = 20%) */
  thresholdAdjustmentRatio: number;
  /** 全局进化触发的最小同行业组织数 (默认 5) */
  minOrgsForIndustryAggregation: number;
}

// ═══ 第一层: 会话内学习 ═══

export interface SessionFeedback {
  diagnosisId: string;
  /** 用户显式反馈的假设/哨兵 ID */
  targetId: string;
  /** 反馈类型 */
  type: 'hypothesis_negated' | 'hypothesis_confirmed' | 'dimension_focus';
  /** 用户提供的理由 */
  reason?: string;
  /** 用户提供的替代值 (如 "实际现金流 500 万") */
  correctionValue?: string;
  /** 会话中情绪强度 (0-1) */
  intensity?: number;
}

export interface SessionWeight {
  targetId: string;
  weight: number;
  reason: string;
}

// ═══ 第二层: 组织自适应 ═══

export type CorrectionMemoryType =
  | 'user_correction'
  | 'threshold_adjustment'
  | 'industry_baseline'
  | 'evolution_snapshot';

export interface UserCorrection {
  sentinelId: string;
  findingId: string;
  correctedClaims: string[];
  /** 从 reason 解析出的结构化事实 */
  facts: ExtractedFact[];
  timestamp: string;
}

export interface ExtractedFact {
  /** 节点类型, 如 'Financial' */
  nodeType: string;
  /** 属性名, 如 'cash' */
  field: string;
  /** 属性值, 解析后的数值 */
  value: number | string;
  /** 用户原始表述 */
  rawText: string;
}

export interface ThresholdAdjustment {
  sentinelId: string;
  oldThreshold: { warning: number; critical: number };
  newThreshold: { warning: number; critical: number };
  correctionCount: number;
  reason: string;
  adjustedAt: string;
}

export interface OrgAdaptationResult {
  correctionsProcessed: number;
  factsWritten: number;
  ticketsClosed: number;
  thresholdsAdjusted: Array<{ sentinelId: string; old: number; new: number }>;
  errors: string[];
  degraded: boolean;
}

// ═══ 第三层: 全局进化 ═══

export interface PerSentinelStats {
  sentinelId: string;
  name: string;
  orgCount: number;
  values: number[];
  median: number;
  p25: number;
  p75: number;
}

export interface IndustryBaseline {
  industry: string;
  aggregatedAt: string;
  sentinelStats: PerSentinelStats[];
  /** 与通用阈值偏差显著的哨兵 */
  thresholdSuggestions: Array<{
    sentinelId: string;
    generalThreshold: { warning: number; critical: number };
    industryMedian: number;
    suggestion: string;
  }>;
}

export interface IndustryPattern {
  type: 'threshold_calibration' | 'common_pitfall' | 'knowledge_gap';
  sentinelId: string;
  evidence: string;
  suggestion: string;
  orgCount: number;
}

// ═══ Phase P2: 进化提案 ═══

export interface ThresholdChange {
  sentinelId: string;
  from: { warning: number; critical: number };
  to: { warning: number; critical: number };
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface EvolutionProposal {
  id: string;
  /** 提案类型: 阈值调整 / 模式发现 */
  type: 'threshold_adjustment' | 'pattern_discovery';
  title: string;
  description: string;
  /** 关联行业 */
  industry: string;
  /** 具体的阈值变更列表 */
  changes: ThresholdChange[];
  /** 风险评估: 影响多少个 org */
  risk: 'low' | 'medium' | 'high';
  /** 影响范围评估 */
  impactEstimate: { orgCount: number; sentinelIds: string[] };
  /** 证据 / 为什么需要此变更 */
  evidence: string;
  /** 状态机: pending → approved/rejected → applied */
  status: ProposalStatus;
  createdAt: string;
  updatedAt: string;
  /** 审批通过后被应用的快照 ID */
  appliedSnapshotId?: string;
  /** 灰度百分比历史 */
  rolloutPercentage?: number;
}

// ═══ L3 Write API 类型 (由 sentinel/runner.ts 实现) ═══

export interface L3WriteAPI {
  closeTicket(orgId: string, sentinelId: string): Promise<number>;
  getThreshold(orgId: string, sentinelId: string): Promise<{ warning: number; critical: number } | null>;
  updateThreshold(orgId: string, sentinelId: string, threshold: { warning?: number; critical?: number }): Promise<void>;
  getSentinelStats(industry: string): Promise<PerSentinelStats[]>;
}

// ═══ L0 Engine 主类型 ═══

export interface EvolutionEngineOptions {
  l3: L3WriteAPI | null;
  l4: {
    graphStore: GraphStoreLike;
    memoryStore: AgentMemoryStoreLike;
    industryLoader: IndustryLoaderLike;
  };
  config?: Partial<EvolutionConfig>;
}

export interface GraphStoreLike {
  createNode(type: string, props: Record<string, unknown>, graph: string): string;
  updateNode(id: string, props: Record<string, unknown>, graph: string): void;
  queryNodes(type: string, filters?: Record<string, unknown>, graph?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  getNode(id: string, graph: string): unknown | null;
}

export interface AgentMemoryStoreLike {
  remember(entry: {
    orgId: string; key: string; value: string; type: string;
    confidence: number; source: string; tags: string[];
    expiresAt: string | null;
  }): unknown;
  recall(orgId: string, key: string): { value: string } | null;
  list(query: { orgId: string; type?: string; tags?: string[]; limit?: number }): Array<{ value: string; tags: string[]; type: string }>;
  forget(orgId: string, key: string): boolean;
}

export interface IndustryLoaderLike {
  getIndustry(name: string): { name: string; displayName: string; extends?: string } | null;
  listIndustries(): string[];
  clearIndustryCache(): void;
}
