# Task Brief: D464 — 控制塔门禁减负修复

> 2026-08-21 | CTO | 创始人裁决：门禁 bug 修复 ≠ 冻结

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
Synova = AI 诊断 Agent。本任务是控制塔门禁层（scripts/，CTO 地盘）减负修复——创始人裁决：门禁 bug 是"减负"不是"加固"，不属于 08-21 冻结范围。

### b) 文件审计
- scripts/workflow/check-dev-doc-write-set.sh（G12c 写集验证，中文文件名 quotepath 盲区）
- scripts/pre-commit-check.sh（GIT_CACHED_* 文件名源头，quotepath + UTF-8 头块）
- scripts/pre-push-check.sh（rebase→merge 提示 + UTF-8 头块）
- scripts/control-tower/check-branch-sync.sh（rebase→merge 提示 + UTF-8 头块）
- tests/control-tower/check-dev-doc-write-set.test.sh（+2 用例）
- tests/control-tower/check-branch-sync.test.sh（断言同步 merge 推荐）
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md（冲突处理 rebase→merge）
- docs/synova/coordination/审计发现台账-DSH-CTO.md（记录）

### c) 决策
冻结期只修已有 bug，不加新门禁（最小化）。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- ctrl-tower-change 模式 2（bash 全角标点紧贴变量 → unbound）+ 模式 6（验收链）
- K3 上报的中文名盲区 + codex PR #69 复踩：core.quotepath 转义中文文件名 → grep 匹配不上
- rebase 改 hash → full-hash 对账断裂（D331 + D451 补记）

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/workflow/check-dev-doc-write-set.sh
- scripts/pre-commit-check.sh
- scripts/pre-push-check.sh
- scripts/control-tower/check-branch-sync.sh
- tests/control-tower/check-dev-doc-write-set.test.sh
- tests/control-tower/check-branch-sync.test.sh
- docs/synova/coordination/MULTI-MACHINE-PR-WORKFLOW.md
- docs/synova/coordination/审计发现台账-DSH-CTO.md
- task-state/D464.json
- .claude/task-briefs/2026-08-21-D464-control-tower-gate-fix.md

不做什么：
- scripts/audit/（K3 专属，红线）
- tag-bypass-wiring.test.sh 4 项存量失败（独立待修，本次不碰）
- 不加新门禁（冻结期最小化）

## Q3: 验收 — 入口 → 交互 → 结果

入口：pre-commit / pre-push 门禁运行时（check-dev-doc-write-set.sh、check-branch-sync.sh、pre-push-check.sh）
处理：中文文件名经 quotepath=false 正确匹配（不再误报"零实际变更"）；分叉/过期提示推荐 merge（不改 hash）
结果：check-dev-doc-write-set.test.sh 6/6 + check-branch-sync.test.sh 11/11 通过

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] bash -n 4 脚本语法通过
- [ ] check-silent-swallow.sh --utf8 4 脚本带头块
- [ ] check-dev-doc-write-set.test.sh 6/6 + check-branch-sync.test.sh 11/11
- [ ] 提交合并进 main
