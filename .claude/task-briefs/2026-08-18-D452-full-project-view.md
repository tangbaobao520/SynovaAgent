# Task Brief: D452 — 全项目视野修复（方案B）+ 状态对齐

> 2026-08-18 | CTO | 控制塔 + 数据源

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人纠正定位：CTO 是全局不是 Mac 侧。founder-truth/CTO-HEALTH 只扫 task-state（Mac 52 任务），丢全项目 142 历史任务。方案 B：task-state 优先 + git log 全项目回退，历史折叠。

### b) 文件审计
- scripts/control-tower/founder-truth.py（collect + render 加历史折叠）
- scripts/control-tower/gen-cto-health.py（循环后补历史任务）
- task-state/D401/403/404/405.json（状态 claimed→impl_done）

### c) 决策
方案 B（创始人选）：不改 task-state，改读取逻辑；历史任务折叠，红绿灯只算活跃。

## Q1: 调研 — 业界最佳实践 / memory 历史教训

- M7 文档-实现漂移：数据源要统一，不能各扫各的
- DASHBOARD-CN 已是 git 派生全项目（成熟做法），对齐它

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/control-tower/founder-truth.py
- scripts/control-tower/gen-cto-health.py
- task-state/D401.json
- task-state/D403.json
- task-state/D404.json
- task-state/D405.json
- task-state/D452.json
- docs/synova/founder-console.html
- docs/synova/CTO-HEALTH.md
- memory/notes/implemented/2026-08-18-d452-full-project-view.md
- .claude/task-briefs/2026-08-18-D452-full-project-view.md
- .claude/current-brief

不做什么：
- scripts/audit/（K3 专属）
- task-state 补写 206 历史档案（方案 B 否决了 A）

## Q3: 验收 — 入口 → 交互 → 结果

入口：founder-truth --html / gen-cto-health
处理：collect 补历史任务 → render 折叠 → 状态对齐
结果：全项目 194 任务可见（52 活跃 + 142 历史折叠）；D401/403/404/405 转绿

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] founder-truth 历史任务 142 折叠，红绿灯只算活跃
- [ ] CTO-HEALTH 历史任务折叠一行
- [ ] D401/403/404/405 impl_done
- [ ] 提交经 synova-commit + 推送 + 入 main
