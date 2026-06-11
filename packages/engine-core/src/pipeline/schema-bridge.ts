/**
 * engine-server/pipeline/schema-bridge.ts — Schema v3.1 ↔ engine-server 类型桥接
 *
 * V1.2 第一阶段：双仓库合并的核心桥梁。
 * 将 E:\culture-forge\src\types\schema-v3.1.ts 的类型映射为
 * engine-server/types.ts 的可消费类型，使 evolution/ 等模块可被 engine-server 调用。
 *
 * 设计原则：
 * 1. 最小映射：只映射 evolution/ 实际消费的字段
 * 2. 单向流动：schema-v3.1 → engine-server types，不反向修改
 * 3. 向后兼容：不修改 engine-server/types.ts 现有定义
 * 4. 降级安全：映射失败时回退到默认值，不抛异常
 * 5. 类型内联：因 tsconfig rootDir 限制，schema-v3.1 核心类型内联于此，不跨仓库 import
 *
 * @packageDocumentation
 */

import type {
  CollaborationMode,
  GapDivisionOfLabor,
  GapInformationFlow,
  GapAuthorityGovernance,
  GapTrustIncentive,
  GapKnowledgeSharing,
  GapExternalInterface,
  SafetyBaseline,
  PersonaGenomeBlue,
  TeamStructureBlue,
  BlueprintDTO,
  CollaborationModeBlue,
} from '../types';

// ====================================================================
// 零、Schema v3.1 核心类型（内联，避免跨仓库 import rootDir 冲突）
// 来源: E:\culture-forge\src\types\schema-v3.1.ts
// ====================================================================

/** 信源可达性 */
export type SourceAccessibility = 
  | 'public_verifiable'
  | 'semi_visible'
  | 'invisible';

/** 6缝隙维度标识 */
export type GapDimension =
  | 'division_of_labor'
  | 'information_flow'
  | 'authority_governance'
  | 'trust_incentive'
  | 'knowledge_sharing'
  | 'external_interface';

/** 碎片审计状态 */
export type FragmentAuditStatus = 
  | 'verified'
  | 'mixed'
  | 'unverifiable'
  | 'removed';

/** 可扩展的模式描述对象 */
export interface PatternModeV3 {
  name: string;
  label: string;
  confidence: 'high' | 'medium' | 'low';
  claim_type: 'observed' | 'designed';
  source_evidence: string[];
  designer_notes?: string;
  applicable_scenarios?: string[];
  composability_tags?: string[];
  evolution_stability?: 'stable' | 'experimental' | 'volatile';
  evolution_history?: Array<{
    timestamp: string;
    event: 'degraded' | 'experiment_created' | 'replaced' | 'confidence_restored';
    old_confidence?: 'high' | 'medium' | 'low';
    new_confidence?: 'high' | 'medium' | 'low';
    experiment_id?: string;
  }>;
  crowd_validation?: {
    validated: boolean;
    method: 'ab_experiment' | 'observational' | 'none';
    total_validations?: number;
    last_validated_at?: string;
  };
}

/** 证据碎片 */
export interface EvidenceFragment {
  evidence_id: string;
  text: string;
  source_url: string;
  source_type: 'Tier-1' | 'Tier-2' | 'Tier-3';
  source_name?: string;
  timestamp: string;
  is_direct_quote: boolean;
  original_text?: string;
  audit_status: FragmentAuditStatus;
  audit_note?: string;
}

/** 缝隙证据包 */
export interface GapEvidence {
  gap_dimension: GapDimension;
  source_accessibility: SourceAccessibility;
  tier_distribution: {
    'Tier-1': number;
    'Tier-2': number;
    'Tier-3': number;
    unqualified: number;
  };
  verified_rate: number;
  fragments: EvidenceFragment[];
  collection_strategy?: string;
}

// ====================================================================
// 一、模式映射：schema-v3.1 PatternModeV3 → engine-server 6缝隙类型
// ====================================================================

/**
 * 将 v3.1 旧 power_distribution 模式名映射为 authority_governance.authority 枚举
 */
export function mapPowerDistributionToAuthority(
  modeName: string,
): GapAuthorityGovernance['authority'] {
  const map: Record<string, GapAuthorityGovernance['authority']> = {
    hierarchical: 'hierarchical',
    democratic: 'flat',
    autocratic: 'hierarchical',
    full_delegation: 'decentralized',
    type1_type2_door: 'domain_based',
    trust_the_manager: 'decentralized',
    rotating_ceo: 'collegial',
    delegate_to_experts: 'domain_based',
    federal: 'federal',
  };
  return map[modeName] || 'flat';
}

/**
 * 将 v3.1 旧 trust_model 模式名映射为 trust_incentive 的 initialTrust/updateMechanism
 */
