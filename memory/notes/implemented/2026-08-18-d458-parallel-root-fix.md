---
status: implemented
date: 2026-08-18
task: D458
tags: [parallel, root-fix, gitignore, untrack, version]
---

# D458 — 多 session 并行冲突系统性根治

## 决策（参考：第一性原理 + Anthropic 机器可验 + GIT-SYNC-PLAN 既定决策）

根因不是"某个文件冲突"，而是"把运行时状态/生成物当源代码跟踪"。GIT-SYNC-PLAN(08-14)已定这些文件"不进 git"，写进 .gitignore，但漏执行 `git rm --cached` → 76 文件仍跟踪。

## 三层解法
1. 运行时信号去跟踪（git rm --cached 7 个）：current-brief/workflow-state/audit-result/health/session-registry/gatekeeper信号×2
2. 生成物单点生成门禁（待做）：session 禁改 founder-console/CTO-HEALTH/product-progress/dashboard，只允许 CI bot
3. bypass.log merge=union（D457 已做）

## 版本管理固化
创始人 2026-08-18 定：补丁=第三位/升级=第二位/改版=第一位。建 VERSION.md，本次 = V4.8.1（补丁）
