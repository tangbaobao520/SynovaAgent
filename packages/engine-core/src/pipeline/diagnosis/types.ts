/**
 * diagnosis/types.ts — Synova 多层诊断引擎类型定义
 *
 * ARCH-04 三层结构：
 *   第一层（观测层）：六缝隙 GapDimension（定义在 schema-bridge.ts，不动）
 *   第二层（衍生层）：速度/加速度/相位耦合/粘性维度
 *   第三层（推理层）：注意力配置/身份标记/路径依赖/自知偏差
 *
 * 设计原则：
 *   1. 六缝隙维度不扩展——它们是观测层
 *   2. 新维度不进六缝隙——它们是独立层，不同精度、不同置信度
 *   3. 每层输出独立可用
 *   4. 盲区是产品特性——标注"覆盖率 60%" 比假装全知更有价值
 */

import type { GapDimension, GapEvidence } from '../schema-bridge';
export type { GapDimension, GapEvidence };

// ====================================================================
// 第一层：观测层 — GapSnapshot（结构化快照）
// ====================================================================

/** 单个缝隙维度的引擎评分 */
export interface GapDimensionScore {
  /** 该维度的协作模式名 */
  mode: string;
  /** 引擎观测得分 0-1，来自推断置信度映射 */
  engineScore: number;
  /** 置信度级别 */
  confidence: 'high' | 'medium' | 'low';
  /** 各数据源分别贡献的分值 */
  sourceBreakdown: Record<string, number>;
}

/** 一次六缝隙快照（观测层输出） */
export interface GapSnapshot {
  /** 团队标识 */
  teamId: string;
  /** 观测时间 ISO-8601 */
  observedAt: string;
  /** 快照产生来源 */
  sourcePipeline: 'phase-c' | 'manual_trigger' | 'periodic_check' | 'legacy-culture-forge';
  /** 六缝隙维度 → 评分 */
  gaps: Record<GapDimension, GapDimensionScore>;
}

// ====================================================================
// 第二层：衍生层 — GapDynamics（纯数值计算，零 LLM 调用）
// ====================================================================

/** 相位耦合：描述哪个缝隙维度先变、哪个后变 */
export interface PhaseCoupling {
  /** 领先变化的维度 */
  leader: GapDimension;
  /** 跟随变化的维度 */
  follower: GapDimension;
  /** 滞后天数 */
  lagDays: number;
  /** 皮尔逊相关系数 -1 ~ 1 */
  correlation: number;
}

/** 粘性维度：长期未发生显著变化的维度 */
export interface StickyDimension {
  dimension: GapDimension;
  /** 粘性得分 0-1，越接近 1 越难改变 */
  stickinessScore: number;
  /** 未发生显著变化的月数 */
  monthsUnchanged: number;
}

/** 衍生层输出（依赖 ≥3 个快照） */
export interface GapDynamics {
  /** 各维度变化速度，ΔmodeScore / Δtime 归一化 */
  velocity: Record<GapDimension, number>;
  /** 各维度变化加速度，Δvelocity / Δtime */
  acceleration: Record<GapDimension, number>;
  /** 相位耦合关系列表 */
  phaseCoupling: PhaseCoupling[];
  /** 长期不变的维度列表 */
  stickyDimensions: StickyDimension[];
  /** 团队整体变化速率 */
  overallChangeRate: number;
}

// ====================================================================
// 第三层：推理层
// ====================================================================

/** 注意力配置（从已有日志做关键词聚类 + 频率统计） */
export interface AttentionAllocation {
  /** 各主题占比，和为 1 */
  byTopic: Record<string, number>;
  /** 决策类型分布 */
  byDecisionType: Record<string, number>;
  /** 0 = 纯内视，1 = 纯外视 */
  selfVsExternal: number;
  /** 0 = 纯运营，1 = 纯创新 */
  internalOpsVsInnovation: number;
  /** 消耗最多注意力的前 3 个 Agent / 维度 */
  topAttentionConsumers: string[];
}

/** 身份标记（从"我们"开头的句子做词频聚类） */
export interface IdentityMarkers {
  /** 提取的身份标记词列表，如 ["技术驱动", "用户立场", "小而美"] */
  markers: string[];
  /** 每个 marker 的出现密度 / 总对话量 */
  frequency: Record<string, number>;
  /** 与 90 天前对比的趋势 */
  trend: Record<string, 'rising' | 'declining' | 'stable'>;
  /** 最重要的身份锚点 */
  primaryAnchor: string | null;
}

/** 路径依赖检测结果 */
export interface PathDependency {
  /** 受检维度 */
  dimension: GapDimension;
  /** 粘性得分 0-1 */
  stickinessScore: number;
  /** 未发生显著变化的月数 */
  monthsUnchanged: number;
  /** 同类团队该维度的平均变化频率，null = 基线不足 */
  peerAvgChangeRate: number | null;
  /** 粘性是否显著高于同类 */
  isAnomaly: boolean;
  /** 推测锁定原因，如 "创始人直接决策习惯" / "监管合规要求" */
  lockedBy: string | null;
  /** 人类可读解释 */
  interpretation: string;
}

/** 单个维度的自知偏差 */
export interface SelfAwarenessDelta {
  dimension: GapDimension;
  /** 引擎观测得分 0-1 */
  engineScore: number;
  /** 人自评得分 0-1，null = 未收集 */
  humanScore: number | null;
  /** 基于几次自评 */
  sampleCount: number;
  /** humanScore - engineScore，正 = 人比引擎乐观 */
  delta: number | null;
  /** 人类可读解释 */
  interpretation: string;
}

