---
status: implemented
date: 2026-08-21
task: D468
tags: [control-tower, sync-downgrade, D335, 同步降频, 减负]
---

# D468 — 方案3 同步降频（砍 D335 提交前同步）

## 决策
创始人授权完全实现控制塔。方案 3：砍提交前同步（D335），保留 push 前防覆盖（D334）。

## 理由
D335（check-branch-sync 提交前同步）与 D334（push 前同步检查）功能重叠——提交端拦"基于过期代码干活"，push 端拦"覆盖对方工作"。同步降频后：提交时不再强制"基于最新 main"（拉平降到任务边界一次），push 时 D334 单端兜底（防覆盖物理保障保留，历史 D334 前双机互覆盖 11 commit）。

## 结果
- synova-commit 砍 check-branch-sync 调用
- 删除 check-branch-sync.sh + check-branch-sync.test.sh（死代码，铁律 37）
- D334 门禁 0 保留（防覆盖）
