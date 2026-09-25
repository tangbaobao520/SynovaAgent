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

// ── 真源 → 面板契约 adapter（D963 退回项 2：Host 半映射，前端只管渲染）─────────
//
// 契约（铁律 47）：
//   @input  parsed —— 真源 JSON（docs/synova/coordination/宪章三问-48格.json 原样）：
//            { schema, counts:{cells,ext_points,questions,filled},
//              cells: [{ id, layer, ext_point, question:"q1"|"q2"|"q3",
//                        question_text, question_desc, status, judgement, evidence,
//                        command, owner, updated_at, ... }] }
//   @output 面板契约（客户端 lib/client.js 只读这个形状）：
//            { schema, counts, filled,
//              questions: [{ key:"q1", text:"加了吗" }, ...]（按 q1/q2/q3 顺序），
//              rows: [{ id, layer, name, cells: [{ status, tone, text, note }] }] ——
//              16 行（按 (layer, ext_point) 去重、保持源顺序，与权威生成器
//              scripts/control-tower/gen-charter-grid.py 的 by[(layer, ext_point)] 分组一致）
//              × 3 列（q1/q2/q3） }
//   @四色口径（照权威生成器 gen-charter-grid.py:17-18 COL 表，不发明第五色）：
//            green=生效了 / yellow=接上了但没生效（接了未生效）/ red=缺失 / empty=未填（待办）。
//            未知/缺失 status → empty（X27：缺失≠通过，绝不绿；生成器 COL.get 默认同款）。
//   @note   取 judgement，空则 question_desc（与生成器 note = judgement or question_desc 一致）。
//   @degraded 输入非对象/无 cells 数组 → 返回 { rows:[], questions:[三问默认头], counts:null }，
//            由路由层 ok:true 照常下发；前端显式空态文案，不抛错。
const CHARTER_TONE = {
  green: { tone: "green", text: "生效了" },
  yellow: { tone: "yellow", text: "接了未生效" },
  red: { tone: "red", text: "缺失" },
  empty: { tone: "empty", text: "未填" }
};
const CHARTER_Q_KEYS = ["q1", "q2", "q3"];

/**
 * 真源 cells[] → 面板 rows[]×3 适配。
 * @param {unknown} parsed 真源 JSON 解析结果。
 * @returns {{schema:string, counts:object|null, filled:number|null, questions:{key:string,text:string}[], rows:{id:string,layer:string,name:string,cells:{status:string,tone:string,text:string,note:string}[]}[]}}
 */
export function adaptCharterGrid(parsed) {
  const fallback = {
    schema: "charter-grid/panel-1",
    counts: null,
    filled: null,
    questions: CHARTER_Q_KEYS.map((k) => ({ key: k, text: k === "q1" ? "加了吗" : k === "q2" ? "接上了吗" : "生效了吗" })),
    rows: []
  };
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
  const src = parsed;
  if (!Array.isArray(src.cells)) return fallback;

  // 列头：取每个 question 首次出现的 question_text（真源三问恒定；缺席则默认词）
  const qText = {};
  for (const c of src.cells) {
    if (c && typeof c.question === "string" && !qText[c.question] && typeof c.question_text === "string") {
      qText[c.question] = c.question_text;
    }
  }
  const questions = CHARTER_Q_KEYS.map((k) => ({ key: k, text: qText[k] ?? fallback.questions[CHARTER_Q_KEYS.indexOf(k)].text }));

  // 行：按 (layer, ext_point) 去重、保持源顺序（与权威生成器分组键一致）
  const rowOrder = [];
  const rowMap = new Map();
  for (const c of src.cells) {
    if (!c || typeof c !== "object") continue;
    const layer = String(c.layer ?? "");
    const name = String(c.ext_point ?? "");
    const rowKey = layer + "\u0000" + name;
    let row = rowMap.get(rowKey);
    if (!row) {
      row = { id: String(c.id ?? "").replace(/C\d+$/, "") || rowOrder.length + 1 + "", layer, name, cells: [] };
      rowMap.set(rowKey, row);
      rowOrder.push(row);
    }
    const q = typeof c.question === "string" ? c.question : "";
    const idx = CHARTER_Q_KEYS.indexOf(q);
    if (idx < 0) continue;
    const st = String(c.status ?? "").trim().toLowerCase();
    const tone = CHARTER_TONE[st] ?? CHARTER_TONE.empty;
    const note = String(c.judgement || c.question_desc || "");
    row.cells[idx] = { status: st, tone: tone.tone, text: tone.text, note };
  }
  // 补齐缺席列为 empty（某 ext_point 缺某问时不塌列）
  for (const row of rowOrder) {
    for (let i = 0; i < 3; i++) {
      if (!row.cells[i]) row.cells[i] = { status: "empty", tone: "empty", text: "未填", note: "" };
    }
  }

  return {
    schema: "charter-grid/panel-1",
    counts: src.counts && typeof src.counts === "object" ? src.counts : null,
    filled: src.counts && typeof src.counts.filled === "number" ? src.counts.filled : null,
    questions,
    rows: rowOrder
  };
}