export function mapTrustModel(modeName: string): Pick<GapTrustIncentive, 'initialTrust' | 'updateMechanism' | 'degradationTriggers'> {
  const map: Record<string, Pick<GapTrustIncentive, 'initialTrust' | 'updateMechanism' | 'degradationTriggers'>> = {
    audit_required: { initialTrust: 'low', updateMechanism: 'merit_based' },
    trust_first: { initialTrust: 'high', updateMechanism: 'fixed' },
    trust_person_with_culture_guardrail: { initialTrust: 'medium', updateMechanism: 'merit_based', degradationTriggers: ['文化违背', '价值观偏离'] },
    trust_competence: { initialTrust: 'medium', updateMechanism: 'merit_based' },
  };
  return map[modeName] || { initialTrust: 'medium', updateMechanism: 'merit_based' };
}

/**
 * 将 v3.1 旧 conflict_resolution 模式名映射为 authority_governance 的 strategy/deadlockTimeout
 */
export function mapConflictResolution(modeName: string): Pick<GapAuthorityGovernance, 'strategy' | 'deadlockTimeoutSeconds'> {
  const map: Record<string, Pick<GapAuthorityGovernance, 'strategy' | 'deadlockTimeoutSeconds'>> = {
    escalation: { strategy: 'escalation', deadlockTimeoutSeconds: 300 },
    consensus: { strategy: 'consensus', deadlockTimeoutSeconds: 600 },
    disagree_and_commit: { strategy: 'single_decider', deadlockTimeoutSeconds: 300 },
    debate_and_decide: { strategy: 'majority_vote', deadlockTimeoutSeconds: 600 },
    exit_with_honor: { strategy: 'escalation', deadlockTimeoutSeconds: 300 },
    public_admission: { strategy: 'consensus', deadlockTimeoutSeconds: 300 },
    institutionalize_not_personalize: { strategy: 'escalation', deadlockTimeoutSeconds: 300 },
    intellectual_honesty: { strategy: 'consensus', deadlockTimeoutSeconds: 300 },
  };
  return map[modeName] || { strategy: 'consensus', deadlockTimeoutSeconds: 300 };
}

export function mapDivisionOfLabor(modeName: string): Pick<GapDivisionOfLabor, 'mode' | 'substitutable'> {
  const map: Record<string, Pick<GapDivisionOfLabor, 'mode' | 'substitutable'>> = {
    functional_division: { mode: 'fixed', substitutable: false },
    project_based: { mode: 'flexible', substitutable: true },
    role_rotation: { mode: 'morphing', substitutable: true },
    domain_expert: { mode: 'fixed', substitutable: false },
    swarming: { mode: 'morphing', substitutable: true },
  };
  return map[modeName] || { mode: 'fixed', substitutable: false };
}

export function mapInformationFlow(modeName: string): Pick<GapInformationFlow, 'topology' | 'syncMode'> {
  const map: Record<string, Pick<GapInformationFlow, 'topology' | 'syncMode'>> = {
    chain: { topology: 'chain', syncMode: 'round_robin' },
    star: { topology: 'star', syncMode: 'moderated' },
    full_mesh: { topology: 'full_mesh', syncMode: 'free_form' },
    hierarchical_flow: { topology: 'hierarchical', syncMode: 'moderated' },
  };
  return map[modeName] || { topology: 'star', syncMode: 'free_form' };
}

// ====================================================================
// 二、6缝隙证据包 → engine-server CollaborationModeBlue 完整映射
// ====================================================================

