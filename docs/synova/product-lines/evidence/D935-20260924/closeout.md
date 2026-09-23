# D935-M1 收尾三件（M6）— ownership presets 域修正（窄卡）

> 口径：全部数字来自命令原始输出，禁手写。
> 截至时刻：**2026-09-24 04:59:56 +0800（UTC 2026-09-23T20:59:56Z）**
> 分支：`fix/d935-ownership-presets-mac` ｜ 基线：`origin/main` = `1a1cccc8`（PR #731）
> 收尾提交时 HEAD：`a27958c6`

---

## ① diff

命令与口径：`git diff --stat origin/main...HEAD`（**三点点**，对照当前 origin/main；干净工作树上裸 `git diff --stat` 输出 0 行，不适用）

```
 .claude/bypass.log                                 |   3 +
 .../2026-09-24-D935-M1-ownership-presets-域修正.md | 125 ++++
 .github/CODEOWNERS                                 |   1 +
 docs/synova/coordination/ownership.yaml            |   8 +
 .../evidence/D935-20260924/self-verify.md          | 770 +++++++++++++++++++++
 .../2026-09-24-d935-ownership-presets-domain.md    |  46 ++
 task-state/D935.json                               |  36 +
 tests/control-tower/check-ownership.test.sh        |  27 +
 8 files changed, 1016 insertions(+)
```

逐文件 `git diff --numstat origin/main...HEAD`：

```
3	0	.claude/bypass.log
125	0	.claude/task-briefs/2026-09-24-D935-M1-ownership-presets-域修正.md
1	0	.github/CODEOWNERS
8	0	docs/synova/coordination/ownership.yaml
770	0	docs/synova/product-lines/evidence/D935-20260924/self-verify.md
46	0	memory/notes/proposed/2026-09-24-d935-ownership-presets-domain.md
36	0	task-state/D935.json
27	0	tests/control-tower/check-ownership.test.sh
```

**分类**（按 CTO 口径「写集 ≤3 文件 + 治理产物不计入」）：

| 类别 | 文件 | 行数 |
|---|---|---|
| **task（3 件，CTO 批准写集）** | `docs/synova/coordination/ownership.yaml`、`.github/CODEOWNERS`、`tests/control-tower/check-ownership.test.sh` | +36 / **−0** |
| 治理产物（D860 豁免） | brief、Note、`task-state/D935.json`、自验证据 | +977 |
| hook 运行期账本（`domain_neutral`） | `.claude/bypass.log` | +3 |

**全仓库零删除行（`−0`）** = 未改任何既有归属。

三个 task 文件与独立自验时的内容**逐字节一致**（防止重建提交引入漂移）：

```
✅ docs/synova/coordination/ownership.yaml      (sha256: fe9cd04d787a4bbb…)
✅ .github/CODEOWNERS                           (sha256: 192c3eb3ae516ac7…)
✅ tests/control-tower/check-ownership.test.sh  (sha256: 92b6cad5ed3ecf0b…)
```

---

## ② 自验结论

**自验员：`d935-verifier`（独立成员，非编码 `d935-encoder` 兼任）**

> ### 自验结论：**可提请独立审计**（四项全过、反例成立）
> （我不判"通过"；通过与否归 CTO 收件闸 + K3 终审）

