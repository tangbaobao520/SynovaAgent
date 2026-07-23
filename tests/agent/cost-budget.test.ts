/**
 * tests/agent/cost-budget.test.ts — D8g 推理成本预算测试 (L1 单元契约 + L2a 接线)
 *
 * 权威文档 #6 测试体系规范:
 *   L1: checkBudget 预算内/warnAt/blockAt + trackExecution 累计 + degraded
 *   L2a: MainAgent 接线验证
 */
import { describe, it, expect } from "vitest";
import { BudgetTracker, NOOP_BUDGET_TRACKER } from "../../src/agent/cost-budget";
import { readFileSync } from "fs";

// ═══ 夹具 ═══

/** 小预算配置，方便在测试中触发 warnAt 和 blockAt */
const SMALL_BUDGET = {
  maxTokensFast: 50_000,
  maxTokensMedium: 200_000,
  maxTokensSlow: 500_000,
  cumulativeBudget: 100_000, // 小累计预算
  warnAt: 0.5, // 50% 告警
  blockAt: 0.8, // 80% 拦截
};

describe("D8g: BudgetTracker — checkBudget", () => {
  // ════════════════════════════════════════════════════════════════════
  // L1: 预算内执行
  // ════════════════════════════════════════════════════════════════════

  it("L1: 预算内 → allowed=true, blocked=false, warnLevel=false", () => {
    const tracker = new BudgetTracker(SMALL_BUDGET);
    const status = tracker.checkBudget("loop-1", "fast");

    expect(status.allowed).toBe(true);
    expect(status.blocked).toBe(false);
    expect(status.warnLevel).toBe(false);
    expect(status.estimatedTokens).toBeGreaterThan(0);
    expect(status.remainingBudget).toBeGreaterThan(0);
  });

  // ════════════════════════════════════════════════════════════════════
  // L1: warnAt 触发告警
  // ════════════════════════════════════════════════════════════════════

  it("L1: 累计成本达 warnAt → allowed=true, warnLevel=true", () => {
    const tracker = new BudgetTracker({ ...SMALL_BUDGET, blockAt: 1.0 });
    // warnAt = 50% of 100K = 50K
    // 先消耗 40K → 累计 40K
    tracker.trackExecution("loop-1", "fast", 40_000, 40_000);
    expect(tracker.getCumulativeCost()).toBe(40_000);

    // 再请求 fast (50K) → projected = 40K + 50K = 90K > 50K (warnAt), < 100K (blockAt)
    const status = tracker.checkBudget("loop-2", "fast");

    expect(status.allowed).toBe(true);
    expect(status.warnLevel).toBe(true);
    expect(status.blocked).toBe(false);
    expect(status.cumulativeCost).toBe(40_000);
  });

  // ════════════════════════════════════════════════════════════════════
  // L1: blockAt 拦截执行
  // ════════════════════════════════════════════════════════════════════

  it("L1: 累计成本达 blockAt → blocked=true, allowed=false", () => {
    const tracker = new BudgetTracker(SMALL_BUDGET);
    // blockAt = 80% of 100K = 80K
    // 消耗 60K → 剩余约 40K
    tracker.trackExecution("loop-1", "medium", 60_000, 60_000);
    expect(tracker.getCumulativeCost()).toBe(60_000);

    // 再请求 fast (50K) → 累计 = 60K + 50K = 110K > 80K (blockAt)
    const status = tracker.checkBudget("loop-2", "fast");

    expect(status.allowed).toBe(false);
    expect(status.blocked).toBe(true);
    expect(status.warnLevel).toBe(false); // blocked 优先级高于 warn
  });

  // ════════════════════════════════════════════════════════════════════
  // L1: 不同 scale 使用不同 maxTokens
  // ════════════════════════════════════════════════════════════════════

  it("L1: 各 scale 使用对应的 maxTokens", () => {
    const tracker = new BudgetTracker();

    const fast = tracker.checkBudget("loop-1", "fast");
    expect(fast.estimatedTokens).toBe(50_000);

    const medium = tracker.checkBudget("loop-2", "medium");
    expect(medium.estimatedTokens).toBe(200_000);

    const slow = tracker.checkBudget("loop-3", "slow");
    expect(slow.estimatedTokens).toBe(500_000);
  });
});

