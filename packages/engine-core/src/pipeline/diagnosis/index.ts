/**
 * diagnosis/index.ts — Synova 多层诊断引擎公开 API
 *
 * ARCH-04 三层结构：
 *   第一层（观测层）：六缝隙快照 — gap-recorder
 *   第二层（衍生层）：时间动态 — gap-dynamics（纯数值计算）
 *   第三层（推理层）：诊断推理 — attention-allocator, identity-extractor,
 *                     path-dependency, self-awareness
 *
 * 总入口：assembleFullDiagnosis() — 组装全量诊断
 */

// ── Types ──
export type {
  FullDiagnosis,
  FullDiagnosisV2,
  FullDiagnosisV3,
  GapSnapshot,
  GapDimensionScore,
  GapDynamics,
  PhaseCoupling,
  StickyDimension,
  AttentionAllocation,
  IdentityMarkers,
  PathDependency,
  SelfAwarenessReport,
  SelfAwarenessDelta,
  BlindSpotDeclaration,
  SelfAssessmentInput,
  SelfAssessmentRecord,
  HACDReport,
  CPCReport,
  CPCDimensionDetail,
  CPCGap,
  IPUReport,
  HONAReport,
  HONANode,
  HONAEdge,
  CapabilitySpectrum,
  CapabilityDim,
  IntentAlignment,
  SevenPowersReport,
  PowerAssessment,
  FinancialBaseline,
  ModelPricing,
  FinancialImpactReport,
  CostBreakdown,
  TokenEconomicsReport,
  TokenSourceBreakdown,
  TokenWasteBreakdown,
  HTMReport,
  TrustCurve,
  TrustDecayEvent,
  SinglePointRisk,
  EOBReport,
  MultiRoleNarrative,
  ImprovementActionItem,
  ActionPlan,
  TaskIntegrationResult,
  AssemblyOptions,
  FDEDiagnosisExtensions,
  BenchmarkReport,
  DimensionBenchmark,
  EnrichedData,
  LocalGitMetrics,
  SoftwareEnrichment,
  GitHubMetrics,
  EnricherPlugin,
  // SynovaAgent Agent 运行时类型（P1a）
  InitiatorProfile,
  DiagnosisScope,
  DiagnosisEvidence,
  ModuleFinding,
  EvidenceFilter,
  ContradictionSignal,
  DiagnosisHypothesis,
  CausalNode,
  CausalEdge,
  CausalChain,
  RootCause,
  RootCauseTree,
  StructuredDiagnosisReport,
  DeliveryResult,
  ConsultationResult,
  AgentIterationState,
  DiagnosisErrorCode,
  DiagnosisEvent,
  DiagnosisPermissionLevel,
  PermissionContext,
  PermissionResult,
  DiagnosisSessionMessage,
  CompactResult,
} from './types';

// ── Layer 1: Observation ──
export {
  buildGapSnapshot,
  recordGapSnapshot,
  getGapTimeline,
  getLatestSnapshot,
  getSnapshotCount,
  clearTeamSnapshots,
  resetAllSnapshots,
  recordLegacyGapSnapshot,
  GAP_DIMENSIONS,
} from './gap-recorder';

// ── Layer 2: Dynamics ──
export { computeDynamics } from './gap-dynamics';

// ── Layer 3: Reasoning ──
export {
  computeAttention,
  recordTopicKeyword,
  recordDecisionType,
  recordInteraction,
  recordAgentConsumption,
  clearTeamLogs,
} from './attention-allocator';

export {
  extractIdentityMarkers,
  recordIdentitySentence,
  recordIdentitySentences,
  clearIdentityData,
} from './identity-extractor';

export { detectPathDependency } from './path-dependency';

export {
  computeSelfAwareness,
  recordSelfAssessment,
  getSelfAssessments,
  clearTeamSelfAssessments,
} from './self-awareness';

// ── Assembler ──
export {
  assembleFullDiagnosis,
  assembleFullDiagnosisAsync,
  assembleFullDiagnosisV2,
  assembleFullDiagnosisV2Async,
  assembleFullDiagnosisV3Async,
} from './diagnosis-assembler';

// ── Hybrid Org Modules (ARCH-07) ──
export { computeHACD } from './hacd';
export { computeCPC } from './cpc';
export { computeIPU } from './ipu-overload';
export { computeHONA, recordAgentInteraction, clearAgentInteractions } from './hona';

// ── V2 Extension Modules (ARCH-06) ──
export { computeCapabilitySpectrum } from './capability-spectrum';
export { computeIntentAlignment } from './intent-alignment';
export { computeSevenPowers } from './seven-powers';

