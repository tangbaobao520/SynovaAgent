# Task Brief: D465 — CI 门禁 diff 语义补齐（消除空暂存假绿）

> 2026-08-21 | CTO | 控制塔减负审计落地项 1

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = AI 诊断 Agent。本任务是控制塔门禁（scripts/，CTO 地盘）CI gap 补齐——CI 上 pre-commit-check.sh 空暂存导致增量检查空跑假绿。

### b) 文件审计
- scripts/pre-commit-check.sh（GIT_CACHED_* diff 来源加 CI 模式）
- .github/workflows/ci.yml（quality job 注入 SYNO_DIFF_BASE + fetch-depth）

### c) 决策
纯技术减负，不碰铁律：CI 门禁真正检查 PR 变更，消除假绿。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- CI 是 clean checkout，`git diff --cached` 为空 → 增量检查（as-any/测试配对/接线/brief/scope）空跑跳过
- 三点 diff `base...HEAD` = merge-base 到 HEAD 的变更，正确表达"PR 引入的变更"
- D390 教训：注入缝必须武装守卫 → SYNO_DIFF_BASE 仅 GITHUB_ACTIONS 环境生效

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/pre-commit-check.sh
- .github/workflows/ci.yml
- task-state/D465.json
- .claude/task-briefs/2026-08-21-D465-ci-diff-gap-fix.md

不做什么：
- scripts/audit/（K3 专属）
- 不动 SKIP_AS_ANY/SKIP_EMPTY_CATCH（历史存量，独立治理）
- 不挪权威（方案 1 的"挪 CI"要拍板，本任务只补 gap）

## Q3: 验收 — 入口 → 交互 → 结果

入口：CI quality job 跑 pre-commit-check.sh 时（GITHUB_ACTIONS=true + SYNO_DIFF_BASE=origin/main）
处理：GIT_CACHED_* 改用 `origin/main...HEAD` 替代空暂存
结果：CI 增量检查真正查 PR 变更（不再空跑假绿）

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] bash -n 语法通过
- [ ] 三点 diff 语法验证（main...HEAD 列出 PR 变更）
- [ ] 本地模式不回归（无 GITHUB_ACTIONS → --cached）
- [ ] 现有测试回归（check-dev-doc-write-set 6/6 + check-branch-sync 11/11）
- [ ] 提交合并进 main
