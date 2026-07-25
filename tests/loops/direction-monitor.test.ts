/**
 * tests/loops/direction-monitor.test.ts — D222 方向监测单元测试 (L1 契约)
 *
 * 权威文档 #6 测试体系规范:
 *   1. 全部边在基线范围内 → status=valid + deviations=[] (normal)
 *   2. 资本维度 40% 偏离 → status=risk + deviations 含 E-05 等 (boundary)
 *   3. 资本+客户双维度 60% 偏离 → status=invalid (error)
 *   4. 边参数不可用(无 EdgeStore) → valid + degraded (temporal/降级)
 *   5. 零边实例 → edge 当前值为 0 → 偏离 (边界)
 */
import { describe, it, expect } from "vitest";
import {
  DirectionMonitor,
  type EdgeStoreReader,
  type DirectionReport,
} from "../../src/loops/direction-monitor";

// ═══ Mock EdgeStoreReader ═══

/**
 * 根据边类型 → 权重列表 的映射，构建 Mock EdgeStore。
 * 权重列表为空时表示无边实例。
 */
function mockStore(
  edgeWeights: Record<string, number[]>,
): EdgeStoreReader {
  return {
    queryEdges(type, _from, _to, _graph) {
      const key = (type || "").toLowerCase();
      const weights = edgeWeights[key] || [];
      return weights.map((w, i) => ({
        id: `${key}-${i}`,
        type: key.toUpperCase(),
        from: "node-a",
        to: "node-b",
        weight: w,
        props: {},
      }));
    },
  };
}

// ═══ 测试 ═══