// ── Trust & Boundary Modules (ARCH-06 P2) ──
export { computeHTM } from './htm';
export { computeEOB } from './eob';

// ── Financial Modules (ARCH-07) ──
export {
  computeFinancialImpact,
  simulateImprovement,
  loadFinancialBaseline,
  saveFinancialBaseline,
} from './financial-impact';
export {
  computeTokenEconomics,
  getModelPricing,
  getDefaultModelPriceTable,
} from './token-economics';

// ── Observer Bridge ──
export { bridgeHealthSnapshot, bridgeAndRecord } from './observer-bridge';

// ── Module Registry ──
export {
  registerModule,
  listModules,
  getModule,
  runModule,
  runModules,
export type {
  DiagnosticModule,
  DiagnosticPriority,
  ConfidenceModel,
  DiagnosticDataSourceRequirements,
  ModuleRunResult,

// ── Persistence ──
export {
  saveSnapshot,
  loadTimeline,
  loadAllTimelines,
  saveAttentionLog,
  loadAttentionLogs,
  saveIdentityData,
  loadIdentityData,
  saveSelfAssessment,
  loadSelfAssessments,
} from './persistence';

// ── FDE Modules (ARCH-08) ──
export { pushActionItems } from './task-integration';

// ── FDE Toolset (Agent 工具注册) ──
export {
  FDE_TOOLS,
  getFdeTool,
  createFdeToolExecutor,
  listFdeToolDescriptions,
} from './fde-toolset';
export type { FdeToolDefinition } from './fde-toolset';

// ── P2 Modules (ARCH-08 Benchmark + Enricher) ──
export { computeBenchmark } from './benchmark-engine';
export { enrichDiagnosis } from './data-enricher';

// ── SynovaAgent Agent 运行时模块 (P1a) ──
export {
  DiagnosisOrchestrator,
  MemorySessionTracer,
} from './diagnosis-orchestrator';
export type {
  DiagnosisLLMClient,
  ToolExecutor,
  ToolResult,
  LLMResponse,
  SessionTracer,
  OrchestratorConfig,
} from './diagnosis-orchestrator';

export {
  PermissionPolicy,
  RecordingPermissionStore,
  createDefaultPermissionPolicy,
} from './diagnosis-permissions';
export type { PermissionRule, PermissionRequest } from './diagnosis-permissions';

export {
  RecoveryExecutor,
  RecoveryContext,
  DiagnosisFailureScenario,
  createDefaultRecipes,
  createDefaultRecoveryExecutor,
} from './diagnosis-recovery';
export type { RecoveryRecipe, RecoveryStep, RecoveryResult } from './diagnosis-recovery';

export {
  DiagnosisSessionCompactor,
  estimateMessageTokens,
  DEFAULT_SESSION_CONFIG,
} from './diagnosis-session';
export type { DiagnosisSessionConfig } from './diagnosis-session';

export {
  DiagnosisPromptBuilder,
  createScopePromptBuilder,
  createHypothesisPromptBuilder,
} from './diagnosis-prompt-builder';
export type {
  PromptSection,
  PhaseContext,
  AgentRoleDefinition,
  SkillCard,
} from './diagnosis-prompt-builder';

export { EvidenceManager } from './evidence-manager';

export { renderDiagnosisReport, renderMarketingSection, renderFullDiagnosisReport } from './report-renderer';
export type { MarketingSectionInput } from './report-renderer';

// ── P2-01 错误归一化 + 类型层级 ──
export {
  // Class hierarchy
  DiagnosticAgentError,
  PhaseExecError,
  LLMCallError,
  ModuleExecError,
  SessionCompactionError,
  EvidencePoolError,
  RecoveryExhaustedError,
  // Type guards
  isRetryable,
  isDegraded,
  getFailurePhase,
  // Factory functions
  phaseExecFailed,
  llmCallFailed,
  moduleFailedDegraded,
  moduleFailedHard,
  sessionCompactionFailed,
  evidencePoolOverflow,
  evidencePoolCorrupted,
  recoveryExhausted,
  // Legacy normalizer (backwards-compatible)
  normalizeDiagnosisError,
  RECOVERABLE_CODES,
} from './diagnosis-error';
export type {
  NormalizedDiagnosisError,
  LLMSuggestedAction,
} from './diagnosis-error';

// ── P2-02 事件流封装 ──
export { DiagnosisEventStream } from './diagnosis-event-stream';
export type { DiagnosisEventWriter } from './diagnosis-event-stream';

// ── P2-03 钩子系统 ──
export { DiagnosisHookMap } from './diagnosis-hook-map';
export type {
  HookFn,
  HookKind,
  HookContext,
  BeforePhaseContext,
  AfterModuleContext,
  BeforeReportContext,
  BeforeToolCallContext,
} from './diagnosis-hook-map';

// ── P2-04 Agent 工具注册表 ──
export {
  registerTool,
  registerTools,
  getTool,
  listTools,
  listToolNames,
  toolCount,
  hasTool,
  executeTool,
} from './agent-tool-registry';
export type { AgentTool, AgentToolContext } from './agent-tool-registry';

// ── P2-05 子 Agent 隔离 ──
export { SubAgentIsolator } from './sub-agent-isolator';
export type {
  SubAgentType,
  SubAgentResult,
  SubAgentContext,
  SubAgentRunOptions,
} from './sub-agent-isolator';

// ── P2-06 JSONL 会话转录 ──
export { SessionTranscriptor } from './session-transcript';

// ── P1-06 关键人才风险 ──
export {
  analyzeKeyPersonRisk,
  buildDependenciesFromRoles,
  buildKnowledgeDomains,
} from './key-person-risk';
export type {
  RoleDependency,
  KnowledgeDomain,
  RoleRiskProfile,
  KeyPersonRiskReport,
  SOGRiskNode,
} from './key-person-risk';

// ── P1b 咨询沟通层 ──
export {
  renderEmpathyMessage,
  renderMultiRoleMessages,
  getRoleLabel,
  getRoleTone,
  adaptDetailLevel,
} from './empathy-templates';
export type { EmpathyScenario, RecipientRole, RiskSeverity, EmpathyTemplateParams, EmpathyMessage } from './empathy-templates';

export {
  detectSensitiveFields,
  scanContentForSensitivity,
  redactField,
  redactObject,
  getBuiltinRules,
  createCustomRule,
} from './sensitivity-rules';
export type { SensitivityCategory, RedactAction, SensitivityMatch, SensitivityRule, RedactedField, RedactionAuditEntry } from './sensitivity-rules';

export {
  buildIntervieweeProfile,
  listRoleTypes,
  suggestRoleType,
  getDimensionPriority,
  aggregateTeamPriorities,
} from './interviewee-profile';
export type { IntervieweeRoleType, DecisionAuthority, CommunicationPreference, IntervieweeProfile, ProfileBuildInput } from './interviewee-profile';

// ── Marketing Modules (ARCH-19) ──
export { loadMarketingData, saveMarketingData, deleteMarketingData } from './marketing-data-store';
export type { MarketingDataRecord, MarketingDataInput } from './marketing-data-store';

export {
  queryQuestions,
  countByDimension,
  countByRole,
  addCustomQuestion,
  addCustomQuestions,
  removeCustomQuestion,
  getQuestionCount,
  clearCustomQuestions,
  getSeedQuestions,
  generateQuestionnaire,
} from './question-bank';
export type { QuestionType, DiagnosticQuestion, QuestionChoice, QuestionFilter, TargetRole, TargetDimension } from './question-bank';

// ── P1b 外部数据层 ──
export {
  computeFinancialSnapshot,
  assessFinancialImpact,
  createEmptyEntry,
  validateEntry,
} from './financial-snapshot';
export type { FinancialEntry, FinancialSnapshot, FinancialDiagnosisImpact } from './financial-snapshot';

export {
  queryProducts,
  getProduct,
  isVersionDeprecated,
  isVersionOutdated,
  getCategories,
  fuzzySearch,
  analyzeAIInventory,
} from './ai-product-knowledge';
export type { AIProduct, AIProductCategory, ProductQuery, TeamAIToolEntry, AIInventoryAnalysis } from './ai-product-knowledge';

// ── P1b 知识+改造层 ──
export {
  archiveDiagnosis,
  getArchive,
  queryArchives,
  getTeamHistory,
  getLatestDiagnosis,
  cleanupArchive,
  resetArchive,
  extractKnowledge,
} from './diagnosis-archive';
export type { ArchiveEntry, ArchiveFilter, ExtractedKnowledge } from './diagnosis-archive';

export {
  addKnowledge,
  upsertKnowledge,
  getKnowledge,
  queryKnowledge,
  citeKnowledge,
  deleteKnowledge,
  getKnowledgeStats,
  resetKnowledge,
  extractFromDiagnosis,
} from './organization-knowledge-builder';
export type { KnowledgeType, OrgKnowledgeEntry, KnowledgeQuery, KnowledgeStats } from './organization-knowledge-builder';
