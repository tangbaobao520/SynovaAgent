// lib/ledger.js — 「项目总览」账本读取器（纯 Node，无 cordis 依赖 → 可 node --test 独立测试）
//
// 契约（铁律 47）：
//   @input   repoRoot: string — SynovaAgent 仓库根目录（调用方回退 process.cwd()）
//   @output  Promise<LedgerReadResult>
//              成功 → { ok: true,  degraded: false, path, raw: string }
//              降级 → { ok: false, degraded: true,  path, error: string, code: string }
//   @degraded 三条路径，全部**不抛异常**（铁律 24/31：禁静默降级、禁抛异常拖垮宿主）：
//              ① ENOENT   — D795 派生器尚未产出（正常默认态，不是故障）→ code="ENOENT"
//              ② BAD_JSON — 文件存在但不是合法 JSON            → code="BAD_JSON"
//              ③ 其它 I/O — 权限/磁盘等                        → code=err.code ?? "EIO"
//   @write   零写入：本模块只调用 readFile，绝不写盘（D794 红线：插件零写入）
//   @why raw 原文透传：路由按契约「ledger.json 原样内容」返回，故解析仅用于校验合法性，
//            返回体仍用原文，避免 JSON.parse→stringify 改变字段序/数字表示。
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** 账本相对仓库根的路径（D795 派生器的唯一产出点；D794 只读）。 */
export const LEDGER_REL_PATH = "docs/synova/project/ledger.json";

/**
 * 只读读取并校验项目账本。
 * @param {string} repoRoot SynovaAgent 仓库根目录。
 * @returns {Promise<{ok:true,degraded:false,path:string,raw:string}|{ok:false,degraded:true,path:string,error:string,code:string}>}
 */
export async function readLedger(repoRoot) {
  const path = join(repoRoot, LEDGER_REL_PATH);
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    const code = err?.code ?? "EIO";
    const error =
      code === "ENOENT"
        ? `ledger 尚未产出：${LEDGER_REL_PATH} 不存在（等 D795 派生器）`
        : `ledger 读取失败（${code}）：${err?.message ?? err}`;
    return { ok: false, degraded: true, path, error, code };
  }
  try {
    JSON.parse(raw);
  } catch (err) {
    return {
      ok: false,
      degraded: true,
      path,
      error: `ledger JSON 解析失败：${err?.message ?? err}`,
      code: "BAD_JSON"
    };
  }
  return { ok: true, degraded: false, path, raw };
}
