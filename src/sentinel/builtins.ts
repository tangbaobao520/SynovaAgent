/**
 * sentinel/builtins.ts — 内置哨兵注册（**路径1 已关停**，D968）
 *
 * ═══ D968 裁定：关停路径1，唯一入口 = 文件驱动（路径2）═══
 *
 * 规格 `SYNOVA-哨兵体系-最终版-v1-20260925.md` §三 冻结三条注册路径：
 *   路径1: builtins.ts → 扫 src/sentinel/adapters/*-sentinel.ts   ← **本文件，已关停**
 *   路径2: file-driven-loaders.ts → 扫 extensions/sentinels/*​/manifest.json（唯一入口）
 *   路径3: runner.ts → 运行时再次 loadSentinels()（冗余）→ 已在 runner.ts 去掉
 *
 * **为何"关停"而不是"修复"（院方禁令 4 的实证依据）**：
 *   原实现的 `filenameToExportKey()` 把 `-sentinel.ts` 剥掉后只做 camelCase，
 *   **从未拼回 `Sentinel` 后缀** ⇒ 四个文件名推导出的键
 *   （`cashFlow` / `cpc` / `goalAlignment` / `integrationHealth`）
 *   与实际导出（`cashFlowSentinel` / `cpcSentinel` / `goalalignmentSentinel` /
 *   `integrationHealthSentinel`）**全部对不上** ⇒ 实测 `scanned: 4, registered: 0`
 *   （旧版运行时原始输出见 D968 evidence）。
 *   ⇒ 只需 1 行（拼回 `Sentinel`）就能让其中 3 个"活过来" —— 这正是院方禁令 4
 *      「**不要顺手修注册 bug 就宣布'第二套哨兵活了'**（修 1 行能让键名对上 3 个）」
 *      点名的情形。本批裁决是**关停路径1**；**明令禁止修那个键名推导**
 *      （CTO 2026-09-25 裁定）。
 *
 * **栈式约束（PR-A / PR-B，必读）**：
 *   `registerBuiltinSentinels` 的**调用点** `src/agent/synova-agent.ts:78-79` 属 **win 域**，
 *   归 **PR-B**（base = PR-A）移除。因此 **PR-A 必须保留本 export**，否则 PR-A 单独编译不过
 *   （TS2305: 模块无导出成员）。⇒ 本文件在 PR-A 阶段是"**有意的过渡态**"
 *   （no-op + log.warn），**不是遗留死代码**；PR-B 移除调用点后本 export 即可删除。
 *
 * 架构: L3（哨兵域）。关停后本模块不再有任何磁盘扫描 / 动态 import 行为。
 */

import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/builtins');

/** 路径1 关停后的运行期提示（可见，不静默——铁律 11） */
const PATH1_CLOSED_MSG =
  '[builtins] 路径1 已关停（D968）：唯一入口 = 文件驱动 ' +
  '(src/init/file-driven-loaders.ts → extensions/sentinels/*/manifest.json)。' +
  '本调用为 no-op，不再扫描 src/sentinel/adapters/。';

/**
 * registerBuiltinSentinels — **路径1 关停后的 no-op**（保留 export 仅为栈式编译约束）。
 *
 * 契约（铁律 47）:
 *   @input  — 无
 *   @output Promise<void>；**不注册任何哨兵**（registry 不被修改）
 *   @degraded — 不适用（不再触碰磁盘 / 动态 import，无失败路径）
 *   @error  — 不抛异常（恒 resolve）
 *
 * 保留理由（栈式约束）: 调用点 `src/agent/synova-agent.ts:78-79` 在 PR-B 才移除；
 *   若 PR-A 直接删掉本 export，PR-A 单独会因"调用了不存在的函数"编译失败。
 */
export async function registerBuiltinSentinels(): Promise<void> {
  log.warn(PATH1_CLOSED_MSG);
}

// 哨兵注册: **唯一入口 = 文件驱动**（src/init/file-driven-loaders.ts）
// 新增哨兵 = extensions/sentinels/{name}/manifest.json + aggregate.ts → 零代码变更
//
// 已随路径1 关停一并删除（D968）:
//   - `filenameToExportKey()`          —— 键名推导；缺陷留档于本文件头注释，**明令禁止修复**
//   - `readdirSync(adaptersDir)` 扫描 + 逐文件动态 import + 逐文件 try/catch
//   - 旧「内置哨兵」适配器（同批删除）: cpc-sentinel / goal-alignment-sentinel /
//     integration-health-sentinel（三者 @deprecated）/ cash-flow-sentinel
//     （能力与 extensions/sentinels/cash-runway/ 重叠、且生产上从未注册）/
//     helpers（前四者的工具函数，删后零引用）
