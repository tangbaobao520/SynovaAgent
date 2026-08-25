# Task Brief: D468 — 方案3 同步降频（砍 D335 提交前同步）

> 2026-08-21 | CTO | 创始人授权完全实现控制塔

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
控制塔门禁层（scripts/，CTO 地盘）。方案 3 同步降频：砍提交前同步（D335），保留 push 前防覆盖（D334）。

### b) 文件审计
- scripts/control-tower/synova-commit（砍 check-branch-sync 调用）
- scripts/control-tower/check-branch-sync.sh（删除，死代码）
- tests/control-tower/check-branch-sync.test.sh（删除，配对）

### c) 决策
同步降频：提交时不再强制"基于最新 main"（拉平降到任务边界一次），push 时 D334 拦落后/分叉（防覆盖保留）。

## Q1: 调研 — 历史教训

- D334 前双机互覆盖 11 commit → 防覆盖物理保障必须保留（push 端）
- D335 提交前同步与 D334 push 前同步重叠，砍提交端保留 push 端（单端兜底）
- 铁律 37：死代码入仓库即违规 → 删除 check-branch-sync.sh

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/synova-commit
- scripts/control-tower/check-branch-sync.sh（删除）
- tests/control-tower/check-branch-sync.test.sh（删除）
- task-state/D468.json
- .claude/task-briefs/2026-08-21-D468-sync-downgrade.md

不做什么：
- scripts/audit/（K3 专属）
- 不砍 D334 push 前防覆盖
- 不砍 D331 bypass 对账（K3 审计证据链）

## Q3: 验收 — 入口 → 交互 → 结果

入口：synova-commit 提交时
处理：不再跑 check-branch-sync（提交前同步）
结果：提交不强制"基于最新 main"，push 时 D334 拦落后/分叉

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] synova-commit 语法通过
- [ ] check-branch-sync.sh + test 删除（零引用）
- [ ] D334 防覆盖保留（pre-push 门禁 0）
- [ ] 现有测试回归
- [ ] 提交合并进 main
