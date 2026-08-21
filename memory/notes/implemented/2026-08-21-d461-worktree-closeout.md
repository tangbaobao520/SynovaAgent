---
status: implemented
date: 2026-08-21
task: D461
tags: [worktree, closeout, orphan, freeze-decision]
---

# D461 — worktree 收尾强制（孤儿检测 + 仪表盘显示）

## 决策
2026-08-21 控制塔冻结决策的**必修项**（LLM-as-a-Verifier 佐证 0.9999）。

根因：D402/D445 的实现躺在 worktree 分支上没合并进 main（task-state 标待实现但实际早写好），差点当孤儿删掉。worktree 隔离解决了并发冲突，也隔离了交付——没人收尾。

## 实现
- scripts/control-tower/check-orphan-worktrees.sh：检测孤儿 worktree（HEAD 不在 origin/main 历史 = 有独有提交未合并），--json 输出
- gen-cto-health.py §九：CTO 开工可见孤儿 worktree 清单（有孤儿才显示，无则不打扰）

## 冻结期边界
不做成"拦 session 的门禁"（违反冻结精神），做成"CTO 可见的收尾提醒"——轻量、不拖慢开发。