/** 自知偏差报告 */
export interface SelfAwarenessReport {
  /** 各维度偏差明细 */
  deltas: SelfAwarenessDelta[];
  /** 所有维度 |delta| 均值 */
  overallGap: number;
  /** |delta| > 0.2 的显著偏离维度 */
  significantDimensions: SelfAwarenessDelta[];
  /** 人类可读解释 */
  interpretation: string;
}

// ====================================================================
// 盲区声明
// ====================================================================

/** 引擎能力盲区声明——标注"覆盖率 60%"比假装全知更有价值 */
export interface BlindSpotDeclaration {
  /** 盲区所属维度 */
  dimension: string;
  /** 检测到的信号 */
  signal: string;
  /** 引擎当前能观测到的比例 0-1 */
  coverageEstimate: number;
  /** 如果用户愿意提供 X 数据，可缩小盲区 */
  coverableBy: string;
}

// ====================================================================
// 全量诊断组装
// ====================================================================

/** Synova 多层诊断引擎全量输出 */
export interface FullDiagnosis {
  teamId: string;
  generatedAt: string;

  /** 第一层：当前快照 */
  gaps: GapSnapshot;

  /** 第二层：时间动态（< 3 个快照时为 null） */
  dynamics: GapDynamics | null;

  /** 第三层：深层推理 */
  attention: AttentionAllocation;
  identity: IdentityMarkers;
  pathDependency: PathDependency[];
  selfAwareness: SelfAwarenessReport;

  /** 盲区声明 */
  blindSpots: BlindSpotDeclaration[];

  /** 诊断叙述：LLM 基于以上所有结构化数据生成的可读文本 */
  narrative: string;

  /** 降级模块列表：本次组装中计算失败的模块名。空数组 = 全模块正常 */
  degradedModules: string[];
}

// ====================================================================
// 自评数据采集
// ====================================================================

/** 用户自评提交（POST /api/diagnosis/:teamId/self-assess） */
export interface SelfAssessmentInput {
  dimension: GapDimension;
  /** 用户自评得分 0-1 */
  score: number;
}

/** 自评存储条目 */
export interface SelfAssessmentRecord {
  teamId: string;
  dimension: GapDimension;
  score: number;
  recordedAt: string;
}

// ====================================================================
// V2 混合组织诊断模块（ARCH-07 新增）
// ====================================================================

/** 人机协作深度报告 */
export interface HACDReport {
  /** 协作等级 L0(完全人工) ~ L4(完全自主) */
  level: 'L0' | 'L1' | 'L2' | 'L3' | 'L4';
  /** 人工介入比例 0-1 */
  hitlRatio: number;
  /** 自主完成比例 0-1 */
  autoRatio: number;
  /** 近期趋势 */
  trend: 'improving' | 'stable' | 'declining';
  /** 人类可读解读 */
  interpretation: string;
}

/** 协作协议完备性报告 */
export interface CPCReport {
  /** 整体完备性得分 0-1 */
  completenessScore: number;
  /** 各维度完备性明细 */
  byDimension: Record<string, CPCDimensionDetail>;
  /** 协议缺口列表 */
  gaps: CPCGap[];
  /** 完备性等级 */
  level: 'minimal' | 'basic' | 'adequate' | 'comprehensive';
  /** 人类可读总结 */
  interpretation: string;
}

export interface CPCDimensionDetail {
  /** 该维度得分 0-1 */
  score: number;
  /** 置信度 */
  confidence: 'high' | 'medium' | 'low';
  /** 缺失的能力 */
  missingCapabilities: string[];
}

export interface CPCGap {
  dimension: string;
  /** 缺失的具体能力 */
  missing: string;
  /** 严重程度 */
  severity: 'critical' | 'moderate' | 'minor';
}

/** 信息处理过载报告 */
export interface IPUReport {
  /** 过载得分 0-1，越高越严重 */
  overloadScore: number;
  /** 瓶颈维度 */
  bottleneckAgent: string | null;
  /** 队列深度 0-10 */
  queueDepth: number;
  /** 平均响应时间 ms */
  avgResponseTimeMs: number;
  /** 死锁率 0-1 */
  deadlockRate: number;
  /** 建议措施 */
  recommendation: string;
  /** 人类可读解读 */
  interpretation: string;
}

// ====================================================================
// HONA 异质节点网络（ARCH-07 A3b）
// ====================================================================

/** 网络中的单个 Agent 节点 */
export interface HONANode {
  id: string;
  /** 度（直接连接数） */
  degree: number;
  /** 度中心性 0-1 */
  centrality: number;
  /** 结构角色 */
  role: 'authority' | 'bridge' | 'peer';
  /** 是否为孤立节点 */
  isIsolated: boolean;
}

/** 网络中的一条交互边 */
export interface HONAEdge {
  from: string;
  to: string;
  /** 交互次数权重 */
  weight: number;
}

/** 异质节点网络分析报告 */
export interface HONAReport {
  nodes: HONANode[];
  edges: HONAEdge[];
  /** 网络密度 0-1 */
  density: number;
  /** 平均度中心性 */
  avgCentrality: number;
  /** 最大度中心性 */
  maxCentrality: number;
  /** 孤立节点数 */
  isolatedCount: number;
  /** 网络结构类型 */
  structure: 'dense' | 'moderate' | 'sparse' | 'fragmented';
  /** 人类可读解读 */
  interpretation: string;
}

// ====================================================================
// V2 全量诊断（向后兼容 V1）
// ====================================================================

