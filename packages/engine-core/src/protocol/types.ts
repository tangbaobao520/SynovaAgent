/**
 * protocol-engine/types.ts — Protocol Engine 核心类型定义
 *
 * 自包含，不依赖 engine-server 或 culture-forge 外部类型。
 */

// ================================================================
// 缝隙维度
// ================================================================

export type GapDimension =
  | 'division_of_labor'
  | 'information_flow'
  | 'authority_governance'
  | 'trust_incentive'
  | 'knowledge_sharing'
  | 'external_interface'
  | 'safety_baseline';

export const GAP_DIMENSION_LABELS: Record<GapDimension, string> = {
  division_of_labor: '分工协作',
  information_flow: '信息流转',
  authority_governance: '权限治理',
  trust_incentive: '信任与激励',
  knowledge_sharing: '知识共享',
  external_interface: '外部接口',
  safety_baseline: '安全基线',
};

// ================================================================
// 协议结构
// ================================================================

export interface TeamProtocol {
  version: number;
  roles: string[];
  mode?: string;
  gaps: Record<string, unknown>;
  evolution?: ProtocolEvolution;
}

export interface ProtocolEvolution {
  version: number;
  lastUpdated: string;
  changeLog: string[];
}

// ================================================================
// Agent 消息
// ================================================================

export interface AgentMessage {
  from: string;
  to: string;
  type: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  /** GAP-2: 任务增强卡（跨角色知识注入，任务完成后过期） */
  augmentation?: TaskAugmentationCard;
}

/** GAP-2: 任务增强卡 — 临时上下文注入，不写入 SOUL.md */
export interface TaskAugmentationCard {
  id: string;
  taskCategory: string;
  targetRoleId: string;
  matchedMemories: Array<{ memoryId: string; title: string; snippet: string }>;
  recommendedFallbacks: string[];
  generatedAt: string;
  expiresAt: string;
}

export interface CollaborationContext {
  sessionId: string;
  agentRoles: Record<string, string>;
  teamSize?: number;
  stage?: string;
}

export interface SessionFragment {
  sessionId: string;
  messages: AgentMessage[];
  startedAt: string;
  lastActiveAt: string;
  /** 片段结束时间 */
  endTime?: number;
  /** 角色 ID */
  roleId?: string;
}

// ================================================================
// 协议违规与拦截
// ================================================================

export type ConstraintSeverity = 'LOCK' | 'BLOCK' | 'WARN';

export interface ProtocolViolation {
  gapDimension: GapDimension;
  severity: ConstraintSeverity;
  clause: string;
  suggestion?: string;
  evidenceUrl?: string;
}

export interface ProtocolInterceptResult {
  passed: boolean;
  violations: ProtocolViolation[];
  source: 'cache' | 'rule' | 'workspace' | 's1' | 'llm' | 'fallback';
  reason?: string;
  /** override 相关（仅 BLOCK 时有效） */
  overridePriority?: number;
  maxOverrides?: number;
  overrideQuotaUsed?: number;
  /** LLM 裁决的推理过程 */
  llmReasoning?: string;
  /** GAP-2: 路由决策（interceptor 集成 routing-engine 后返回） */
  routing?: RoutingDecision;
}

/** GAP-2: 路由决策 */
export interface RoutingDecision {
  mandatoryTargets: string[];
  conditionalTargets: string[];
  suppressTargets: string[];
  augmentationCard?: TaskAugmentationCard;
  decisionLog: string;
}

export interface ProtocolInspectResult {
  passed: boolean;
  violations: ProtocolViolation[];
  warnings?: string[];
  recommendations?: string[];
  incentiveHints?: IncentiveHint[];
}

// ================================================================
// 拦截器配置
// ================================================================

export interface ProtocolInterceptorConfig {
  defaultMaxOverrides: number;
  llmTimeoutMs: number;
  maxInterceptsPerSecond?: number;
  s1Enabled?: boolean;
  s1IntervalMs?: number;
  s1QuickCheckEnabled?: boolean;
  /** 依赖注入：规则引擎实例 */
  ruleEngine?: any;
  /** 依赖注入：LLM 裁决器实例 */
  llmJudge?: any;
  /** 依赖注入：裁决缓存实例 */
  cache?: any;
  /** 依赖注入：熔断器实例 */
  circuitBreaker?: any;
  /** 依赖注入：协作事件记录回调（避免直接导入 engine-server） */
  onCollaborationEvent?: (event: Record<string, unknown>) => void;
}

export interface InterceptorStats {
  totalIntercepts: number;
  ruleMatches: number;
  llmCalls: number;
  fallbacks: number;
  cacheHits: number;
  cacheMisses: number;
  locks: number;
  blocks: number;
  warns: number;
  overrides: number;
  circuitBreakerTrips: number;
  s1Violations: number;
}

// ================================================================
// LLM 裁决
// ================================================================

export interface LLMJudgeConfig {
  model?: string;
  timeoutMs?: number;
  maxTokens?: number;
}

export interface IncentiveHint {
  gapDimension?: GapDimension;
  recommendedMode?: string;
  reasoning?: string;
  confidence?: 'high' | 'medium' | 'low';
  /** P1 LITE: 激励类型 */
  hintType?: string;
  /** P1 LITE: 激励原因 */
  reason?: string;
  /** P1 LITE: 目标角色 */
  targetRole?: string;
}

export interface LLMJudgeRequest {
  fromRole: string;
  toRole: string;
  gap: GapDimension;
  ruleVerdict: string;
  context: string;
  messageContent: string;
}

export interface LLMJudgeResponse {
  isViolation: boolean;
  severity: ConstraintSeverity;
  confidence: number;
  reason: string;
  suggestion?: string;
}

// ================================================================
// 协议引擎接口
// ================================================================

export interface SuitabilityRule {
  id: string;
  description: string;
  check: (protocol: TeamProtocol) => boolean;
  severity: ConstraintSeverity;
}

export interface SuitabilityCheckResult {
  passed: boolean;
  violations: SuitabilityRule[];
}

export interface IProtocolEngine {
  intercept(
    message: AgentMessage,
    protocol: TeamProtocol,
    context: CollaborationContext,
  ): Promise<ProtocolInterceptResult>;

  inspect(
    message: AgentMessage,
    protocol: TeamProtocol,
  ): Promise<ProtocolInspectResult>;
}

// ================================================================
// 规则引擎类型
// ================================================================

export interface MatchRule {
  id: string;
  gap: GapDimension | 'safety_baseline';
  messageType?: string[];
  rolePattern?: RegExp;
  contentPattern?: RegExp;
  severity: ConstraintSeverity;
  reason: string;
  suggestion?: string;
}

export interface RuleMatchResult {
  matched: boolean;
  violations: ProtocolViolation[];
  maxSeverity?: ConstraintSeverity | null;
}

// ================================================================
// 缓存与熔断器类型
// ================================================================

export interface CacheEntry {
  result: ProtocolInterceptResult;
  createdAt: number;
  ttlMs: number;
  hits: number;
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  windowMs: number;
  openTimeoutMs: number;
  successThreshold: number;
  halfOpenMaxRequests: number;
}

export interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  consecutiveSuccesses: number;
  halfOpenRequests: number;
  openedAt: number | null;
}
