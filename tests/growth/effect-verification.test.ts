/**
 * tests/growth/effect-verification.test.ts — D254 效果验证测试 (L1×3)
 *
 * 1. closeGoal→verifyEffect→improved (delta > 10%)
 * 2. closeGoal→verifyEffect→worsened (delta < -10%)
 * 3. 无 diagnosisId→unknown
 */
import { describe, it, expect, beforeAll } from "vitest";
import { verifyEffect } from "../../src/growth/goal-lifecycle";
import { writeEffectReport, type EffectReport } from "../../src/growth/knowledge-feedback";
import type { Goal } from "../../src/growth/goal-types";
import type { GraphBridgeLike } from "../../src/growth/goal-types";

// ═══ 夹具 ═══

function makeGoal(overrides?: Partial<Goal>): Goal {
  return {
    goalId: `goal-${Date.now()}`,
    orgId: "org-test",
    title: "Test Goal",
    description: "Description",
    priority: "P1",
    status: "active",
    ownerDeptId: "sales",
    createdBy: { role: "ga" },
    createdAt: new Date().toISOString(),
    deadline: new Date(Date.now() + 86400000).toISOString(),
    lastModifiedAt: new Date().toISOString(),
    plannedDurationDays: 30,
    diagnosisId: "diag-001",
    metrics: [{ metricName: "m1", currentValue: 10, targetValue: 20, unit: "percent", computeContractId: "c1" }],
    successCriteria: [{ criterion: "test", verificationMethod: "metric_threshold", verified: false }],
    dependsOn: [],
    conflictsWith: [],
    reDiagnosisCount: 0,
    ...overrides,
  };
}

function makeStore(props: Record<string, unknown>): GraphBridgeLike {
  return {
    getNode: (_id: string, _graph: string) => ({ id: _id, type: "DIAGNOSIS", props }),
    createNode: (_t: string, _p: Record<string, unknown>, _g: string) => "id",
    updateNode: (_id: string, _p: Record<string, unknown>, _g: string) => {},
    queryNodes: (_t: string, _f?: Record<string, unknown>, _g?: string) => [],
  };
}

// ═══ 测试 ═══

describe("D254: verifyEffect", () => {
  it("baseline vs current delta > 10% → improved", async () => {
    const goal = makeGoal({ diagnosisId: "diag-improved" });
    const store = makeStore({
      matchedEdgeIds: ["edge-cashflow"],
      baselineValues: { "edge-cashflow": 1.0 },
      currentValues: { "edge-cashflow": 1.5 },
    });

    const result = await verifyEffect(goal, store);
    expect(result.status).toBe("improved");
    expect(result.before).toBe(1.0);
    expect(result.after).toBe(1.5);
    expect(result.deltaPct).toBeGreaterThan(0);
    expect(result.edgeId).toBe("edge-cashflow");
  });

  it("baseline vs current delta < -10% → worsened", async () => {
    const goal = makeGoal({ diagnosisId: "diag-worsened" });
    const store = makeStore({
      matchedEdgeIds: ["edge-cashflow"],
      baselineValues: { "edge-cashflow": 1.5 },
      currentValues: { "edge-cashflow": 1.0 },
    });

    const result = await verifyEffect(goal, store);
    expect(result.status).toBe("worsened");
    expect(result.before).toBe(1.5);
    expect(result.after).toBe(1.0);
    expect(result.deltaPct).toBeLessThan(0);
  });

  it("no diagnosisId → status=unknown", async () => {
    const goal = makeGoal({ diagnosisId: undefined });
    const store = makeStore({});

    const result = await verifyEffect(goal, store);
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("无关联诊断报告");
  });

  it("no matchedEdgeIds → status=unknown", async () => {
    const goal = makeGoal({ diagnosisId: "diag-no-edges" });
    const store = makeStore({
      baselineValues: {},
    });

    const result = await verifyEffect(goal, store);
    expect(result.status).toBe("unknown");
    expect(result.reason).toContain("无 edge 引用");
  });
});

describe("D254: writeEffectReport", () => {
  it("writes effect report without throwing", () => {
    const report: EffectReport = {
      status: "improved",
      before: 1.0,
      after: 1.5,
      deltaPct: 50,
      edgeId: "edge-test",
      verifiedAt: new Date().toISOString(),
    };

    // Should not throw (agent-memory-store may not be initialized in test)
    expect(() => writeEffectReport(report)).not.toThrow();
  });
});
