# D962 合并候选卡 — feat/d962-2a-merge（供 CTO 选择提交）

> 产出：d962-coder-b，2026-09-25。base = origin/main@0ab457f2。**未推 main、未开 PR**（按派单约束）。
> 消除目标：V 报的"两分支合并当天密封网二次翻红"（4 条指向已删脚本的断言）。

## 一、合并拓扑与冲突记录

- merge₁ ab0ebbaf ← chore/d962-2a-scripts @ c4b795ba（第一批 46→29）
- merge₂ b67983b1 ← feat/d962-2a-precommit-b @ 7874cbf2（V5.3 precommit + 第二批 −6）
- 断言同步 commit 18dc30fa

| 冲突文件 | 类型 | 解法 |
|---|---|---|
| scripts/workflow/loop-score.sh | UU | 取并集（三处退役打分项全移除 + 乱码修复保留），bash -n 过 |
| tests/control-tower/g9-contract.test.sh | AA | 取 V5.3 版（#37 退役守卫——合并树终态语义） |
| tests/control-tower/g10-cp3.test.sh | AA | 取 V5.3 版（真红分支断言——死分支已修活） |
| tests/control-tower/grep-oP-regression.test.sh | UU | 手工并集（见下） |

## 二、密封网 4 条断言同步（不得放宽——类别覆盖逐类保全）

| 原断言（指向已删脚本） | 处置 |
|---|---|
| 根 check-brief-vs-code.sh 模式条目 | 第一批已随删；backtick 条目改指 workflow 真身（保留） |
| check-tech-debt.sh 日期条目 | **随删**（\d 类覆盖由 resolve-commit-brief.sh:60 真身条目承接） |
| check-integrity-startup.sh label 条目 | 第一批已随删（"[A-Z]" 类覆盖由 file-driven tags 词表条目承接） |
| checks/check-test-quality.sh exports 条目 | **随删**（exports 提取覆盖由 pre-commit export 条目×2 承接） |
| match_file/brief 日期（V5.3 已改指） | external-auditor.sh:195 / resolve-commit-brief.sh:60 |

类别覆盖核对（每类 ≥1 存活）：\s ✓(file-driven tags) \S ✓(checker-review) \K ✓(export×2+CRITERIA×3+brief id) \d ✓(resolve-commit-brief) 简单直译 ✓(backtick/tags/extensions/双链)。
**结果：grep-oP-regression 合并树 24/0 PASS**（条目 38→24 系退役脚本条目随删，类别覆盖不减）。

另同步 2 条 V5.3 语义断言（非放宽，判定面仍在）：
- g5 4e：壳包检测 → 铁律 46 三重匹配（packages/engine-core 引用扫描仍覆盖 packages/ 下壳包核心风险；纯 re-export <50 行启发式判定**归 2b**——登记未清项）
- g8 5d：pre-commit 调用点 → 脚本在位且自跑绿（组 8 判定迁 CI，2b 挂载）

## 三、验证原始输出摘要（合并树实测）

- 密封网：`结果: 24 通过, 0 失败 / Status: ✅`
- 25 项测试电池全 PASS（grep-oP / hard-gate-convergence 24/0 / ci-strict-mode / ci-strict-visible / fastlane / g5 / g8 / g9 / g10 / ct-health 7/0 / check-brief-vs-code / loop-score / check-ci-stale-red / check-orphan-worktrees / check-sentinel-type-net / check-notes-lifecycle / gen-cto-health / brief-parseable / brief-parser-strip / attach / incident-loop / incident-loop-hygiene 12/0 / sync-dsh-skills / utf8 / verify-incremental / gate-stats）
- pre-commit 自过 exit 0（399 行 / 断面 grep -c check-dsh-anchor = 3）；check-plan-integrity exit 0
- **check-bypass-log.test.sh：main 上 PASS、本候选分支 FAIL**——既有环境依赖（"无新提交→exit 0"用例仅在分支==main 状态成立；特性分支上对账合法报未登记提交）。非合并引入回归，实测两侧输出留档。合并入 main 后该测试自动回绿。

## 四、双口径计数（合并树实测）

| 口径 | 命令 | 值 |
|---|---|---|
| CTO 卡原命令（含 audit 红线件） | `find scripts -maxdepth 3 -name 'check-*' -type f \| wc -l` | **23** |
| 排除 audit 红线件 | 同上 + `grep -vc "scripts/audit/"` | **22** |
| canary-drift 2b 删除后 | — | 22 / 21 |

## 五、文件清单与 PR 预算

`git diff origin/main...HEAD --name-status`：**72 files = 15 A + 26 D + 31 M**（+1885 / −4000）。
- PR 预算（D734 ≤12 文件 + 单域）：**72 ≫ 12 超限**。治理产物豁免口径（D860）适用与否由 CTO 判。
- **PR 拆法建议（给 CTO）**：
  - 方案 α（推荐）：**单 PR 提交本候选分支**。理由：两分支互为前提（V5.3 移除引用是第二批删除的触发条件；密封网断言只在合并树收敛为绿），拆开则任一单独合并当天密封网必红（V 的预警正是此）——本候选的存在意义就是消解该顺序依赖。需 CTO 按 D860 治理口径豁免文件数预算（或明示一次性开口子规则）。
  - 方案 β：两个 PR 按序合并（2a-scripts → 2a-precommit-b），但须接受中间态密封网红（两窗口）+ A 分支 docs/d962-disposition 的 skill 行改动须先行合入（本候选已含同文本，合并时自动对齐）。
  - 无论 α/β：本候选分支可直接作为 α 的 PR head，或作为 β 的顺序与冲突解法参照。

## 六、未清项（合并后跟踪）

1. canary-drift 删除（等 2b ci.yml:281 改线）→ 终态 22/21
2. 2b iron-laws job：挂载迁 CI 34 项中未内联的判定面（测试质量/文件驱动 check-file-driven.sh/技能同步/架构边界/数据流/壳包启发式）——**当前 V5.3 CI 区仅内联 5 项**，其余判定面在 2b 挂载前处于"本地不跑、CI 未接"窗口，已在 phase2-plan §九登记
3. CTO 终态口径三选一（22 含红线件 / 21 排除 / 其他）
4. `.dsh/skills/pr-review` 退役注释与 A 分支 docs/d962-disposition 逐字一致——若 A 分支先合，本候选该文件无冲突

## 七、纪律自报

本轮曾误在主工作树执行 merge（落在他人本地分支，**未推送**，当场 `git reset --hard HEAD~1` 恢复至其原状，untracked 未动）——违反"主树只做同步协调"，根因是 `git worktree add ... && git merge` 链式命令在主树执行了第二段。教训入台账：**worktree 命令必须独立成条并显式 workdir**。
