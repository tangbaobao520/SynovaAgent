/**
 * sentinel/types.ts — Sentinel 哨兵接口定义 (P1-1)
 *
 * 哨兵系统是所有长期监控能力的基础。
 * 每个 Sentinel 是一个独立的检查单元，由 CronScheduler 定时唤醒，
 * 执行检查、产生发现、触发告警。
 *
 * 架构: L3 (洞察层) — Sentinel 消费 L4 本体数据, 产生 Signal 节点
 *
 * @state: real — 接口契约, 编译器强制执行
 */

// V4.2.3: engine-core 桥接已删除 — 类型内联
// ═══ Sentinel 元数据 ═══

/** 哨兵类别 */
export type SentinelCategory =
  | 'health'         // 系统健康 (数据库连接、API 可用性)
  | 'data-quality'   // 数据质量 (缺失字段、过期数据、异常值)
  | 'risk'           // 风险监测 (关键人离职、客户集中度)
  | 'evolution'      // 进化追踪 (组织变化速度、适应性)
  | 'compliance'     // 合规检查
  | 'collaboration'  // 人+Agent 协作信号 (D3: 信任、协作深度、自知偏差)
  | 'capability'     // 组织能力信号 (D2: 缝隙、协议完备性、路径依赖)
  | 'strategy'       // 战略健康信号 (D6: 竞争壁垒)
  | 'growth'         // 增长诊断 (46哨兵增长动力学)
  | 'custom';        // 用户自定义

/** 哨兵优先级 */
export type SentinelPriority = 'P0' | 'P1' | 'P2' | 'P3';

/** 哨兵运行模式 */
export type SentinelMode =
  | 'cron'       // Cron 定时触发
  | 'event'      // 事件驱动 (本体变更时)
  | 'on-demand'; // 手动触发

// ═══ 哨兵发现 ═══

/** 单条哨兵发现 */
export interface SentinelFinding {
  /** 发现 ID (唯一) */
  id: string;
  /** 严重程度 */
  severity: 'emergency' | 'critical' | 'warning' | 'info';
  /** 标题 (一句话) */
  title: string;
  /** 详细描述 (人话) */
  description: string;
  /** 证据列表 */
  evidence: string[];
  /** 建议操作 */
  suggestion: string;
  /** 发现时间 */
  detectedAt: string;
  /** 关联的本体节点 ID (可选) */
  relatedNodeId?: string;
}

/** 哨兵检查结果 */
export interface SentinelCheckResult {
  /** 哨兵 ID */
  sentinelId: string;
  /** 检查是否成功执行 */
  ok: boolean;
  /** 发现列表 */
  findings: SentinelFinding[];
  /** 执行耗时 (ms) */
  durationMs: number;
  /** 检查时间 */
  checkedAt: string;
  /** 错误信息 (ok=false 时) */
  error?: string;
  /** 降级标记 (部分数据不可用但仍产出结果) */
  degraded?: boolean;
}

// ═══ Sentinel 接口 ═══

/** 哨兵配置 */
export interface SentinelConfig {
  /** 唯一标识 */
  id: string;
  /** 显示名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 类别 */
  category: SentinelCategory;
  /** 优先级 */
  priority: SentinelPriority;
  /** 运行模式 */
  mode: SentinelMode;
  /** Cron 表达式 (mode=cron 时必填) */
  cron?: string;
  /** 所需数据源 */
  requiredDataSources: string[];
  /** 置信度模型 */
  confidenceModel: 'deterministic' | 'statistical' | 'llm';
  /** 版本 */
  version: string;
  /** 诊断层 (技术方案 §5) */
  layer?: 'environment' | 'capital' | 'interface' | 'technology' | 'alignment' | 'internal';
  /** 辅助专家列表 */
  auxiliaryExperts?: string[];
  /** 计算类型 */
  computeKind?: 'deterministic' | 'heuristic' | 'conditional' | 'inferred' | 'aggregate';
  /** 是否需要技术-经济范式阶段校准阈值 */
  technoEconomicPhaseCalibration?: boolean;
}

