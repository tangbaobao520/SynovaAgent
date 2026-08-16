---
name: project-state-2026-06-16
description: SynovaAgent 项目状态快照 — 分支、质量门禁、专家架构、待办
metadata:
  type: project
---

# 项目状态快照 — 2026-06-16

## 当前分支
`feat/prompt-architecture` — 已推送 origin。main 分支落后。

## 质量门禁
- tsc --noEmit: 0 errors
- vitest run: 107 passed / 112 total (5 个预存失败，非本次引入)
- as any: 0
- 空壳模块: 0
- 代码量: 236 源文件 / 33,565 行 + 117 测试文件 / 14,785 行

## 五层架构
```
L1 交互 → routes/ (API), tui/ (TUI V2), mcp/ (MCP)
L2 编排 → agent/ (ConversationEngine, skill-lazy-loader, tools)
           orchestrator/ (context-compressor, SubAgentCoordinator)
L3 洞察 → l3/ (ExpertDispatcher, ExpertAutonomy, QualityFirewall)
           expert-platform/ (8 位专家)
L4 本体 → l4/ (GraphBridge, EntityResolver)
L5 存储 → store/ (SQLite)
```

## 8 位专家 (L3)
1. strategy (战略诊断)
2. org (组织诊断)
3. finance (财务诊断)
4. tech (技术诊断)
5. marketing (市场诊断)
6. action (行动建议)
7. business_model (商业模式诊断) ← 新增，全链路接线
8. knowledge (知识管理)

## Loop Engineering v2.5
- 38 项 pre-commit 硬阻断
- 6 个执法脚本（hook-check-memory / check-empty-modules / check-manual-drift / check-test-quality / check-wire-full / check-vertical-slice）
- L1→L4 分层验证（verify-incremental.sh）
- 最多 5 轮自动修复循环

## 文件优先范式 (Phase 0-2)
- FileScanner: 扫描 expert/ 目录加载 markdown 知识文件
- ExpertFileLoader: 按专家名加载对应知识文件
- KnowledgeFileImporter: 将知识文件导入本体层
- 双 Claude 协同: 文件优先 Claude → 本体 Claude

## 端口
- SynovaAgent 默认端口: 18790（避免与 OpenClaw 18789 冲突）
- DEV_MODE=true 启用开发模式

## 待办
- [ ] synova.json 端口确认 18790
- [ ] synova.json + .last-good 回滚机制生产验证
- [ ] C2 budget API 返回正确数据验证
- [ ] C3 技能渐进加载 ExpertDispatcher 生效验证
- [ ] C4 上下文压缩长对话触发验证
- [ ] C6 CLI 命令验证

## 关联
- [[session-2026-06-16]]
- [[loop-engineering-v2.5]]
- [[file-first-paradigm]]
