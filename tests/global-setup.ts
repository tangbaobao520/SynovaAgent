/**
 * tests/global-setup.ts — D657 测试零副作用：vitest 全局快照 + 恢复现场
 *
 * 契约（铁律 47）:
 *   @input  — vitest 生命周期（setup 在全部测试前, teardown 在 vitest run 结束后）
 *   @output — teardown 恢复测试期间对工作树的运行时污染:
 *             白名单（extensions/industries/**、.codex/**）内:
 *               tracked modified → git checkout -- 恢复; untracked → 删除
 *             白名单外新增 → console.warn 点名（不删除——防误删用户数据, 铁律 11 语义）
 *   @degraded — setup 时 git status 失败（非 git 环境）→ 显式 warn + 跳过恢复
 *             （不阻断测试——本模块是卫生层, 不是测试前置条件）
 *
 * 根因实测（K3 D651 C 失分点 + 本机复现 @93209c57）:
 *   tests/evolution/global-analyzer.test.ts 等触发 writeIndustryThresholds()
 *   → 改写 extensions/industries/saas-tech/thresholds.json（tracked! aggregatedAt）
 *   → fresh clone 跑全量测试后 git status 不净。
 *   写入方走 process.cwd() 相对路径且 src/ 本任务禁改 → 恢复现场在测试基建层完成。
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** 恢复计划: restore=git checkout 恢复 tracked; remove=删除 untracked; unknown=白名单外（只告警） */
export interface ReconcilePlan {
  restore: string[];
  remove: string[];
  unknown: string[];
}

/** 白名单前缀: 测试运行时已知写入目标（新写入方出现时在此登记, 不登记则进 unknown 告警） */
const WHITELIST_PREFIXES = ['extensions/industries/', '.codex/'];

/** porcelain 行解析: " M path" / "?? path" / "M  path" → [status, path] */
export function parsePorcelainLine(line: string): { status: string; path: string } | null {
  if (line.length < 4) return null;
  const status = line.slice(0, 2);
  const filePath = line.slice(3).replace(/^"|"$/g, '');
  return { status, path: filePath };
}

/**
 * 纯函数: 对比测试前后 git status 快照, 产出恢复计划。
 * @param before porcelain 行列表（测试前）
 * @param after  porcelain 行列表（测试后）
 */
export function reconcile(before: string[], after: string[]): ReconcilePlan {
  const plan: ReconcilePlan = { restore: [], remove: [], unknown: [] };
  const beforeMap = new Map<string, string>();
  for (const line of before) {
    const parsed = parsePorcelainLine(line);
    if (parsed) beforeMap.set(parsed.path, parsed.status);
  }
  for (const line of after) {
    const parsed = parsePorcelainLine(line);
    if (!parsed) continue;
    const { status, path: p } = parsed;
    const prev = beforeMap.get(p);
    if (prev === status) continue; // 测试前已如此, 非测试污染
    if (prev === undefined && status === '??') {
      // 新增 untracked（porcelain 目录形态 "?? dir/" 直接整删）
      (WHITELIST_PREFIXES.some((w) => p.startsWith(w)) ? plan.remove : plan.unknown).push(p);
    } else if (prev === undefined && status.trim() === 'M') {
      // 工作树 modified（测试改写 tracked 文件——本批污染实锤形态）
      (WHITELIST_PREFIXES.some((w) => p.startsWith(w)) ? plan.restore : plan.unknown).push(p);
    } else {
      // 状态迁移组合（staged 混入等）——保守归 unknown, 不自动操作
      plan.unknown.push(p);
    }
  }
  return plan;
}

function gitStatus(): string[] {
  const out = execFileSync('git', ['status', '--porcelain'], {
    encoding: 'utf-8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return out.split('\n').filter((l) => l.length >= 4);
}

export function setupZeroSideEffect(): () => Promise<void> {
  let before: string[];
  try {
    before = gitStatus();
  } catch (err) {
    // 降级: 非 git 环境（铁律 11——显式 warn, 不静默, 不阻断测试）
    console.warn(
      `[zero-side-effect] degraded: git status 失败（${err instanceof Error ? err.message : String(err)}）——跳过测试后恢复现场`,
    );
    return async () => {};
  }

  return async () => {
    let after: string[];
    try {
      after = gitStatus();
    } catch (err) {
      console.warn(
        `[zero-side-effect] degraded: teardown git status 失败（${err instanceof Error ? err.message : String(err)}）`,
      );
      return;
    }
    const plan = reconcile(before, after);
    for (const p of plan.restore) {
      try {
        execFileSync('git', ['checkout', '--', p], { stdio: 'pipe' });
      } catch (err) {
        console.warn(`[zero-side-effect] degraded: 恢复 ${p} 失败（${err instanceof Error ? err.message : String(err)}）`);
      }
    }
    for (const p of plan.remove) {
      try {
        fs.rmSync(path.resolve(p), { recursive: true, force: true });
      } catch (err) {
        console.warn(`[zero-side-effect] degraded: 删除 ${p} 失败（${err instanceof Error ? err.message : String(err)}）`);
      }
    }
    if (plan.unknown.length > 0) {
      console.warn(
        `[zero-side-effect] 检出白名单外测试残留（未自动删除, 请人工确认是否入白名单 WHITELIST_PREFIXES）:\n` +
          plan.unknown.map((p) => `  - ${p}`).join('\n'),
      );
    }
  };
}

// vitest globalSetup 约定: default export; 测试消费命名导出
export default setupZeroSideEffect;
