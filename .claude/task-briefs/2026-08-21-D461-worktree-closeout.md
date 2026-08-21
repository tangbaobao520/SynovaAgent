# Task Brief: D461 — worktree 收尾强制

> 2026-08-21 | CTO | 冻结决策必修项

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
2026-08-21 控制塔冻结决策：worktree 收尾强制 = 必修（D402/D445 交付躺分支未合并教训）。孤儿检测 + CTO-HEALTH 显示。

### b) 文件审计
- scripts/control-tower/check-orphan-worktrees.sh（新，孤儿检测）
- tests/control-tower/check-orphan-worktrees.test.sh（配对测试 5/5）
- scripts/control-tower/gen-cto-health.py（§九 接入）
- docs/synova/coordination/DECISION-控制塔冻结-20260821.md（决策记录）
- 审计发现台账（决策入账）

### c) 决策
冻结期：不做拦 session 的门禁，做 CTO 可见的收尾提醒（轻量不拖慢开发）。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- D402/D445 教训：worktree 隔离 = 交付隔离，无收尾机制
- 冻结期原则：新增机制要最小化

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/check-orphan-worktrees.sh
- tests/control-tower/check-orphan-worktrees.test.sh
- scripts/control-tower/gen-cto-health.py
- docs/synova/CTO-HEALTH.md
- docs/synova/coordination/DECISION-控制塔冻结-20260821.md
- docs/synova/coordination/审计发现台账-DSH-CTO.md
- task-state/D461.json
- memory/notes/implemented/2026-08-21-d461-worktree-closeout.md
- .claude/task-briefs/2026-08-21-D461-worktree-closeout.md

不做什么：
- scripts/audit/（K3 专属）
- 不做拦 session 的门禁（冻结期最小化）
- 不做 CT-31/32/33（冻结）

## Q3: 验收 — 入口 → 交互 → 结果

入口：CTO 开工看 CTO-HEALTH
处理：check-orphan-worktrees 检测 → §九 显示孤儿
结果：孤儿 worktree 可见，CTO 决定合并/删除

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] check-orphan-worktrees.sh 三态退出（0/1/2）
- [ ] gen-cto-health §九 接入（有孤儿才显示）
- [ ] 测试 5/5 通过
- [ ] 决策文档 + 台账入账
- [ ] 提交经 synova-commit + 推送 + 入 main
