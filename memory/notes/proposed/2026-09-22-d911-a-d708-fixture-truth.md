---
状态: proposed
日期: 2026-09-22
决策: D911 切片 A——把 D708 合并级写集对账 gate 的三条「判据不稳」缺陷一次修到位：① D# 取号回退**限定在 `merge-base(base,head)..head`**（并入的 main 历史不再提供 D#，扫不到即 `None`）；② S1/S2/S3 声明源一律从**被检查的 head 树**读（`git show <head>:<path>`），不再读本地工作树；③ `--pr-body` 与 `GITHUB_EVENT_PATH` 双缺时，「豁免通道不可用」升级为**结论字段**（结论块内 + `--json`）并给出不依赖 PR 正文的替代路径（声明文件内 `## 写集豁免`）。**不新增门禁机制、不放松任何判据、不改退出码语义。**
理由: ① 门禁开始阻止修复门禁——未合 PR 队列 39 件中至少 5 件（#674/#675/#685/#696/#687）被同一族缺陷长期卡死，其中 #696 恰是修 main 恒红的 PR；② 缺陷① 同类第 2 次（第 1 次 #694，当时归因「PR 正文写法」已由 CTO 作废，真因就是取号越界）；③ 取号越界对象**不稳定**（批七实测同一分支两次刷新，错锚从 D806 变 D803），故修法必须落在 `infer_did` 本身；④ 声明源读工作树会让结论随运行目录漂移（CI 检出 / 复核 worktree / 本地各读各的）；⑤ CI 不传 `--pr-body`（单写者，本卡不改 ci.yml）→ 若不把该状态钉进结论，执行方看不到「PR 正文里的豁免根本没被读」。
---

## 触发场景（实测证据，非转述）

1. **取号越界（A1，E2E 夹具钉 sha `9e24daf5` = `refs/pull/696/head`）**：修前
   `merge_writeset_gate.py --base origin/main --head 9e24daf5 --branch gate/ctrl-verify-batch2`
   → `❌ 结论: block — 检测到 14 个写集外文件（夹带）` / `任务: D821`（**真任务是 D861**）/ `EXIT=1`。
   根因：分支名无 D# → subject 回退扫全历史 → 先撞上并入的 main 侧 `feat(D821)` → 拿 D821 的
   `task-state/D821.json` 当声明源 → 本 PR 自己的 14 个交付文件全判「夹带」。修后同命令
   → `✅ 结论: pass` / `任务: D861` / `变更集: 15 个文件` / `EXIT=0`。
2. **同类第 2 次**：#694（首次，归因错误）+ #674/#675（本次）；`chore/dsh-decisions`（#685）CI 失败步骤同名；
   `docs/squad-lead-preset`（#697）合并 main 后被取到 **D870**（同为 main 历史里的号），只因变更全在文档范围才侥幸降级放行。
3. **声明源读工作树（A2）**：夹具实测——工作树切到别的分支（本地无 brief）时，修前 `EXIT=2`
   （三源皆空 → fail-closed），修后按 head 树取到 brief 声明 → `EXIT=0`；反方向更危险：本地有**未提交**的
   brief 时修前 `EXIT=0`（假绿），修后 `EXIT=2`。
4. **豁免通道无结论字段（A3）**：修前「PR 正文不可用」只出现在输出**尾注**（`⚠️ PR 正文不可用…—— 仅文件声明源生效`），
   `--json` 无任何对应字段 → 执行方看不到「PR 正文豁免在 CI 根本没生效」。修后该状态进入
   `❌/✅/⚠️ 结论:` 块内 + `--json` 的 `exempt_channel`/`exempt_channel_reason`/`exempt_channel_fix`。

## 落地（切片 A · 4 件写集）

- `scripts/control-tower/merge_writeset_gate.py`：`infer_did` 加 `base_ref` 参数（回退限定 merge-base 范围，
  `base_ref` 缺省即不回退）；`find_declaration_files` 改按 head 树定位（`ls-tree` 找候选 + `git show` 取内容，
  S2/S3 内容落系统临时目录再喂外部解析器）；`collect_declared`/`collect_explicit_exempt` 吃 head 树内容；
  `resolve_pr_body_text` 返回 `(文本, 通道状态)`；`_emit` 新增结论块内的豁免通道打印与替代路径指引。