/** Synova 多层诊断引擎 V2 全量输出（扩展 V1） */
export interface FullDiagnosisV2 extends FullDiagnosis {
  /** 人机协作深度（无协作事件时为 null） */
  hacd?: HACDReport | null;
  /** 协作协议完备性（无快照时为 null） */
  cpc?: CPCReport | null;
  /** 信息处理过载（无协作事件时为 null） */
  ipu?: IPUReport | null;
  /** 异质节点网络（无交互数据时为 null） */
  hona?: HONAReport | null;
  /** 组织能力谱系（无 Blueprint 数据时为 null） */
  capabilitySpectrum?: CapabilitySpectrum | null;
  /** 意图对齐度（无 SOUL.md / 注意力数据时为 null） */
  intentAlignment?: IntentAlignment | null;
  /** 7 Powers 竞争壁垒评估 */
  sevenPowers?: SevenPowersReport | null;
  /** 财务影响报告（FinancialBaseline 未配置时为 null） */
  financialImpact?: FinancialImpactReport | null;
  /** Token 经济学报告（FinancialBaseline 未配置时为 null） */
  tokenEconomics?: TokenEconomicsReport | null;
  /** 混合信任模型（无协作事件数据时为 null） */
  htm?: HTMReport | null;
  /** 组织弹性边界（无团队变更数据时为 null） */
  eob?: EOBReport | null;
  /** 品类认知清晰度（无客户访谈数据时为 null） */
  categoryClarity?: import('./category-clarity').CategoryClarityResult | null;
  /** 差异化实质性验证（无差异化主张或客户感知数据时为 null） */
  differentiationValidation?: import('./differentiation-validation').DifferentiationValidationResult | null;
  /** 定位三方一致性（三方数据不完整时为 null） */
  positioningConsistency?: import('./positioning-consistency').PositioningConsistencyResult | null;
}

// ====================================================================
// V2 扩展类型：组织能力谱系（ARCH-06 #8）
// ====================================================================

/** 单个业务能力维度 */
export interface CapabilityDim {
  /** 能力维度名 */
  name: string;
  /** 覆盖度 0-1 */
  coverage: number;
  /** 贡献该能力的角色 ID 列表 */
  coveredBy: string[];
  /** 缺失的具体能力标签 */
  missingLabels: string[];
}

/** 组织能力谱系报告 */
export interface CapabilitySpectrum {
  /** 各业务能力维度明细 */
  dimensions: CapabilityDim[];
  /** 整体能力覆盖度 0-1 */
  overallCoverage: number;
  /** 指出的能力缺口总数 */
  gapCount: number;
  /** 与外部接口缝隙的联动标记 */
  externalInterfaceRisk: boolean;
  /** 人类可读解释 */
  interpretation: string;
}

// ====================================================================
// V2 扩展类型：意图对齐度（ARCH-06 #8 / #19）
// ====================================================================

/** 意图对齐度报告 */
export interface IntentAlignment {
  /** 人-组织对齐偏差 0-1（越低越好） */
  humanOrgGap: number;
  /** Agent-组织对齐偏差 0-1 */
  agentOrgGap: number;
  /** 人-Agent 对齐偏差 0-1 */
  humanAgentGap: number;
  /** 组织目标关键词 */
  orgGoals: string[];
  /** 人类注意力 top topics */
  humanFocus: string[];
  /** Agent 高频任务方向 */
  agentFocus: string[];
  /** 人类可读解释 */
  interpretation: string;
}

// ====================================================================
// V2 扩展类型：7 Powers 竞争壁垒（ARCH-06 #9）
// ====================================================================

/** 单项力量评估 */
export interface PowerAssessment {
  /** 力量名称 */
  name: string;
  /** 评分 0-1 */
  score: number;
  /** 置信度 0-1 */
  confidence: number;
  /** 评估依据 */
  evidence: string;
  /** 评估方式 */
  method: 'rule' | 'llm_inferred';
}

/** 7 Powers 报告 */
export interface SevenPowersReport {
  /** 7 项力量评估 */
  powers: PowerAssessment[];
  /** 综合壁垒强度 0-1 */
  overallMoatStrength: number;
  /** 最强力量 */
  strongestPower: string;
  /** 最弱力量 */
  weakestPower: string;
  /** 人类可读解释 */
  interpretation: string;
}

// ====================================================================
// ARCH-07 混合信任模型 (HTM) 类型
// ====================================================================

/** 每日信任数据点 */
export interface TrustCurve {
  date: string;
  correctionRate: number;
  autoAcceptRate: number;
  sampleSize: number;
}

/** 信任衰减事件 */
export interface TrustDecayEvent {
  date: string;
  correctionRate: number;
  baselineRate: number;
  severity: 'critical' | 'moderate';
  possibleTrigger: string;
}

/** 单点依赖风险 */
export interface SinglePointRisk {
  agentId: string;
  dependencyConcentration: number;
  routeCount: number;
  risk: 'critical' | 'high' | 'moderate';
}

/** 混合信任模型报告 */
export interface HTMReport {
  trustCurves: TrustCurve[];
  autoAcceptRate: number;
  escalationRate: number;
  agentAgentHealth: number;
  trustHealthScore: number;
  trend: 'improving' | 'stable' | 'declining';
  decayEvents: TrustDecayEvent[];
  singlePointRisks: SinglePointRisk[];
  interpretation: string;
}

// ====================================================================
// ARCH-07 组织弹性边界 (EOB) 类型
// ====================================================================

/** 组织弹性边界报告 */
export interface EOBReport {
  churnRate: number;
  scaleLatencyHours: number | null;
  externalRatio: number;
  zombiePermissions: string[];
  boundaryHealth: number;
  interpretation: string;
}

// ====================================================================
// ARCH-07 财务视角类型
// ====================================================================