| 口径 | 命令 | 原始结果 |
|---|---|---|
| ① 判别性夹具 | `check-ownership.py …install-squad-lead.sh --owner mac --yaml <变异>` → **EXIT=1**（`❌ 越域` 落 `win`）｜`--yaml <真>` → **EXIT=0**（`mac`）｜`--yaml <origin/main 版>` → **EXIT=1** | 判别力前置为**结构化**证据（43 条规则/命中 1 → 42 条/命中 0，注释保留）；修复前后构成**因果**链 |
| ② (a) 路径判定（决定性） | `check-pr-budget.sh --files "<D931 8 件>"` | **EXIT=0**，`✅ ② 变更单域: ✅ PASS 5 个文件同域: mac` |
| ② (b) 真门禁级变基预演 | `/tmp` 克隆 checkout D931 tip + `GITHUB_ACTIONS=true SYNO_DIFF_BASE=origin/main` | **BEFORE EXIT=1** `❌ ② 变更跨域`（#727 复现）／**AFTER EXIT=0** `✅ 全部 13 组通过` |
| ③ 两组测试 | `check-ownership.test.sh` / `check-pr-budget.test.sh` | **EXIT=0 / 58 项**、**EXIT=0 / 32 项** |
| ④ 未引入兜底放行 | `--numstat`=8/0；兜底块与 `domain_neutral` 逐字节 `diff` EXIT=0；**5406 文件投影仅 3 件变化且全在 presets（win→mac）** | 无删除行、兜底与 `domain_neutral` 一字未动 |

额外必查：`.github/CODEOWNERS` 与 `--emit-codeowners` `cmp`/sha256 全同（`192c3eb3…`，3308 字节）；presets 两行均 `mac`；**夹带件数 = 0**；权威源 `TASK-ROUTING.md:37` 原文已核。

证据全文 770 行：[self-verify.md](./self-verify.md)

**队长独立抽查（不替代自验）**：`numstat` = 8/0 ✅；兜底块逐字节相同 ✅；`domain_neutral` 逐字节相同 ✅；工作树自验期间仅证据目录 untracked ✅。

---

## ③ 遗留清单

### A. 本卡内已处置

1. **M2 写集冲突（已按 CTO 裁定 A 处置）**：本卡 3 文件与在飞卡 **D911**（`claimed`/`high`/5 工作树）write_set 100% 重叠 → 依 `TASK-ROUTING.md` §串行点「写集重叠 → 停手问创始人」上报，CTO 裁定 M1 先合 + 令 D911 暂停这 3 文件。
2. **task-3 与 task-2 的证据目录重叠** → 改为 `blocked_by: task-2` 的**顺序交接**（非并行），已在卡面写明。

### B. 需 CTO / K3 处置（本卡不修，逐条附证据）

3. **【CT 队列·门禁 fail-open】`scripts/pre-commit-check.sh:991` 组 7a 恒过**
   该行 `grep -Ev` 的模式含 ERE 非法的 `^+++` → `grep` 整条失败（exit 2、无 stdout）→ `NEW_DIAG` 恒空 → `soft_check` count=0 走 ✅。
   **最小复现**：`echo test | grep -Ev "^+++"` → `grep: repetition-operator operand invalid`，exit 2；改为 `'^\+{3}'` 则正常。
   **后果**：组 7a「禁止新 DiagnosticModule」在**本地与 CI strict 下同样 fail-open 恒过**。
   非本卡引入（本卡 `scripts/**` 零触碰，脚本与 main 逐字节一致）。
4. **【CT 队列】`alloc-task-id.sh` 两处缺陷**（本卡实测复现，两次取号各撞一次）：
   - `:242` `echo "brief 骨架已生成: $BRIEF_FILE（…）"` —— 全角 `（` 紧贴变量名，`set -u` 下 `BRIEF_FILE�: unbound variable`（ctrl-tower 模式 2，D370 同型）。本次影响：D935 取号尾部确认语丢失（brief 仍生成）。
   - `:204` `BRIEF_FILE="$BRIEF_DIR/…-$(echo "$TITLE" | tr " " "-").md"` —— **title → 文件名未消毒 `/`**。本次影响：D936 取号时 `…/D936-M1b-…electron/src/extensions…md: No such file or directory`，**brief 骨架未生成**（卡号已发放）。
5. **【K3/CTO】`.github/CODEOWNERS` 头第 4 行声称的漂移门禁 `tests/control-tower/ownership.test.sh` 全仓不存在**（实际文件为 `check-ownership.test.sh`）。该字符串由生成器 `check-ownership.py:159` **硬编码**，main 即如此。不影响功能，属"文档-实现不符"，且该文件是 CODEOWNERS 上游。
6. **【CTO】D941/M1b 卡**：见 D.7。
7. **【CTO】D911 恢复写权**：本卡合并后，D911 可恢复 `ownership.yaml` / `.github/CODEOWNERS` / `tests/control-tower/check-ownership.test.sh` 的写权（CTO 裁定 A 的暂停前提解除）。

