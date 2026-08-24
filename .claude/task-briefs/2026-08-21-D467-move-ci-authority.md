# Task Brief: D467 — 方案1 挪 CI 核心落地（本地软提示 + CI 权威）

> 2026-08-21 | CTO | 创始人授权完全实现控制塔

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔门禁层（scripts/，CTO 地盘）。方案 1 挪 CI：本地 pre-commit 从硬阻断降为软提示（快速反馈），CI 为唯一权威裁判。

### b) 文件审计
- scripts/pre-commit-check.sh（组1 as any 改"只拦新增"）
- .github/workflows/ci.yml（去掉无效 SKIP_AS_ANY/SKIP_EMPTY_CATCH）
- scripts/install-hooks.sh（pre-commit 模板软提示）
- .git/hooks/pre-commit（软提示）

### c) 决策
创始人授权完全实现控制塔。方案 1 是技术决策（控制塔架构），自决落地。

## Q1: 调研 — 历史教训

- CI 上 SKIP_AS_ANY/SKIP_EMPTY_CATCH 是无效设置（pre-commit-check.sh 不读）+ as any 存量已 0（完整逻辑匹配）
- as any 检查全仓库 grep → 只拦新增（diff 模式），CI 检查 PR 变更而非全仓库
- pre-commit 硬阻断 → 软提示（CI 权威），Anthropic/DeepSeek 标准做法

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/pre-commit-check.sh
- .github/workflows/ci.yml
- scripts/install-hooks.sh
- task-state/D467.json
- .claude/task-briefs/2026-08-21-D467-move-ci-authority.md

不做什么：
- scripts/audit/（K3 专属）
- 不砍 post-commit 三判（后续独立简化）
- 不碰产品代码（as any 存量已 0，无需清理）

## Q3: 验收 — 入口 → 交互 → 结果

入口：本地 git commit 时 pre-commit hook 软提示
处理：门禁失败 → 写 GATE_FAIL_SOFT 到 bypass.log + 软提示，exit 0 放行
结果：本地提交不被阻断，CI（quality job 跑 pre-commit-check.sh + SYNO_DIFF_BASE）权威硬拦

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] bash -n 语法通过（3 脚本 + hook）
- [ ] pre-commit hook exit 0（软提示）
- [ ] 现有测试回归（check-dev-doc-write-set 6/6 + tag-bypass-wiring 24/24）
- [ ] 提交合并进 main
