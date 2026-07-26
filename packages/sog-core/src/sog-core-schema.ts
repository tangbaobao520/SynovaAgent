/**
 * sog-core-schema.ts — SOG-Core v1.0 唯一权威定义
 *
 * Synova Ontology Graph (SOG) 是组织数字孪生的开放标准。
 * 此文件冻结后，枚举值永不可修改或删除。只能追加新类型和可选属性。
 *
 * @version 1.0.0
 * @license CC BY 4.0
 */

// ═══════════════════════════════════════════════════════════════════
// VERSION
// ═══════════════════════════════════════════════════════════════════

export const SOG_CORE_VERSION = '1.0.0';

// ═══════════════════════════════════════════════════════════════════
// ENUMS — 永不可修改或删除，只能追加
// ═══════════════════════════════════════════════════════════════════

export enum SOGNodeType {
  PERSON = 'Person',
  TEAM = 'Team',
  AGENT = 'Agent',
  TOOL = 'Tool',
  CLIENT = 'Client',
  PROCESS = 'Process',
  EVENT = 'Event',
  DOCUMENT = 'Document',
  FINANCIAL = 'Financial',
  LOCATION = 'Location',
  GOAL = 'Goal',
  CAPABILITY = 'Capability',
  RISK = 'Risk',
  COMPLIANCE = 'Compliance',
	USER = 'User',            // Auth M1: 系统用户
	RESOURCE_USER = 'resource/user', // D107: 企业用户
	KNOWLEDGE_CHUNK = 'KnowledgeChunk', // Auth M1: 知识片段
	BUSINESS_MODEL = 'BusinessModel',  // P1: 商业模式画布节点
}

export enum SOGEdgeType {
  INTERACTS_WITH = 'INTERACTS_WITH',
  BELONGS_TO = 'BELONGS_TO',
  OWNS = 'OWNS',
  TRIGGERS = 'TRIGGERS',
  AFFECTS = 'AFFECTS',
  DEPENDS_ON = 'DEPENDS_ON',
  CORRESPONDS_TO = 'CORRESPONDS_TO',
  CONSUMES = 'CONSUMES',
  ALIGNS_WITH = 'ALIGNS_WITH',
  PROVIDES = 'PROVIDES',
	HAS_ACCESS_TO = 'HAS_ACCESS_TO', // Auth M1: 用户→资源访问权限
	REVENUE_FROM = 'REVENUE_FROM',       // P1: 收入来源→客户细分
	COST_DRIVEN_BY = 'COST_DRIVEN_BY',   // P1: 成本→活动/资源驱动
	VALUE_PROPOSITION = 'VALUE_PROPOSITION', // P1: 价值主张→目标客户
}

// ═══════════════════════════════════════════════════════════════════
// NODE PROP INTERFACES — 每种节点独立接口, 0 处 any
// ═══════════════════════════════════════════════════════════════════

export interface PersonProps {
  name: string;
  email?: string;
}

export interface TeamProps {
  name: string;
  teamType: 'permanent' | 'temporary';
}

export interface AgentProps {
  name: string;
  agentType: 'internal' | 'external';
  model?: string;
  // AgentObserver v1.1 扩展 (optional, 向后兼容)
  platform?: string;
  lastSeen?: string;
  status?: 'active' | 'idle' | 'error' | 'offline';
  activityCount?: number;
  lastToolName?: string;
}

export interface ToolProps {
  name: string;
  category: string;
  parentToolId?: string;
}

export interface ClientProps {
  name: string;
  entityType: 'internal' | 'external';
}

export interface ProcessProps {
  name: string;
  processType: 'approval' | 'deployment' | 'meeting' | 'other';
}

export interface EventProps {
  eventType: string;
  timestamp: string; // ISO 8601
}

export interface DocumentProps {
  name: string;
  docType: 'prd' | 'meeting_notes' | 'report' | 'contract' | 'other';
}

export interface FinancialProps {
  financialType: 'cost_center' | 'revenue' | 'cost' | 'token_account';
  amount?: number;
  currency?: string;
}

export interface LocationProps {
  locationType: 'office' | 'remote' | 'datacenter' | 'factory';
  address?: string;
  timezone?: string;
}

