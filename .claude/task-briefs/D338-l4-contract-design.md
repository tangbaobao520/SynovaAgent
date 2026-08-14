# Task Brief: D338: L4 数据契约收敛方案设计（dev doc）

> 生成: 2026-08-14 | 分支: feat/d338-l4-contract-design | as any: 0
> #CRITERIA: A

## 项目身份（每次重读 — 源自 CLAUDE.md §项目身份）

SynovaAgent 是一个驻扎企业的 AI 诊断系统。诊断是手段，增长才是目的。
核心问题：这家企业的增长卡在哪里？现在该做什么？
Agent，不是 ChatBot。驻扎企业，持续观测，主动发现，自动诊断，给出行动建议，跟踪执行。

**本任务层级**: L4 本体层架构设计（dev doc 产出，实现交 Claude Code）

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
K3 全链路审计（20260813）结论：客户/资本/人才三循环端到端贯通率 0/3。
本机核实根因在 L4 契约层：类型四口径并存（新 45 类型/旧 PascalCase/大写变体/文档 17 节点）、
field-mappings 类型错位（Market≠Client、People≠Person）、属性名断裂（snake_case≠camelCase）、
SQL 精确匹配零容错。本任务产出收敛方案 dev doc（角色：架构师职责，铁律 0-5）。

### b) 文件审计
- `packages/ontology/src/node-types.ts` — 新体系 45 类型（目标权威）。→ 不改
- `packages/sog-core/` — 旧 PascalCase 枚举（退役对象）。→ 不改
- `src/adapters/sqlite-graph-store.ts` — 精确匹配查询（网关改造点，实现阶段动）。→ 不改（本任务只出方案）
- `extensions/ontology/field-mappings/` — 8 个映射文件，3 个类型错位。→ 不改
- `docs/plans/codex/strategy/` — 方案文档落点。→ 新增 1 份
- K3 审计报告 + AUDIT-FINDINGS-LEDGER — 设计依据。→ 引用
- 冲突检查：无。纯新增方案文档。

### c) 决策
无冲突。参考：第一性原理（数据流最短路径）+ Anthropic 工程基线（契约优先）+ DeepSeek 开源实证（兼容层迁移模式）
→ 结论：GraphStore 契约网关 + 文件驱动别名表 + 三阶段迁移。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训

### a) 业界最佳实践
兼容层迁移模式（strangler fig）：网关归一化短期贯通，消费者逐步迁移，映射表收缩
可视化进度，最终网关退化为透传。行业标准做法（API 版本迁移/数据库 schema 演进同型）。

### b) memory/ 历史教训
- 铁律 46 桥接文件教训：网关≠桥接代理——归一化逻辑必须原创实现，映射表文件驱动，不允许 import 代理
- 铁律 47 契约优先：本方案先定义类型/属性契约（映射表 schema），再谈实现
- K3 审计台账 M3 类（写了没接线）：网关必须配活运行实验测试（T4），不允许"网关存在但没人用"
- D311 改基教训：T4 实验必须脚本化进测试目录，不能只靠人工跑

### c) 决策参考系
参考：Anthropic/DeepSeek/第一性原理 + 结论：契约网关 + 三阶段迁移 + 验收对齐 K3 审计。

## Q2: 范围 — 正确的最简方案

做什么：
- docs/plans/codex/strategy/SYNOVA-DESIGN-L4数据契约收敛-20260814.md — 收敛方案（问题陈述/目标态/三阶段/任务分解 T1-T9/验收标准/风险裁决项）

不做什么：
- 不改 src/ 任何代码（本任务是 dev doc，实现阶段才动代码）
- 不改 packages/ontology/src/node-types.ts（新体系权威，本方案只引用）
- 不改 scripts/audit/ 审计脚本（铁律 0-5 红线）
- 不设计 L5 连接器方案（数据入口问题，独立任务）

## Q3: 验收 — 入口 → 交互 → 结果

入口（从哪触发）：创始人审阅方案文档 + 裁决"待裁决项"（属性别名策略）
处理（中间步骤）：方案经 PR 合并入 main → 创始人批任务给 Claude 按 T1-T9 实现
结果（最终展示）：L4 契约收敛完成 → K3 复审计 0/3 → 3/3 贯通

## 架构层: L4

## Done 标准:
- [x] verify: `grep -c "契约网关" docs/plans/codex/strategy/SYNOVA-DESIGN-L4数据契约收敛-20260814.md` 输出 ≥ 1
- [x] verify: `grep -c "T9" docs/plans/codex/strategy/SYNOVA-DESIGN-L4数据契约收敛-20260814.md` 输出 ≥ 1（任务分解完整）
- [x] verify: `grep -c "0/3" docs/plans/codex/strategy/SYNOVA-DESIGN-L4数据契约收敛-20260814.md` 输出 ≥ 1（对齐 K3 审计）
- [x] verify: `grep -c "待裁决" docs/plans/codex/strategy/SYNOVA-DESIGN-L4数据契约收敛-20260814.md` 输出 ≥ 1（风险显式化）
