/**
 * engine-server/types.ts — 引擎侧类型定义
 *
 * 完全对齐 CONTRACT-01 (v2.0) 和 CONTRACT-02 (v1.1)。
 * 此文件是契约的类型副本——engine-server 不能 import ClawOrg-BOX 其他模块。
 *
 * @packageDocumentation
 */

// ====================================================================
// 请求类型
// ====================================================================

export interface GenerateBlueprintRequest {
  taskDefSchemaVersion: '1.0';
  taskDefinition: TaskDefinitionDTO;
  diagnosisReport?: DiagnosisReport;
  options?: {
    mode?: 'async' | 'sync';
    locale?: 'zh-CN' | 'en-US';
    /** 团队 ID，用于诊断快照关联。不传则跳过快照记录。 */
    teamId?: string;
  };
}

export interface TaskDefinitionDTO {
  job: string;
  constraints: string[];
  successMetrics: string[];
  failureModes: string[];
  stage: 'from_scratch' | 'expansion' | 'optimization';
  confidence: number;
  sanitizationLevel: 'standard';
  /** 可行性预检查结果（沈括 Ginkgo 框架） */
  feasibility?: 'feasible' | 'conditional' | 'infeasible';
}

/**
 * DiagnosisReport — L0 诊断报告
 *
 * 在 L0 对话完成、用户发出孵化指令后生成。
 * 作为 L0 → 引擎 Pipeline（L1-L5）的桥梁上下文。
 *
 * 宪法约束：evidenceMap 标注每个字段取值来源：
 * - 'confirmed' = 用户对话中明确表述
 * - 'inferred'  = 引擎基于对话推断（未经用户确认）
 */
export interface DiagnosisReport {
  mission: { longTermVision: string; shortTermGoals: string[] };
  businessModel: { primaryBusiness: string; valueProposition: string; revenueModel: string };
  currentState: { stage: string; existingAssets: string[]; teamScale: string };
  resources: { budget: string; founderTime: string; keyPartnerships: string[] };
  risks: { topConcerns: string[]; pastFailures: string[]; industryPitfalls: string[] };
  successCriteria: { northStar: string; keyIndicators: string[] };
  coreInsight: string;
  suggestedPriority: string;
  evidenceMap: Record<string, 'confirmed' | 'inferred'>;
}

// ====================================================================
// 统一错误结构（9 种错误码）
// ====================================================================

export interface ApiErrorDetail {
  field?: string;
  position?: number;
  matched?: string;
  rule?: string;
}

export interface ApiErrorResponse {
  code: ErrorCode;
  message: string;
  requestId: string;
  details?: ApiErrorDetail[];
}

export type ErrorCode =
  | 'INVALID_REQUEST_ID'
  | 'INVALID_SCHEMA_VERSION'
  | 'INVALID_TASKDEF'
  | 'INSUFFICIENT_SANITIZATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'TASK_REQUEST_NOT_FOUND'
  | 'RATE_LIMIT'
  | 'ENGINE_ERROR'
  | 'ENGINE_UNAVAILABLE'
  | 'TIMEOUT'
  | 'EXPIRED';

// ====================================================================
// 异步/同步响应类型
// ====================================================================

export interface BlueprintAccepted {
  status: 'accepted';
  blueprintSchemaVersion: '1.0';
  taskRequestId: string;
  estimatedSeconds: number;
  pollUrl: string;
  expiresAt: string;
}

export interface BlueprintSyncResponse {
  status: 'completed' | 'fallback_async';
  blueprintSchemaVersion?: string;
  blueprintId?: string;
  blueprint?: BlueprintDTO;
  taskRequestId?: string;
  pollUrl?: string;
}

// ====================================================================
// 轮询三态
// ====================================================================

export type TaskRequestStatus =
  | TaskRequestProcessing
  | TaskRequestCompleted
  | TaskRequestFailed;

export interface TaskRequestProcessing {
  status: 'processing';
  taskRequestId: string;
  progress: number;
  phase: PipelinePhase;
  estimatedRemainingSeconds?: number;
  /** 孵化动画帧数据 */
  incubationFrame: IncubationFrame;
}

