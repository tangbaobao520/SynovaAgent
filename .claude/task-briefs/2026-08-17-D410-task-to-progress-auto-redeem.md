# Task Brief: D410 — 任务交付 → 进度条自动兑换通道

> 2026-08-17 | CTO (DeepSeek Harness) | 产品线仪表盘

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
产品进度条（product-progress.html）只认 evidence/*.json 证据记录。K3 审计报告是 .md 未转 JSON → 8-13 之后所有交付不反映进度。创始人要求：完成一个任务就要体现在仪表盘。

### b) 文件审计
- scripts/product-lines/redeem-progress.py（新，A3.5 兑换环节）
- scripts/product-lines/refresh-all.sh（集成 A3.5）
- task-state/D394.json（+acceptance_points: 7-3）
- task-state/D396.json（+acceptance_points: 15-4）
- task-state/D379.json（清空声明，7-2 待 K3 复审）
- docs/synova/product-lines/evidence/task-D394.json / task-D396.json（生成物）

### c) 决策
诚实规则不变：impl commit 物理校验 + audit 非 FAIL 才兑换；无审计报告不自己翻绿。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

- calc-progress.py 诚实规则 §1：无证据不计分
- M2 声称vs事实：兑换必须物理可核（git cat-file + audit 报告存在）
- M7 文档-实现漂移：验收点状态必须跟交付走

## Q2: 范围 — 正确的最简方案

做什么：
- scripts/product-lines/redeem-progress.py
- scripts/product-lines/refresh-all.sh
- task-state/D394.json
- task-state/D396.json
- task-state/D379.json
- docs/synova/product-lines/evidence/task-D394.json
- docs/synova/product-lines/evidence/task-D396.json
- docs/synova/product-lines/todos.yaml（刷新产物）
- docs/synova/product-lines/product-progress.html（刷新产物）
- .claude/task-briefs/2026-08-17-D410-task-to-progress-auto-redeem.md
- task-state/D410.json
- memory/notes/implemented/2026-08-17-d410-task-to-progress-redeem.md

不做什么：
- 不改 calc-progress.py 的诚实规则（证据门槛不放松）
- 不碰 scripts/audit/
- 不为无审计报告的任务自动翻绿（D379 7-2 等 K3 复审）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：任务完成 → CTO 收尾登记 acceptance_points → refresh-all.sh
处理（中间步骤）：redeem-progress 核验 impl+audit → 生成证据 JSON → calc-progress 消费
结果（最终展示）：进度条反映最近交付；D394→7-3、D396→15-4 翻绿，总进度 ≥4%

## 架构层: 基础设施

#CRITERIA: A

## Done 标准
- [ ] redeem-progress.py 幂等运行（重跑不重复写）
- [ ] D394→7-3、D396→15-4 证据生成，进度条 4%
- [ ] refresh-all.sh 全链绿（A3→A3.5→A4→A5）
- [ ] 提交经 synova-commit + 推送 + 入 main
