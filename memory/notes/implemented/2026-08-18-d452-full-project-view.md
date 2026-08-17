---
status: implemented
date: 2026-08-18
task: D452
tags: [founder-truth, cto-health, full-project, view]
---

# D452 — 全项目视野修复（方案B）+ 状态对齐

## 决策
创始人纠正：CTO 是整个项目的 CTO，不是 Mac 侧。之前 founder-truth/CTO-HEALTH 数据源只扫 task-state（Mac 52 任务），丢了全项目 git log 里的 142 个历史任务。

方案 B（创始人选）：不改 task-state（不补 206 个历史档案），改 2 个脚本的读取逻辑——task-state 优先（活跃任务），git log 全项目回退（历史任务），历史任务折叠成一行。

## 实现
1. founder-truth.py：collect() 补 git 有、task-state 无的 D#（hist=True）；render 折叠（details/summary）；红绿灯只算活跃
2. gen-cto-health.py：循环后补 impl_hits - seen 的历史任务；markdown 折叠成"📦 历史任务 142 个"一行
3. 状态对齐：D401/403/404/405 claimed→impl_done（物理已完成）

## 效果
- founder-truth：🟢 31→35 / 🟡 11→7 / 🔴 0（4 个滞后任务转绿）
- 全项目任务 52 → 194（52 活跃 + 142 历史折叠）
