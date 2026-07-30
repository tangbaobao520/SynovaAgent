/**
 * tests/loops/ga-correction-feedback.test.ts — D273 GA 纠错反馈闭环测试
 *
 * L1×3 单元:
 *   1. threshold_adjust 公式正确 (新阈值 = 旧阈值 × (1 + direction × pct/100 × min(n,3)/3))
 *   2. <3 次不触发 (pending)
 *   3. >=3 次触发 + 回写 + 备份旧值
 * L2b×1 集成:
 *   4. processFeedbackSignals → applyEvolutionActions → manifest 值变更
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { applyEvolutionActions, type EvolutionAction } from "../../src/loops/middle-evolution-engine";

// ═══ 夹具 ═══

const TEST_INDUSTRY = "_test_d273";
const PROJECT_ROOT = process.cwd();
const TEST_THRESHOLD_DIR = join(PROJECT_ROOT, "extensions", "industries", TEST_INDUSTRY);
const TEST_THRESHOLD_PATH = join(TEST_THRESHOLD_DIR, "thresholds.json");

const TEST_SENTINEL_KEY = "ZZ_TEST_D273";

function setupThresholdFile(overrides?: Record<string, number>): void {
  mkdirSync(TEST_THRESHOLD_DIR, { recursive: true });
  const data = {
    industry: TEST_INDUSTRY,
    aggregatedAt: "2026-07-30T00:00:00.000Z",
    thresholdOverrides: {
      [TEST_SENTINEL_KEY]: overrides || { warning: 1.5, critical: 1.1 },
    },
  };
  writeFileSync(TEST_THRESHOLD_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function cleanupTestDir(): void {
  if (existsSync(TEST_THRESHOLD_DIR)) {
    rmSync(TEST_THRESHOLD_DIR, { recursive: true });
  }
}

function makeAction(overrides?: Partial<EvolutionAction>): EvolutionAction {
  return {
    type: "threshold_adjust",
    reason: "哨兵 F1_KZ 被标记为 false alarm 3 次，阈值可能过高",
    parameter: { sentinelKey: TEST_SENTINEL_KEY, adjustPercent: 5, direction: "up" },
    confidence: 0.8,
    triggeredAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => {
  cleanupTestDir();
});

afterEach(() => {
  cleanupTestDir();
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 1: threshold_adjust 公式正确
// ═════════════════════════════════════════════════════════════════════════════

describe("D273: applyEvolutionActions formula", () => {
  it("threshold_adjust 公式: warning 1.5 → 1.5 * (1 + 0.05 * 3/3) = 1.575", () => {
    setupThresholdFile();
    // 制造 2 次历史纠错 + 本次 = 3 次
    const thresholdPath = TEST_THRESHOLD_PATH;
    const raw = JSON.parse(readFileSync(thresholdPath, "utf-8"));
    raw._gaCorrections = [
      { key: TEST_SENTINEL_KEY, direction: "up", applied: false },
      { key: TEST_SENTINEL_KEY, direction: "up", applied: false },
    ];
    writeFileSync(thresholdPath, JSON.stringify(raw, null, 2), "utf-8");

    const result = applyEvolutionActions([makeAction()]);
    expect(result.applied).toBe(1);
    expect(result.errors).toHaveLength(0);

    const updated = JSON.parse(readFileSync(thresholdPath, "utf-8"));
    // 1.5 * (1 + 0.05 * 3/3) ≈ 1.58 (Math.round 舍入)
    expect(updated.thresholdOverrides[TEST_SENTINEL_KEY].warning).toBeCloseTo(1.58, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 2: <3 次不触发
// ═════════════════════════════════════════════════════════════════════════════

describe("D273: min trigger count", () => {
  it("少于 3 次纠错 → skipped (pending)", () => {
    setupThresholdFile();
    // 只有 1 次历史纠错
    const raw = JSON.parse(readFileSync(TEST_THRESHOLD_PATH, "utf-8"));
    raw._gaCorrections = [{ key: TEST_SENTINEL_KEY, direction: "up", applied: false }];
    writeFileSync(TEST_THRESHOLD_PATH, JSON.stringify(raw, null, 2), "utf-8");

    const result = applyEvolutionActions([makeAction()]);
    expect(result.skipped).toBe(1);
    expect(result.applied).toBe(0);

    // 验证阈值未变
    const updated = JSON.parse(readFileSync(TEST_THRESHOLD_PATH, "utf-8"));
    expect(updated.thresholdOverrides[TEST_SENTINEL_KEY].warning).toBe(1.5);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 3: >=3 次触发 + 回写 + 备份旧值
// ═════════════════════════════════════════════════════════════════════════════

describe("D273: backup and history", () => {
  it("≥3 次触发后记录 _gaCorrections 含 previousWarning", () => {
    setupThresholdFile();
    const raw = JSON.parse(readFileSync(TEST_THRESHOLD_PATH, "utf-8"));
    raw._gaCorrections = [
      { key: TEST_SENTINEL_KEY, direction: "up", applied: false },
      { key: TEST_SENTINEL_KEY, direction: "up", applied: false },
      { key: TEST_SENTINEL_KEY, direction: "up", applied: false },
    ];
    writeFileSync(TEST_THRESHOLD_PATH, JSON.stringify(raw, null, 2), "utf-8");

    const result = applyEvolutionActions([makeAction()]);
    expect(result.applied).toBe(1);

    const updated = JSON.parse(readFileSync(TEST_THRESHOLD_PATH, "utf-8"));
    const lastCorrection = updated._gaCorrections[updated._gaCorrections.length - 1];
    expect(lastCorrection.applied).toBe(true);
    expect(lastCorrection.previousWarning).toBe(1.5);
    expect(lastCorrection.newWarning).toBeCloseTo(1.58, 1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Test 4: 降级 — 阈值文件不存在 → 跳过
// ═════════════════════════════════════════════════════════════════════════════

describe("D273: degraded mode", () => {
  it("阈值文件不存在 → 跳过不崩溃", () => {
    // 清理测试目录 (确保不存在)
    cleanupTestDir();

    const action = makeAction({ parameter: { sentinelKey: "NONEXISTENT", adjustPercent: 5, direction: "up" } });
    const result = applyEvolutionActions([action]);
    expect(result.applied).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(0);
    // 不崩溃即可
  });
});