/** 用户配置的财务基准参数（一次性设置，持久化于团队配置） */
export interface FinancialBaseline {
  /** 人均全成本/小时 */
  humanHourlyCost: number;
  /** Agent 运行成本/小时（含 API 费用、算力分摊） */
  agentHourlyCost: number;
  /** 延迟交付的每日成本 */
  delayCostRate: number;
  /** 单次关键错误造成的平均财务损失 */
  averageErrorCost: number;
  /** 商机延迟的每日机会成本 */
  opportunityCostRate: number;
  /** LLM 模型价格表 */
  modelPricing: ModelPricing[];
  /** 无法识别模型的默认价格（每百万 token） */
  defaultTokenPricePer1M: number;
}

/** 单个模型的价格配置 */
export interface ModelPricing {
  modelId: string;
  /** 每百万输入 token 价格（美元） */
  inputPricePer1M: number;
  /** 每百万输出 token 价格（美元） */
  outputPricePer1M: number;
  /** 缓存命中价格（如有） */
  cachedInputPricePer1M?: number;
}

/** 单项成本明细 */
/** SOG v1.0 Financial 节点类型 */
export type FinancialNodeType = 'cost_center' | 'revenue' | 'cost' | 'token_account';

export interface CostBreakdown {
  /** 成本类别标签 */
  label: string;
  /** 估算月度成本 */
  monthlyCost: number;
  /** 归因的诊断维度 */
  sourceDimension: string;
  /** 计算依据说明 */
  basis: string;
  /** SOG v1.0: 归因的财务类型 */
  financialType?: FinancialNodeType;
}

/** 财务影响报告 */
export interface FinancialImpactReport {
  period: { start: string; end: string };
  /** 总低效成本（月度，元） */
  totalInefficiencyCost: number;
  /** 分项成本明细 */
  breakdown: CostBreakdown[];
  /** 改善潜力（月度节省估算） */
  improvementPotential: number;
  /** 改善投入产出比 */
  roi: number | null;
  /** 是否使用了估算（FinancialBaseline 未配置部分参数） */
  isEstimated: boolean;
  /** 人类可读解释 */
  interpretation: string;
  /** SOG v1.0: 按财务类型的成本汇总 */
  financialTypeSummary?: Record<FinancialNodeType, number>;
}

/** Token 来源成本拆分 */
export interface TokenSourceBreakdown {
  /** Agent 正常推理 Token 成本 */
  agentReasoning: number;
  /** HITL 修正导致的重新生成 Token 成本 */
  hitlRework: number;
  /** Agent 间调用 Token 成本 */
  agentToAgent: number;
  /** 无法归因的 Token 成本 */
  uncategorized: number;
}

/** Token 浪费归因 */
export interface TokenWasteBreakdown {
  /** 信任未校准导致的重做成本 */
  trustMiscalibrationCost: number;
  /** 协议缺失导致的方向错误成本 */
  protocolMissingCost: number;
  /** 无熔断导致的级联重试成本 */
  noCircuitBreakerCost: number;
  /** IPU 过载导致的超额消耗成本 */
  ipuOverloadCost: number;
  /** 路由错误导致的无效调用成本 */
  routingErrorCost: number;
}

/** Token 经济学报告 */
export interface TokenEconomicsReport {
  period: { start: string; end: string };
  /** Token 总量 */
  totalTokens: number;
  /** Token 总成本 */
  totalCost: number;
  /** 输入 Token 量 */
  inputTokens: number;
  /** 输出 Token 量 */
  outputTokens: number;
  /** 按模型拆分 */
  byModel: Array<{ modelId: string; tokens: number; cost: number; percentage: number }>;
  /** 按来源拆分 */
  bySource: TokenSourceBreakdown;
  /** 浪费归因 */
  wasteBreakdown: TokenWasteBreakdown;
  /** 效率指标 */
  efficiency: {
    avgTokensPerTask: number;
    /** 重做 Token 占比 */
    reworkTokenRatio: number;
    /** 每次有效决策的平均 Token 成本 */
    costPerDecision: number;
    trend: 'improving' | 'stable' | 'degrading';
  };
  /** 盲区声明 */
  blindSpots: {
    shadowAIEstimated: boolean;
    unparsableModels: string[];
  };
}

// ====================================================================
// FDE 引擎内化类型（ARCH-08）
// ====================================================================

/** 多角色诊断解读 */
export interface MultiRoleNarrative {
  /** CEO 视角：一句话总结 + 3 个战略要点 */
  ceoSummary: string;
  /** 团队负责人视角：具体可操作的行动指导 */
  teamLeadGuidance: string;
  /** HRBP 视角：人员/文化/组织健康建议 */
  hrBPActionItems: string;
  /** 生成时间 ISO-8601 */
  generatedAt: string;
  /** true = LLM 全断，使用规则拼接的降级文本 */
  fallback: boolean;
}

/** 改进行动项 */
export interface ImprovementActionItem {
  /** 唯一 ID */
  id: string;
  /** 来源诊断模块名 */
  sourceModule: string;
  /** 来源缝隙维度 */
  sourceDimension: string;
  /** 人类可读标题 */
  title: string;
  /** 详细描述 */
  description: string;
  /** 目标外部系统 */
  targetSystem: 'jira' | 'linear' | 'manual';
  /** 优先级 */
  priority: 'critical' | 'high' | 'medium' | 'low';
  /** 预估工时（小时） */
  estimatedEffortHours: number;
  /** 创建时间 ISO-8601 */
  createdAt: string;
  /** 外部系统 ID，创建后回填 */
  externalId?: string;
  /** 生命周期状态 */
  status: 'pending' | 'created' | 'applied' | 'dismissed';
  /** 给团队的建议文案 */
  suggestion: string;
}

