# Task Brief: E1/E2/E4 引擎迁移 — 按计划补齐实际实现

> 生成: 2026-06-24 12:21 | 分支: feat/prompt-architecture | as any: 0

## 项目身份（完整）
同上。

## Q0: 定位 — 项目拼图 + 文件审计

### a) 项目拼图
L3 洞察层。引擎迁移轨 E1/E2/E4。
- E1: registry.ts — 已有 runAll()，缺 listForTeam() 按团队过滤
- E2: 引擎 Phase 2 — 已有 runSentinelForTeam() 调用，但 Finding 事件未按维度分发
- E4: 引擎配置 — diagnosis.ts 读 synova.json；但 gateDataCompleteness/gateMinHypothesisConfidence 无对应 synova.json 字段

### b) 文件审计
| 文件 | 现状 | 关系 |
|------|------|------|
| src/sentinel/registry.ts | 有 runAll()，无 listForTeam() | 扩展 |
| src/l3/synova-diagnosis-engine-impl.ts | Phase 2 调 runSentinelForTeam() | 复用 |
| synova.json | 有 diagnosis.maxToolRounds，无 gate 字段 | 扩展 |
| src/routes/diagnosis.ts | 已读 config.diagnosis?.* | 复用 |

### c) 决策
扩展。不新建文件。补齐：registry.listForTeam() + synova.json gate 字段。

## Q1: 调研
### a) 业界最佳实践
哨兵应按团队过滤（listForTeam），非跑全部后过滤。已有 SentinelFinding 携带 dimension 字段，按维度分发到正确专家。

### b) Anthropic 团队怎么做
先确认现有代码 vs 计划差距 → 只补缺口，不重写。listForTeam 加过滤逻辑，synova.json 补 gate 字段，不改现有 runAll 语义。

### c) 我们犯过的错
上次 E1-E4 号称完成但 listForTeam 缺失。根因：没走 task-start，没做 Q0 对比。本次：先对比再动手。

## Q2: 范围
正确的最简方案 — 三件事：
1. registry.ts 加 listForTeam(teamId, context, registry?) — 调用已注册哨兵的 check()，返回 Finding[]
2. engine-impl.ts Phase 2 — 现已正确调哨兵，确认 Finding 事件含 dimension 字段
3. synova.json 加 gateDataCompleteness / gateMinHypothesisConfidence — 消除硬编码 fallback

**明确不做：** 不改哨兵适配器、不改 sentinel-loader、不改专家调度。

## Q3: 验收
入口: npm run dev → POST /api/diagnosis/consult
处理: Phase 2 → registry.listForTeam() → 哨兵 Finding[] → 注入 LLM
结果: 诊断 complete 事件，synova.json gate 值被读取

## 本任务在哪一层
L3 洞察层 + L5 配置

## Done 标准
- [x] E1: listForTeam() 实现 — 基于 dimension 维度过滤哨兵
- [x] E2: engine Phase 2 哨兵调用确认 — 已有 runSentinelForTeam() 调用
- [x] E4: synova.json 加 gate 字段 — 消除 hardcoded fallback
- [ ] tsc 零错误 | 测试通过 | pre-commit 8 组全过
