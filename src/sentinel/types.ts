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
export enum DiagnosisErrorCode {
  EVIDENCE_INSUFFICIENT = "EVIDENCE_INSUFFICIENT",
  LLM_TIMEOUT = "LLM_TIMEOUT",
  GATE_CHECK_FAILED = "GATE_CHECK_FAILED",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  RECOVERY_EXHAUSTED = "RECOVERY_EXHAUSTED",
  SESSION_CORRUPTED = "SESSION_CORRUPTED",
  MODULE_FAILED = "MODULE_FAILED",
  TOOL_TIMEOUT = "TOOL_TIMEOUT",
  SUBAGENT_LOST = "SUBAGENT_LOST",
}

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
  severity: 'critical' | 'warning' | 'info';
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
import type { capitalEfficiencySentinel as _capEffCheck } from '../../extensions/sentinels/capital-efficiency/aggregate';
import type { computeRoicWaccSpread as _roicCheck } from '../../extensions/sentinels/capital-efficiency/computes/roic-wacc-spread';
import type { computeCapitalTurnover as _capTurnCheck } from '../../extensions/sentinels/capital-efficiency/computes/capital-turnover';
