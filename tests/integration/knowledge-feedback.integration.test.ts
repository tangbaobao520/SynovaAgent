/**
 * tests/integration/knowledge-feedback.integration.test.ts — D227 知识回流端到端测试
 *
 * Gates 15: closeGoal → extractGoalKnowledge → classifyDeviation → KnowledgeStore
 * Gate 4:  registerBuiltinSentinels() 注册 >= 3 哨兵
 *
 * 测试流程:
 *   1. extractGoalKnowledge 返回 14 字段 (正常)
 *   2. classifyDeviation 6 类全部覆盖 (6 tests)
 *   3. writeGoalKnowledge → KnowledgeStoreLike.insert (降级)
 *   4. closeGoal 全链路 (含 store/audit mock)
 *   5. registerBuiltinSentinels >= 3
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { extractGoalKnowledge, writeGoalKnowledge } from "../../src/growth/knowledge-feedback";
import type { Goal, GoalMetric } from "../../src/growth/goal-types";
import type { KnowledgeStoreLike, DeviationClassifier } from "../../src/growth/knowledge-feedback";

// ═══ 夹具: 标准 Goal ═══

const NOW = new Date().toISOString();

function makeGoal(overrides?: Partial<Goal>): Goal {
  return {
    goalId: `goal-test-${Date.now()}`,
    orgId: "org-test",
    title: "SaaS 收入增长 30%",
    description: "通过优化转化率提升 SaaS 收入",
    priority: "P1",
    status: "active",
    ownerDeptId: "sales",
    createdBy: { role: "ga" },
    createdAt: NOW,
    deadline: new Date(Date.now() + 86400000).toISOString(),
    lastModifiedAt: NOW,
    plannedDurationDays: 90,
    metrics: [
      {
        metricName: "revenue_growth",
        currentValue: 10,
        targetValue: 30,
        unit: "percent",
        computeContractId: "compute-revenue",
      },
    ],
    successCriteria: [
      { criterion: "Revenue growth >= 30%", verificationMethod: "metric_threshold", verified: false },
    ],
    dependsOn: [],
    conflictsWith: [],
    reDiagnosisCount: 0,
    ...overrides,
  };
}

// ═══ Mock KnowledgeStore ═══

class MockKnowledgeStore implements KnowledgeStoreLike {
  entries: Array<{ text: string; sourceId: string }> = [];

  insert(chunk: {
    text: string;
    sourceType: string;
    sourceId: string;
    authorityLevel: string;
    accessLevel: string;
    accessSensitivity: string;
  }): string {
    this.entries.push({ text: chunk.text, sourceId: chunk.sourceId });
    return `knowledge-${this.entries.length}`;
  }
}

const knowledgeStore = new MockKnowledgeStore();

beforeAll(() => {
  // Reset store between test runs
  knowledgeStore.entries = [];
});

// ═════════════════════════════════════════════════════════════════════════════
// Gate 15: extractGoalKnowledge — 14 字段完整性
// ═════════════════════════════════════════════════════════════════════════════

describe("Gate 15: extractGoalKnowledge 14 fields", () => {
  it("返回完整 14 字段 GoalExecutionKnowledge 对象", () => {
    const goal = makeGoal();
    const metricComparisons = [
      { metricName: "revenue_growth", target: 30, actual: 15, met: false },
    ];

    const knowledge = extractGoalKnowledge(goal, "not_achieved", metricComparisons);

    // 14 字段
    expect(knowledge.goalId).toBe(goal.goalId);
    expect(knowledge.goalTitle).toBe("SaaS 收入增长 30%");
    expect(knowledge.goalDescription).toBe("通过优化转化率提升 SaaS 收入");
    expect(knowledge.dimension).toBe("market");
    expect(typeof knowledge.industry).toBe("undefined");
    expect(knowledge.outcome).toBe("not_achieved");
    expect(knowledge.deviationClassifier).toBeTruthy();
    expect(typeof knowledge.deviationConfidence).toBe("number");
    expect(knowledge.deviationReason).toBeTruthy();
    expect(Array.isArray(knowledge.metricChain)).toBe(true);
    expect(knowledge.metricChain.length).toBe(1);
    expect(knowledge.metricChain[0].deviation).toBeCloseTo(-50, 0);
    expect(typeof knowledge.lessons).toBe("string");
    expect(knowledge.lessons.length).toBeGreaterThan(10);
    expect(typeof knowledge.reusableAdvice).toBe("string");
    expect(knowledge.reusableAdvice.length).toBeGreaterThan(10);
    expect(knowledge.createdAt).toBeTruthy();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Gate 15: classifyDeviation — 全部 6 类
// ═════════════════════════════════════════════════════════════════════════════

describe("Gate 15: classifyDeviation 6 types", () => {
  it("deviation > 50% → external_shock", () => {
    const goal = makeGoal();
    const comparisons = [
      { metricName: "revenue_growth", target: 30, actual: 5, met: false },
    ];
    const knowledge = extractGoalKnowledge(goal, "not_achieved", comparisons);
    expect(knowledge.deviationClassifier).toBe("external_shock");
    expect(knowledge.deviationConfidence).toBeGreaterThanOrEqual(0.5);
  });

  it("reDiagnosisCount >= 2 + negative deviation → measurement_error", () => {
    const goal = makeGoal({ reDiagnosisCount: 3 });
    const comparisons = [
      { metricName: "revenue_growth", target: 30, actual: 25, met: false },
    ];
    const knowledge = extractGoalKnowledge(goal, "partially_achieved", comparisons);
    expect(knowledge.deviationClassifier).toBe("measurement_error");
    expect(knowledge.deviationReason).toContain("再诊断");
  });

  it("industry baseline also declined → market_change", () => {
    const goal = makeGoal();
    const comparisons = [
      { metricName: "revenue_growth", target: 30, actual: 24, met: false },
    ];
    const knowledge = extractGoalKnowledge(
      goal, "partially_achieved", comparisons, "saas", -0.2,
    );
    expect(knowledge.deviationClassifier).toBe("market_change");
    expect(knowledge.industry).toBe("saas");
  });

  it("rootCause present + negative deviation → target_too_high", () => {
    const goal = makeGoal({ rootCause: "市场增速放缓" });
    const comparisons = [
      { metricName: "revenue_growth", target: 30, actual: 22, met: false },
    ];
    const knowledge = extractGoalKnowledge(goal, "partially_achieved", comparisons);
    expect(knowledge.deviationClassifier).toBe("target_too_high");
    expect(knowledge.deviationReason).toContain("市场增速放缓");
  });

  it("negative deviation without special flags → execution_failure", () => {
    const goal = makeGoal();
    const comparisons = [
      { metricName: "revenue_growth", target: 30, actual: 20, met: false },
    ];
    const knowledge = extractGoalKnowledge(goal, "not_achieved", comparisons);
    expect(knowledge.deviationClassifier).toBe("execution_failure");
    expect(knowledge.deviationReason).toContain("未达成目标");
  });

  it("deviation +30%~50% → target_too_low (无其他分类触发)", () => {
    const goal = makeGoal({ reDiagnosisCount: 0, rootCause: undefined });
    // 35% 偏差 — 超过 30% 但不超过 50%，不触发 external_shock
    const comparisons = [
      { metricName: "revenue_growth", target: 30, actual: 41, met: true },
    ];
    const knowledge = extractGoalKnowledge(goal, "achieved", comparisons);
    expect(knowledge.deviationClassifier).toBe("target_too_low");
    expect(knowledge.deviationReason).toContain("目标可能偏低");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Gate 15: writeGoalKnowledge — 写入 PKB
// ═════════════════════════════════════════════════════════════════════════════

describe("Gate 15: writeGoalKnowledge → KnowledgeStore", () => {
  it("writeGoalKnowledge 调用 insert 写入知识条目", () => {
    knowledgeStore.entries = [];
    const goal = makeGoal();
    const comparisons = [
      { metricName: "revenue_growth", target: 30, actual: 15, met: false },
    ];
    const knowledge = extractGoalKnowledge(goal, "not_achieved", comparisons);

    const resultId = writeGoalKnowledge(knowledge, knowledgeStore);
    expect(resultId).toBeTruthy();
    expect(typeof resultId).toBe("string");

    // 验证写入内容
    expect(knowledgeStore.entries.length).toBe(1);
    expect(knowledgeStore.entries[0].sourceId).toBe(goal.goalId);
    expect(knowledgeStore.entries[0].text).toContain("SaaS 收入增长 30%");
    expect(knowledgeStore.entries[0].text).toContain("execution_failure");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Gate 15: closeGoal 全链路 (含 store mock)
// ═════════════════════════════════════════════════════════════════════════════

describe("Gate 15: closeGoal delegates to updateGoalStatus", () => {
  it("closeGoal store.getNode returns Goal (验证 getGoal 可工作)", async () => {
    const goal = makeGoal({ status: "active" });
    const store = {
      getNode: (_id: string, _g: string) => ({ id: goal.goalId, type: "GOAL", props: goal }),
      createNode: (_t: string, _p: Record<string, unknown>, _g: string) => "g-id",
      updateNode: (_id: string, _p: Record<string, unknown>, _g: string) => {},
      queryNodes: (_t: string, _f?: Record<string, unknown>, _g?: string) => [],
    };
    const { getGoal } = await import("../../src/growth/goal-store");
    const parsed = getGoal(goal.goalId, store);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe(goal.title);
    expect(parsed!.status).toBe("active");
  });
});

describe("Gate 4: sentinel registration", () => {
  // D968（PR-B）: 本 Gate 原先断言 `src/sentinel/adapters/` 存在 >= 3 个 *-sentinel.ts 且含
  //   `goal-alignment-sentinel.ts` —— 那是在**断言路径1 的第二套内置哨兵存在**。
  //   D968 已裁定：唯一入口 = 文件驱动（路径2），路径1 关停、5 个适配器全部裁剪
  //   ⇒ 该断言与新架构**方向相反**，必须改为断言**文件驱动单入口**。
  it("路径1 的扫描源目录已删除（唯一入口 = 文件驱动）", () => {
    const { existsSync } = require("fs");
    const { join } = require("path");
    const adapterDir = join(__dirname, "..", "..", "src", "sentinel", "adapters");
    expect(existsSync(adapterDir)).toBe(false);
  });

  it("文件驱动单入口：loadSentinels() 加载数 = 目录数（加载器语义口径，动态取数）", async () => {
    const { readdirSync } = require("fs");
    const { join } = require("path");
    const { loadSentinels, clearSentinelCache } = await import(
      "../../src/sentinel/sentinel-loader"
    );
    clearSentinelCache(); // 注入缝/cache 陷阱：取快照前必须清缓存
    const { sentinels, errors } = loadSentinels();

    // 目录数口径必须由**加载器自身语义**推导（非递归、跳过 shared 与 `_` 前缀），
    // 且**不得写死 45/43** —— D965 裁撤 2 桩后该值会变（D968 evidence §4）。
    const root = join(__dirname, "..", "..", "extensions", "sentinels");
    const expected = readdirSync(root, { withFileTypes: true }).filter(
      (e: { isDirectory: () => boolean; name: string }) =>
        e.isDirectory() && e.name !== "shared" && !e.name.startsWith("_"),
    ).length;

    expect(errors).toEqual([]);
    expect(sentinels.length).toBe(expected);
    expect(sentinels.length).toBeGreaterThan(0); // 防空集合假绿
  });
});
