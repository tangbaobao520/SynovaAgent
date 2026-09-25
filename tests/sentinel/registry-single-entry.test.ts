/**
 * tests/sentinel/registry-single-entry.test.ts — D968 Done② / Done③ 单入口判据
 *
 * 覆盖两条**硬要求**（队长 2026-09-25 据 D966 只读复测升格进卡面）：
 *
 *   Done②  `loadSentinels()` 加载数 = 目录数，**口径必须由加载器自身语义推导**
 *          （非递归扫顶层、跳过 `shared` 与 `_` 前缀 —— sentinel-loader.ts:76-77），
 *          且判据与 45/43 无关，在任意时序下成立。
 *          反例防线（同测试内）：朴素 `ls` 口径 = 加载数 + 被跳过的目录数（假红）；
 *          递归数 manifest ≠ 加载数。
 *
 *   Done③  注入缝 `SENTINELS_FIXTURE_DIR` 的 **cache 陷阱**判别性断言：
 *          `sentinel-loader.ts:58` 模块级 `cache`、`:66` 无条件返回缓存
 *          ⇒ 同进程内若先跑过一次 `loadSentinels()`，再设 env 会**拿回缓存**、夹具根本没被扫
 *          ⇒ 断言可能全绿却什么都没验证（假绿）。
 *          本文件用两条断言把陷阱**自动化钉死**：
 *            (1) 夹具根 **1 个目录** ⇒ `loadSentinels().sentinels.length` 必须 **= 1**；
 *            (2) 不 `clearSentinelCache()` 时拿回的仍是**主目录**加载数（陷阱真实存在），
 *                `clearSentinelCache()` 之后才 = 1（修复有效）。
 *          ⇒ 「去掉 clear ⇒ 红」由 (2) 与 (1) 的对比**在测试内自证**，不依赖人工流程。
 *          「只加一个目录、不改一行代码 → 跑通十环」的三环证明在
 *          `tests/sentinel/d751-new-sentinel-e2e.test.ts`（发现/路由/派发，真实管线）。
 *
 * 契约（铁律 47）:
 *   @input  — 无（夹具自建在 os.tmpdir() 下；不改仓库任何文件）
 *   @output — vitest 断言（覆盖正常 / 反例 / 边界 / 陷阱四类）
 *   @degraded — 不适用（测试自身失败即红，不降级）
 *   @error  — 夹具目录不可建 → 测试失败（fail-closed，绝不 skip 成绿）
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  loadSentinels,
  clearSentinelCache,
  registerLoadedSentinels,
} from '../../src/sentinel/sentinel-loader';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SENTINELS_DIR = join(REPO_ROOT, 'extensions', 'sentinels');

const FIXTURE_ROOT = join(tmpdir(), 'd968-single-entry-fixture');
const FIXTURE_SENTINEL_NAME = 'd968-fixture-only';

/**
 * 「目录数」的**加载器语义**口径 —— 与 `sentinel-loader.ts:76-77` 逐字对齐：
 *   `readdirSync(dir, { withFileTypes: true })` 非递归；`entry.isDirectory()`
 *   `entry.name === 'shared'` 跳过；`entry.name.startsWith('_')` 跳过。
 * @input  dir — 哨兵扫描根
 * @output number — 加载器会尝试读取 manifest.json 的目录数
 */
function loaderSemanticDirCount(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).filter(
    (e) => e.isDirectory() && e.name !== 'shared' && !e.name.startsWith('_'),
  ).length;
}

/** 反例 A：朴素 `ls -d dir/*​/ | wc -l` 等价口径（含 `_extinct` / `shared`） */
function naiveTopLevelDirCount(dir: string): number {
  return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).length;
}

/** 反例 B：递归数 manifest.json（会把 `_extinct/*` 里的退役件一起数进来） */
function recursiveManifestCount(dir: string): number {
  let n = 0;
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) walk(join(d, e.name));
      else if (e.name === 'manifest.json') n += 1;
    }
  };
  walk(dir);
  return n;
}

/** 建 1 个哨兵目录的最小夹具（loader 只做 JSON.parse，不做 schema 校验） */
function buildOneDirFixture(): void {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  const dir = join(FIXTURE_ROOT, FIXTURE_SENTINEL_NAME);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify(
      {
        name: FIXTURE_SENTINEL_NAME,
        version: '1.0.0',
        type: 'sentinel',
        displayName: 'D968 单入口夹具哨兵',
        description: 'D968 Done③ 判别性夹具：夹具根仅有此 1 个目录',
        schedule: '0 9 * * *',
        expert: 'fundamental-efficiency',
        priority: 'P2',
        computes: [],
        thresholds: {},
        aggregation: 'worst_first',
        context: { requiredDataSources: [], dataAccess: { allowedDimensions: [], sensitiveAccess: 'read' } },
        entryPoint: './aggregate.ts',
        exportKey: 'd968FixtureSentinel',
      },
      null,
      2,
    ),
    'utf-8',
  );
}

beforeEach(() => {
  delete process.env.SENTINELS_FIXTURE_DIR;
  clearSentinelCache();
});

