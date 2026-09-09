/**
 * tests/zero-side-effect.test.ts — D657 测试零副作用：三路径测试（铁律 48）
 *
 * 覆盖矩阵:
 *   正常 — reconcile 对白名单 untracked 新增 → remove 计划; tracked modified → restore 计划
 *   边界 — 非白名单新增 → unknown（不自动删, 只告警）; 状态迁移组合 → unknown 保守;
 *          无差异 → 空计划; porcelain 行解析（引号包裹/短行）
 *   降级 — globalSetup 在 git 不可用环境 → 返回 no-op teardown 且显式 warn
 *
 * 本测试自身零副作用: 只测纯函数与 mock, 不触碰工作树。
 */
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { reconcile, parsePorcelainLine, setupZeroSideEffect } from './global-setup';

describe('parsePorcelainLine', () => {
  it('正常: 解析 porcelain 状态行（untracked/modified）', () => {
    expect(parsePorcelainLine('?? extensions/industries/new-dir/')).toEqual({
      status: '??',
      path: 'extensions/industries/new-dir/',
    });
    expect(parsePorcelainLine(' M extensions/industries/saas-tech/thresholds.json')).toEqual({
      status: ' M',
      path: 'extensions/industries/saas-tech/thresholds.json',
    });
  });

  it('边界: 短行/空行返回 null（不抛错）', () => {
    expect(parsePorcelainLine('')).toBeNull();
    expect(parsePorcelainLine('ab')).toBeNull();
    expect(parsePorcelainLine('?? x')).toEqual({ status: '??', path: 'x' }); // 长度恰好 4
  });
});

describe('reconcile — D657 恢复计划', () => {
  it('正常: 白名单内 untracked 新增 → remove 计划（本批 test-write 污染形态）', () => {
    const plan = reconcile([], ['?? extensions/industries/test-write/thresholds.json']);
    expect(plan.remove).toEqual(['extensions/industries/test-write/thresholds.json']);
    expect(plan.restore).toEqual([]);
    expect(plan.unknown).toEqual([]);
  });

  it('正常: 白名单内 tracked modified → restore 计划（aggregatedAt 改写实锤形态）', () => {
    const plan = reconcile([], [' M extensions/industries/saas-tech/thresholds.json']);
    expect(plan.restore).toEqual(['extensions/industries/saas-tech/thresholds.json']);
    expect(plan.remove).toEqual([]);
  });

  it('边界: 白名单外新增 → unknown（不自动删除, 防误删用户数据）', () => {
    const plan = reconcile([], ['?? data/user-real-db.sqlite', '?? docs/notes-tmp.md']);
    expect(plan.unknown).toEqual(['data/user-real-db.sqlite', 'docs/notes-tmp.md']);
    expect(plan.remove).toEqual([]);
    expect(plan.restore).toEqual([]);
  });

  it('边界: 测试前已存在的状态不误报（prev === status 跳过）', () => {
    const plan = reconcile([' M docs/pre-existing.md'], [' M docs/pre-existing.md']);
    expect(plan.restore).toEqual([]);
    expect(plan.unknown).toEqual([]);
  });

  it('边界: 状态迁移组合（未见过的新状态对）→ 保守归 unknown', () => {
    const plan = reconcile(['?? extensions/industries/x/'], ['A  extensions/industries/x/']);
    expect(plan.unknown).toEqual(['extensions/industries/x/']);
  });

  it('边界: 无差异 → 空计划', () => {
    const plan = reconcile([], []);
    expect(plan).toEqual({ restore: [], remove: [], unknown: [] });
  });

  it('正常: .codex 白名单（heartbeat 形态）', () => {
    const plan = reconcile([], ['?? .codex/heartbeat.json']);
    expect(plan.remove).toEqual(['.codex/heartbeat.json']);
  });
});

describe('globalSetup — 降级路径', () => {
  it('降级: git status 失败 → 返回 no-op teardown 且显式 warn（不静默, 铁律 11）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const originalCwd = process.cwd();
    // 切到无 git 的临时目录使 execFileSync('git', ...) 失败（-C 不可用, 沙箱内无污染）
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'd657-nogit-'));
    process.chdir(tmp);
    try {
      const teardown = setupZeroSideEffect();
      expect(typeof teardown).toBe('function');
      await teardown(); // no-op 不抛
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('degraded: git status 失败'));
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(tmp, { recursive: true, force: true });
      warnSpy.mockRestore();
    }
  });
});