### C. 本卡执行期观测到的环境异常（非本卡引入，已保全证据）

8. **提交期有外部进程改写非本卡文件并进入索引**（夹带风险）：
   首次 `git commit`（`d28d731c`）**夹带 2 个非本卡文件** —— `docs/synova/coordination/模块归属-MacWin-20260923.md`（+42/−9，整篇重写）、`docs/synova/coordination/审计发现台账-DSH-CTO.md`（+1，新增 2026-09-24 第二批条目）。两件 mtime 均为提交时刻，**主树对应文件干净且是旧版（1860 字节 vs 工作树 3706 字节）**。
   内容属 CTO 侧自我纠错材料（台账自述「CTO 造了第二事实源（自我纠错）」）。
   **处置**：内容已保全至 `/tmp/d935-foreign/`；本卡改用 `git commit --only <显式路径>` 重建，最终变更集**夹带件数 = 0**（已核）。**未删除任何他人副本**（本工作树内还原为 origin/main 版）。
   **待查**：谁在提交窗口写入本工作树 —— 属跨 session 写隔离缺口，建议 CTO 追。
9. **`git rebase` 被 D521 bypass 检测器误报打断**：rebase 期间 post-commit hook 写入 `detected-bypass head-mismatch marker=… parent=…`（本次全程**未用** `--no-verify`，各提交均有 `COMMITTED | pre-commit PASS` 登记）。按 D865 先例该标记属"stale marker 非真绕过"。**队长处置**：abort rebase 后**重建**分支（分支从未 push，重写安全），未把误报行写进历史。建议 CTO 让 bypass 检测器对 REBASE_HEAD 场景豁免。
10. **`②(b)` staged 口径空转**（自验员发现，已被 (a)+(克隆预演) 取代）：`check-pr-budget.sh:92` 读 `git diff origin/main...HEAD`，**不读暂存区**；`pre-commit-check.sh` 全文 `grep check-ownership` = 0 命中（D733 无独立组，仅经 D734）。故"把 D931 写集 staged 再跑门禁"**无法证明** #727 会转绿。建议把「克隆 + CI 注入缝真门禁预演」写进后续同类卡的验收口径。
11. **M7 型指标漂移**：`grep -c INJECTED-RED` 全仓 4 处**均为散文引用**（K3 报告 / W1 计划 / D922 证据 / SYSTEM-PROMPT 坑清单原文），非红证残留；本卡 6 文件逐文件命中 0。D922 已记录同一误报。

### D. 后续（非本卡）

12. **D936 = M1b 卡**（CTO 裁定：「按 `模块归属-MacWin-20260923.md`（#730 新基线）全量重写」，含 `electron/**` 由 Mac 改判 Win、`src/l3|l4|…` 由兜底 Win 改判 Mac、`extensions/**` 拆分、**最长前缀优先** + **未登记 = fail-closed**、改解析算法、重写 ownership.yaml、动 `.github/workflows/ci.yml`）。**必过 K3**（门禁语义变更）。卡号已由分配器发放并登记 `task-state/D936.json`。
13. **D931（#727）复绿**：本卡合并进 main 后，D931 分支 `merge origin/main` 即解阻（自验员的克隆预演已证 BEFORE→AFTER 由红转绿）。由 CTO 触发，不占本单 WIP。

---

## ④ 事实更正声明（队长自查）

- 本收尾曾计划在首次提交中一并落库，但该提交被外部进程夹带 2 个非本卡文件；**已重建**，最终变更集见 ①。首次提交 `d28d731c` 及 `4be1961e` 已从分支移出（未 push，无远端影响）。
- `task-state/D935.json` 由分配器写入**主树**，本工作树原先不存在（自验员实测指出）；已在本工作树补齐并提交。
