# Task Brief: D336: 多 Agent 协作协议 — 四角色两线 + 审计红线 + 任务路由

> 生成: 2026-08-14 | 分支: feat/d336-multi-agent-collab | as any: 0
> #CRITERIA: A

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

**本任务层级**: 基础设施（协作治理）— 非 L1-L5 业务代码。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
创始人将 DeepSeek Harness（Mac）加入协作。现有团队：Codex+DeepSeek(dev doc) +
Claude Code(实现) + Kimi K3(独立审计)，均在 Win 机，控制塔体系成熟。
创始人确认（2026-08-14）：
① DeepSeek Harness 角色 = 架构师 + 第二开发者 + PR 审查（不碰审计）
② 审计红线 = 严格隔离，写进铁律
③ 协作协议现在落地
本任务把三个决策固化为仓库内宪法。

### b) 文件审计
- `docs/synova/coordination/` — 已有 MULTI-MACHINE-PR-WORKFLOW.md（D334）、FOUNDER-GUIDE-MERGE.md（D334）、DECISION-REFERENCE.md（D333）。→ 新增 2 份
- `CLAUDE.md` 铁律区 — 已到 0-5。→ 新增 0-5（多 Agent 协作 + 审计红线）
- `scripts/audit/` — 审计工具链（Kimi 专属，本次红线确认：本任务零接触）
- 冲突检查：无。纯新增文档 + CLAUDE.md 追加。

### c) 决策
无冲突。参考：Anthropic/DeepSeek/第一性原理 + 结论：角色边界文档化 + 审计红线铁律化 + 路由表登记制。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

### a) 业界最佳实践
多 agent 协作的工业标准模式：maker-checker 分离（开发与审计独立）、
角色职责单源文档（team contract）、任务认领登记防撞车（board/registry）。
审计独立性的核心：审计者不参与被审计工作、审计标准制定与被审计分离。

### b) memory/ 历史教训
- D296 认领制：跨 session 污染根治 → 本协议沿用"认领登记"防撞车
- D311 多会话协调：单机多 agent 已有基建 → 本协议补"跨角色/跨机"层
- 铁律 0（对齐前置）：创始人三决策已确认，本任务只固化不发明

### c) 决策参考系
参考：Anthropic/DeepSeek/第一性原理 + 结论：四角色两线架构 + 审计红线铁律化 + 路由表登记。

## Q2: 范围 — 正确的最简方案

做什么：
- docs/synova/coordination/MULTI-AGENT-COLLAB.md — 协作协议（角色职责表/审计红线/任务生命周期/防撞车/共享记忆）
- docs/synova/coordination/TASK-ROUTING.md — 任务路由表（类型路由 + 模块认领状态 + 认领流程）
- CLAUDE.md — 铁律 0-5 多 Agent 协作协议 + 审计红线
- .codex/control-tower/VERSION.md — bump V4.7.8（PATCH：流程约束变更）

不做什么：
- 不改 src/ 任何业务代码（本任务是协作治理）
- 不改 scripts/audit/ 任何审计脚本（审计红线——本任务零接触）
- 不改 scripts/control-tower/ 门禁逻辑（D334/D335 已完成）
- Kimi K3 的审计流程与标准保持原样（独立性，本任务零接触）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：任何角色的 agent 读 CLAUDE.md（铁律 0-5）或派活前查 TASK-ROUTING.md
处理（中间步骤）：角色按职责表接任务 → 认领登记 → 开发线实现 → PR 审查 → 合并 → K3 独立审计
结果（最终展示）：四角色边界清晰、审计独立有铁律保障、撞车有登记制预防

## 架构层: 基础设施
协作治理（五层之外）

## Done 标准:
- [x] verify: `grep -c "MULTI-AGENT-COLLAB" CLAUDE.md` 输出 ≥ 1（铁律引用接线）
- [x] verify: `grep -c "审计红线" docs/synova/coordination/MULTI-AGENT-COLLAB.md` 输出 ≥ 1
- [x] verify: `grep -c "Kimi K3" docs/synova/coordination/TASK-ROUTING.md` 输出 ≥ 1（审计角色独立）
- [x] verify: `grep -rn "scripts/audit" docs/synova/coordination/MULTI-AGENT-COLLAB.md` 输出 ≥ 1（红线含路径）
