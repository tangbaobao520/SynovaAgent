# 角色分工（2026-08-11 创始人定）

> 控制塔协作模型：写文档、执行、审计三者分离。

| 角色 | 职责 | 边界 |
|------|------|------|
| **Codex（我）** | 写 dev doc（SYNOVA-IMPL-DXXX）；**自审计自己写的 dev doc**（结构 7 段 / 行号引用 / 写集契约 / 测试先行 red→green / 版本编排 / 跨文档一致性）；维护双仪表盘 | **不再做交付审计**（D 系列代码审计、完成报告核验、CI 核验）——交给 KIMI K3 |
| **KIMI K3** | 独立交付审计：Claude Code 交付后的代码逐行审计、完成标准核验、CI 实查、控制塔问题审计 | 独立于 maker（Codex 写文档 / Claude Code 执行） |
| **Claude Code** | 执行 dev doc（测试先行 → 实现 → 提交 → 推送） | 不审计自己；报告如实，由 KIMI K3 独立核验 |

## 流程

1. Codex 写 dev doc → 自审计（pre-dispatch checklist）→ 派发
2. Claude Code 执行 → 提交推送 → 完成报告
3. **KIMI K3 独立审计**（逐行代码 + DS 核验 + CI）→ 结论
4. 发现问题 → Codex 写 FIX dev doc → 循环

## 边界红线

- Codex 的 `synova-audit` skill 仅用于 **dev doc 自审计**，不用于交付审计
- 交付审计的结论以 KIMI K3 为准；Codex 不再对交付下审计结论
- 跨 session 冲突 / 控制塔问题的深度审计同样归 KIMI K3（Codex 只提供审计线索和证据）

## 决策原则（2026-08-13 创始人定）

- 遇到难决策/多选项/最佳实践选择时，走 [DECISION-REFERENCE.md](DECISION-REFERENCE.md) 四步框架（第一性原理 → Anthropic 基线 → DeepSeek 开源实证 → 收敛检查）
- **决策必须记录所用参考系**（不靠记忆，写入 dev doc/回复/完成报告）
- Claude Code 完成报告须含"决策记录"（决策点 + 参考系 + 理由），供 K3 审计核验
