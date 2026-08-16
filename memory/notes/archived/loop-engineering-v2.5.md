---
name: loop-engineering-v2.5
description: Loop Engineering v2.5 三层阻断架构 + 38 项 pre-commit + 6 新执法脚本
metadata:
  type: project
---

# Loop Engineering v2.5 — 三层阻断 + 物理执法

2026-06-15/16 从 v2.0 升级到 v2.5。

## 核心变化
6 个新脚本实现物理执法（零 AI 自律裁量权）：
- hook-check-memory.sh — G2 自动注入教训
- check-empty-modules.sh — 空壳阻断
- check-manual-drift.sh — 手册漂移检测
- check-test-quality.sh — 测试断言覆盖
- check-wire-full.sh — 全量接线
- check-vertical-slice.sh — 入口→交互→结果三环节

## 阻断分层
```
PreToolUse (写前)  → hook-check-memory + hook-check-brief
PostToolUse (写后) → verify-incremental.sh (L1→L4, 最多5轮)
pre-commit (提交前) → 38 项硬阻断
pre-push (推送前)   → 6 道门禁 + ArchitectureAuditor
```

## 设计原则
1. 每个规则配一个脚本 — 返回非零=阻断
2. 阻断点越早越好 — PreToolUse > PostToolUse > pre-commit > pre-push
3. 增量阻断, 存量警告 — 一刀切阻断存量会阻塞所有工作
4. 阻断带修复指引 — 输出: 哪个文件、哪一行、违反什么、怎么修

## 关联
- [[session-2026-06-16]]
- [[project-state-2026-06-16]]
