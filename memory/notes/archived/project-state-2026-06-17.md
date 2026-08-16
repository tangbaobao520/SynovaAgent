---
name: project-state-2026-06-17
description: SynovaAgent 项目状态快照 — v3.0 改造后
metadata:
  type: project
---

# 项目状态快照 — 2026-06-17

## 当前分支
`feat/prompt-architecture` — 已推送 origin。main 分支落后 16 commits。

## Loop Engineering v3.0
- **5 项 pre-commit 硬阻断**（全 <5s，从 38 项砍下来）
- **1 道 pre-push 门禁**（secrets 终扫，从 6 道砍下来）
- **5 层执法架构**：task-start.sh → hook-check-memory.sh → verify-incremental.sh → pre-commit → pre-push
- **Agent 自检 5 问**：接线/异常/类型/测试/残留（CLAUDE.md 指令，而非 bash 脚本）
- **task-start 3 问**：Q1调研/Q2范围/Q3验收
- **净效果**：12 脚本 → 8 脚本，38 项 → 5 项，提交耗时 90s → <5s

## 质量门禁
- tsc --noEmit: 0 errors（上次验证）
- vitest run: 107 passed / 112 total（5 个预存失败）
- as any: 0
- 空壳模块: 0
- 代码量: 236 源文件 / 33,565 行 + 117 测试 / 14,785 行

## 五层架构
```
L1 交互 → routes/ (API), tui/ (TUI V2), mcp/ (MCP)
L2 编排 → agent/ (ConversationEngine), orchestrator/
L3 洞察 → l3/ (ExpertDispatcher), expert-platform/ (8 位专家)
L4 本体 → l4/ (GraphBridge), evidence/
L5 存储 → store/ (SQLite), cron/
```

## 8 位专家 (L3)
strategy / org / finance / tech / marketing / action / business_model / knowledge

## 端口
- SynovaAgent: 18790（避免与 OpenClaw 18789 冲突）
- DEV_MODE=true 启用开发模式

## 待办
- [ ] synova.json 端口确认 18790
- [ ] synova.json + .last-good 回滚机制生产验证
- [ ] C2 budget API 验证
- [ ] C3 技能加载验证
- [ ] C4 上下文压缩验证
- [ ] C6 CLI 命令验证
- [ ] 更新 v2.5 遗留文档（LOOP-ENGINEERING-SYSTEM.md 等）

## 关联
- [[session-2026-06-17]]
- [[loop-engineering-v3.0]]
- [[loop-engineering-v2.5]]
- [[file-first-paradigm]]