afterEach(() => {
  delete process.env.SENTINELS_FIXTURE_DIR;
  clearSentinelCache();
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe('D968 Done② — loadSentinels() 加载数 = 目录数（加载器语义口径）', () => {
  it('正常路径: 加载数 === 加载器语义目录数，且 errors 为空', () => {
    clearSentinelCache();
    const expected = loaderSemanticDirCount(SENTINELS_DIR);
    const { sentinels, errors } = loadSentinels();
    // 动态等式 —— 不出现任何写死的 45/43，D965/D968 任意时序下都成立
    expect(sentinels.length).toBe(expected);
    expect(errors).toEqual([]);
    // 前置：目录数必须 > 0，否则上面的等式在空目录下退化为 0 === 0（假绿防线）
    expect(expected).toBeGreaterThan(0);
  });

  it('反例 A（假红防线）: 朴素顶层目录口径 ≠ 加载数 —— 差值 = 被跳过的 shared/_* 目录数', () => {
    const naive = naiveTopLevelDirCount(SENTINELS_DIR);
    const semantic = loaderSemanticDirCount(SENTINELS_DIR);
    const skipped = naive - semantic;
    // 仓库当前存在 shared/ 与 _extinct/ ⇒ 朴素口径必然偏大（这正是陷阱 A）
    expect(skipped).toBeGreaterThan(0);
    expect(loadSentinels().sentinels.length).toBe(semantic);
    expect(loadSentinels().sentinels.length).not.toBe(naive);
  });

  it('反例 B（假红防线）: 递归数 manifest ≠ 加载数 —— 差值 = _extinct 退役件 + 根级 extension manifest', () => {
    const recursive = recursiveManifestCount(SENTINELS_DIR);
    const semantic = loaderSemanticDirCount(SENTINELS_DIR);
    // _extinct/<退役件>/manifest.json —— loader 因 `_` 前缀整目录跳过，递归数却会数进来
    const extinctManifests = recursiveManifestCount(join(SENTINELS_DIR, '_extinct'));
    // extensions/sentinels/manifest.json = **整个扩展的 extension-manifest**（$schema=extension-manifest-v1），
    // 不是哨兵 manifest；loader 只扫目录（entry.isDirectory()）⇒ 它不参与加载，但会被递归数进来。
    const rootExtensionManifest = existsSync(join(SENTINELS_DIR, 'manifest.json')) ? 1 : 0;

    expect(recursive).toBe(semantic + extinctManifests + rootExtensionManifest);
    expect(extinctManifests).toBeGreaterThan(0);
    // 递归口径显著偏大（当前 +13）⇒ 用它当分母必假红
    expect(recursive).toBeGreaterThan(semantic);
    expect(loadSentinels().sentinels.length).not.toBe(recursive);
  });

  it('十环④下半: 注册数 = 加载数（errors 为空），且 registry.count() 一致', async () => {
    clearSentinelCache();
    destroySentinelRegistry();
    try {
      const { sentinels } = loadSentinels();
      const { registered, errors } = await registerLoadedSentinels();
      // 十环④ 判据原文：「加载数 = 目录数；注册数 = 加载数」——本用例补的是后半句
      expect(registered).toBe(sentinels.length);
      expect(errors).toEqual([]);
      expect(getSentinelRegistry().count()).toBe(sentinels.length);
      // 前置：加载数 > 0，否则等式在空集合上退化为 0 === 0（假绿防线）
      expect(sentinels.length).toBeGreaterThan(0);
    } finally {
      destroySentinelRegistry();
      delete process.env.SENTINELS_FIXTURE_DIR;
      clearSentinelCache();
    }
  });
});

describe('D968 Done③ — 注入缝 cache 陷阱（判别性断言 + 自动反证）', () => {
  it('判别性: 夹具根 1 个目录 ⇒ 加载数必须 = 1（而非主目录数）', () => {
    buildOneDirFixture();
    expect(loaderSemanticDirCount(FIXTURE_ROOT)).toBe(1);

    process.env.SENTINELS_FIXTURE_DIR = FIXTURE_ROOT;
    clearSentinelCache(); // ← 硬约束：设 env 后必须 clear
    const { sentinels, errors } = loadSentinels();

    expect(sentinels).toHaveLength(1);
    expect(sentinels[0].manifest.name).toBe(FIXTURE_SENTINEL_NAME);
    expect(errors).toEqual([]);
  });

  it('自动反证: 不 clear 缓存 ⇒ 拿回主目录加载数（「env 后设即生效」为假）', () => {
    buildOneDirFixture();

    // 预热缓存（主目录）—— 模拟"同进程内其他用例先碰过 loadSentinels()"
    delete process.env.SENTINELS_FIXTURE_DIR;
    clearSentinelCache();
    const mainCount = loadSentinels().sentinels.length;
    expect(mainCount).toBeGreaterThan(1); // 主目录显然不止 1 个（夹具只有 1 个）

    // 设 env 但**不 clear** ⇒ 命中 :66 的无条件缓存返回，夹具根本没被扫
    process.env.SENTINELS_FIXTURE_DIR = FIXTURE_ROOT;
    const staleCount = loadSentinels().sentinels.length;
    expect(staleCount).toBe(mainCount); // ← 陷阱本体：env 被缓存吞掉
    expect(staleCount).not.toBe(1); // ← 与上面的判别性断言 (=1) 形成对照

    // clear 之后才真正扫夹具
    clearSentinelCache();
    expect(loadSentinels().sentinels.length).toBe(1);
  });

  it('边界: 夹具根不存在 ⇒ degraded 且有 errors（不静默返回空集合当"通过"）', () => {
    process.env.SENTINELS_FIXTURE_DIR = join(tmpdir(), 'd968-does-not-exist-xyz');
    clearSentinelCache();
    const { sentinels, degraded, errors } = loadSentinels();
    expect(sentinels).toEqual([]);
    expect(errors.length).toBeGreaterThan(0);
    // 现实现返回 degraded:true（sentinel-loader.ts 目录不存在分支）
    expect(degraded).toBe(true);
  });
});
