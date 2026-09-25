// lib/charter.js — 「宪章三问 48 格」读取器（三级取数；纯 Node，无 cordis 依赖 → 可 node --test）
//
// 契约（铁律 47）：
//   @input   repoRoot: string — SynovaAgent 仓库根目录
//   @output  Promise<CharterReadResult>
//              成功 → { ok:true, degraded:false, source:"worktree"|"origin/main",
//                       ref:string, raw:string, parsed:unknown, fallback_note:string|null }
//              降级 → { ok:false, degraded:true, error:string, attempts:string[], path:string,
//                       missing:"宪章三问-48格.json" }
//   @取数顺序（照 lib/ledger.js 先例，三级，禁静默跳过）：
//     ① 工作区 <repoRoot>/docs/synova/coordination/宪章三问-48格.json → source="worktree"
//     ② 否则 git -C <repoRoot> show origin/main:<rel>                → source="origin/main"
//     ③ 两级都失败 → 显式降级（当前 main 上不存在该文件，属预期正常态）
//   @degraded 全程不抛异常（铁律 24/31）：坏 JSON 记录原因后继续尝试 origin/main；
//             两级都失败 → 显式 degraded + missing 标注，禁空白禁 500。
//   @write   零写入：只 readFile + 只读 git show。
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileP = promisify(execFile);

/** 数据源相对仓库根的路径（只读，D963 不产出该文件）。 */
export const CHARTER_REL_PATH = "docs/synova/coordination/宪章三问-48格.json";

/** git ref 回退时读取的权威分支。 */
export const CHARTER_REF = "origin/main";

/** 降级时告知前端缺的是哪个文件（显式 degraded 的一部分）。 */
export const CHARTER_MISSING = "宪章三问-48格.json";

function tryParse(raw) {
  try {
    return { ok: true, parsed: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, error: `JSON 解析失败：${err?.message ?? err}` };
  }
}

/** ① 工作区文件。 */
async function readWorktree(repoRoot) {
  const abs = join(repoRoot, CHARTER_REL_PATH);
  let raw;
  try {
    raw = await readFile(abs, "utf8");
  } catch (err) {
    const code = err?.code ?? "EIO";
    return {
      ok: false,
      error: code === "ENOENT" ? `工作区无 ${CHARTER_REL_PATH}` : `工作区读取失败（${code}）：${err?.message ?? err}`
    };
  }
  const parsed = tryParse(raw);
  if (!parsed.ok) return { ok: false, error: `工作区宪章 ${parsed.error}` };
  return { ok: true, ref: abs, raw, parsed: parsed.parsed };
}

/** ② git 权威回退：origin/main:<rel>，只读 show。 */
async function readOriginMain(repoRoot) {
  const ref = `${CHARTER_REF}:${CHARTER_REL_PATH}`;
  let stdout;
  try {
    const out = await execFileP("git", ["-C", repoRoot, "show", ref], {
      timeout: 10000,
      maxBuffer: 32 * 1024 * 1024
    });
    stdout = out.stdout;
  } catch (err) {
    const reason = String(err?.stderr ?? err?.message ?? err).trim().split("\n")[0] || "git show 失败";
    return { ok: false, error: `${CHARTER_REF} 取数失败：${reason}` };
  }
  if (!stdout || stdout.trim() === "") {
    return { ok: false, error: `${CHARTER_REF} 上的 ${CHARTER_REL_PATH} 为空` };
  }
  const parsed = tryParse(stdout);
  if (!parsed.ok) return { ok: false, error: `${CHARTER_REF} 宪章 ${parsed.error}` };
  return { ok: true, ref, raw: stdout, parsed: parsed.parsed };
}

/**
 * 三级取数读取宪章 48 格：工作区 → origin/main → 显式降级。
 * @param {string} repoRoot SynovaAgent 仓库根目录。
 * @returns {Promise<{ok:true,degraded:false,source:string,ref:string,raw:string,parsed:unknown,fallback_note:string|null}|{ok:false,degraded:true,error:string,attempts:string[],path:string,missing:string}>}
 */
export async function readCharter(repoRoot) {
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
      source: CHARTER_REF,
      ref: fromGit.ref,
      raw: fromGit.raw,
      parsed: fromGit.parsed,
      fallback_note: `${attempts[0]}；已回退 git 权威 ${CHARTER_REF}`
    };
  }
  attempts.push(fromGit.error);

  return {
    ok: false,
    degraded: true,
    error: attempts.join("；"),
    attempts,
    path: CHARTER_REL_PATH,
    missing: CHARTER_MISSING
  };
}