export interface TaskRequestCompleted {
  status: 'completed';
  taskRequestId: string;
  blueprintId: string;
  blueprint: BlueprintDTO;
}

export interface TaskRequestFailed {
  status: 'failed';
  taskRequestId: string;
  error: {
    code: ErrorCode;
    message: string;
    retryable: boolean;
    hits?: ApiErrorDetail[];
  };
}

// ====================================================================
// 孵化动画帧
// ====================================================================

export interface IncubationFrame {
  phaseId: string;
  phaseLabel: string;
  progress: number;
  statusLine: string;
  detail?: string;
}

// ====================================================================
// 管道阶段
// ====================================================================

export type PipelinePhase =
  | 'L1_derive_roles'
  | 'L2_distill_genome'
  | 'L3_select_mode'
  | 'L4_match_skills'
  | 'L5_assemble_blueprint';

export const PIPELINE_PHASES: PipelinePhase[] = [
  'L1_derive_roles',
  'L2_distill_genome',
  'L3_select_mode',
  'L4_match_skills',
  'L5_assemble_blueprint',
];

export const PHASE_LABELS: Record<PipelinePhase, string> = {
  L1_derive_roles: '分析需求，规划团队角色',
  L2_distill_genome: '为每个角色生成专业心智模型',
  L3_select_mode: '制定团队协作与沟通规则',
  L4_match_skills: '为角色匹配技能与工具',
  L5_assemble_blueprint: '组装团队配置，准备部署',
};

// ====================================================================
// BlueprintDTO（完整对齐 CONTRACT-01）
// ====================================================================

export interface BlueprintDTO {
  blueprintSchemaVersion: '1.0';
  blueprintId: string;

  // 元数据
  generatedAt: string;
  engineVersion: string;
  pipelineVersion: string;

  // 任务还原
  taskDef: {
    job: string;
    constraints: string[];
    successMetrics: string[];
    stage: string;
    confidence: number;
  };

  // L1: 团队结构
  teamStructure: TeamStructureBlue;

  // L2: 角色认知基因
  personaGenomes: PersonaGenomeBlue[];

  // L3: 协作协议（完整 6 缝隙）
  collaborationMode: CollaborationModeBlue;

  // L4: 技能集
  skillSets: SkillSetBlue[];

  // L5: 5格式文件
  fiveFormats: FiveFormatsOutput;

  // 风险覆盖与设计依据
  riskCoverage: RiskCoverageEntry[];
  designRationale: DesignRationaleEntry[];

  // 覆盖等级
  coverageLevel: 'high' | 'medium' | 'low' | 'cold_start';

  // 证据链（壁垒四：血缘追踪）
  evidenceChain?: import('./pipeline/evidence-chain').EvidenceChain[];

  // 可部署模板（引擎产物 → OpenClaw Gateway 桥梁）
  /** AR-16: Synova.yml 标准序列化字符串 */
  synovaYml?: string;
  deployableTemplate?: unknown;

  // 日志
  notes: string[];
  auditResult?: {
    passed: boolean;
    overallVerdict: 'publish' | 'conditional_publish' | 'draft_only';
    summary: {
      verified: number;
      inferred: number;
      unverifiable: number;
      failed: number;
      blocked: number;
    };
    opinion: string;
  };

  // QA 评分（可选，仅当运行 LLM Judge 后填充）
  qaResult?: {
    overallScore: number;
    overallPassed: boolean;
    dimensions: Array<{
      dimension: string;
      score: number;
      passed: boolean;
      subScores: Array<{ label: string; score: number; maxScore: number; comment: string }>;
      judgeComment: string;
    }>;
  };
}

// ── 子类型 ──

export interface DesignRationale {
  dimension: string;
  choice: string;
  reason: string;
  sourceGap: string;
}

export interface TeamStructureBlue {
  totalRoles: number;
  recommendedTeamSize: number;
  derivationMethod: 'template_match' | 'keyword_inference' | 'cold_start' | 'minimal_default';
  roles: RoleBlue[];
  designRationale?: DesignRationale;
}