export interface GoalProps {
  goalType: 'mission' | 'vision' | 'okr' | 'north_star';
  description: string;
  targetDate?: string;
  progress?: number; // 0-1
}

export interface CapabilityProps {
  name: string;
  category: 'technical' | 'domain' | 'compliance' | 'leadership';
  proficiencyLevel?: number; // 0-1
}

export interface RiskProps {
  riskType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'active' | 'mitigated' | 'resolved';
}

export interface ComplianceProps {
  name: string;
  complianceType: 'regulation' | 'standard' | 'policy';
  jurisdiction?: string;
  effectiveDate?: string;
  status: 'compliant' | 'non_compliant' | 'partial';
}

export interface BusinessModelProps {
  name: string;
  canvasType: 'subscription' | 'transactional' | 'advertising' | 'freemium' | 'platform' | 'hybrid' | 'other';
  description?: string;
  /** 商业模式健康度评分 0-1 */
  healthScore?: number;
  /** 收入集中度 — 最大单一来源占比 */
  revenueConcentration?: number;
  /** 固定成本占比 */
  fixedCostRatio?: number;
}

/** 所有节点属性联合类型 */
export type SOGNodeProps =
  | PersonProps | TeamProps | AgentProps | ToolProps
  | ClientProps | ProcessProps | EventProps | DocumentProps
  | FinancialProps | LocationProps | GoalProps
  | CapabilityProps | RiskProps | ComplianceProps
  | BusinessModelProps;

// ═══════════════════════════════════════════════════════════════════
// EDGE PROP INTERFACES — 每种边独立接口, 0 处 any
// ═══════════════════════════════════════════════════════════════════

export interface InteractsWithEdgeProps {
  channel: 'public_channel' | 'direct_message' | 'email' | 'meeting' | 'other';
  weight?: number;
}

export interface BelongsToEdgeProps {
  role?: string;
  joinedAt?: string;
}

export interface OwnsEdgeProps {
  ownershipType: 'executes' | 'manages' | 'sponsors';
}

export interface TriggersEdgeProps {
  delay?: number; // ms
  causalStrength?: number; // 0-1
}

export interface AffectsEdgeProps {
  direction: 'positive' | 'negative';
  magnitude?: number;
}

export interface DependsOnEdgeProps {
  criticality: 'required' | 'optional';
}

export interface CorrespondsToEdgeProps {
  correspondenceType: 'equivalent' | 'related' | 'supersedes';
  confidence: number; // 0-1
}

export interface ConsumesEdgeProps {
  amount: number;
  period: string; // ISO 8601 duration
}

export interface AlignsWithEdgeProps {
  alignmentStrength: number; // 0-1
  alignmentType: 'direct' | 'indirect' | 'conflicting';
}

export interface ProvidesEdgeProps {
  proficiencyLevel?: number; // 0-1
  capacity?: number;
}

export interface RevenueFromEdgeProps {
  /** 收入贡献占比 0-1 */
  share?: number;
  /** 收入类型: 交易/订阅/广告/平台/服务 */
  revenueType?: 'transaction' | 'subscription' | 'advertising' | 'platform_fee' | 'service';
}

export interface CostDrivenByEdgeProps {
  /** 成本占比 0-1 */
  share?: number;
  /** 成本类型: 固定/可变 */
  costType?: 'fixed' | 'variable';
}

export interface ValuePropositionEdgeProps {
  /** 匹配强度 0-1 */
  alignmentStrength?: number;
  /** 价值主张是否已通过定价实现 */
  monetized?: boolean;
}

/** 所有边属性联合类型 */
export type SOGEdgeProps =
  | InteractsWithEdgeProps | BelongsToEdgeProps | OwnsEdgeProps
  | TriggersEdgeProps | AffectsEdgeProps | DependsOnEdgeProps
  | CorrespondsToEdgeProps | ConsumesEdgeProps
  | AlignsWithEdgeProps | ProvidesEdgeProps
  | RevenueFromEdgeProps | CostDrivenByEdgeProps | ValuePropositionEdgeProps;

// ═══════════════════════════════════════════════════════════════════
// EDGE ENDPOINT MATRIX — 权威定义, 覆盖全部 10 种边
// ═══════════════════════════════════════════════════════════════════

