---
status: proposed
date: 2026-08-17
task: D408
tags: [control-tower, closeout, registry]
---

# D408 — 收尾批次：session-registry + todos + bypass 证据落库

## 决策
创始人授权（2026-08-17）：每个任务结束（无论完成情况）统一汇总到 CTO，最终未提交的由 CTO 完成最终推送，保证 code/dev-doc/audit 一一对应。

本批次：
1. `.codex/control-tower/session-registry.json` — D389-D407 全部 DSH session 写集登记（claimed/committed 证据链）
2. `docs/synova/product-lines/todos.yaml` — 26 线待办聚合（refresh-all 生成，含 K3 D355/D373 审计发现条目）
3. `.claude/bypass.log` — D407 三次提交的 COMMITTED 记录（synova-commit 提交后追加，需随批次落库）

## 范围
- 不提交：extensions/industries/*/thresholds.json、tests/output/*.json（编码 session 测试运行产物）
- 不提交：.codex/audit/audit-result.json、.codex/settings/gatekeeper/*（运行时自动信号）
