# Task Brief: D457 — bypass.log 多 PR 合并冲突根治

> 2026-08-18 | CTO | 控制塔

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
CT-47：bypass.log append-only 证据日志，多 session 并发追加，PR 合并必冲突（D357/D358/D354）。修复：merge=union 自动取并集。

### b) 文件审计
- .gitattributes（加 .claude/bypass.log merge=union）
- scripts/install-hooks.sh（注册 merge.union.driver）
- tests/control-tower/bypass-union-merge.test.sh（配对测试）

### c) 决策
union 驱动（git 原生，取并集），每行含唯一 HASH 不重复，最少机制。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- append-only 日志合并标准解法 = merge=union
- 方向①最干净（对比方向②转 untracked、方向③改写集）

## Q2: 范围 — 正确的最简方案

做什么：
- .gitattributes
- scripts/install-hooks.sh
- tests/control-tower/bypass-union-merge.test.sh
- task-state/D457.json
- memory/notes/implemented/2026-08-18-d457-bypass-union.md
- .claude/task-briefs/2026-08-18-D457-bypass-union.md
- .claude/current-brief

不做什么：
- scripts/audit/（K3 专属）
- synova-commit 写集逻辑（方向③，不改，union 已够）

## Q3: 验收 — 入口 → 交互 → 结果

入口：多 PR 合并 bypass.log
处理：union 驱动自动取并集
结果：无冲突，双方记录全保留

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] .gitattributes 声明 merge=union
- [ ] install-hooks.sh 注册 driver
- [ ] 沙箱验证 union 取并集（3 行全在无冲突）
- [ ] 测试 3/3 通过
- [ ] 提交经 synova-commit + 推送 + 入 main