export const EDGE_ENDPOINT_MAP: Record<SOGEdgeType, { from: SOGNodeType[]; to: SOGNodeType[] }> = {
  [SOGEdgeType.INTERACTS_WITH]:  { from: [SOGNodeType.PERSON, SOGNodeType.AGENT],                                           to: [SOGNodeType.PERSON, SOGNodeType.AGENT] },
  [SOGEdgeType.BELONGS_TO]:      { from: [SOGNodeType.PERSON, SOGNodeType.TEAM, SOGNodeType.AGENT, SOGNodeType.TOOL],       to: [SOGNodeType.TEAM] },
  [SOGEdgeType.OWNS]:            { from: [SOGNodeType.PERSON, SOGNodeType.TEAM, SOGNodeType.AGENT],                         to: [SOGNodeType.PROCESS, SOGNodeType.CLIENT, SOGNodeType.TOOL, SOGNodeType.DOCUMENT] },
  [SOGEdgeType.TRIGGERS]:        { from: [SOGNodeType.EVENT],                                                              to: [SOGNodeType.EVENT, SOGNodeType.PROCESS] },
  [SOGEdgeType.AFFECTS]:         { from: [SOGNodeType.EVENT, SOGNodeType.PROCESS],                                          to: [SOGNodeType.FINANCIAL, SOGNodeType.CLIENT, SOGNodeType.RISK] },
  [SOGEdgeType.DEPENDS_ON]:      { from: [SOGNodeType.PROCESS, SOGNodeType.TOOL, SOGNodeType.AGENT],                        to: [SOGNodeType.TOOL, SOGNodeType.AGENT, SOGNodeType.PROCESS] },
  [SOGEdgeType.CORRESPONDS_TO]:  { from: [SOGNodeType.EVENT, SOGNodeType.DOCUMENT],                                         to: [SOGNodeType.EVENT, SOGNodeType.DOCUMENT, SOGNodeType.GOAL] },
  [SOGEdgeType.CONSUMES]:        { from: [SOGNodeType.AGENT, SOGNodeType.PROCESS],                                          to: [SOGNodeType.FINANCIAL] },
  [SOGEdgeType.ALIGNS_WITH]:     { from: [SOGNodeType.GOAL, SOGNodeType.TEAM, SOGNodeType.PERSON, SOGNodeType.PROCESS],     to: [SOGNodeType.GOAL, SOGNodeType.TEAM, SOGNodeType.PERSON, SOGNodeType.PROCESS] },
  [SOGEdgeType.PROVIDES]:        { from: [SOGNodeType.PERSON, SOGNodeType.TEAM, SOGNodeType.TOOL, SOGNodeType.AGENT],       to: [SOGNodeType.CAPABILITY] },
  [SOGEdgeType.HAS_ACCESS_TO]:    { from: [SOGNodeType.USER, SOGNodeType.AGENT],                                             to: [SOGNodeType.DOCUMENT, SOGNodeType.TOOL, SOGNodeType.PROCESS] },
  [SOGEdgeType.REVENUE_FROM]:     { from: [SOGNodeType.FINANCIAL],                                                        to: [SOGNodeType.CLIENT] },
  [SOGEdgeType.COST_DRIVEN_BY]:   { from: [SOGNodeType.FINANCIAL],                                                        to: [SOGNodeType.PROCESS, SOGNodeType.CAPABILITY, SOGNodeType.TOOL] },
  [SOGEdgeType.VALUE_PROPOSITION]:{ from: [SOGNodeType.GOAL],                                                             to: [SOGNodeType.CLIENT] },
};

// ═══════════════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════════════

export class SOGValidationError extends Error {
  readonly code = 'SOG_VALIDATION_ERROR' as const;
  readonly details: string;
  readonly timestamp: string;

