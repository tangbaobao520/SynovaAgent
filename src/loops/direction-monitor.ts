/**
 * src/loops/direction-monitor.ts — 方向有效性监测 (D222)
 *
 * 附录 A v2.0 Gate 7 — 方向有效性监测。
 * 读取 42 边参数 + Goal 完成率 + 溢出状态 → 输出 direction_status。
 *
 * 契约:
 *   @input  — enterpriseId + EdgeStoreReader + 可选 Goal/Overflow 数据
 *   @output — DirectionReport { status, deviations[], warnings[], checkedAt }
 *   @degraded — 边参数不可用 → degraded + status=valid
 */
import { createLogger } from "@synova/logger";

const log = createLogger("loops/direction-monitor");

// ═══ 类型定义 ═══

/** 方向有效性状态 */
export type DirectionStatus = "valid" | "risk" | "invalid";

/** 维度分类 */
export type EdgeCategory = "capital" | "customer" | "talent";

/** 单条偏离记录 */
export interface EdgeDeviation {
  edgeId: string;
  edgeLabel: string;
  category: EdgeCategory;
  /** 当前值 (0-1 或权重) */
  currentValue: number;
  /** 基线值 */
  baseline: number;
  /** 偏离百分比 */
  deviationPercent: number;
}

/** 维度偏离统计 */
export interface CategoryDeviation {
  category: EdgeCategory;
  totalEdges: number;
  deviatedEdges: number;
  deviationRate: number; // 0-1
  deviations: EdgeDeviation[];
}

/** 方向监测报告 */
export interface DirectionReport {
  status: DirectionStatus;
  deviations: EdgeDeviation[];
  categories: CategoryDeviation[];
  warnings: string[];
  checkedAt: string;
  degraded: boolean;
}

/** 边存储读取器 — 最小接口，避免直接耦合 L4 GraphStore */
export interface EdgeStoreReader {
  queryEdges(
    type?: string,
    from?: string,
    to?: string,
    graph?: string,
  ): Array<{
    id: string;
    type: string;
    from: string;
    to: string;
    weight: number;
    props: Record<string, unknown>;
  }>;
}

// ═══ 常量 ═══

/**
 * 42+ 边类型分类映射 (资本/客户/人才)。
 * 基于 edge-types JSON 文件命名和 allowedFrom/allowedTo 语义。
 */
const EDGE_CLASSIFICATION: Record<string, EdgeCategory> = {
  // ── 资本 (Capital) ──
  capital_acquisition: "capital",
  capital_allocation: "capital",
  capital_source_mix: "capital",
  profit_reinvestment: "capital",
  funds: "capital",
  equipment_acquisition: "capital",
  efficiency_attraction: "capital",
  value_pricing: "capital",
  procurement_bargaining: "capital",
  assumption_triggered_reallocation: "capital",

  // ── 客户 (Customer) ──
  customer_lockin: "customer",
  customer_data_loop: "customer",
  brand_building: "customer",
  brand_builds: "customer",
  demand_to_spec: "customer",
  channel_delivery: "customer",
  service_support: "customer",
  reputation_attraction: "customer",
  reputation_flywheel: "customer",
  competitive_positioning: "customer",
  market_share_capture: "customer",

  // ── 人才 (Talent) ──
  talent_acquisition: "talent",
  talent_deployment: "talent",
  talent_filter: "talent",
  talent_retention: "talent",
  knowledge_reuse: "talent",
  knowledge_sharing: "talent",
  organizational_learning: "talent",
  cross_functional_synergy: "talent",
  decision_authority: "talent",
  decision_concentrates: "talent",
  incentive_alignment: "talent",
  incentive_binds: "talent",
  trust_friction_reduction: "talent",
};

const CATEGORY_NAMES: Record<EdgeCategory, string> = {
  capital: "资本",
  customer: "客户",
  talent: "人才",
};

const CATEGORY_EDGES = Object.keys(EDGE_CLASSIFICATION);

/** 判定阈值 */
const THRESHOLD_RISK = 0.3; // 30% 偏离 → risk
const THRESHOLD_INVALID = 0.5; // 50% 偏离 → invalid
const INVALID_CATEGORY_COUNT = 2; // 2+ 类别 ≥50% → invalid
const DEFAULT_BASELINE = 0.7; // 默认基线健康值

// ═══ DirectionMonitor ═══

/**
 * 方向有效性监测器。
 *
 * 读取 42 边参数（通过 EdgeStoreReader）→ 按资本/客户/人才分类统计偏离率
 * → 输出 direction_status（valid/risk/invalid）。
 *
 * 判定规则:
 *   - 2+ 类别偏离率 ≥50% → invalid
 *   - 任一类别偏离率 ≥30% → risk
 *   - 全部 <30% → valid
 */
export class DirectionMonitor {
  private edgeStore: EdgeStoreReader | null;

  constructor(edgeStore?: EdgeStoreReader) {
    this.edgeStore = edgeStore ?? null;
  }

