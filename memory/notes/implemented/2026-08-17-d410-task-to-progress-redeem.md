---
status: proposed
date: 2026-08-17
task: D410
tags: [product-lines, dashboard, redeem, auto-progress]
---

# D410 — 任务交付 → 进度条自动兑换通道

## 决策（创始人 2026-08-17：完成一个任务就要体现在仪表盘，这是 CTO 职责）
根因：进度条只认 evidence/*.json 证据记录，而 K3 审计报告是 .md 未转 JSON → 8-13 之后所有交付（D355-D409）都不反映在进度上。

方案：新增 `scripts/product-lines/redeem-progress.py`（A3.5 环节）：
- task-state/D###.json 声明 `acceptance_points`（任务推进的验收点，CTO 收尾登记）
- 核验：impl commit 在 git（cat-file）+ audit 报告存在且非 FAIL（诚实规则）
- 生成 evidence/task-D###.json（record_type=k3, verdict=pass）→ calc-progress 消费翻绿
- 幂等：重复运行不重复写

首次兑换：D394→7-3（监测结果持久化）、D396→15-4（专家提示词效果验证）
总进度 3% → 4%，已验证验收点 5 → 7。

D379→7-2 不兑换（无审计报告，待 K3 复审——诚实规则：不自己给自己翻绿）。
