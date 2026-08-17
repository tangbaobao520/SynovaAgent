# Task Brief: D409 — task-state 三件套一致性修正

> 2026-08-17 | CTO (DeepSeek Harness) | 控制塔维护

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
收尾机制（D408 建立）发现 task-state 状态与物理工件不一致：5 个任务（D356/D379/D395/D396/D406）状态字段未反映实际交付。

### b) 文件审计
- task-state/D356.json：spec_done → audited（impl 6db5a17a 已在 main）
- task-state/D379.json：spec_done → impl_done（impl afbc5fd1 已在 main）
- task-state/D395.json：impl_done → audited（impl 9c786b51 已在 main）
- task-state/D396.json：impl 字段补 9aaf0cde（golden-case 门禁）
- task-state/D406.json：claimed → impl_done（impl 108d343a 已在 main）

### c) 决策
状态由工件派生（D393），人工字段仅登记；发现不一致即修正并重新生成 CTO-HEALTH。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- D393：task-state status DERIVED from artifacts（spec 文件 / impl commit / audit 报告）
- M7 文档-实现漂移：状态字段与物理事实必须一致，否则仪表盘误导创始人

## Q2: 范围 — 正确的最简方案

做什么：
- task-state/D356.json
- task-state/D379.json
- task-state/D395.json
- task-state/D396.json
- task-state/D406.json
- docs/synova/CTO-HEALTH.md
- .claude/task-briefs/2026-08-17-D409-taskstate-consistency.md
- task-state/D409.json
- memory/notes/implemented/2026-08-17-d409-taskstate-consistency.md

不做什么：
- 不修改任何 src/ 代码（纯状态登记）
- 不碰 scripts/audit/

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：收尾对账（D408 机制）
处理（中间步骤）：盘点 → 修正 5 json → 重跑 gen-cto-health → 提交
结果（最终展示）：CTO-HEALTH §五 5 个任务状态与物理工件一致；全部入 main

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] 5 个 task-state json 状态/impl 与 main 工件一致
- [ ] gen-cto-health.py 重跑成功（指纹更新）
- [ ] 提交经 synova-commit + 推送 + 入 main
