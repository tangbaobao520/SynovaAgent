/**
 * tests/loops/ga-calibration-evolution.test.ts — D556 回流层 2: diagnosis_conclusion → 进化动作
 *
 * 契约来源: SYNOVA-IMPL-DSH-D556-ga-collab-e2e-20260829.md §6 动作映射表 + §8 引擎层断言:
 *   1. 3 条回流（reject/modify/ineffective 各一组 AggregatedSignal）→ 生成 3 条
 *      'diagnosis_calibration_review' 动作（decision/targetIds/sampleCount/hint 逐项断言）
 *   2. 阈值断言: count=2 → 零动作（MIN_TRIGGER_COUNT=3 同源——对齐既有「少于 3 次 → skipped」语义）
 *   3. targetType 纪律: diagnosis_logic 不触发（白名单只认 diagnosis_conclusion）
 *   4. applyEvolutionActions → agent_memory 审核条目真实写入（tmp SQLite + 清理）+ applied 计数
 *   5. 诚实降级: store 未初始化 / 参数缺失 → skipped++（不抛、不静默——铁律 24/31）
 *
 * 惯例对齐 tests/loops/ga-correction-feedback.test.ts（真实 fs/DB + tmp 清理）。
 * 既有语义记录（DS6 只增不改）: 既有 Signal 4（expert_confidence_downgrade）的 filter 无
 * targetType 限定 → ineffective × diagnosis_conclusion 组同时命中 Signal 4 与新 Signal 6，
 * 重叠为既有白名单行为，本文件显式断言该事实（非回归、非旁路）。
 * 诚实边界: 审核条目 = 待办队列，不自动改诊断逻辑权重（层 3 descope——K3 首查项）。
 */