/** 行动方案 */
export interface ActionPlan {
  teamId: string;
  generatedAt: string;
  items: ImprovementActionItem[];
  degradedModules: string[];
}

/** 任务集成结果 */
export interface TaskIntegrationResult {
  created: { localId: string; externalId: string; system: string }[];
  failed: { localId: string; reason: string }[];
  skipped: { localId: string; reason: string }[];
}

/** V3 组装选项 */
export interface AssemblyOptions {
  fdeModules?: {
    autoInterpreter?: boolean;
    autoAction?: boolean;
    benchmark?: boolean;
    dataEnricher?: boolean;
    workshopGenerator?: boolean;
    calibration?: boolean;
  };
}

// ====================================================================
// P2 基准对比引擎类型（ARCH-08 补充）
// ====================================================================

/** 单个维度的基准对比结果 */
export interface DimensionBenchmark {
  dimension: string;
  /** 当前团队得分 0-1 */
  teamScore: number;
  /** 同类团队均值 */
  peerAvg: number;
  /** 同类团队中位数 */
  peerMedian: number;
  /** 前 25% 阈值 */
  topQuartileThreshold: number;
  /** 当前团队百分位 0-100 */
  percentile: number;
  /** 排名 (1 = best) */
  rank: number;
  /** 可比团队总数 */
  totalPeers: number;
  /** 人类可读解释 */
  interpretation: string;
}

/** 基准对比报告 */
export interface BenchmarkReport {
  teamId: string;
  generatedAt: string;
  dimensions: Record<string, DimensionBenchmark>;
  /** 跨维度平均百分位 */
  overallPercentile: number;
  overallInterpretation: string;
  peerCount: number;
  degradedModules: string[];
}

// ====================================================================
// P2 数据富化引擎类型（ARCH-08 补充）
// ====================================================================

/** 本地 Git 仓库指标 */
export interface LocalGitMetrics {
  repoPath: string;
  commitsLast30Days: number;
  activeBranches: number;
  uniqueAuthors: number;
  /** 每周 merge 次数 */
  mergeFrequency: number;
  /** 平均每次 commit 变更文件数 */
  avgCommitSize: number;
}

/** 软件生态富化数据 */
export interface SoftwareEnrichment {
  installedTools: string[];
  categories: Record<string, string[]>;
  /** 有协作价值的工具但未集成 */
  integrationGaps: string[];
}

/** GitHub API 指标 */
export interface GitHubMetrics {
  openPRs: number;
  mergedPRsLast30Days: number;
  avgReviewTurnaroundHours: number;
  openIssues: number;
  closedIssuesLast30Days: number;
  issueCloseRate: number;
}

/** 数据富化插件接口 */
export interface EnricherPlugin {
  id: string;
  label: string;
  fetch: (teamId: string) => Promise<Record<string, unknown> | null>;
}

/** 富化数据汇总 */
export interface EnrichedData {
  teamId: string;
  generatedAt: string;
  localGit: LocalGitMetrics | null;
  software: SoftwareEnrichment | null;
  github: GitHubMetrics | null;
  degradedModules: string[];
}

/** V3 FDE 扩展字段 */
export interface FDEDiagnosisExtensions {
  multiRoleNarrative?: MultiRoleNarrative | null;
  actionPlan?: ActionPlan | null;
  benchmark?: BenchmarkReport | null;
  enrichedData?: EnrichedData | null;
}

/** FullDiagnosisV3 = V2 + FDE 扩展 */
export interface FullDiagnosisV3 extends FullDiagnosisV2 {
  fde: FDEDiagnosisExtensions;
}

// ====================================================================
// SynovaAgent 诊断代理运行时类型（P1a 新增）
// ====================================================================

// --- Phase 0 输入/输出 ---

/** 诊断发起人画像 */
export interface InitiatorProfile {
  /** 发起人角色标识（如 "CEO"、"TeamLead"、"HRBP"） */
  role: string;
  /** 所属团队 ID */
  teamId: string;
  /** 发起人姓名（可选） */
  name?: string;
  /** 发起人自述关注点 */
  concerns?: string[];
  /** 战略姿态问卷答案（Phase 0 采集） */
  postureAnswers?: PostureQuestionnaire;
  /** 启用多角色访谈（Phase 0 自动创建访谈项目） */
  enableMultiRoleInterview?: boolean;
}

/** 诊断范围界定（Phase 0 输出） */
export interface DiagnosisScope {
  teamId: string;
  /** 确定的诊断维度列表 */
  dimensions: string[];
  /** 排除的维度及原因 */
  excludedDimensions: Record<string, string>;
  /** 目标深度 */
  depth: 'quick' | 'standard' | 'deep';
  /** 范围确认时间 ISO-8601 */
  confirmedAt: string;
  /** 识别到的战略姿态（Phase 0 输出） */
  posture?: StrategicPosture;
  /** 多角色访谈项目 ID（Phase 0 创建，Phase 1/3 消费） */
  interviewProjectId?: string;
}

// --- 证据与发现（Phase 1 输出 / 全阶段共用） ---

/** 诊断证据 */
export interface DiagnosisEvidence {
  id: string;
  /** 证据来源类型 */
  source: 'module' | 'interviewee' | 'document' | 'external_system' | 'llm_inferred';
  /** 证据内容 */
  content: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 采集时间 ISO-8601 */
  timestamp: string;
  /** 采集阶段 0-5 */
  phase: number;
  /** 所属维度 */
  dimension: string;
  /** 是否包含敏感/隐私信息 */
  isPrivate: boolean;
  /** 隐私原因（isPrivate 为 true 时必填） */
  privateReason?: string;
  /** 被哪个新证据 ID 推翻 (Phase 2 新证据覆盖 Phase 1 旧推断时自动标记) */
  supersededBy?: string;
  /** 推翻时间 */
  supersededAt?: string;
  /** 来源角色 ID（interviewee 来源时） */
  roleId?: string;
  /** 来源模块 ID（module 来源时） */
  moduleId?: string;
}

