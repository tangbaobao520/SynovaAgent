// lib/ledger.js — 「项目总览」账本读取器（三级取数；纯 Node，无 cordis 依赖 → 可 node --test）
//
// 契约（铁律 47）：
//   @input   repoRoot: string — SynovaAgent 仓库根目录（调用方回退 process.cwd()）
//   @output  Promise<LedgerReadResult>
//              成功 → { ok:true, degraded:false, source:"worktree"|"origin/main",
//                       ref:string, raw:string, parsed:unknown, fallback_note:string|null }
//              降级 → { ok:false, degraded:true, error:string, attempts:string[], path:string }
//   @取数顺序（三级；缺一不可，禁静默跳过）
//     ① 工作区 <repoRoot>/docs/synova/project/ledger.json  → source="worktree"
//     ② 否则 git -C <repoRoot> show origin/main:<rel>      → source="origin/main"
//     ③ 两级都失败 → 显式 degraded，error 带上**每一级各自的失败原因**
//   理由（D794 实测）：只读工作区文件时，谁 checkout 了别的分支就「数据不通」——
//   账本随分支消失。origin/main 是 D334「main 是唯一真相」的权威副本，作为回退。
//   @degraded 三级全部**不抛异常**（铁律 24/31：禁静默、禁拖垮宿主）：
//     · 工作区坏 JSON 不直接判死 —— 继续尝试 origin/main（并记录该级失败原因）
//     · git 不可用（非仓库 / 无 origin ref / 无 git 二进制）→ 记录原因后降级
//   @write   零写入：只 readFile + 只读 git show，绝不写盘（D794 红线：插件零写入）
//
// 注：本模块不执行 git fetch —— origin/main ref 的新鲜度依赖仓库既有的 fetch 纪律
//     （铁律 0-3 开工前 git fetch --all / pre-push 门禁）。ref 不存在时如实降级，不猜测。
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileP = promisify(execFile);

/** 账本相对仓库根的路径（D795 派生器的唯一产出点；D794 只读）。 */
export const LEDGER_REL_PATH = "docs/synova/project/ledger.json";

/** git ref 回退时读取的权威分支。 */
export const LEDGER_REF = "origin/main";

/** 校验 JSON 合法性；返回 {ok, parsed} 或 {ok:false, error}。 */
function tryParse(raw) {
  try {
    return { ok: true, parsed: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `JSON 解析失败：${err?.message ?? err}` };
  }
}

/** ① 工作区文件。 */
async function readWorktree(repoRoot) {
  const abs = join(repoRoot, LEDGER_REL_PATH);
  let raw;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    const code = err?.code ?? "EIO";
    return {
      ok: false,
      error: code === "ENOENT" ? `工作区无 ${LEDGER_REL_PATH}` : `工作区读取失败（${code}）：${err?.message ?? err}`
    };
  }
  const parsed = tryParse(raw);
  if (!parsed.ok) return { ok: false, error: `工作区账本 ${parsed.error}` };
  return { ok: true, ref: abs, raw, parsed: parsed.parsed };
}

/** ② git 权威回退：origin/main:<rel>，只读 show。 */
async function readOriginMain(repoRoot) {
  const ref = `${LEDGER_REF}:${LEDGER_REL_PATH}`;
  let stdout;
  try {
    const out = await execFileP("git", ["-C", repoRoot, "show", ref], {
      timeout: 10000,
      maxBuffer: 32 * 1024 * 1024
    });
    stdout = out.stdout;
  } catch (err) {
    const reason = String(err?.stderr ?? err?.message ?? err).trim().split("\n")[0] || "git show 失败";
    return { ok: false, error: `${LEDGER_REF} 取数失败：${reason}` };
  }
  if (!stdout || stdout.trim() === "") {
    return { ok: false, error: `${LEDGER_REF} 上的 ${LEDGER_REL_PATH} 为空` };
  }
  const parsed = tryParse(stdout);
  if (!parsed.ok) return { ok: false, error: `${LEDGER_REF} 账本 ${parsed.error}` };
  return { ok: true, ref, raw: stdout, parsed: parsed.parsed };
}

/**
 * 三级取数读取账本：工作区 → origin/main → 显式降级。
 * @param {string} repoRoot SynovaAgent 仓库根目录。
 * @returns {Promise<{ok:true,degraded:false,source:string,ref:string,raw:string,parsed:unknown,fallback_note:string|null}|{ok:false,degraded:true,error:string,attempts:string[],path:string}>}
 */
export async function readLedger(repoRoot) {
  const attempts = [];

  const worktree = await readWorktree(repoRoot);
  if (worktree.ok) {
    return {
      ok: true,
      degraded: false,
      source: "worktree",
      ref: worktree.ref,
      raw: worktree.raw,
      parsed: worktree.parsed,
      fallback_note: null
    };
  }
  attempts.push(worktree.error);

  const fromGit = await readOriginMain(repoRoot);
  if (fromGit.ok) {
    return {
      ok: true,
      degraded: false,
      source: LEDGER_REF,
      ref: fromGit.ref,
      raw: fromGit.raw,
      parsed: fromGit.parsed,
      fallback_note: `${attempts[0]}；已回退 git 权威 ${LEDGER_REF}`
    };
  }
  attempts.push(fromGit.error);

  return {
    ok: false,
    degraded: true,
    error: attempts.join("；"),
    attempts,
    path: join(repoRoot, LEDGER_REL_PATH)
  };
}