/**
 * Sentinel 接口 — 所有哨兵必须实现此接口。
 *
 * 对标 OpenClaw Hook 模式: 每个 Sentinel 是一个独立的检查单元,
 * 由 SentinelRegistry 管理生命周期, CronScheduler 驱动定时执行。
 */
export interface Sentinel {
  /** 哨兵配置 */
  readonly config: SentinelConfig;

  /**
   * 执行一次检查。
   *
   * @param context — 运行上下文 (数据库连接、当前时间等)
   * @returns 检查结果, 包含发现列表
   *
   * 约定:
   * - 永远不抛异常 — 错误通过 SentinelCheckResult.ok=false 返回
   * - 数据不足时返回空 findings + degraded=true
   * - 单次检查应在 30s 内完成 (超时由调用方处理)
   */
  check(context: SentinelContext): Promise<SentinelCheckResult>;
}

/** 哨兵运行上下文 */
export interface SentinelContext {
  /** 数据库实例 */
  db: unknown;
  /** 当前时间 (便于测试时间确定性) */
  now: Date;
  /** 哨兵注册中心 (哨兵间可互查) */
  registry?: SentinelRegistry;
  /** V4.3.0: 图遍历实例 (可选 — 旧 aggregate 不收也能工作) */
  traversal?: import('../l4/graph-traversal').GraphTraversal;
  /** V4.3.0: 团队 ID (上下文透传) */
  teamId?: string;
}

// ═══ SentinelRegistry 接口 ═══

export interface SentinelRegistry {
  /** 注册一个哨兵 */
  register(sentinel: Sentinel): void;
  /** 注销哨兵 */
  unregister(id: string): void;
  /** 获取哨兵 */
  get(id: string): Sentinel | undefined;
  /** 列出所有已注册哨兵 */
  list(): Sentinel[];
  /** 按类别过滤 */
  listByCategory(category: SentinelCategory): Sentinel[];
  /** 按优先级过滤 */
  listByPriority(priority: SentinelPriority): Sentinel[];
  /** 获取哨兵总数 */
  count(): number;
}

// V4.2.5: 编译时验证 — extensions/sentinels/{name}/aggregate.ts 的 exportKey
// 哨兵通过 sentinel-loader.ts 动态加载，静态 import type 确保 tsc 零失败
import type { apiCoverageSentinel as _apiCoverageTypeCheck } from '../../extensions/sentinels/api-coverage/aggregate';
import type { computeProtocolCoverage as _protoCoverageCheck } from '../../extensions/sentinels/api-coverage/computes/protocol-coverage';
import type { dataHealthSentinel as _dataHealthTypeCheck } from '../../extensions/sentinels/data-health/aggregate';
import type { computeDataReadiness as _dataReadinessCheck } from '../../extensions/sentinels/data-health/computes/data-readiness-score';
import type { computeDataSiloScore as _dataSiloCheck } from '../../extensions/sentinels/data-health/computes/data-silo-score';
import type { softwareHealthSentinel as _swHealthTypeCheck } from '../../extensions/sentinels/software-health/aggregate';
import type { computeSaasUsageScore as _saasCheck } from '../../extensions/sentinels/software-health/computes/saas-usage-score';
import type { computeShadowItScore as _shadowCheck } from '../../extensions/sentinels/software-health/computes/shadow-it-score';
import type { customerDemandShiftSentinel as _custDemandCheck } from '../../extensions/sentinels/customer-demand-shift/aggregate';
import type { computeCustomerChurnRisk as _custChurnCheck } from '../../extensions/sentinels/customer-demand-shift/computes/customer-churn-risk';
import type { computeCustomerConcentration as _custConcCheck } from '../../extensions/sentinels/customer-demand-shift/computes/customer-concentration';
import type { capitalEfficiencySentinel as _capEffCheck } from '../../extensions/sentinels/_extinct/capital-efficiency/aggregate';
import type { computeRoicWaccSpread as _roicCheck } from '../../extensions/sentinels/_extinct/capital-efficiency/computes/roic-wacc-spread';
import type { marketLifecycleSentinel as _marketLifecycleCheck } from '../../extensions/sentinels/_extinct/market-lifecycle/aggregate';
import type { computeLifecycleStage as _lifecycleCheck } from '../../extensions/sentinels/_extinct/market-lifecycle/computes/lifecycle-stage';
import type { opportunityWindowSentinel as _oppWinCheck } from '../../extensions/sentinels/opportunity-window/aggregate';
import type { computeOpportunityWindowScore as _oppScoreCheck } from '../../extensions/sentinels/opportunity-window/computes/opportunity-window-score';
import type { computeCapitalTurnover as _capTurnCheck } from '../../extensions/sentinels/_extinct/capital-efficiency/computes/capital-turnover';
import type { competitiveDynamicsSentinel as _compDynCheck } from "../../extensions/sentinels/_extinct/competitive-dynamics/aggregate";
import type { environmentRentDependencySentinel as _rentDepCheck } from "../../extensions/sentinels/environment-rent-dependency/aggregate";
import type { structuralChangeSentinel as _structChangeCheck } from "../../extensions/sentinels/_extinct/structural-change/aggregate";
import type { computeStructuralChangeSignal as _structSigCheck } from "../../extensions/sentinels/_extinct/structural-change/computes/structural-change-signal";

