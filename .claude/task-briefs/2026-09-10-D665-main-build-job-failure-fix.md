# Task Brief: D665 main-build-job-failure-fix

> 生成: 2026-09-10 | 任务: D665 | 认领: synova-cto
> 参考: D333 决策四步（第一性原理→Anthropic→开源实证→收敛）

#CRITERIA: A

## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
控制塔/repo 卫生任务（非五层）。main build job 自 D595 PR #459 起 CI checkout 报
"No url found for submodule path '.sessions/d595-mcp-auth/repo'" 常红：
10 个运行时目录（9 个 .synova-wt-* + 1 个 .sessions/d595-mcp-auth/repo）以
gitlink(160000) 形式入树，且无 .gitmodules 条目、无 .gitignore 覆盖、无任何门禁防线。
### b) 文件审计
- `git ls-tree -r HEAD | grep -c "^160000"` → 10 条命中（实测 2026-09-10，bec59c34 基线）
- .gitignore 无 .sessions / .synova-wt 条目（grep 实证零覆盖）
- tests/control-tower/ 与 scripts/pre-commit-check.sh 无 gitlink 检查（grep 实证零防线）
- K3 曾三次提 gitlink 问题（D593-FIX/FIX2 复审），仅修 D593 自身，树级防线缺失
### c) 决策
删存量（git rm --cached）+ .gitignore 防再入 + 新建 check-gitlinks.sh 树级守门
（三态退出，D328 惯例）+ 密封测试入 ci.yml 列表（M3：建了必须接线）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
- 业界实证：gitlink 指向外部 commit 且无 .gitmodules 时，actions/checkout 直接报错
  exit 128——submodule 误入树是 CI 常见事故模式。
- memory 教训：M1 fail-open（无检查=静默通过）；M3 机制建成未接线（测试必须真实
  入 ci.yml 显式列表）；V3.9（软机制 0% 有效——守门必须是物理退出码）。
- 参考：第一性原理（gitlink=外部 commit 指针，运行时 worktree/session 目录不属于
  版本库）+ GitHub Actions 实证 → 结论：摘除存量 + ignore 防再入 + 树级守门测试。

## Q2: 范围 — 正确的最简方案
做什么：
- .gitignore — 增 .synova-wt-* 与 .sessions/ 忽略条目
- scripts/control-tower/check-gitlinks.sh — 新建树级 gitlink 守门，三态退出 0/1/2
- tests/control-tower/check-gitlinks.test.sh — 新建密封测试：正常/注入 gitlink/降级/接线四覆盖
- .github/workflows/ci.yml — 测试入 Control Tower Gate Tests 密封列表
- docs/_config.yml — Pages 全站关闭 Liquid 渲染（build job 第二层根因：docs/ 33 个 md
  含字面 {{，Jekyll Liquid::SyntaxError 常红；一类一机制，禁逐文件打地鼠）
- docs/.nojekyll — 终解：GitHub pages gem 实测忽略 render_with_liquid 默认值（#496 合并后
  同错误复现），改静态服务绕过 Jekyll/Liquid/YAML 全链；仪表盘为预构建 HTML 不受影响
- .claude/task-briefs/2026-09-10-D665-main-build-job-failure-fix.md — 本 brief 随分支入库
- memory/notes/implemented/2026-09-10-D665-gitlink-guard.md — 四态 Note（铁律 49）
- task-state/D665.json — impl_done 登记（第二个 commit）
- .synova-wt-d577 — git rm --cached 摘除 gitlink
- .synova-wt-d577-impl — git rm --cached 摘除 gitlink
- .synova-wt-d579 — git rm --cached 摘除 gitlink
- .synova-wt-d580 — git rm --cached 摘除 gitlink
- .synova-wt-d581 — git rm --cached 摘除 gitlink
- .synova-wt-d589 — git rm --cached 摘除 gitlink
- .synova-wt-d595-cont — git rm --cached 摘除 gitlink
- .synova-wt-d597 — git rm --cached 摘除 gitlink
- .synova-wt-d602 — git rm --cached 摘除 gitlink
- .sessions/d595-mcp-auth/repo — git rm --cached 摘除 gitlink
不做什么：
- 不改 src/server.ts（src/ 全域产品代码与本任务无关）
- 不改 scripts/audit/audit-rules.sh（K3 红线，审计域禁碰）
- 不改 scripts/pre-commit-check.sh（本批不扩 pre-commit 组，树级守门走 CI canary 层）
- 不删磁盘上的 .synova-wt-* 目录（git rm --cached 仅摘索引，各任务 worktree 原样保留）

## Q3: 验收 — 入口 → 交互 → 结果
入口：PR 的 GitHub Actions（build job + Control Tower Gate Tests）
处理：gitlink 摘除 + ignore 防再入 + check-gitlinks.sh 三态守门
结果：build job 绿；密封测试绿；HEAD 树 gitlink 计数为 0

## 架构层: 基础设施（控制塔，非五层）
控制塔 repo 卫生与树级守门任务，不属于五层产品架构（不触 src/ L1-L5）

## Done 标准:
- [ ] bash tests/control-tower/check-gitlinks.test.sh → exit 0（三态 0/1/2 全覆盖）
- [ ] git ls-tree -r HEAD | grep -c "^160000" → 0
- [ ] main 分支 GitHub Actions build job conclusion=success（job 级结论，非本地推断）