  constructor(details: string) {
    super(`SOG Validation Error: ${details}`);
    this.name = 'SOGValidationError';
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

export function validateEdgeEndpoints(type: SOGEdgeType, fromType: SOGNodeType, toType: SOGNodeType): boolean {
  const rule = EDGE_ENDPOINT_MAP[type];
  if (!rule) return false;
  return rule.from.includes(fromType) && rule.to.includes(toType);
}

// ═══════════════════════════════════════════════════════════════════
// RUNTIME VALIDATORS — 14 节点 + 10 边, 供 createNode/createEdge 调用
// ═══════════════════════════════════════════════════════════════════

// ── Node validators ──

export const NODE_VALIDATORS: Record<SOGNodeType, (props: unknown) => boolean> = {
  [SOGNodeType.PERSON]:      (p): p is PersonProps      => hasString(p, 'name'),
  [SOGNodeType.TEAM]:        (p): p is TeamProps         => hasString(p, 'name') && hasTeamType(p),
  [SOGNodeType.AGENT]:       (p): p is AgentProps        => hasString(p, 'name') && hasAgentType(p),
  [SOGNodeType.TOOL]:        (p): p is ToolProps          => hasString(p, 'name') && hasString(p, 'category'),
  [SOGNodeType.CLIENT]:      (p): p is ClientProps        => hasString(p, 'name') && hasEntityType(p),
  [SOGNodeType.PROCESS]:     (p): p is ProcessProps       => hasString(p, 'name') && hasProcessType(p),
  [SOGNodeType.EVENT]:       (p): p is EventProps         => hasString(p, 'eventType') && hasString(p, 'timestamp'),
  [SOGNodeType.DOCUMENT]:    (p): p is DocumentProps      => hasString(p, 'name') && hasDocType(p),
  [SOGNodeType.FINANCIAL]:   (p): p is FinancialProps     => hasFinancialType(p),
  [SOGNodeType.LOCATION]:    (p): p is LocationProps      => hasLocationType(p),
  [SOGNodeType.GOAL]:        (p): p is GoalProps          => hasGoalType(p) && hasString(p, 'description'),
  [SOGNodeType.CAPABILITY]:  (p): p is CapabilityProps    => hasString(p, 'name') && hasCapCategory(p),
  [SOGNodeType.RISK]:        (p): p is RiskProps          => hasString(p, 'riskType') && hasSeverity(p) && hasRiskStatus(p),
  [SOGNodeType.COMPLIANCE]:  (p): p is ComplianceProps    => hasString(p, 'name') && hasComplianceType(p) && hasComplianceStatus(p),
  [SOGNodeType.USER]:        (p): p is Record<string, unknown> => hasString(p, 'name'),
  [SOGNodeType.RESOURCE_USER]: (p): p is Record<string, unknown> => hasString(p, 'email'),
  [SOGNodeType.KNOWLEDGE_CHUNK]: (p): p is Record<string, unknown> => hasString(p, 'content'),
  [SOGNodeType.BUSINESS_MODEL]:  (p): p is BusinessModelProps   => hasString(p, 'name') && hasCanvasType(p),
};

// ── Edge validators ──

export const EDGE_VALIDATORS: Record<SOGEdgeType, (props: unknown) => boolean> = {
  [SOGEdgeType.INTERACTS_WITH]:  (p): p is InteractsWithEdgeProps  => hasChannel(p),
  [SOGEdgeType.BELONGS_TO]:      (_p): _p is BelongsToEdgeProps      => true, // role + joinedAt 都是可选
  [SOGEdgeType.OWNS]:            (p): p is OwnsEdgeProps           => hasOwnershipType(p),
  [SOGEdgeType.TRIGGERS]:        (_p): _p is TriggersEdgeProps       => true, // delay + causalStrength 都是可选
  [SOGEdgeType.AFFECTS]:         (p): p is AffectsEdgeProps        => hasDirection(p),
  [SOGEdgeType.DEPENDS_ON]:      (p): p is DependsOnEdgeProps      => hasCriticality(p),
  [SOGEdgeType.CORRESPONDS_TO]:  (p): p is CorrespondsToEdgeProps  => hasCorrespondenceType(p) && hasConfidence(p),
  [SOGEdgeType.CONSUMES]:        (p): p is ConsumesEdgeProps       => typeof (p as any)?.amount === 'number' && hasString(p, 'period'),
  [SOGEdgeType.ALIGNS_WITH]:     (p): p is AlignsWithEdgeProps     => hasAlignmentStrength(p) && hasAlignmentType(p),
  [SOGEdgeType.PROVIDES]:        (_p): _p is ProvidesEdgeProps       => true, // proficiencyLevel + capacity 都是可选
  [SOGEdgeType.HAS_ACCESS_TO]:    (p): p is Record<string, unknown>     => hasString(p, 'resourceType') && hasString(p, 'permission'),
  [SOGEdgeType.REVENUE_FROM]:     (_p): _p is RevenueFromEdgeProps       => true, // share + revenueType 可选
  [SOGEdgeType.COST_DRIVEN_BY]:   (_p): _p is CostDrivenByEdgeProps      => true, // share + costType 可选
  [SOGEdgeType.VALUE_PROPOSITION]:(_p): _p is ValuePropositionEdgeProps  => true, // alignmentStrength + monetized 可选
};

// ═══════════════════════════════════════════════════════════════════
// HELPER CHECKS — DRY, 类型安全
// ═══════════════════════════════════════════════════════════════════

function hasString(p: unknown, k: string): boolean {
  return typeof (p as any)?.[k] === 'string' && (p as any)[k].length > 0;
}

function hasTeamType(p: unknown): boolean {
  return ['permanent', 'temporary'].includes((p as any)?.teamType);
}

function hasAgentType(p: unknown): boolean {
  return ['internal', 'external'].includes((p as any)?.agentType);
}

function hasEntityType(p: unknown): boolean {
  return ['internal', 'external'].includes((p as any)?.entityType);
}

function hasProcessType(p: unknown): boolean {
  return ['approval', 'deployment', 'meeting', 'other'].includes((p as any)?.processType);
}

function hasDocType(p: unknown): boolean {
  return ['prd', 'meeting_notes', 'report', 'contract', 'other'].includes((p as any)?.docType);
}

function hasFinancialType(p: unknown): boolean {
  return ['cost_center', 'revenue', 'cost', 'token_account'].includes((p as any)?.financialType);
}

function hasLocationType(p: unknown): boolean {
  return ['office', 'remote', 'datacenter', 'factory'].includes((p as any)?.locationType);
}

function hasGoalType(p: unknown): boolean {
  return ['mission', 'vision', 'okr', 'north_star'].includes((p as any)?.goalType);
}

function hasCapCategory(p: unknown): boolean {
  return ['technical', 'domain', 'compliance', 'leadership'].includes((p as any)?.category);
}

function hasSeverity(p: unknown): boolean {
  return ['low', 'medium', 'high', 'critical'].includes((p as any)?.severity);
}

function hasRiskStatus(p: unknown): boolean {
  return ['active', 'mitigated', 'resolved'].includes((p as any)?.status);
}

function hasComplianceType(p: unknown): boolean {
  return ['regulation', 'standard', 'policy'].includes((p as any)?.complianceType);
}

function hasComplianceStatus(p: unknown): boolean {
  return ['compliant', 'non_compliant', 'partial'].includes((p as any)?.status);
}

function hasChannel(p: unknown): boolean {
  return ['public_channel', 'direct_message', 'email', 'meeting', 'other'].includes((p as any)?.channel);
}

function hasOwnershipType(p: unknown): boolean {
  return ['executes', 'manages', 'sponsors'].includes((p as any)?.ownershipType);
}

function hasDirection(p: unknown): boolean {
  return ['positive', 'negative'].includes((p as any)?.direction);
}

function hasCriticality(p: unknown): boolean {
  return ['required', 'optional'].includes((p as any)?.criticality);
}

function hasCorrespondenceType(p: unknown): boolean {
  return ['equivalent', 'related', 'supersedes'].includes((p as any)?.correspondenceType);
}

function hasConfidence(p: unknown): boolean {
  return typeof (p as any)?.confidence === 'number';
}

function hasAlignmentStrength(p: unknown): boolean {
  return typeof (p as any)?.alignmentStrength === 'number';
}

function hasAlignmentType(p: unknown): boolean {
  return ['direct', 'indirect', 'conflicting'].includes((p as any)?.alignmentType);
}

function hasCanvasType(p: unknown): boolean {
  return ['subscription', 'transactional', 'advertising', 'freemium', 'platform', 'hybrid', 'other'].includes((p as any)?.canvasType);
}