export function buildCollaborationModeFromGaps(
  gaps: Partial<Record<GapDimension, GapEvidence>>,
  selectedModes?: Partial<Record<string, { name: string; label: string; confidence: string }>>,
): CollaborationModeBlue {
  const powerMode = selectedModes?.authority_governance?.name || 'hierarchical';
  const trustMode = selectedModes?.trust_incentive?.name || 'audit_required';
  const conflictMode = selectedModes?.authority_governance?.name || 'escalation';
  const laborMode = selectedModes?.division_of_labor?.name || 'functional_division';
  const infoMode = selectedModes?.information_flow?.name || 'star';

  const powerRes = mapPowerDistributionToAuthority(powerMode);
  const trustRes = mapTrustModel(trustMode);
  const conflictRes = mapConflictResolution(conflictMode);
  const laborRes = mapDivisionOfLabor(laborMode);
  const infoRes = mapInformationFlow(infoMode);

  const authorityGovernance = {
    ...conflictRes,
    authority: powerRes,
    hasVeto: powerRes === 'hierarchical',
    vetoRoles: powerRes === 'hierarchical' ? ['L3_governance'] : undefined,
    escalationPath: ['L2_execution', 'L3_governance'],
  };
  const trustIncentive = {
    alignment: 'mixed' as const,
    successSignal: '任务完成 + 协作指标达标',
    failureSignal: '冲突超时 + 决策延迟',
    ...trustRes,
  };

  return {
    mode: (powerRes === 'hierarchical' ? 'iron_captain' :
            powerRes === 'flat' ? 'democratic_council' :
            powerRes === 'federal' ? 'loose_federation' :
            'cross_check_balance') as CollaborationMode,
    label: selectedModes?.authority_governance?.label || '层级授权',
    description: `从6缝隙证据推导: power=${powerMode}, trust=${trustMode}, conflict=${conflictMode}`,
    selectionReason: '基于schema-v3.1证据包自动推导',
    divisionOfLabor: { ...laborRes, roleAssignment: {}, fallbackRoles: {} },
    informationFlow: { ...infoRes, visibilityMatrix: {}, routingMap: {} },
    // 8-gap deprecated bridge
    conflictResolution: { ...conflictRes },
    powerDistribution: {
      authority: powerRes,
      hasVeto: powerRes === 'hierarchical',
      vetoRoles: powerRes === 'hierarchical' ? ['L3_governance'] : undefined,
      decisionFlow: { propose: 'L2_execution', discuss: 'L2_execution', decide: 'L3_governance', execute: 'L2_execution' },
    },
    incentiveAlignment: {
      alignment: trustIncentive.alignment,
      successSignal: trustIncentive.successSignal,
      failureSignal: trustIncentive.failureSignal,
    },
    trustModel: {
      initialTrust: trustRes.initialTrust,
      updateMechanism: trustRes.updateMechanism,
      degradationTriggers: trustRes.degradationTriggers,
    },
    // 6-gap unified
    authorityGovernance,
    trustIncentive,
    knowledgeSharing: {
      strategy: infoRes.topology === 'full_mesh' ? 'free_for_all' : 'central_repo',
      syncIntervalHours: 24,
      hasTacitKnowledge: true,
    },
    externalInterface: { strategy: 'gatekeeper', canBypassProtocol: false, auditLogEnabled: true },
    safetyBaseline: { requireHumanApproval: [], auditLogEnabled: true, maxAutonomyLevel: 'medium' },
  };
}

// ====================================================================
// 三、进化引擎信号采集接口
// ====================================================================

export interface RuntimeCollaborationEvent {
  timestamp: string;
  gapDimension: GapDimension;
  eventType: 'conflict' | 'flow' | 'decision' | 'share';
  roles: { from: string; to: string };
  data: {
    modeUsed: string;
    outcome: 'resolved' | 'escalated' | 'deadlocked';
    durationMs?: number;
    humanIntervention?: boolean;
  };
}

export interface EvolutionSignal {
  gapDimension: GapDimension;
  currentMode: string;
  signalStrength: number;
  signalType: 'mode_conflict' | 'deadlock_frequent' | 'overridden' | 'satisfaction_drop';
  suggestedAction: 'keep' | 'generate_variant' | 'degrade_confidence' | 'replace_mode';
  sampleSize: number;
  latestEventAt: string;
}

// ====================================================================
// 四、TeamStructure ↔ evolution 桥接
// ====================================================================

export function extractRoleTopology(teamStructure: TeamStructureBlue): {
  roleCount: number;
  governanceRoles: string[];
  executionRoles: string[];
  collaborationGraph: Record<string, string[]>;
} {
  const roles = teamStructure.roles || [];
  return {
    roleCount: roles.length,
    governanceRoles: roles.filter(r => r.governanceLayer === 'L3_governance').map(r => r.name),
    executionRoles: roles.filter(r => r.governanceLayer !== 'L3_governance').map(r => r.name),
    collaborationGraph: Object.fromEntries(roles.map(r => [r.name, r.collaboratesWith || []])),
  };
}

// ====================================================================
// 五、evolution-overrides.json 读写接口
// ====================================================================

export interface EvolutionOverride {
  id: string;
  scope: 'mode' | 'genome' | 'template' | 'inference';
  gapDimension?: GapDimension;
  oldValue: string;
  newValue: string;
  confidenceDelta: number;
  experimentId?: string;
  sampleSize: number;
  createdAt: string;
  merged: boolean;
  reviewNotes?: string;
}

export interface EvolutionOverridesFile {
  version: '1.0';
  generatedAt: string;
  overrides: EvolutionOverride[];
  metadata: {
    totalOverrides: number;
    pendingReview: number;
    merged: number;
    lastReviewAt?: string;
  };
}

export function createEmptyOverrides(): EvolutionOverridesFile {
  return {
    version: '1.0',
    generatedAt: new Date().toISOString(),
    overrides: [],
    metadata: { totalOverrides: 0, pendingReview: 0, merged: 0 },
  };
}