/** 模块发现 */
export interface ModuleFinding {
  /** 模块 ID */
  moduleId: string;
  /** 严重程度 */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** 发现详情 */
  detail: string;
  /** 关联证据 ID 列表 */
  evidenceRefs: string[];
}

/** 证据查询过滤器 */
export interface EvidenceFilter {
  dimension?: string;
  phase?: number;
  source?: DiagnosisEvidence['source'];
  minConfidence?: number;
  isPrivate?: boolean;
}

/** 矛盾信号 */
export interface ContradictionSignal {
  /** 证据 A ID */
  evidenceA: string;
  /** 证据 B ID */
  evidenceB: string;
  /** 所属维度 */
  dimension: string;
  /** 矛盾严重程度 0-1 */
  severity: number;
  /** 人类可读描述 */
  description: string;
}

// --- 假设与根因（Phase 2/3 输出） ---

/** 诊断假设（Phase 2 输出） */
export interface DiagnosisHypothesis {
  id: string;
  /** 假设陈述 */
  statement: string;
  /** 涉及的缝隙维度 */
  dimensions: string[];
  /** 置信度 0-1 */
  confidence: number;
  /** 支持证据 ID 列表 */
  supportingEvidence: string[];
  /** 反对证据 ID 列表 */
  refutingEvidence: string[];
  /** 状态 */
  status: 'active' | 'confirmed' | 'refuted';
  /** 生成阶段 */
  generatedInPhase: number;
}

/** 因果链节点 */
export interface CausalNode {
  id: string;
  /** 节点标签 */
  label: string;
  /** 节点类型 */
  type: 'symptom' | 'cause' | 'root_cause' | 'contributing_factor';
  /** 所属维度 */
  dimension: string;
  /** 严重程度 0-1 */
  severity: number;
}

/** 因果链边 */
export interface CausalEdge {
  from: string;
  to: string;
  /** 关系标签（如 "导致"、"加剧"、"缓解"） */
  label: string;
  /** 关系强度 0-1 */
  strength: number;
}

/** 因果链 */
export interface CausalChain {
  nodes: CausalNode[];
  edges: CausalEdge[];
}

/** 根因（Phase 3 输出单元） */
export interface RootCause {
  id: string;
  /** 所属维度 */
  dimension: string;
  /** 置信度 0-1 */
  confidence: number;
  /** 支持证据 ID 列表 */
  supportingEvidence: string[];
  /** 因果链 */
  causalChain: CausalChain;
  /** 跨维度关联——根因涉及的其他维度及关联说明 */
  crossDimensionLinks?: Array<{
    dimension: string;
    relationship: string;
    evidenceCount: number;
  }>;
  /** 人类可读描述 */
  description: string;
}

/** 根因树（Phase 3 输出） */
export interface RootCauseTree {
  /** 根因列表 */
  rootCauses: RootCause[];
  /** 矛盾检测结果 */
  contradictions: ContradictionSignal[];
  /** 生成时间 ISO-8601 */
  generatedAt: string;
}

// --- 报告与交付（Phase 4/5 输出） ---

/** 结构化诊断报告（Phase 4 输出，金字塔结构） */
export interface StructuredDiagnosisReport {
  /** 顶层：CEO 一句话摘要 */
  ceoSummary: string;
  /** 中层：六缝隙雷达图数据 */
  gapRadar: Record<string, number>;
  /** 关键发现列表 */
  keyFindings: ModuleFinding[];
  /** 底层：全部证据链 */
  evidenceChain: DiagnosisEvidence[];
  /** 根因树 */
  rootCauseTree: RootCauseTree;
  /** 行动建议 */
  actionRecommendations: string[];
  /** 生成时间 ISO-8601 */
  generatedAt: string;
  /** 诊断耗时 ms */
  durationMs: number;
  /** 降级模块列表 */
  degradedModules: string[];
  /** 战略姿态 */
  posture: StrategicPosture;
  /** 姿态人类可读标签 */
  postureLabel: string;
}

/** 交付结果（Phase 5 输出） */
export interface DeliveryResult {
  /** 报告访问 URL */
  reportUrl: string;
  /** 是否已同步到外部系统 */
  syncedToExternal: boolean;
  /** 外部系统同步详情 */
  externalSync?: {
    system: string;
    status: 'success' | 'partial' | 'failed';
    details: string;
  }[];
  /** 持续监测锚点——告知用户下次诊断时间+自动检查内容（Phase 5 信任闭环） */
  continuousMonitoringAnchor?: {
    /** 建议下次诊断日期 ISO */
    nextDiagnosisDate: string;
    /** 下次诊断自动检查的内容 */
    autoCheckItems: string[];
    /** 锚点话术（给用户看） */
    message: string;
  };
}

// --- 全流程聚合类型 ---

/** 诊断咨询完整结果 */
export interface ConsultationResult {
  teamId: string;
  /** 最终报告 */
  report: StructuredDiagnosisReport;
  /** 全量事件流 */
  events: DiagnosisEvent[];
  /** 总耗时 ms */
  totalDurationMs: number;
  /** 降级模块列表 */
  degradedModules: string[];
  /** 交付结果 */
  delivery: DeliveryResult;
}

