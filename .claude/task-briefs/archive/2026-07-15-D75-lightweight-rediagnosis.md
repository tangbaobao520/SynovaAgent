## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。D75 = 轻量级再诊断引擎。
L3(洞察层: 轻量级专家调度) + L2(编排层: D73/D72触发集成)。
已有: D71 Goal → D72 Proposal → D73 方案哨兵 → D74 工作台。
### b) 文件审计
grep "createGoalSentinel" → src/growth/goal-sentinel.ts:132 ✅
grep "handleDispute" → src/growth/proposal-engine.ts:257 ✅
grep "getGoal" → src/growth/goal-store.ts:136 ✅
grep "EdgeType" → packages/ontology/src/edge-types.ts:23 ✅
### c) 决策
src/growth/lightweight-diagnosis.ts 新建。
goal-sentinel.ts 和 proposal-engine.ts 修改触发集成。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界: 轻量级再诊断 = "分级诊疗"模式。先少资源快速评估，失败则升级全量诊断。
b) 架构: DI模式注入专家调用函数，核心逻辑纯函数可测试。
c) memory/: goal-sentinel和proposal-engine是D71-D73产物，修改须不破坏现有契约。

## Q2: 范围 — 正确的最简方案
做什么：
- lightweight-diagnosis.ts: 核心引擎(维度推断+专家选择+边选择+调整判定)
- goal-sentinel.ts: severity=emergency→fire-and-forget触发再诊断
- proposal-engine.ts: handleDispute回调触发再诊断
- 测试文件≥12
不做什么（含文件路径）：
- 不修改goal-store.ts, proposal-types.ts, goal-types.ts
- 不修改goal-sentinel.ts的三因子偏离算法核心
- 不修改专家提示词模板

## Q3: 验收 — 入口 → 交互 → 结果
入口: (1) goal-sentinel check发现emergency → (2) proposal-engine dispute触发
处理: 维度推断→专家选择→边选择→最小化上下文中调用专家→调整判定
结果: GoalAdjustmentProposal (adjust_target/abandon/escalate)

## 架构层:
L3(lightweight-diagnosis) + L2(goal-sentinel/proposal-engine集成)

## Done 标准
[ ] lightweightReDiagnosis: 1专家+3-5边+5分钟超时硬约束
[ ] lightweightReDiagnosis: 超时→escalate_to_full_diagnosis
[ ] inferDimensionFromDept: ownerDeptId→5维度映射表
[ ] selectExpertForDimension: 5维度→5专家
[ ] selectRelevantCausalEdges: 每维度3-5条最相关42边
[ ] determineAdjustmentType: adjust_target/abandon/escalate
[ ] D73集成: severity=emergency→触发
[ ] D72集成: handleDispute→触发
[ ] Goal.reDiagnosisCount递增
[ ] ≥3次→自动升级全量诊断
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=12测试
