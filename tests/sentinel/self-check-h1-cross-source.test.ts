/**
 * tests/sentinel/self-check-h1-cross-source.test.ts — D968 B2 判别性夹具
 *
 * ═══ 裁定背景（CTO 2026-09-25）═══
 *
 * D968 要去掉**路径3**（`runner.ts` 运行期重复加载：`clearSentinelCache()` + `loadSentinels()`），
 * 但规格 §三.3 的字面做法「改为复用已注册表」**会静默废掉 H1**：
 *   H1 判据 = `ratio = registryCount / expectedCount`（`src/sentinel/self-check.ts:92-110`）
 *   `registryCount`  = `getSentinelRegistry().count()`      —— **注册表源**
 *   `expectedCount`  = `loadSentinels().sentinels.length`   —— **磁盘 manifest 源**
 *   若把 `expectedCount` 也改成 `registry.count()`（**同源**）⇒ `ratio ≡ 1` ⇒ **自证恒真**、
 *   漂移检测被静默废掉（本批一路在抓的"假绿"）。
 * ⇒ CTO 裁定：**保留跨源语义**；runner 只读路径2 启动时发布的加载数快照（不再运行期重扫磁盘）。
 *
 * ═══ 本夹具的判别力 ═══
 *
 * 用**真实加载管线**构造"磁盘有 2 个 manifest、但只有 1 个注册成功"的漂移场景：
 *   - 夹具根 2 个目录：1 个健康 + 1 个 `entryPoint` 缺失（存在但注册失败的 manifest）
 *   - `loadSentinels()`        → 2（磁盘源，含失败件）
 *   - `registerLoadedSentinels()` → registered=1 + errors 非空（注册表源）
 *   ⇒ 跨源 `{registryCount: 1, expectedCount: 2}` ⇒ **H1 必须告警** ✅
 *   ⇒ 同源 `{registryCount: 1, expectedCount: 1}` ⇒ **H1 静默**（→ 这正是"假绿"形态，
 *      本文件把它固化为一条**反向断言**，证明"同源 = 检测力归零"）
 *
 * 契约（铁律 47）:
 *   @input  — 夹具哨兵根（os.tmpdir 下自建，1 健康 + 1 坏）+ `evaluateSentinelHealth`（真实判据函数）
 *   @output — 4 用例：跨源告警 / 同源静默（检测力归零的反证）/ 全挂 critical / ratio 边界
 *   @degraded — 不适用（测试自身失败即红，不降级）
 *   @error  — 夹具不可建 → 测试失败（fail-closed，不 skip 成绿）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  loadSentinels,
  clearSentinelCache,
  registerLoadedSentinels,
} from '../../src/sentinel/sentinel-loader';
import { destroySentinelRegistry } from '../../src/sentinel/registry';
import { evaluateSentinelHealth } from '../../src/sentinel/self-check';
import type { SentinelHealthState } from '../../src/sentinel/self-check';

const FIXTURE_ROOT = join(tmpdir(), 'd968-h1-cross-source');

/** 写一个哨兵目录；`breakEntryPoint=true` 时制造"manifest 存在但注册失败" */
function writeSentinelDir(name: string, breakEntryPoint: boolean): void {
  const dir = join(FIXTURE_ROOT, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      type: 'sentinel',
      displayName: name,
      description: 'D968 H1 跨源夹具',
      schedule: '0 9 * * *',
      expert: 'fundamental-efficiency',
      priority: 'P2',
      computes: [],
      thresholds: {},
      aggregation: 'worst_first',
      context: { requiredDataSources: [], dataAccess: { allowedDimensions: [], sensitiveAccess: 'read' } },
      entryPoint: './aggregate.ts',
      exportKey: 'fixtureSentinel',
    }),
    'utf-8',
  );
  if (!breakEntryPoint) {
    // 健康件：entryPoint 存在且导出含 check() 的对象
    writeFileSync(
      join(dir, 'aggregate.ts'),
      `export const fixtureSentinel = {\n  config: { id: 'sentinel-${name}' },\n  async check() { return []; },\n};\n`,
      'utf-8',
    );
  }
  // breakEntryPoint=true ⇒ 不写 aggregate.ts ⇒ registerLoadedSentinels 报 "entryPoint 不存在"
}

function baseState(overrides: Partial<SentinelHealthState> = {}): SentinelHealthState {
  return {
    registryCount: 0,
    expectedCount: 0,
    cronJobs: [],
    lastRunAt: null,
    maxScheduleMs: 60_000,
    uptimeMs: 1_000,
    ...overrides,
  };
}

function h1Findings(state: SentinelHealthState): string[] {
  return evaluateSentinelHealth(state)
    .findings.filter((f) => f.id.startsWith('self-check-H1-'))
    .map((f) => f.id);
}

beforeEach(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  delete process.env.SENTINELS_FIXTURE_DIR;
  clearSentinelCache();
  destroySentinelRegistry();
});

afterEach(() => {
  delete process.env.SENTINELS_FIXTURE_DIR;
  clearSentinelCache();
  destroySentinelRegistry();
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe('D968 B2 — H1 跨源判别性夹具（保留跨源语义，禁 ratio ≡ 1）', () => {
  it('夹具自证: 真实管线里 2 个 manifest 只有 1 个注册成功（磁盘源 ≠ 注册源）', async () => {
    writeSentinelDir('h1-good', false);
    writeSentinelDir('h1-broken', true);
    process.env.SENTINELS_FIXTURE_DIR = FIXTURE_ROOT;
    clearSentinelCache();

    const { sentinels, errors: loadErrors } = loadSentinels();
    expect(sentinels).toHaveLength(2); // 磁盘源：2（含坏件）
    expect(loadErrors).toEqual([]); // manifest 本身都可解析

    const { registered, errors } = await registerLoadedSentinels();
    expect(registered).toBe(1); // 注册源：1
    expect(errors.length).toBeGreaterThan(0); // 坏件被点名（不静默）
    expect(errors.join(' ')).toContain('h1-broken');
  });

  it('✅ 跨源: {registryCount:1, expectedCount:2} ⇒ H1 **必须告警**（漂移检出）', () => {
    // 这是 runner「只读磁盘 manifest 快照」语义下的真实取值组合
    const ids = h1Findings(baseState({ registryCount: 1, expectedCount: 2 }));
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.some((id) => id.startsWith('self-check-H1-'))).toBe(true);
  });

  it('🔴 反证（同源 = 检测力归零）: {registryCount:1, expectedCount:1} ⇒ H1 **静默**', () => {
    // 若把 expectedCount 也取 registry.count()（同源），真实漂移场景会退化成这个组合
    // ⇒ 下述"静默"就是"假绿"：磁盘明明少注册了 1 个，H1 却一句话都不说。
    // 本条把该退化形态固化为断言 —— 它是"禁 ratio ≡ 1"裁定的可证伪依据。
    const ids = h1Findings(baseState({ registryCount: 1, expectedCount: 1 }));
    expect(ids).toEqual([]); // ← 检测力归零（同源必然恒等）
  });

  it('边界: 全未注册 {0, 2} ⇒ H1 critical（loader 全挂，fail-loud）', () => {
    const result = evaluateSentinelHealth(baseState({ registryCount: 0, expectedCount: 2 }));
    const h1 = result.findings.filter((f) => f.id.startsWith('self-check-H1-'));
    expect(h1.length).toBeGreaterThan(0);
    expect(h1[0].severity).toBe('critical');
  });
});