/** 代理迭代状态快照 */
export interface AgentIterationState {
  /** 当前阶段 0-5 */
  phase: number;
  /** 当前迭代次数 */
  iteration: number;
  /** 最大迭代次数 */
  maxIterations: number;
  /** 证据池当前大小 */
  evidenceCount: number;
  /** 活跃假设数 */
  hypothesisCount: number;
}

// ====================================================================
// 战略姿态识别（ARCH-16: 五种姿态 → P1 实现前三种）
// ====================================================================

/** 战略姿态 */
export type StrategicPosture =
  | 'moat_builder'       // 护城河型
  | 'steady_operator'    // 稳健经营型
  | 'survival_seeker'    // 生存突破型
  | 'lifestyle_keeper'   // 自由生活型（P2）
  | 'mission_focus';     // 使命驱动型（P2）

/** Phase 0 姿态识别问卷答案 */
export interface PostureQuestionnaire {
  /** Q1: 三年目标 */
  q1Goal: 'leader' | 'stable_profit' | 'survive' | 'lifestyle' | 'impact';
  /** Q2: 增长机会态度 */
  q2Growth: 'seize' | 'cautious' | 'survive_first' | 'reject' | 'mission_aligned';
  /** Q3: 成功指标（多选排序） */
  q3Metrics: Array<'market_share' | 'profit_cashflow' | 'team_wellbeing' | 'user_growth' | 'social_impact'>;
}

/** 姿态配置：控制诊断模块的选择、权重、叙事 */
export interface PostureConfig {
  posture: StrategicPosture;
  /** 人类可读标签 */
  label: string;
  /** 报告标题 */
  reportTitle: string;
  /** 头部渐变色 */
  headerGradient: string;
  /** 应运行的模块 ID 列表 */
  enabledModules: string[];
  /** 应跳过的模块 ID 列表 */
  skippedModules: string[];
  /** 模块叙事映射：moduleId → 姿态特定措辞 */
  narrativeMap: Record<string, PostureModuleNarrative>;
}

/** 单个模块在特定姿态下的叙事配置 */
export interface PostureModuleNarrative {
  /** 姿态下的章节标题 */
  sectionTitle: string;
  /** 健康阈值（覆写默认值） */
  criticalThreshold: number;
  /** 健康时的 CEO 摘要片段模板 */
  healthyFragment: string;
  /** 告警时的 CEO 摘要片段模板 */
  criticalFragment: string;
  /** 行动建议模板 */
  actionTemplate: string;
}

// --- 错误分类 ---

/** 诊断错误码（对标 Claw-Code ApiError 枚举） */
export enum DiagnosisErrorCode {
  EVIDENCE_INSUFFICIENT = 'EVIDENCE_INSUFFICIENT',
  LLM_TIMEOUT = 'LLM_TIMEOUT',
  GATE_CHECK_FAILED = 'GATE_CHECK_FAILED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  RECOVERY_EXHAUSTED = 'RECOVERY_EXHAUSTED',
  SESSION_CORRUPTED = 'SESSION_CORRUPTED',
  MODULE_FAILED = 'MODULE_FAILED',
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  SUBAGENT_LOST = 'SUBAGENT_LOST',
  // Ontology layer (ARCH-23 Phase 2)
  GRAPH_DB = 'GRAPH_DB',
  INGEST_INVALID = 'INGEST_INVALID',
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
  QUERY_TIMEOUT = 'QUERY_TIMEOUT',
  VERSION_CONFLICT = 'VERSION_CONFLICT',
}

// --- 事件流 ---

/** 诊断事件（可区分联合类型，对标 Claw-Code TelemetryEvent） */
export type DiagnosisEvent =
  | { type: 'phase_started'; phase: number; timestamp: string }
  | { type: 'phase_completed'; phase: number; durationMs: number; degradedModules: string[]; timestamp: string }
  | { type: 'evidence_added'; evidence: DiagnosisEvidence; timestamp: string }
  | { type: 'contradiction_detected'; evidenceA: string; evidenceB: string; dimension: string; timestamp: string }
  | { type: 'hypothesis_generated'; hypothesis: DiagnosisHypothesis; timestamp: string }
  | { type: 'hypothesis_refuted'; hypothesisId: string; reason: string; timestamp: string }
  | { type: 'root_cause_identified'; rootCause: RootCause; timestamp: string }
  | { type: 'report_ready'; reportUrl: string; timestamp: string }
  | { type: 'error'; code: DiagnosisErrorCode; message: string; recoverable: boolean; timestamp: string }
  | { type: 'llm_response'; phase: number; contentPreview: string; contentLength: number; timestamp: string }
  | { type: 'llm_fallback'; phase: number; reason: string; llmContentPreview: string; timestamp: string };

// --- 权限类型（供 diagnosis-permissions.ts 使用） ---

/** 诊断权限等级（对标 Claw-Code PermissionMode） */
export enum DiagnosisPermissionLevel {
  EVERYONE = 0,
  ORG_MEMBER = 1,
  DIAGNOSIS_PARTICIPANT = 2,
  INITIATOR_ONLY = 3,
  FDE_OVERRIDE = 4,
  ADMIN_ONLY = 5,
  NEVER = 6,
}

/** 权限检查上下文 */
export interface PermissionContext {
  requesterRole: string;
  requesterTeamId: string;
  targetTeamId: string;
  isInitiator: boolean;
  isFDE: boolean;
}

/** 权限检查结果（对标 Claw-Code PermissionPromptDecision） */
export type PermissionResult =
  | { allowed: true }
  | { allowed: false; reason: string; suggestedAction: string };

// --- 会话压缩类型（供 diagnosis-session.ts 使用） ---

