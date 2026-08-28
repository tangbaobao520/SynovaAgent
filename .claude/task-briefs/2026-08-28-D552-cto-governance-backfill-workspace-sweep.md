# Task Brief: D552 cto-governance-backfill-workspace-sweep

> 生成: 2026-08-28 | 任务: D552 | 认领: CTO (DeepSeek Harness)
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）
> 决策参考：第一性原理（治理资产不入 git = 单点丢失风险，台账原则"不遗忘"）+ Anthropic（提交走 PR + CI 权威门禁）+ 收敛结论：回填走分支+PR，不直接推 main

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制体系层（治理资产），非产品代码。主工作区 rebase 到 origin/main（434d7211）后发现 54 个未跟踪文件：
分类后分为「main 缺失的历史治理资产」（需回填入 git）与「骨架 brief/临时 worktree 垃圾」（需删除）。

### b) 文件审计
- 15 个骨架 brief（`<agent>` 占位）→ 已删除（D545/D546 骨架误提交教训：占位 brief 禁止入库）
- 7 份 DSH impl plan 经 `git cat-file -e origin/main:` 核实缺失（D356-DSH/D379-DSH/D534/D535/D538/D544/D546）
- dev-doc-delivery 技能双轨（.claude + .dsh）本地存在、main 缺失（组 13 技能同步检查对象）
- dsh/plugins/synova-dashboards 插件本地存在、main 缺失
- task-state/D530-D532.json main 缺失（main 目录从 D534 起）
- 10 个仓库内过期 worktree 已移除（分支已合并或内容已入 main）；.wt-d483（register-auth 在途）保留

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- 铁律 0-3 禁止 git stash（D312 事故）——全程未用 stash，用「先复制救援文件→删垃圾→换分支」顺序
- 铁律 34 Feature Branch 强制 + D334 多机 PR 工作流——回填走 chore/cto-governance-backfill 分支 + PR
- D545/D546 教训：骨架 brief 误提交致 plan-integrity CI 红——本次 15 个骨架 brief 物理删除而非提交
- D550 教训：alloc-task-id 只读本地陈旧 task-state 致 D# 撞号——本任务走分配器得 D552（工作区已 rebase，占用表与 origin/main 一致）
- 台账原则（创始人 2026-08-26）：所有遗漏主动登记，不问——本任务即把"main 缺失的治理资产"批量登记回 git

## Q2: 范围 — 正确的最简方案

做什么（回填入 git，分批提交）：
- dev-doc-delivery 技能双轨（.claude/skills + .dsh/skills）
- dsh/plugins/synova-dashboards 插件
- dsh/plugins/synova-dashboards/README.md
- dsh/plugins/synova-dashboards/package.json
- dsh/plugins/synova-dashboards/lib/client.js
- dsh/plugins/synova-dashboards/lib/collect.js
- dsh/plugins/synova-dashboards/lib/index.js
- dsh/plugins/synova-dashboards/scripts/install-dashboards.sh
- dsh/plugins/synova-dashboards/scripts/restart-dsh-web.sh
- 治理文档：D391 brief、D523 brief、派单-L1切片C、编码指令×6、K3-PRODUCT-LINES-VERIFICATION-TASK、founder-alerts.md、plans/PLAN-task-state-derived-status、research/会话并发seq乱序缺陷、docs/archive/D382
- impl 计划历史件 6 份归档 docs/archive/（verify-parallel 门禁禁止 implementation/ 历史回填——写集重叠已关闭任务；DSH-D356 重复件删除，main 已有 D356×2）
- task-state/D530-D532.json（D530 状态 claimed→impl_done 补证据注记）
- memory/notes/proposed/（tool-cordis-preset-mutex note + MEMORY.md 索引修正链接）
- 救援的新版仪表盘：founder-console.html + CTO-HEALTH.md（来自 .wt-D539，较 main 新）

不做什么：
- 不改 src/**/*.ts — 产品代码归编码线（红线，本任务纯治理资产）
- 不改 scripts/audit/** — K3 审计红线（永不碰）
- 不动 .wt-d483/** — 编码 session 在途工作区（feat/d483-register-auth）
- 不提交 dsh/desktop/** — 已删除垃圾（仅 package-lock + node_modules）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：main 工作区 `git status --porcelain`（54 个未跟踪文件）
处理（中间步骤）：分类核实（cat-file/ls-tree/hash 对比 origin/main）→ 救援 → 删除垃圾 → 移除 worktree → 分批提交 → PR
结果（最终展示）：`git status --porcelain` 仅剩 .wt-d483 注册目录；回填资产经 PR 入 main；task-state/D552 状态闭环

## 架构层: 控制体系（治理资产），非 L1-L5 产品层

## Done 标准: 以下全部物理可验

- [x] verify: git status --porcelain | grep -v '\.wt-d483/' | wc -l —— 结果 4 条全为在途 D551 文件（TASK-ROUTING.md/D551.json/D551 spec/编码指令-D551），无骨架 brief 残留
- [x] verify: git ls-tree -r --name-only origin/main dsh/plugins/ | grep synova-dashboards —— PR #279 合并后命中
- [x] verify: git ls-tree --name-only origin/main task-state/ | grep -E 'D530|D531|D532' —— PR #279 合并后三条全命中
- [x] verify: git ls-tree --name-only origin/main .dsh/skills/ | grep dev-doc-delivery && git ls-tree --name-only origin/main .claude/skills/ | grep dev-doc-delivery —— 双轨命中（组 13 同步）
- [x] verify: git log origin/main..chore/cto-governance-backfill --oneline —— PR #279 合并后为空（全量入 main）
- [x] verify: git log origin/main --oneline --grep 'D552' -1 —— task-state/D552.json status=impl_done + impl.pr=#279 入 main