import type { financingConstraintSentinel as _finConCheck } from "../../extensions/sentinels/financing-constraint/aggregate";
import type { capitalStructureSentinel as _capStructCheck } from "../../extensions/sentinels/_extinct/capital-structure/aggregate";
import type { computeDebtEquityRatio as _deCheck } from "../../extensions/sentinels/_extinct/capital-structure/computes/debt-equity-ratio";
import type { computeInterestCoverage as _icCheck } from "../../extensions/sentinels/_extinct/capital-structure/computes/interest-coverage";
import type { growthQualitySentinel as _gqCheck } from "../../extensions/sentinels/growth-quality/aggregate";
import type { computeCashConversionRate as _ccrCheck } from "../../extensions/sentinels/growth-quality/computes/cash-conversion-rate";
import type { capitalTurnoverSentinel as _ctCheck } from "../../extensions/sentinels/_extinct/capital-turnover/aggregate";
import type { computeDebtStructure as _dsCheck } from "../../extensions/sentinels/_extinct/capital-structure/computes/debt-structure";
import type { computeIntegrationHealth as _ihCheck } from "../../extensions/sentinels/software-health/computes/integration-health";
import type { computeAssetTurnover as _atCheck } from "../../extensions/sentinels/_extinct/capital-turnover/computes/asset-turnover";
import type { computeCashConversionCycle as _cccCheck } from "../../extensions/sentinels/_extinct/capital-turnover/computes/cash-conversion-cycle";
import type { computeCashRunway as _crCheck } from "../../extensions/sentinels/financing-constraint/computes/cash-runway";
import type { computeWacc as _waccCheck } from "../../extensions/sentinels/_extinct/capital-efficiency/computes/wacc";
import type { computeVariableCosts as _varcCheck } from "../../extensions/sentinels/unit-economics/computes/variable-costs";
import type { computeMarginalContribution as _mcCheck } from "../../extensions/sentinels/unit-economics/computes/marginal-contribution";
import type { computeFixedCostRigidity as _fcrCheck } from "../../extensions/sentinels/unit-economics/computes/fixed-cost-rigidity";
import type { computeScenarioSimulation as _ssCheck } from "../../extensions/sentinels/unit-economics/computes/scenario-simulation";
import type { computeBreakEven as _beCheck } from "../../extensions/sentinels/unit-economics/computes/break-even";
import type { computeProblemActionCycle as _pacCheck } from "../../extensions/sentinels/org-repairability/computes/compute-problem-action-cycle";
import type { computeFinkelsteinPowerIndex as _fpiCheck } from "../../extensions/sentinels/power-rigidity/computes/compute-power-rigidity";
import type { computeExploreExploitBalanceV2 as _eebv2Check } from "../../extensions/sentinels/explore-exploit-balance/computes/compute-explore-exploit-balance";
import type { nicheBreadthSentinel as _nbCheck } from "../../extensions/sentinels/niche-breadth/aggregate";
import type { computeLevinsBreadth as _levinsCheck } from "../../extensions/sentinels/niche-breadth/computes/levins-breadth";
import type { nicheSqueezeSentinel as _nsCheck } from "../../extensions/sentinels/niche-squeeze/aggregate";
import type { computeNicheSqueezeIndex as _nsIdxCheck } from "../../extensions/sentinels/niche-squeeze/computes/niche-squeeze-index";
import type { competitiveMoatStructuralSentinel as _cmsCheck } from "../../extensions/sentinels/_extinct/competitive-moat-structural/aggregate";
import type { competitiveMoatPerceptualSentinel as _cmpCheck } from "../../extensions/sentinels/_extinct/competitive-moat-perceptual/aggregate";
import type { businessModelCoherenceSentinel as _bmcCheck } from "../../extensions/sentinels/business-model-coherence/aggregate";
import type { unitEconomicsSentinel as _ueCheck } from "../../extensions/sentinels/unit-economics/aggregate";
import type { internalTransactionCostSentinel as _itcCheck } from "../../extensions/sentinels/internal-transaction-cost/aggregate";
import type { networkPowerSentinel as _npCheck } from "../../extensions/sentinels/network-power/aggregate";
import type { valueCaptureSentinel as _vcCheck } from "../../extensions/sentinels/value-capture/aggregate";
import type { moatDependencySentinel as _mdCheck } from "../../extensions/sentinels/moat-dependency/aggregate";
import type { timePenetrationSentinel as _tpCheck } from "../../extensions/sentinels/time-penetration/aggregate";
import type { makeOrBuySentinel as _mobCheck } from "../../extensions/sentinels/make-or-buy/aggregate";
import type { ConnectorCoverageSentinel as _ccCheck } from "../../extensions/sentinels/_extinct/connector-coverage/aggregate";
import type { ProcessAiReadinessSentinel as _parCheck } from "../../extensions/sentinels/process-ai-readiness/aggregate";
import type { AiEcosystemFitSentinel as _aefCheck } from "../../extensions/sentinels/ai-ecosystem-fit/aggregate";
import type { AgentDeploymentMaturitySentinel as _admCheck } from "../../extensions/sentinels/agent-deployment-maturity/aggregate";
import type { AiInvestmentReturnSentinel as _airCheck } from "../../extensions/sentinels/ai-investment-return/aggregate";
import type { HumanAgentBoundarySentinel as _habCheck } from "../../extensions/sentinels/human-agent-boundary/aggregate";
import type { strategyCapabilityFitSentinel as _scfCheck } from "../../extensions/sentinels/strategy-capability-fit/aggregate";
import type { adaptationVelocitySentinel as _avCheck } from "../../extensions/sentinels/_extinct/adaptation-velocity/aggregate";
import type { resourceMisallocationSentinel as _rmCheck } from "../../extensions/sentinels/resource-misallocation/aggregate";
import type { exploreExploitBalanceSentinel as _eebCheck } from "../../extensions/sentinels/explore-exploit-balance/aggregate";
import type { routineMutationSentinel as _rmutCheck } from "../../extensions/sentinels/routine-mutation/aggregate";
import type { incentiveAlignmentSentinel as _iaCheck } from "../../extensions/sentinels/incentive-alignment/aggregate";
import type { knowledgeAccessibilitySentinel as _kaCheck } from "../../extensions/sentinels/knowledge-accessibility/aggregate";
import type { routineDiffusionSentinel as _rdCheck } from "../../extensions/sentinels/routine-diffusion/aggregate";
import type { channelCapacitySentinel as _ccapCheck } from "../../extensions/sentinels/channel-capacity/aggregate";
import type { infoDistortionSentinel as _idCheck } from "../../extensions/sentinels/info-distortion/aggregate";
import type { orgRepairabilitySentinel as _orCheck } from "../../extensions/sentinels/org-repairability/aggregate";
import type { powerRigiditySentinel as _prCheck } from "../../extensions/sentinels/power-rigidity/aggregate";
import type { talentDensitySentinel as _tdCheck } from "../../extensions/sentinels/talent-density/aggregate";
import type { computeFlywheelSpeeds as _fwCheck } from "../../src/sentinel/flywheel-aggregator";