- `tests/control-tower/merge_writeset_gate.test.sh`：新增 ⑬–⑳ 共 27 条断言（密封沙箱自建地形，零网络），
  并加 `SYNO_D708_GATE` 注入缝——**同一夹具**换修前 gate 二进制即可复现红侧（修前 38 通过/18 失败，
  修后 56 通过/0 失败；失败的 18 条全部落在新增判据 ⑬-⑰b，既有 ①-⑫ 两侧均通过），
  ⑲⑳ 两侧都绿（「该拦的仍拦」）。红侧**不修改任何交付文件**（不注入临时标记，故无残留可清）。
- 契约（铁律 47）：三个被改函数的 `@input/@output/@degraded/@error` 已写进 docstring；
  判定三态（0 通过 / 1 夹带 / 2 无法判定）与豁免语义**逐条保持不变**。

## 判据纪律（本卡的验收形态）

- **禁 grep 型判据**：所有「修好了」的证明 = 夹具的**退出码 + 结论行**（修前/修后两侧同一夹具），
  不用「搜到了某字符串」当证据。
- **不得把「判红」改成「不判」**：反例①（分支名带 D# 但卡不存在）仍 `exit 2`；反例②（真夹带）仍
  `exit 1` + 逐文件点名，撤掉后回 `exit 0`——两条在修前/修后两侧都通过。
- **fail-open 显式**：唯一新增的显式提示是一条 `⚠️ 豁免通道: 不可用`（结论块内），不放行任何文件。

## 执行期新发现的工具缺口（本卡只登记、不修）

**`synova-commit` 对合并提交恒阻断（D706 不变量误判）**：拉平基线 `git merge --no-ff origin/main`（0 冲突）后
经 `synova-commit` 提交合并 → `❌ D706: 提交树与暂存声明不一致 — 阻断`，点名 `> MM .claude/bypass.log`，
`已撤销该提交（HEAD 回退 1 步）并还原暂存区`。根因：`scripts/control-tower/synova-commit:540` 用
`git show --no-renames --name-status --format="" "$_real"` 取「实际提交变更集」，而**合并提交走 combined diff**
（实测 `git show --name-status --format="" ee0c4eb1` → 0 行；`git diff --name-only ee0c4eb1^1 ee0c4eb1` → 2 行），
与 L529 的暂存声明集口径不同 → L542 必然判不等。同文件 L334-346 却有 merge 快速通道（`FASTLANE_TRIGGER` 含
`MERGE_HEAD`）⇒ merge 路径**设计上要走 synova-commit**，被自家 D706 检查压掉 = 真回归。
后果：`MERGE_HEAD` 被 `git commit` 消费后回滚不恢复 → 合并中间态丢失（本次靠 `git reset --hard` + 重做 merge 复原，零丢失）。
拟修法：L540 对 merge 提交改用 `git diff --name-only <real>^1 <real>`（或 `--first-parent`）取变更集。
**教训**：门禁脚本的「同一份事实」必须只用一个口径取——D706 用「vs HEAD 的索引 diff」比「git show 提交树」，
与 D911 三条缺陷同根（判据与对象不同树/不同范围）。§缺陷① 与本条都属「门禁阻止修复门禁」。

## 相关 D#

- 本卡：**D911**（切片 A：A1/A2/A3）；同族旧卡：**D814**（status=claimed，修法 `git log --first-parent`）——
  本卡口径更严（`merge-base(base,head)..head`：`--first-parent` 只走第一父链，仍可能漏「分支自身提交在第二父链」的形态）。
- 前置/关联：D708（合并级写集门禁本体）、D861（#696 控制塔侧，本卡 E2E 夹具的真任务号）、D821（被错取的号）、
  D694/D674/D675/D685/D687（同族误拦的 PR）、D749（G12 写集口径，属切片 C）。
- 派单件：`docs/synova/dispatch/D911-门禁三缺陷根治-20260922.md`；权威证据件：
  `docs/synova/coordination/裁定记录-门禁三缺陷-20260922.md` §缺陷①。

## 边界（本卡不做）

- **不改 `.github/workflows/ci.yml`**（单写者），CI 侧豁免通道的接线另卡。
- **不新增门禁机制/放行开关**；**不碰 `scripts/audit/**`**（K3 独立审计域）。
- 口径统一（`_clean_entry` ↔ `brief_parser.parse_q2`）属切片 C，本卡不扩写集。
- **不改 `scripts/control-tower/synova-commit`**（D706 merge 口径缺口只登记，建议 CTO 立卡）。
- 不写 `task-state/D911.json`（归卡主）、不写 `docs/synova/product-lines/evidence/**`（CTO 裁定证据由队长并入交回件）。
- 本卡产物**仍受 K3 审计**（改过门禁的开发者不豁免）。
