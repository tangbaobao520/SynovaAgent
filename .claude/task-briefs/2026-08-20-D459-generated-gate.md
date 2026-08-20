# Task Brief: D459 — 生成物单点生成门禁（G12d）

> 2026-08-20 | CTO | 控制塔

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
生成物 HTML 冲突根因：session 手动跑生成器提交，越过 CI bot 单点生成。加 G12d 门禁：session 禁改生成物，CI 裸 git commit 放行。

### b) 文件审计
- scripts/pre-commit-check.sh（加 G12d 段）
- tests/control-tower/generated-gate.test.sh（配对测试）

### c) 决策
生成物 M/A 阻断，D 放行；CTO-HEALTH 暂不纳入（无 CI）。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- V3.6 教训：自律 0% 有效，用机器门禁
- 单点生成 = 唯一写者，消除并发冲突

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/pre-commit-check.sh
- tests/control-tower/generated-gate.test.sh
- task-state/D459.json
- memory/notes/implemented/2026-08-20-d459-generated-gate.md
- .claude/task-briefs/2026-08-20-D459-generated-gate.md
- .claude/current-brief

不做什么：
- scripts/audit/（K3 专属）
- docs/synova/CTO-HEALTH.md（无 CI 单点生成，暂不纳入门禁）
- .github/workflows/dashboard-auto.yml（CI 提交方式不改，裸 git commit 天然绕过）

## Q3: 验收 — 入口 → 交互 → 结果

入口：session 走 synova-commit 提交生成物
处理：G12d 检测生成物 M/A → 阻断
结果：session 无法提交生成物，CI 单点生成不受影响

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] G12d 门禁存在（M/A 阻断，D 放行）
- [ ] CI 裸 git commit 绕过（单点生成放行）
- [ ] 测试 4/4 通过
- [ ] 提交经 synova-commit + 推送 + 入 main