describe("D222: DirectionMonitor — 方向有效性监测", () => {
  // ════════════════════════════════════════════════════════════════════
  // 1. normal: 全部边在基线范围内 → valid
  // ════════════════════════════════════════════════════════════════════

  it("L1: 全部边在基线范围内 → status=valid, deviations=[]", async () => {
    // 所有已分类边权重接近默认基线 0.7
    const allEdges = [
      "capital_acquisition", "capital_allocation", "capital_source_mix",
      "profit_reinvestment", "funds", "equipment_acquisition",
      "efficiency_attraction", "value_pricing", "procurement_bargaining",
      "assumption_triggered_reallocation",
      "customer_lockin", "customer_data_loop", "brand_building", "brand_builds",
      "demand_to_spec", "channel_delivery", "service_support",
      "reputation_attraction", "reputation_flywheel", "competitive_positioning",
      "market_share_capture",
      "talent_acquisition", "talent_deployment", "talent_filter", "talent_retention",
      "knowledge_reuse", "knowledge_sharing", "organizational_learning",
      "cross_functional_synergy", "decision_authority", "decision_concentrates",
      "incentive_alignment", "incentive_binds", "trust_friction_reduction",
    ];
    const weights: Record<string, number[]> = {};
    for (const edge of allEdges) {
      weights[edge] = [0.7]; // 正好在基线
    }

    const monitor = new DirectionMonitor(mockStore(weights));
    const report = await monitor.checkDirection("default");

    expect(report.status).toBe("valid");
    expect(report.deviations.length).toBe(0);
    expect(report.degraded).toBe(false);
    expect(report.checkedAt).toBeTruthy();
  });

  // ════════════════════════════════════════════════════════════════════
  // 2. boundary: 资本维度 40% 偏离 → risk
  // ════════════════════════════════════════════════════════════════════

  it("L1: 资本维度 40% 偏离 → status=risk, 含偏离记录", async () => {
    // 资本边全部低权重 (偏离 > 30%)
    // 客户/人才边正常
    const low = [0.15]; // 严重偏离
    const ok = [0.7];   // 正常
    const weights: Record<string, number[]> = {
      // 资本类 — 全部严重偏离
      capital_acquisition: low, capital_allocation: low, capital_source_mix: low,
      profit_reinvestment: low, funds: low, equipment_acquisition: low,
      efficiency_attraction: low, value_pricing: low, procurement_bargaining: low,
      assumption_triggered_reallocation: low,
      // 客户类 — 正常
      customer_lockin: ok, customer_data_loop: ok, brand_building: ok,
      brand_builds: ok, demand_to_spec: ok, channel_delivery: ok,
      service_support: ok, reputation_attraction: ok, reputation_flywheel: ok,
      competitive_positioning: ok, market_share_capture: ok,
      // 人才类 — 正常
      talent_acquisition: ok, talent_deployment: ok, talent_filter: ok,
      talent_retention: ok, knowledge_reuse: ok, knowledge_sharing: ok,
      organizational_learning: ok, cross_functional_synergy: ok,
      decision_authority: ok, decision_concentrates: ok,
      incentive_alignment: ok, incentive_binds: ok, trust_friction_reduction: ok,
    };

    const monitor = new DirectionMonitor(mockStore(weights));
    const report = await monitor.checkDirection("default");

    expect(report.status).toBe("risk");
    expect(report.deviations.length).toBeGreaterThan(0);

    // 验证资本维度偏离率 ≥ 30%
    const capitalCat = report.categories.find((c) => c.category === "capital");
    expect(capitalCat).toBeDefined();
    expect(capitalCat!.deviationRate).toBeGreaterThanOrEqual(0.3);

    // 验证偏离记录包含边名
    const deviationEdgeIds = report.deviations.map((d) => d.edgeId);
    expect(deviationEdgeIds).toContain("capital_acquisition");
  });

  // ════════════════════════════════════════════════════════════════════
  // 3. error: 资本+客户双维度 60% 偏离 → invalid
  // ════════════════════════════════════════════════════════════════════

  it("L1: 资本+客户双维度 60% 偏离 → status=invalid + warnings", async () => {
    // 资本 + 客户边全部低权重 (>50% 偏离)
    // 人才边正常
    const bad = [0.1]; // 严重偏离
    const ok = [0.7];  // 正常
    const weights: Record<string, number[]> = {
      // 资本类 — 全部严重偏离
      capital_acquisition: bad, capital_allocation: bad, capital_source_mix: bad,
      profit_reinvestment: bad, funds: bad, equipment_acquisition: bad,
      efficiency_attraction: bad, value_pricing: bad, procurement_bargaining: bad,
      assumption_triggered_reallocation: bad,
      // 客户类 — 全部严重偏离
      customer_lockin: bad, customer_data_loop: bad, brand_building: bad,
      brand_builds: bad, demand_to_spec: bad, channel_delivery: bad,
      service_support: bad, reputation_attraction: bad, reputation_flywheel: bad,
      competitive_positioning: bad, market_share_capture: bad,
      // 人才类 — 正常
      talent_acquisition: ok, talent_deployment: ok, talent_filter: ok,
      talent_retention: ok, knowledge_reuse: ok, knowledge_sharing: ok,
      organizational_learning: ok, cross_functional_synergy: ok,
      decision_authority: ok, decision_concentrates: ok,
      incentive_alignment: ok, incentive_binds: ok, trust_friction_reduction: ok,
    };

    const monitor = new DirectionMonitor(mockStore(weights));
    const report = await monitor.checkDirection("default");

    expect(report.status).toBe("invalid");
    expect(report.warnings.some((w) => w.includes("失效"))).toBe(true);

    // 验证资本和客户维度偏离率 ≥ 50%
    const capitalCat = report.categories.find((c) => c.category === "capital");
    const customerCat = report.categories.find((c) => c.category === "customer");
    const talentCat = report.categories.find((c) => c.category === "talent");

    expect(capitalCat!.deviationRate).toBeGreaterThanOrEqual(0.5);
    expect(customerCat!.deviationRate).toBeGreaterThanOrEqual(0.5);
    expect(talentCat!.deviationRate).toBeLessThan(0.3);
  });

  // ════════════════════════════════════════════════════════════════════
  // 4. temporal/降级: 无 EdgeStore → valid + degraded
  // ════════════════════════════════════════════════════════════════════

  it("L1: 边参数不可用(无 EdgeStore) → status=valid + degraded=true", async () => {
    const monitor = new DirectionMonitor(); // 无 EdgeStore
    const report = await monitor.checkDirection("default");

    expect(report.status).toBe("valid");
    expect(report.degraded).toBe(true);
    expect(report.deviations.length).toBe(0);
    expect(report.warnings.some((w) => w.includes("未注入"))).toBe(true);
  });

  // ════════════════════════════════════════════════════════════════════
  // 5. 边界: 所有边无实例 → 当前值=0 → 全部偏离
  // ════════════════════════════════════════════════════════════════════

  it("L1: 所有边无实例(空结果) → valid + degraded (无数据不阻断)", async () => {
    // 空 store — 没有边实例 → 降级
    const monitor = new DirectionMonitor(mockStore({}));
    const report = await monitor.checkDirection("default");

    expect(report.status).toBe("valid");
    expect(report.degraded).toBe(true);
    expect(report.warnings.some((w) => w.includes("无边实例"))).toBe(true);
  });
});