/** 会话消息 */
export interface DiagnosisSessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /** 工具调用块（assistant 消息） */
  toolUses?: { id: string; name: string; input: string }[];
  /** 工具结果块（user 消息，对应 tool_use id） */
  toolResults?: { id: string; content: string }[];
}

/** 会话压缩结果 */
export interface CompactResult {
  /** 压缩后保留的消息 */
  messages: DiagnosisSessionMessage[];
  /** 摘要文本（被移出窗口的消息的摘要） */
  summary: string;
  /** 是否触发了压缩 */
  wasCompacted: boolean;
}

// ====================================================================
// Expert Sub-Agent Types (ARCH-17: 协调者 + 6 专家并行 + 合成器)
// ====================================================================

/** 专家类型 */
export type ExpertType =
  | 'strategic_analyst'
  | 'org_diagnostician'
  | 'financial_analyst'
  | 'tech_architect'
  | 'action_advisor'
  | 'marketing_analyst';

/** 专家发现 */
export interface ExpertFinding {
  id: string;
  dimension: string;
  statement: string;
  confidence: number;
  evidenceRefs: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedActions: string[];
}

/** 专家主动标记的矛盾信号 */
export interface ConflictSignal {
  dimension: string;
  myFinding: string;
  myConfidence: number;
  potentialOpposingExpert?: ExpertType;
  reason: string;
}

/** 专家间交叉引用 */
export interface CrossReference {
  dimension: string;
  expertType: ExpertType;
  reason: string;
  priority: 'advisory' | 'important' | 'critical';
}

/** 专家报告 (所有专家强制输出格式) */
export interface ExpertReport {
  reportId: string;
  diagnosisId: string;
  expertType: ExpertType;
  expertName: string;
  orgName: string;
  status: 'running' | 'completed' | 'failed' | 'timeout';
  findings: ExpertFinding[];
  overallAssessment: string;
  uncertainties: { description: string; reason: string; suggestedNextStep: string }[];
  conflictingSignals: ConflictSignal[];
  crossReferences: CrossReference[];
  model: string;
  tokens: { input: number; output: number };
  durationMs: number;
  generatedAt: string;
  toolCalls: { name: string; summary: string }[];
}

/** 会话摘要 (协调者生成, 注入所有专家) */
export interface SessionBrief {
  diagnosisId: string;
  orgName: string;
  teamSize?: string;
  depth: 'quick' | 'standard' | 'deep';
  coreConcerns: string[];
  initiatorRole: string;
  initiatorQuote?: string;
  dimensions: string[];
  excludedDimensions: string[];
  specialNotes?: string;
  previousDiagnosis?: {
    date: string;
    overallScore: number;
    keyFindings: string[];
  };
}

/** 合成报告 (合成器输出) */
export interface SynthesisReport {
  synthesisId: string;
  diagnosisId: string;
  hypotheses: DiagnosisHypothesis[];
  crossExpertContradictions: {
    expertA: ExpertType;
    findingA: string;
    expertB: ExpertType;
    findingB: string;
    dimension: string;
    resolution: string;
  }[];
  crossDimensionLinks: { dimension: string; relatedDimension: string; relationship: string; evidenceCount: number }[];
  expertContributions: { expertType: ExpertType; contribution: string; weight: number }[];
  generatedAt: string;
}

/** 专家数据权限策略 */
export interface DataAccessPolicy {
  expertType: ExpertType;
  allowedDimensions: string[];
  allowedDataSources: string[];
  allowedTools: string[];
  sensitiveDataAccess: 'none' | 'read' | 'full';
  anonymizedView: boolean;
}

/** 专家知识条目 */
export interface ExpertKnowledgeEntry {
  id: string;
  expertType: ExpertType;
  category: string;
  content: string;
  source?: string;
  addedAt: string;
  lastUpdatedAt: string;
}

// ====================================================================
// Graph Ontology Types (ARCH-20: 组织数字孪生本体层)
// ====================================================================

// ═══ SOG-Core v1.0 — 过渡期别名 (全量迁移后删除) ═══
import { SOGNodeType, SOGEdgeType } from '@synova/sog-core';
export { SOGNodeType, SOGEdgeType };
export type NodeType = typeof SOGNodeType[keyof typeof SOGNodeType];
export type EdgeType = typeof SOGEdgeType[keyof typeof SOGEdgeType];

export interface GraphNode {
  id: string;
  type: NodeType;
  props: Record<string, unknown>;
  graph: string;
  createdAt: string;
  updatedAt: string;
}

export interface GraphEdge {
  id: string;
  type: EdgeType;
  from: string;
  to: string;
  weight: number;
  props: Record<string, unknown>;
  graph: string;
  validFrom: string;
  validTo?: string;
}

export interface Triple {
  id: number;
  subject_type: string;
  subject_id: string;
  predicate: string;
  object_type: string;
  object_id: string;
  graph: string;
  weight: number;
  props_json: string;
  confidence: number;
  source?: string;
  valid_from: string;
  valid_to?: string;
  created_at: string;
}

export interface SubGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface OntologyPath {
  nodes: string[];
  edges: string[];
  totalWeight: number;
  length: number;
}

export interface OntologyEvent {
  id: string;
  source: string;
  timestamp: string;
  graph: string;
  nodes: Array<{ type: NodeType; props: Record<string, unknown> }>;
  edges: Array<{ type: EdgeType; from: string; to: string; weight?: number; props?: Record<string, unknown> }>;
}

export interface TriplePattern {
  subject_type?: string;
  subject_id?: string;
  predicate?: string;
  object_type?: string;
  object_id?: string;
}
