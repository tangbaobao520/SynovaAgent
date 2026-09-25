/**
 * tests/sentinel/builtins.test.ts — 路径1（内置适配器注册）关停后的行为断言
 *
 * ═══ D968 背景：本文件此前是「空壳假绿」═══
 *
 * 旧版在 `registerBuiltinSentinels()` 后对 `getSentinelRegistry().list()` 做 `for` 循环断言，
 * 但路径1 **实测 `scanned: 4, registered: 0`**（键名推导从未拼回 `Sentinel` 后缀 ⇒ 4 个文件
 * 全部 "未导出哨兵对象"）⇒ `list()` 恒为空 ⇒ **循环体一次都没执行**（0 条断言真的跑过）；
 * 第二个用例只断言 `count() >= 0`，恒真。
 * ⇒ 整个文件"全绿"却什么都没验证 —— 正是本批一路在抓的**假绿**形态。
 * （CTO 已批准顺手修，见 D968 卡面 ③；"改前 / 改后"对照见 D968 evidence。）
 *
 * ═══ 关停后的正确断言（本版）═══
 *
 * 路径1 已关停（唯一入口 = 文件驱动），故本文件断言的是**关停语义本身**，全部具判别力：
 *   A 空注册表 + 调用 → 注册数**仍为 0**（no-op；前置断言证明 0 不是"本来就没动过"的空集合巧合）
 *   B 已有哨兵 + 调用 → **不动既有注册表**（既不清空也不替换）
 *   C 幂等：连续两次调用不抛异常、注册数不变（并以一次真实注册反向确认接口可写）
 *   D 结构伴随断言：路径1 的扫描源目录 `src/sentinel/adapters/` **已不存在**
 *     （若有人重建该目录以恢复路径1 → 本断言变红）
 *
 * 判据方言无关：A/B/C 全部是**运行时行为断言**（注册表计数变化），不依赖任何源码字符串匹配；
 * D 是结构事实断言（目录存在性），仅作伴随证据，不作唯一判据。
 *
 * 契约（铁律 47）:
 *   @input  — SentinelRegistry（全局单例）+ `registerBuiltinSentinels`（路径1 关停后的 no-op）
 *   @output — 覆盖 no-op / 不扰动 / 幂等 / 结构事实 四类 expect
 *   @degraded — 不适用（测试自身失败即红，不降级）
 *   @error  — 前置失败（如 registry 单例不可用）→ 测试失败（fail-closed，不 skip 成绿）
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { registerBuiltinSentinels } from '../../src/sentinel/builtins';
import type { Sentinel, SentinelConfig, SentinelCheckResult, SentinelContext } from '../../src/sentinel';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
/** 路径1 的扫描源目录（D968 关停后应不存在） */
const PATH1_ADAPTERS_DIR = join(REPO_ROOT, 'src', 'sentinel', 'adapters');

function makeConfig(overrides: Partial<SentinelConfig> = {}): SentinelConfig {
  return {
    id: 'pre-existing',
    name: '既有哨兵',
    description: '用于验证 registerBuiltinSentinels 不扰动既有注册表',
    category: 'health',
    priority: 'P1',
    mode: 'cron',
    cron: '0 */6 * * *',
    requiredDataSources: [],
    confidenceModel: 'deterministic',
    version: '1.0.0',
    ...overrides,
  };
}

function makeSentinel(overrides: Partial<SentinelConfig> = {}): Sentinel {
  const config = makeConfig(overrides);
  return {
    config,
    async check(_ctx: SentinelContext): Promise<SentinelCheckResult> {
      return {
        sentinelId: config.id,
        ok: true,
        findings: [],
        durationMs: 0,
        checkedAt: new Date().toISOString(),
      };
    },
  };
}

describe('registerBuiltinSentinels — 路径1 关停语义（D968）', () => {
  beforeEach(() => {
    destroySentinelRegistry();
  });

  it('A no-op: 空注册表调用后注册数仍为 0（前置断言排除"空集合巧合"）', async () => {
    const registry = getSentinelRegistry();
    // 前置（结构事实）：扫描源目录**已删除** ⇒ 关停前的"扫描 4 个文件"路径不可能再发生
    expect(existsSync(PATH1_ADAPTERS_DIR)).toBe(false);
    // 前置：注册表确实是空的（否则下面的 toBe(0) 可能因"本来就没东西"而恒真）
    expect(registry.count()).toBe(0);
    expect(registry.list()).toEqual([]);

    const returned = await registerBuiltinSentinels();

    expect(returned).toBeUndefined(); // Promise<void>
    expect(registry.count()).toBe(0); // ← no-op：不注册任何哨兵
    expect(registry.list()).toEqual([]);
  });

  it('B 不扰动既有注册表: 已注册 2 个 ⇒ 调用后仍为 2（不清空、不替换）', async () => {
    const registry = getSentinelRegistry();
    registry.register(makeSentinel({ id: 'pre-existing-1' }));
    registry.register(makeSentinel({ id: 'pre-existing-2' }));
    expect(registry.count()).toBe(2);

    await registerBuiltinSentinels();

    expect(registry.count()).toBe(2);
    expect(registry.get('pre-existing-1')).toBeDefined();
    expect(registry.get('pre-existing-2')).toBeDefined();
  });

  it('C 幂等: 连续两次调用不抛异常且注册数恒为 0（以一次真实注册反向确认接口可写）', async () => {
    const registry = getSentinelRegistry();
    await registerBuiltinSentinels();
    await registerBuiltinSentinels();
    expect(registry.count()).toBe(0);
    // 反向确认：本用例的 toBe(0) 断言不是"接口根本写不进去"造成的假阴性
    registry.register(makeSentinel({ id: 'sanity' }));
    expect(registry.count()).toBe(1);
  });
});
