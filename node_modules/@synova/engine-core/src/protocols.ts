/**
 * engine-core/src/protocols.ts — Phase 2A 协议升级 (GAP-3/6/7/8)
 *
 * 产品层：② Synova 引擎（Synova.yml 核心协议段）
 *
 * 替代旧的 GapAuthorityGovernance / GapTrustIncentive / GapDivisionOfLabor / GapExternalInterface
 * 旧类型仅保留作为向后兼容别名，新代码使用本文件的类型。
 *
 * 生成时间：2026-05-22
 */

// ================================================================
// GAP-3: Authority 结构化权限
// ================================================================

/** 每个角色的权限三元组：canDo / needApprovalFor / mustNotDo */
export interface RoleAuthorityRule {
  roleId: string;
  roleName: string;
  canDo: string[];
  needApprovalFor: string[];
  mustNotDo: string[];
}

/** 全局审批规则 */
export interface GlobalApprovalRule {
  operation: 'call_external_api' | 'send_email' | 'modify_agent_config' | 'delete_team_artifact' | 'write_outside_teamdir';
  whoApproves: 'human';
  urgency: 'immediate' | 'batch';
  messageTemplate: string;
}

/** 全局禁止规则 */
export interface ForbiddenRule {
  operation: string;
  reason: string;
}

/** 冲突升级规则 — Agent 之间不投票，分歧升级给人类 */
export interface EscalationRule {
  strategy: 'human_decides';
  triggerAfterMessages: number;
  timeoutMinutes: number;
  messageTemplate: string;
}

/** Authority 完整协议 */
export interface AuthorityProtocol {
  roleRules: RoleAuthorityRule[];
  globalApproval: GlobalApprovalRule[];
  globalForbidden: ForbiddenRule[];
  escalation: EscalationRule;
  humanFinalSay: {
    enabled: true;
    channels: string[];
    autoEscalateAfterMinutes: number;
  };
}

// ================================================================
// GAP-6: Trust 信任与激励
// ================================================================

export interface SignalRule {
  metric: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  description: string;
}

export interface MeritRule {
  condition: { goodSignalCount: number; periodHours: number };
  action: 'increase_trust' | 'decrease_trust';
  newLevel: 'low' | 'medium' | 'high' | 'probation';
}

export interface TrustConsequence {
  authorityAdjustment: {
    addToCanDo?: string[];
    addToNeedApproval?: string[];
    addToMustNotDo?: string[];
  };
  resourceAllocation: {
    tokenBudgetMultiplier: number;
    modelTier: 'default' | 'premium';
    contextWindowPriority: number;
    subAgentBudget: number;
  };
}

export interface DegradationTrigger {
  metric: string;
  operator: '>' | '<' | '>=' | '<=';
  threshold: number;
  durationHours: number;
  newLevel: 'low' | 'medium' | 'probation';
}

export interface TrustProtocol {
  initialTrust: 'low' | 'medium' | 'high';
  signals: { good: SignalRule[]; bad: SignalRule[]; goodLabel: string; badLabel: string };
  update: { mechanism: 'merit_based' | 'seniority_based' | 'fixed'; meritRules: MeritRule[]; cooldownHours: number };
  consequences: { high: TrustConsequence; medium: TrustConsequence; low: TrustConsequence; probation: TrustConsequence };
  degradationTriggers: DegradationTrigger[];
  recovery: { consecutiveGoodSignalsNeeded: number; probationDaysNeeded: number };
}

// ================================================================
// GAP-7: DivisionOfLabor 分工协作
// ================================================================

export interface CapabilityTag {
  tag: string;
  proficiency: number;
  verified: boolean;
}

export interface CollaborationProfile {
  style: 'delegating' | 'collaborative' | 'directive' | 'hybrid';
  substitutable: boolean;
  prefersAutonomy: boolean;
}

export interface DivisionConstraint {
  rule: string;
  type?: 'boundary' | 'workload' | 'cross_role' | 'file_protection';
}

export interface AdaptiveMode {
  enabled: boolean;
  driftThreshold: number;
  autoSuggestSwitch: boolean;
}

export interface DivisionOfLaborProtocol {
  mode: 'fixed' | 'flexible' | 'morphing';
  substitutable: boolean;
  roleAssignment?: Record<string, string[]>;
  fallbackRoles?: Record<string, string[]>;
  capabilityTags: CapabilityTag[];
  collaborationProfile: CollaborationProfile;
  constraints: DivisionConstraint[];
  adaptiveMode: AdaptiveMode;
}

// ================================================================
// GAP-8: ExternalInterface 外部接口
// ================================================================

export interface ExternalServiceRule {
  name: string;
  urlPattern: string;
  maxCallsPerHour: number;
  requiresApproval: boolean;
}

export interface ChannelExchangeRule {
  from: string;
  to: string;
  what: string[];
  format: string;
  maxFrequency: 'hourly' | 'daily' | 'weekly' | 'per_order' | 'on_demand';
}

export interface ChannelAuthority {
  allowRead: string[];
  allowWrite: string[];
  deny: string[];
}

export interface ChannelEscalation {
  strategy: 'notify_team_lead' | 'pause_channel' | 'human_mediator';
  autoEscalateAfterHours: number;
}

export interface ChannelConfig {
  channelId: string;
  partnerTeamName: string;
  purpose: string;
  informationExchange: ChannelExchangeRule[];
  crossAuthority: ChannelAuthority;
  escalation: ChannelEscalation;
  audit: { enabled: boolean; logAllExchanges: boolean; retentionDays: number };
}

export interface ExternalInterfaceProtocol {
  strategy: 'gatekeeper' | 'ambassador' | 'buffer' | 'open_door';
  allowedServices: ExternalServiceRule[];
  audit: { enabled: boolean; logAllExternalCalls: boolean; retentionDays: number };
  dataProtection: { noRawUserDataExport: boolean; sanitizeBeforeExternal: boolean };
  channels?: ChannelConfig[];
}

// ================================================================
// 向后兼容别名
// ================================================================

/** @deprecated 使用 AuthorityProtocol */
export type GapAuthorityGovernance = AuthorityProtocol;
/** @deprecated 使用 TrustProtocol */
export type GapTrustIncentive = TrustProtocol;
/** @deprecated 使用 DivisionOfLaborProtocol */
export type GapDivisionOfLabor = DivisionOfLaborProtocol;
/** @deprecated 使用 ExternalInterfaceProtocol */
export type GapExternalInterface = ExternalInterfaceProtocol;