describe("D8g: BudgetTracker — trackExecution + history", () => {
  // ════════════════════════════════════════════════════════════════════
  // L1: 累计成本累加
  // ════════════════════════════════════════════════════════════════════

  it("L1: trackExecution 累加累计成本 + 追加历史", () => {
    const tracker = new BudgetTracker();

    expect(tracker.getCumulativeCost()).toBe(0);
    expect(tracker.getHistory()).toHaveLength(0);

    tracker.trackExecution("loop-1", "fast", 10_000, 10_000);
    expect(tracker.getCumulativeCost()).toBe(10_000);
    expect(tracker.getHistory()).toHaveLength(1);

    tracker.trackExecution("loop-2", "medium", 20_000, 20_000);
    expect(tracker.getCumulativeCost()).toBe(30_000);
    expect(tracker.getHistory()).toHaveLength(2);
  });

  // ════════════════════════════════════════════════════════════════════
  // L1: getHistory limit
  // ════════════════════════════════════════════════════════════════════

  it("L1: getHistory(limit) 返回最近 N 条", () => {
    const tracker = new BudgetTracker();
    tracker.trackExecution("loop-1", "fast", 10_000, 10_000);
    tracker.trackExecution("loop-2", "medium", 20_000, 20_000);
    tracker.trackExecution("loop-3", "slow", 30_000, 30_000);

    const all = tracker.getHistory();
    expect(all).toHaveLength(3);

    const last2 = tracker.getHistory(2);
    expect(last2).toHaveLength(2);
    expect(last2[0].loopId).toBe("loop-2");
    expect(last2[1].loopId).toBe("loop-3");
  });

  // ════════════════════════════════════════════════════════════════════
  // L1: reset
  // ════════════════════════════════════════════════════════════════════

  it("L1: reset 清空累计成本和历史", () => {
    const tracker = new BudgetTracker();
    tracker.trackExecution("loop-1", "fast", 10_000, 10_000);
    expect(tracker.getCumulativeCost()).toBe(10_000);

    tracker.reset();
    expect(tracker.getCumulativeCost()).toBe(0);
    expect(tracker.getHistory()).toHaveLength(0);
  });
});

describe("D8g: BudgetTracker — 降级", () => {
  // ════════════════════════════════════════════════════════════════════
  // L1: 降级模式 — NOOP_BUDGET_TRACKER 总是允许执行
  // ════════════════════════════════════════════════════════════════════

  it("L1: NOOP_BUDGET_TRACKER 总是 allowed, 不记录成本", () => {
    expect(NOOP_BUDGET_TRACKER.isDegraded()).toBe(true);

    const status = NOOP_BUDGET_TRACKER.checkBudget("loop-1", "fast");
    expect(status.allowed).toBe(true);
    expect(status.blocked).toBe(false);
    expect(status.warnLevel).toBe(false);

    // trackExecution 不产生副作用
    NOOP_BUDGET_TRACKER.trackExecution("loop-1", "fast", 100_000, 100_000);
    expect(NOOP_BUDGET_TRACKER.getCumulativeCost()).toBe(0);
    expect(NOOP_BUDGET_TRACKER.getHistory()).toHaveLength(0);

    // reset 无影响
    NOOP_BUDGET_TRACKER.reset();
    expect(NOOP_BUDGET_TRACKER.isDegraded()).toBe(true);
  });
});

describe("D8g: L2a 接线验证", () => {
  // ════════════════════════════════════════════════════════════════════
  // L2a: MainAgent 包含 BudgetTracker
  // ════════════════════════════════════════════════════════════════════

  it("L2a: main-agent.ts import BudgetTracker", () => {
    const content = readFileSync("src/agent/main-agent.ts", "utf-8");
    expect(content).toContain("BudgetTracker");
    expect(content).toContain("./cost-budget");
  });

  // ════════════════════════════════════════════════════════════════════
  // L2a: MainAgent.executeLoop 包含 checkBudget 和 trackExecution 调用
  // ════════════════════════════════════════════════════════════════════

  it("L2a: main-agent.ts 调用 checkBudget + trackExecution", () => {
    const content = readFileSync("src/agent/main-agent.ts", "utf-8");
    expect(content).toContain("checkBudget");
    expect(content).toContain("trackExecution");
  });
});
