---
status: implemented
date: 2026-08-20
task: D459
tags: [generated-gate, G12d, single-writer, ci]
---

# D459 — 生成物单点生成门禁（G12d）

## 决策
生成物 HTML 冲突的根因：session（含 CTO）手动跑生成器并提交，越过已有的 CI bot 单点生成机制。

修法：pre-commit 加 G12d 门禁——生成物文件（founder-console/dashboard/product-progress×2/todos）处于 M/A 状态 → 阻断；D 状态放行（去跟踪合法）。CI bot 用裸 git commit 不触发门禁，天然放行。

## 理由
- 比方案 A（去跟踪+改 Pages 部署）代价小，直击根因
- CTO-HEALTH.md 暂不纳入（无 CI 单点生成，纳入会断更）
- 机器约束而非纪律（V3.6 教训：自律 0% 有效）