import { describe, it, expect, afterEach } from "vitest";
import { rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import Database from "better-sqlite3";
import {
  processFeedbackSignals,
  applyEvolutionActions,
  type EvolutionAction,
} from "../../src/loops/middle-evolution-engine";
import { getAgentMemoryStore } from "../../src/l4/agent-memory-store";
import type { AggregatedSignal } from "../../src/growth/feedback-collector";

// ═══ 夹具 ═══

const DB_PATH = join(tmpdir(), `d556-agent-mem-${process.pid}-${Math.random().toString(36).slice(2)}.db`);

function makeSignal(
  decision: AggregatedSignal["decision"],
  targetType: AggregatedSignal["targetType"],
  count: number,
  targetIds: string[],
): AggregatedSignal {
  return {
    key: `${decision}:${targetType}:ga`,
    decision,
    targetType,
    count,
    latestTimestamp: "2026-08-29T00:00:00.000Z",
    targetIds,
  };
}

/** spec §6.1: 三决策 × diagnosis_conclusion 各一组（targetIds 两两不相交——避免矛盾仲裁干扰） */
function makeThreeRefluxSignals(): AggregatedSignal[] {
  return [
    makeSignal("reject", "diagnosis_conclusion", 3, ["c-1", "c-2"]),
    makeSignal("modify", "diagnosis_conclusion", 3, ["c-3"]),
    makeSignal("ineffective", "diagnosis_conclusion", 3, ["c-4", "c-5"]),
  ];
}

function makeReviewAction(decision: string, targetIds: string[], sampleCount = 3): EvolutionAction {
  return {
    type: "diagnosis_calibration_review",
    reason: `诊断结论 reject:diagnosis_conclusion:ga 被 GA 以 ${decision} 标记 ${sampleCount} 次`,
    parameter: {
      decision,
      targetIds,
      sampleCount,
      hint: decision === "reject"
        ? "结论块反复被标记错误 → 进人工审核队列"
        : decision === "modify"
          ? "GA 重写版本与 Agent 版本并列 → 审核队列"
          : "信号相关性降级建议 → 审核队列",
    },
    confidence: Math.min(sampleCount / 10, 0.9),
    triggeredAt: "2026-08-29T00:00:00.000Z",
  };
}

afterEach(() => {
  if (existsSync(DB_PATH)) rmSync(DB_PATH);
});

// ═════════════════════════════════════════════════════════════════════════════
// 降级路径（先于 store 初始化的 describe — 本文件首个执行，单例尚未初始化）
// ═════════════════════════════════════════════════════════════════════════════

describe("D556 层 2 降级: store 未初始化 / 参数缺失", () => {
  it("agent_memory 未初始化 → log.warn + skipped++（不抛、不崩溃——真实失败路径）", () => {
    const result = applyEvolutionActions([makeReviewAction("reject", ["c-1"])]);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("动作缺 decision/targetIds 参数 → skipped（参数校验降级）", () => {
    const badAction: EvolutionAction = {
      type: "diagnosis_calibration_review",
      reason: "缺参数动作",
      parameter: { sampleCount: 3 },
      confidence: 0.3,
      triggeredAt: "2026-08-29T00:00:00.000Z",
    };
    const result = applyEvolutionActions([badAction]);
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Signal 6: 3 条回流 → 3 条 diagnosis_calibration_review 动作
// ═════════════════════════════════════════════════════════════════════════════

describe("D556 层 2: processFeedbackSignals 动作生成（spec §6.1 映射表）", () => {
  it("3 条回流（reject/modify/ineffective）→ 恰 3 条新动作 + 每动作 decision/targetIds/sampleCount/hint 正确", () => {
    const actions = processFeedbackSignals(makeThreeRefluxSignals());
    const reviewActions = actions.filter((a) => a.type === "diagnosis_calibration_review");

    expect(reviewActions).toHaveLength(3);
    const byDecision = new Map(reviewActions.map((a) => [a.parameter.decision, a]));
    expect(byDecision.size).toBe(3);

    const reject = byDecision.get("reject");
    expect(reject).toBeDefined();
    expect(reject?.parameter.targetIds).toEqual(["c-1", "c-2"]);
    expect(reject?.parameter.sampleCount).toBe(3);
    expect(reject?.parameter.hint).toBe("结论块反复被标记错误 → 进人工审核队列");

    const modify = byDecision.get("modify");
    expect(modify).toBeDefined();
    expect(modify?.parameter.hint).toBe("GA 重写版本与 Agent 版本并列 → 审核队列");

    const ineffective = byDecision.get("ineffective");
    expect(ineffective).toBeDefined();
    expect(ineffective?.parameter.hint).toBe("信号相关性降级建议 → 审核队列");

    // confidence = min(count/10, 0.9)（spec §6.1）
    for (const action of reviewActions) {
      expect(action.confidence).toBeCloseTo(0.3, 5);
    }
  });

  it("既有 Signal 4 重叠记录（DS6 只增不改）: ineffective 组同时生成 expert_confidence_downgrade → 全动作 4 条", () => {
    const actions = processFeedbackSignals(makeThreeRefluxSignals());
    // 既有 Signal 4 filter（decision==='ineffective' && count>=3）无 targetType 限定——语义保持
    expect(actions).toHaveLength(4);
    expect(actions.some((a) => a.type === "expert_confidence_downgrade")).toBe(true);
    expect(actions.filter((a) => a.type === "diagnosis_calibration_review")).toHaveLength(3);
  });

  it("阈值: count=2 → 零动作（MIN_TRIGGER_COUNT=3 同源，对齐既有「少于 3 次 → skipped」）", () => {
    const actions = processFeedbackSignals([
      makeSignal("reject", "diagnosis_conclusion", 2, ["c-1"]),
    ]);
    expect(actions).toHaveLength(0);
  });

  it("targetType 纪律: diagnosis_logic × reject ≥3 → 不触发新动作（白名单只认 diagnosis_conclusion）", () => {
    const actions = processFeedbackSignals([
      makeSignal("reject", "diagnosis_logic", 5, ["l-1"]),
    ]);
    expect(actions.filter((a) => a.type === "diagnosis_calibration_review")).toHaveLength(0);
  });

  it("既有白名单不动（DS6）: reject×sentinel_alert 仍走 threshold_adjust（同 count≥3）", () => {
    const actions = processFeedbackSignals([
      makeSignal("reject", "sentinel_alert", 3, ["s-1"]),
    ]);
    expect(actions.some((a) => a.type === "threshold_adjust")).toBe(true);
    expect(actions.filter((a) => a.type === "diagnosis_calibration_review")).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// applyEvolutionActions → agent_memory 审核条目真实写入（tmp SQLite + 清理）
// ═════════════════════════════════════════════════════════════════════════════

describe("D556 层 2: applyEvolutionActions sink 写入（agent_memory 真实落盘）", () => {
  it("3 条审核动作 → applied=3 + agent_memory 3 条审核条目（key/tags/type/value 逐项断言）", () => {
    getAgentMemoryStore(new Database(DB_PATH)); // 真实 SQLite（tmp 文件，afterEach 清理）
    const result = applyEvolutionActions([
      makeReviewAction("reject", ["c-1", "c-2"]),
      makeReviewAction("modify", ["c-3"]),
      makeReviewAction("ineffective", ["c-4", "c-5"]),
    ]);
    expect(result.applied).toBe(3);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);

    const store = getAgentMemoryStore();
    const entries = store.list({ orgId: "synova", tags: ["ga_calibration_review"], limit: 50, offset: 0 });
    expect(entries).toHaveLength(3);

    const values = entries.map((e) => JSON.parse(e.value) as Record<string, unknown>);
    const decisions = values.map((v) => v.decision).sort();
    expect(decisions).toEqual(["ineffective", "modify", "reject"]);
    for (const entry of entries) {
      // spec §6.1 key 契约（type 值落 MemoryType 枚举 'ga_correction'——判别值冗余于 key/tags/value）
      expect(entry.key.startsWith("ga_calibration_review:")).toBe(true);
      expect(entry.type).toBe("ga_correction");
      expect(entry.tags).toContain("ga_calibration_review");
      expect(entry.source).toBe("ga_calibration_review");
    }
    const rejectEntry = entries.find((e) => (JSON.parse(e.value) as Record<string, unknown>).decision === "reject");
    expect(rejectEntry).toBeDefined();
    if (rejectEntry) {
      const value = JSON.parse(rejectEntry.value) as Record<string, unknown>;
      expect(value.actionType).toBe("diagnosis_calibration_review");
      expect(value.targetIds).toEqual(["c-1", "c-2"]);
      expect(value.sampleCount).toBe(3);
      expect(value.hint).toBe("结论块反复被标记错误 → 进人工审核队列");
      expect(rejectEntry.tags).toContain("reject");
    }
  });

  it("全链回流→动作→回写: processFeedbackSignals(3 回流) → applyEvolutionActions(全动作) — applied=4（3 审核 + 1 既有 Signal 4 fallback）", () => {
    getAgentMemoryStore(new Database(DB_PATH));
    const actions = processFeedbackSignals(makeThreeRefluxSignals());
    expect(actions).toHaveLength(4); // 3 新 + 1 既有（DS6 记录）
    const result = applyEvolutionActions(actions);
    expect(result.applied).toBe(4);
    expect(result.skipped).toBe(0);
  });
});