  /**
   * 执行方向有效性检查。
   *
   * @param enterpriseId — 企业 ID
   * @returns DirectionReport
   */
  async checkDirection(enterpriseId: string): Promise<DirectionReport> {
    const warnings: string[] = [];
    const checkedAt = new Date().toISOString();

    // ─── 降级: 无 EdgeStore → valid + degraded ───
    if (!this.edgeStore) {
      log.warn({ enterpriseId }, "EdgeStore 未注入 — 方向监测降级 (valid)");
      return {
        status: "valid",
        deviations: [],
        categories: [],
        warnings: ["EdgeStore 未注入 — 使用降级模式"],
        checkedAt,
        degraded: true,
      };
    }

    // ─── 读取边数据 ───
    const allDeviations: EdgeDeviation[] = [];
    const categoryBuckets: Record<EdgeCategory, EdgeDeviation[]> = {
      capital: [],
      customer: [],
      talent: [],
    };

    for (const edgeType of CATEGORY_EDGES) {
      const category = EDGE_CLASSIFICATION[edgeType];
      try {
        const edges = this.edgeStore.queryEdges(
          edgeType.toUpperCase(),
          undefined,
          undefined,
          enterpriseId,
        );

        // 只处理有实例的边 — 无实例的边不参与统计（非缺失数据降级）
        if (edges.length === 0) continue;

        const currentValue = this.computeEdgeCurrentValue(edges);
        const baseline = this.computeEdgeBaseline(edgeType, currentValue);
        const deviationPercent = this.computeDeviation(currentValue, baseline);

        const deviation: EdgeDeviation = {
          edgeId: edgeType,
          edgeLabel: edgeType.replace(/_/g, " "),
          category,
          currentValue,
          baseline,
          deviationPercent,
        };

        if (deviationPercent > THRESHOLD_RISK) {
          allDeviations.push(deviation);
        }
        categoryBuckets[category].push(deviation);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ err: msg, edgeType }, "边参数查询失败 — 跳过");
        warnings.push(`${edgeType}: 查询失败 (${msg})`);
      }
    }

    // ─── 按类别统计偏离率 ───
    const categories: CategoryDeviation[] = [];
    for (const cat of ["capital", "customer", "talent"] as EdgeCategory[]) {
      const bucket = categoryBuckets[cat];
      const deviated = bucket.filter((d) => d.deviationPercent > THRESHOLD_RISK);
      categories.push({
        category: cat,
        totalEdges: bucket.length,
        deviatedEdges: deviated.length,
        deviationRate: bucket.length > 0 ? deviated.length / bucket.length : 0,
        deviations: deviated,
      });
    }

    // ─── 判定 status ───
    const totalTrackedEdges = categories.reduce((s, c) => s + c.totalEdges, 0);

    // 无数据 → 降级
    if (totalTrackedEdges === 0) {
      log.warn({ enterpriseId }, "方向监测降级 — 无边实例数据");
      return {
        status: "valid",
        deviations: [],
        categories,
        warnings: ["无边实例数据 — 使用降级模式"],
        checkedAt,
        degraded: true,
      };
    }

    const highDeviationCategories = categories.filter(
      (c) => c.deviationRate >= THRESHOLD_INVALID,
    );

    let status: DirectionStatus;
    if (highDeviationCategories.length >= INVALID_CATEGORY_COUNT) {
      status = "invalid";
      warnings.push(
        `方向可能已失效: ${highDeviationCategories.length} 个维度偏离率≥${THRESHOLD_INVALID * 100}%`,
      );
      log.warn(
        { enterpriseId, categories: highDeviationCategories.map((c) => c.category) },
        "方向无效 — 多维度严重偏离基线",
      );
    } else if (categories.some((c) => c.deviationRate >= THRESHOLD_RISK)) {
      status = "risk";
      log.warn(
        { enterpriseId, categories: categories.filter((c) => c.deviationRate >= THRESHOLD_RISK).map((c) => c.category) },
        "方向风险 — 存在偏离维度",
      );
    } else {
      status = "valid";
      log.info({ enterpriseId }, "方向有效 — 全部维度在基线范围内");
    }

    // ─── 写入系统日志 ───
    log.info(
      { enterpriseId, status, checkedAt, deviationCount: allDeviations.length },
      `方向监测完成: ${status}`,
    );

    return {
      status,
      deviations: allDeviations,
      categories,
      warnings,
      checkedAt,
      degraded: false,
    };
  }

  // ─── 内部方法 ───

  /**
   * 计算边的当前值。
   * 从 GraphStore 返回的边数据中推导健康评分 (0-1)。
   * 有多条实例时取平均权重；无实例时默认 0（完全偏离）。
   */
  private computeEdgeCurrentValue(
    edges: Array<{ weight: number; props: Record<string, unknown> }>,
  ): number {
    if (edges.length === 0) return 0;
    // 取权重平均值，钳制到 [0, 1]
    const avg = edges.reduce((s, e) => s + (e.weight || 0), 0) / edges.length;
    return Math.max(0, Math.min(1, avg));
  }

  /**
   * 计算边的基线值。
   * 部分边类型使用默认基线；未来支持从 transfer_function 推导预期范围。
   */
  private computeEdgeBaseline(_edgeType: string, _currentValue: number): number {
    return DEFAULT_BASELINE;
  }

  /**
   * 计算偏离百分比。
   * 基线为 0 时特殊处理: 当前值也为 0 → 0% 偏离, 否则 100%。
   */
  private computeDeviation(currentValue: number, baseline: number): number {
    if (baseline === 0) {
      return currentValue === 0 ? 0 : 1;
    }
    return Math.abs(currentValue - baseline) / baseline;
  }
}
