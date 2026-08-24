# Task Brief: D405: CT-41① CI 状态入仪表盘

> 生成: 2026-08-16 | 分配: alloc-task-id.sh (D405)

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
CT-41（仪表盘完整性）①：CI 状态入第③面——gen-cto-health.py 加 analyze_ci（GitHub API 匿名拉最近 runs）+ render §六 CI 状态段。创始人确认盲区 ① 闭合。

### b) 文件审计
- scripts/control-tower/gen-cto-health.py（analyze_ci + render CI 段）
- tests/control-tower/gen-cto-health.test.sh（D393 断言对齐 audited）
- docs/synova/CTO-HEALTH.md（重新生成，含 CI 段）
- .claude/task-briefs/2026-08-16-D405-ci-dashboard.md
- task-state/D405.json

### c) 决策
仪表盘完整性盲区 ①。参考：第一性原理（打开即真相含 CI）。收敛。

## Q1: 调研 — 决策链 + 执行约束

### a) 决策链
① 盲区确认 → ② analyze_ci（匿名 API，degraded 降级）→ ③ render §六 → ④ 测试 7/7 → ⑤ 提交。
引用 CT-41、K3 D393（防失真）。

### b) 执行约束
- rule: "CI 段真实（API 拉取，失败降级不伪造）"
  verify: "CTO-HEALTH §六 显示 runs + degraded 路径"

### c) 决策参考系
参考：第一性原理。收敛。

## Q2: 范围 — 正确的最简方案

做什么（5 文件）：
- scripts/control-tower/gen-cto-health.py
- tests/control-tower/gen-cto-health.test.sh
- docs/synova/CTO-HEALTH.md
- .claude/task-briefs/2026-08-16-D405-ci-dashboard.md
- task-state/D405.json

不做什么：
- 不改 .github/workflows/ci.yml（CI 判定不改）
- 不改 src/agent/sentinel-service.ts（产品代码独立任务）

## Q3: 验收 — 入口 → 交互 → 结果

入口：CTO-HEALTH 生成
处理：CI runs 拉取 → §六 显示
结果：创始人看仪表盘即见 CI 红绿

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] gen-cto-health.test.sh 7/7
- [ ] CTO-HEALTH §六 CI 段显示最近 runs