export interface RoleBlue {
  id: string;
  name: string;
  responsibilities: string[];
  skillsRequired: string[];
  collaboratesWith: string[];
  governanceLayer: 'L1_understanding' | 'L2_execution' | 'L3_governance';
  specialPrivileges?: string[];
}

export interface PersonaGenomeBlue {
  roleId: string;
  roleName: string;
  oceanScores: {
    openness: number;
    conscientiousness: number;
    extraversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  mentalModels: MentalModelEntry[];
  honestBoundaries: string[];
  antiPatterns: string[];
  confidence: number;
}

export interface MentalModelEntry {
  name: string;
  oneLiner: string;
  source: string;
  application: string;
  limitation: string;
  decisionScenarios?: string[];
}

export interface CollaborationModeBlue {
  mode: CollaborationMode;
  label: string;
  description: string;
  selectionReason: string;
  divisionOfLabor: GapDivisionOfLabor;
  informationFlow: GapInformationFlow;
  /** @deprecated 6-gap: merged into authorityGovernance */
  conflictResolution: GapConflictResolution;
  /** @deprecated 6-gap: merged into authorityGovernance */
  powerDistribution: GapPowerDistribution;
  /** @deprecated 6-gap: merged into trustIncentive */
  incentiveAlignment: GapIncentiveAlignment;
  /** @deprecated 6-gap: merged into trustIncentive */
  trustModel: GapTrustModel;
  /** 6-gap unified: conflictResolution + powerDistribution */
  authorityGovernance: GapAuthorityGovernance;
  /** 6-gap unified: incentiveAlignment + trustModel */
  trustIncentive: GapTrustIncentive;
  knowledgeSharing: GapKnowledgeSharing;
  externalInterface: GapExternalInterface;
  safetyBaseline: SafetyBaseline;
}

export type CollaborationMode =
  | 'iron_captain'
  | 'democratic_council'
  | 'loose_federation'
  | 'cross_check_balance'
  | 'bytedance_flat'
  | 'haier_ren_dan_he_yi'
  | 'haidilao_frontline_auth'
  | 'mckinsey_partnership'
  | 'tencent_internal_race';

export interface GapDivisionOfLabor {
  mode: 'fixed' | 'flexible' | 'morphing';
  substitutable: boolean;
  roleAssignment?: Record<string, string[]>;
  fallbackRoles?: Record<string, string[]>;
}

export interface GapInformationFlow {
  topology: 'chain' | 'star' | 'full_mesh' | 'hierarchical';
  syncMode: 'round_robin' | 'free_form' | 'moderated';
  visibilityMatrix?: Record<string, string[]>;
  routingMap?: Record<string, string[]>;
}

// 8-gap 旧类型（@deprecated 桥接，保留以兼容现有代码）

export interface GapConflictResolution {
  strategy: 'majority_vote' | 'single_decider' | 'consensus' | 'escalation';
  deadlockTimeoutSeconds: number;
  deciderRoleId?: string;
  escalationPath?: string[];
}

export interface GapPowerDistribution {
  authority: 'flat' | 'hierarchical' | 'domain_based' | 'federal' | 'collegial' | 'decentralized';
  hasVeto: boolean;
  vetoRoles?: string[];
  decisionFlow?: {
    propose: string;
    discuss: string;
    decide: string;
    execute: string;
  };
}

export interface GapIncentiveAlignment {
  alignment: 'reward' | 'penalty' | 'mixed';
  successSignal: string;
  failureSignal: string;
}

export interface GapTrustModel {
  initialTrust: 'low' | 'medium' | 'high';
  updateMechanism: 'merit_based' | 'seniority_based' | 'fixed';
  degradationTriggers?: string[];
}

/** 权限治理 = 冲突解决 + 权力分配 合并 */
export interface GapAuthorityGovernance {
  strategy: 'majority_vote' | 'single_decider' | 'consensus' | 'escalation';
  authority: 'flat' | 'hierarchical' | 'domain_based' | 'federal' | 'collegial' | 'decentralized';
  deadlockTimeoutSeconds: number;
  deciderRoleId?: string;
  escalationPath?: string[];
  hasVeto: boolean;
  vetoRoles?: string[];
  decisionFlow?: {
    propose: string;
    discuss: string;
    decide: string;
    execute: string;
  };
}

/** 信任与激励 = 激励对齐 + 信任模型 合并 */
export interface GapTrustIncentive {
  alignment: 'reward' | 'penalty' | 'mixed';
  successSignal: string;
  failureSignal: string;
  initialTrust: 'low' | 'medium' | 'high';
  updateMechanism: 'merit_based' | 'seniority_based' | 'fixed';
  degradationTriggers?: string[];
}

export interface GapKnowledgeSharing {
  strategy: 'central_repo' | 'pair_sharing' | 'downward_pour' | 'free_for_all';
  syncIntervalHours: number;
  hasTacitKnowledge: boolean;
}

export interface GapExternalInterface {
  strategy: 'gatekeeper' | 'ambassador' | 'buffer' | 'open_door';
  canBypassProtocol: boolean;
  auditLogEnabled: boolean;
  authorizedRoles?: string[];
}

export interface SafetyBaseline {
  requireHumanApproval: string[];
  auditLogEnabled: boolean;
  maxAutonomyLevel: 'low' | 'medium' | 'high';
}

export interface SkillSetBlue {
  roleId: string;
  roleName: string;
  skills: SkillCard[];
}

/**
 * SkillCard — 技能市场卡片（L4 Skill Engineering）
 *
 * 包含完整的安装元数据和市场展示信息。
 * 支持千面市场的一键安装和复制指令安装。
 */
export interface SkillCard {
  /** 唯一标识（用于安装/市场引用） */
  id: string;
  /** 技能名称 */
  name: string;
  /** 一句话摘要（市场卡片用） */
  summary: string;
  /** 详细说明 */
  description: string;
  /** 使用场景 */
  scenarios: string[];
  /** 执行步骤 */
  steps: string[];
  /** 分类标签 */
  tags: string[];
  /** 技能分类 */
  category: string;
  /** 版本号 */
  version: string;
  /** 安全评分 0-100，null=未审计 */
  securityScore: number | null;
  /** 安装指令 e.g. "claworg skill install <id>" */
  installCommand: string;
  /** 来源框架 ID（引擎映射时填充） */
  sourceFramework?: string;
  /** 是否可发布到千面市场 */
  isMarketplaceSkill: boolean;
  /** V1.4: 许可证类型 (agentskills.io 兼容) */
  license?: string;
  /** V1.4: 兼容的 Agent 框架列表 (agentskills.io 兼容) */
  compatibility?: string[];
  /** V1.4: 扩展元数据 (agentskills.io 兼容) */
  metadata?: Record<string, string>;
  /** V1.4: 技能允许调用的工具列表 (agentskills.io 兼容) */
  allowedTools?: string[];
  // ── V1.5 L2: 信息前提与失败模式 ──
  /** V1.5 L2: 使用技能前需具备的信息或前置技能 */
  prerequisites: string[];
  /** V1.5 L2: 技能执行中常见的失败方式 */
  failureModes: string[];
  /** V1.5 L2: 信源层级 — verified(有框架/弹药库支撑) | inferred(引擎推导) | speculative(LLM推测) */
  sourceTier: 'verified' | 'inferred' | 'speculative';
  // ── V1.5 L3: 协作依赖关系 ──
  /** V1.5 L3: 依赖的其他技能名称 */
  dependsOn: string[];
  /** V1.5 L3: 互斥技能名称 */
  conflictsWith: string[];
  /** V1.5 L3: 触发条件 */
  triggers: string[];
  // ── V1.5 L0: 战略链接 ──
  /** V1.5 L0: 该技能服务的 L0 战略目标 */
  strategicLink: string;
  // ── V1.5 agentskills.io 对齐 ──
  /** V1.5: 输入参数 JSON Schema (agentskills.io 兼容) */
  inputSchema?: Record<string, unknown>;
  /** V1.5: 输出格式 JSON Schema (agentskills.io 兼容) */
  outputSchema?: Record<string, unknown>;
  /** V1.5: MCP 工具名称 (如 "market_analysis") */
  mcpToolName?: string;
  /** V1.5: 技能溯源链 */
  provenance?: Array<{ sourceType: string; sourceId: string; sourceName: string; derivationNote?: string }>;
  /** V1.6 AR-16: 认知基因反向引用 — 标注技能步骤/规则来源于哪个 L2 认知基因 */
  geneSources?: Array<{
    kind: 'mentalModel' | 'antiPattern' | 'bias' | 'expressionDNA';
    name: string;
    mapsTo: string;
  }>;
  /** V1.6 AR-12: 需要上级审批的操作步骤（由 L3 ProtocolConfig 推导） */
  approvalRequired?: string[];
}

export interface FiveFormatsOutput {
  geneYaml: string;
  capPacks: Record<string, { manifest: string; skills: Array<{ fileName: string; content: string }> }>;
  templatePreset: {
    agentsMd: string;
    agents: Array<{
      dirName: string;
      soulMd: string;
      identityMd: string;
      toolsMd: string;
      heartbeatMd: string;
      userMd: string;
    }>;
  };
  teamYaml: string;
  protocolYaml: string;
}

export interface RiskCoverageEntry {
  riskName: string;
  coveredByRoles: string[];
  defenseMechanism: string;
  coverageLevel: 'full' | 'partial' | 'gap';
}

export interface DesignRationaleEntry {
  dimension: string;
  choice: string;
  alternatives: string[];
  reason: string;
  sourceGap?: string;
  /** V1.4: 假设标签 —— 当推导置信度不足时标记为假设，推给 L0 让用户验证 */
  hypothesisTag?: {
    statement: string;
    confidence: number;
    verificationNeeded: string[];
    verified: boolean;
  };
}

// ====================================================================
// 管道内部阶段结果
// ====================================================================

export interface PhaseAResult {
  teamStructure: TeamStructureBlue;
  incubationFrame: IncubationFrame;
  /** V1.3: 引擎驱动推理链（约束→框架→角色每一步可追溯） */
  designRationale?: DesignRationaleEntry[];
  llmRaw?: string;
}

export interface PhaseBResult {
  personaGenomes: PersonaGenomeBlue[];
  incubationFrame: IncubationFrame;
  llmRaw?: string;
}

export interface PhaseCResult {
  collaborationMode: CollaborationModeBlue;
  incubationFrame: IncubationFrame;
  llmRaw?: string;
}

export interface PhaseDResult {
  skillSets: SkillSetBlue[];
  incubationFrame: IncubationFrame;
  llmRaw?: string;
}

export interface PhaseEResult {
  fiveFormats: FiveFormatsOutput;
  riskCoverage: RiskCoverageEntry[];
  designRationale: DesignRationaleEntry[];
  incubationFrame: IncubationFrame;
  llmRaw?: string;
}

// ====================================================================
// 内部任务存储
// ====================================================================

export interface InternalTaskRecord {
  taskRequestId: string;
  status: TaskRequestStatus;
  request: GenerateBlueprintRequest;
  requestId: string; // X-Request-Id
  createdAt: number;
  expiresAt: number;
  abortController?: AbortController;
}

// ====================================================================
// M3 进化引擎 · 四层信号类型（V2.0）
// ====================================================================

/** S0: L0 对话质量简报 */
export interface DialogueQualityBrief {
  sessionId: string;
  totalRounds: number;
  signals: {
    confusionCount: number;
    confirmationCount: number;
    elaborationCount: number;
    redirectCount: number;
  };
  overallQuality: 'high' | 'medium' | 'low';
  improvementHints: string[];
}

/** S1: 推理链质量检查结果 */
export interface InferenceQualityResult {
  inferenceGaps: Array<{
    riskName: string;
    coverageLevel: string;
    severity: 'critical' | 'warning';
  }>;
  knowledgeGaps: KnowledgeGap[];
  qualityDegraded: boolean;
  frameworkBlindspot: {
    hasBlindspot: boolean;
    dominantCategory: string;
    missingCategories: string[];
  };
  overallScore: number;
}

/** S1: 知识缺口（将写入 ammo-factory/missing/ 目录） */
export interface KnowledgeGap {
  unmatchedConstraint: string;
  suggestedIndustry: string;
  suggestedDimension: string;
  discoveredAt: string;
  priority: 'high' | 'medium';
  status: 'pending' | 'in_progress' | 'resolved';
}

/** S2: 用户对 Blueprint 的修改反馈 */
export interface BlueprintFeedbackRequest {
  blueprintId: string;
  taskRequestId: string;
  changes: BlueprintChange[];
  timestamp: string;
}

export interface BlueprintChange {
  field: string;          // 如 "teamStructure.roles[2]" 或 "collaborationMode.mode"
  changeType: 'modify' | 'delete' | 'add';
  oldValue?: unknown;
  newValue?: unknown;
  sourceInference?: {     // 追溯该字段来自哪个推断
    inferenceStatement: string;
    sourceType: 'framework' | 'gap_mode' | 'ammo_entry' | 'llm_inferred';
    sourceId: string;
  };
}

// ====================================================================
// Synova Harness — 跨团队协作类型（V2.0）
// ====================================================================

/** 组织配置——Harness 顶层入口 */
export interface OrgConfig {
  orgId: string;
  name: string;
  teams: TeamRef[];
  channels: ChannelConfig[];
  orgMemory: OrgMemoryConfig;
  /** 组织级升级链：死锁时依次尝试 */
  escalationChain: string[];
  createdAt: string;
  updatedAt: string;
}

/** 团队引用——组织注册表中的轻量条目 */
export interface TeamRef {
  teamId: string;
  name: string;
  mode: CollaborationMode;
  agentCount: number;
  /** Agent Card URL（A2A 发现协议） */
  agentCardUrl?: string;
  /** 团队对外暴露的能力清单 */
  exposedCapabilities: string[];
  /** 团队角色摘要 */
  roles: Array<{ id: string; name: string; governanceLayer: string }>;
}

// ====================================================================
// Channel — 跨团队通信桥
// ====================================================================

/** Channel 拓扑类型 */
export type ChannelTopology = 'star' | 'chain' | 'full_mesh' | 'federated';

/** Channel 配置 */
export interface ChannelConfig {
  channelId: string;
  name: string;
  /** 参与团队 ID 列表（2 个以上） */
  teamIds: string[];
  /** T2T 6 缝隙协议 */
  t2tProtocol: T2TProtocol;
  /** 是否激活 */
  active: boolean;
  createdAt: string;
}

// ====================================================================
// T2T Protocol — 6 缝隙的跨团队重定义
// ====================================================================

export interface T2TProtocol {
  division_of_labor: T2TDivisionOfLabor;
  information_flow: T2TInformationFlow;
  authority_governance: T2TAuthorityGovernance;
  trust_incentive: T2TTrustIncentive;
  knowledge_sharing: T2TKnowledgeSharing;
  external_interface: T2TExternalInterface;
}

/** T2T-分工：哪个团队负责哪类交付物 */
export interface T2TDivisionOfLabor {
  /** teamId → 负责的交付物类别 */
  responsibilities: Record<string, string[]>;
  /** 共享交付物类别 */
  shared: string[];
  /** 是否允许团队间任务委托 */
  delegationEnabled: boolean;
}

/** T2T-信息流：团队间路由规则 */
export interface T2TInformationFlow {
  topology: ChannelTopology;
  /** 消息路由表：fromTeam → toTeam → 允许的消息类型 */
  routing: Record<string, Record<string, string[]>>;
  /** 同步模式 */
  syncMode: 'push' | 'pull' | 'poll';
  /** 是否需要接收确认 */
  requireAck: boolean;
  /** 确认超时 (ms) */
  ackTimeoutMs: number;
}

/** T2T-权限治理：跨团队冲突解决 + 权力分配（合并自 conflict_resolution + power_distribution） */
export interface T2TAuthorityGovernance {
  /** 冲突解决策略 */
  strategy: 'escalation' | 'majority_vote' | 'single_decider' | 'consensus';
  /** 升级路径：从低到高依次尝试（角色ID或"org-lead"或"human"） */
  escalationPath: string[];
  /** 死锁超时 (s) */
  deadlockTimeoutSeconds: number;
  /** 自动升级：超时后自动进入下一级 */
  autoEscalate: boolean;
  /** teamId → 该团队可否决的决策类别 */
  veto: Record<string, string[]>;
  /** 默认决策流 */
  decisionFlow: {
    propose: string[];
    review: string[];
    approve: string[];
  };
}

/** T2T-信任与激励：跨团队 KPI 关联 + 信任降级规则（合并自 incentive_alignment + trust_model） */
export interface T2TTrustIncentive {
  /** 跨团队 KPI 配对：teamA.kpi ↔ teamB.kpi */
  alignments: Array<{
    teamA: string;
    teamAKpi: string;
    teamB: string;
    teamBKpi: string;
    /** 正相关 还是 负相关（tradeoff） */
    correlation: 'positive' | 'tradeoff';
  }>;
  /** 共享成功定义 */
  sharedSuccess: string;
  /** 初始信任级别 */
  initialTrust: 'low' | 'medium' | 'high';
  /** 降级触发条件 */
  degradationTriggers: string[];
  /** 降级后 Channel 行为变化 */
  degradationAction: 'warn' | 'throttle' | 'suspend';
  /** 恢复条件 */
  recoveryConditions: string[];
}

/** T2T-知识共享：Channel 级记忆配置 */
export interface T2TKnowledgeSharing {
  /** Channel 内共享的文档类别 */
  channelScope: string[];
  /** 默认可见性 */
  defaultVisibility: 'channel' | 'org';
  /** 是否允许手动提升到组织级 (channel → org) */
  promoteToOrgEnabled: boolean;
  /** 提升需要审批 */
  promoteRequiresApproval: boolean;
  /** 记忆 TTL（0 = 永久） */
  ttlSeconds: number;
}

/** T2T-外部接口：团队对外暴露的 API 面 */
export interface T2TExternalInterface {
  /** teamId → 该团队暴露给 Channel 的端点 */
  exposedEndpoints: Record<string, string[]>;
  /** 是否需要内部审核后才能响应外部请求 */
  requireInternalReview: boolean;
  /** 审计日志 */
  auditEnabled: boolean;
}

// ====================================================================
// 四层记忆架构
// ====================================================================

export type MemoryTier = 'tier1_private' | 'tier2_team' | 'tier3_channel' | 'tier4_org';

export interface OrgMemoryConfig {
  /** 组织级工作区路径 */
  orgWorkspacePath: string;
  /** 组织级文档列表 */
  orgDocs: Array<{ name: string; path: string; category: string; readOnly: boolean }>;
  /** 可见性矩阵 */
  visibilityMatrix: OrgVisibilityMatrix;
}

export interface OrgVisibilityMatrix {
  teams: Record<string, {
    tier1_private: true;
    /** 可访问本团队 Tier2 的团队（通常只有自己） */
    tier2_team: string[];
    /** channelId → 可访问该 Channel Tier3 的团队 */
    tier3_channels: Record<string, string[]>;
    /** 各团队可读的组织级文档路径（Tier4） */
    tier4_org: string[];
  }>;
}

// ====================================================================
// 跨团队消息类型
// ====================================================================

/** 5 种跨团队通信模式 */
export type CrossTeamPattern =
  | 'async_delegation'
  | 'shared_channel'
  | 'broadcast'
  | 'negotiation'
  | 'escalation';

/** 跨团队消息 */
export interface CrossTeamMessage {
  messageId: string;
  pattern: CrossTeamPattern;
  fromTeamId: string;
  fromRoleId?: string;
  toTeamId: string | '__all__';  // __all__ = 广播
  toRoleId?: string;
  channelId?: string;
  type: CrossTeamMessageType;
  content: string;
  /** 委托/协商等结构化负载 */
  payload?: CrossTeamPayload;
  /** 关联的原始消息 ID（用于链路追踪） */
  inReplyTo?: string;
  timestamp: string;
  ttlSeconds?: number;
}

export type CrossTeamMessageType =
  | 'task.delegate'
  | 'task.result'
  | 'channel.post'
  | 'channel.reply'
  | 'broadcast.announce'
  | 'negotiation.propose'
  | 'negotiation.counter'
  | 'negotiation.accept'
  | 'negotiation.reject'
  | 'escalation.request'
  | 'escalation.resolve';

/** 跨团队消息负载 */
export type CrossTeamPayload =
  | DelegatePayload
  | BroadcastPayload
  | NegotiationPayload
  | EscalationPayload;

/** 异步委托负载 */
export interface DelegatePayload {
  taskTitle: string;
  taskDescription: string;
  deliverables: string[];
  deadline?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  /** 失败时的回退团队 */
  fallbackTeamId?: string;
}

/** 广播负载 */
export interface BroadcastPayload {
  category: 'announcement' | 'alert' | 'okr_update' | 'policy_change';
  severity?: 'info' | 'warning' | 'critical';
  /** 过滤目标（团队子集） */
  targetTeams?: string[];
}

/** 协商负载 */
export interface NegotiationPayload {
  proposalId: string;
  round: number;
  maxRounds: number;
  subject: string;
  position: string;
  rationale: string;
  alternatives?: string[];
}

/** 升级负载 */
export interface EscalationPayload {
  escalatedFrom: string;    // 升级来源（channelId 或 协商proposalId）
  deadlockReason: string;
  involvedTeams: string[];
  history: string[];       // 已尝试的解决步骤
  suggestedResolution?: string;
}

// ====================================================================
// Harness 运行时状态
// ====================================================================

export interface HarnessState {
  orgConfig: OrgConfig;
  /** Channel 运行时统计 */
  channelStats: Record<string, ChannelStats>;
  /** 活跃的跨团队会话 */
  activeSessions: CrossTeamSession[];
}

export interface ChannelStats {
  channelId: string;
  messageCount: number;
  delegationCount: number;
  escalationCount: number;
  avgResponseTimeMs: number;
  trustLevel: 'high' | 'medium' | 'low';
  lastActivityAt: string;
}

export interface CrossTeamSession {
  sessionId: string;
  channelId: string;
  pattern: CrossTeamPattern;
  teams: string[];
  startedAt: string;
  status: 'active' | 'deadlocked' | 'resolved' | 'expired';
  messageCount: number;
}

// ── Knowledge-Sharing types (originally from engine-core, merged here) ──

export type MemoryEntryType =
  | 'decision'
  | 'lesson'
  | 'pattern'
  | 'anti_pattern'
  | 'context'
  | 'milestone'
  | 'skill_reuse'
  | 'protocol_change';

export type MemoryVisibility = 'team' | 'org' | 'public';

export type MemorySource = 'steward' | 'agent' | 'human' | 'engine' | 'qa' | 'observed';

export interface MemoryEntry {
  id: string;
  type: MemoryEntryType;
  title: string;
  content: string;
  authorRoleId: string;
  visibility: MemoryVisibility;
  linkedArtifact?: string;
  source: MemorySource;
  teamId: string;
  blueprintId?: string;
  ttlDays?: number;
  priority?: 'low' | 'normal' | 'high';
  caqrScore?: number;
  createdAt: string;
  updatedAt: string;
  reuseCount: number;
}

export interface OutputContract {
  type: 'markdown' | 'json' | 'yaml' | 'synova_yml';
  path: string;
  description?: string;
  roleName?: string;
  roleId?: string;
  status?: 'active' | 'stale' | 'deprecated';
  produces?: string[];
  consumedBy?: string[];
}