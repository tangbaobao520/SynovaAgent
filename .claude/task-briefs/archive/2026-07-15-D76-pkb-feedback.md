## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。D76 = 执行知识PKB回流。
L4(消费 KnowledgeStore.insert) + L3(knowledge-feedback.ts 知识提取)。
已有: D71 Goal引擎(D71 closeGoal含//TODO(D76)), D73方案哨兵, D75再诊断。
### b) 文件审计
grep "KnowledgeStore" → src/l4/knowledge-store.ts:48 ✅ insert方法在第145行
grep "closeGoal" → src/growth/goal-lifecycle.ts:125 ✅ TODO(D76)在第173行
grep "KnowledgeChunk" → src/l4/knowledge-store.ts:18 ✅ 14字段接口
### c) 决策
src/growth/knowledge-feedback.ts 新建 + goal-lifecycle.ts 替换TODO。
不修改 knowledge-store.ts（只消费 insert）。

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界: 知识回流 = "闭环学习"模式。Goal执行结果→提取经验→PKB沉淀→影响未来决策。
b) architecture: classifyDeviation是纯函数+6条规则，可测。
   writeGoalKnowledge薄封装KnowledgeStore.insert，注入DI。
c) memory/: closeGoal已有TODO预留，修改时不破坏现有契约。

## Q2: 范围 — 正确的最简方案
做什么：
- knowledge-feedback.ts: classifyDeviation(6规则)+extractGoalKnowledge+writeGoalKnowledge+checkBenchmarkThreshold
- goal-lifecycle.ts: 替换TODO为知识提取+写入
不做什么（含文件路径）：
- 不修改 src/l4/knowledge-store.ts（只消费）
- 不修改 src/l3/pkb-lifecycle.ts（独立模块）

## Q3: 验收 — 入口 → 交互 → 结果
入口: closeGoal()调用extractGoalKnowledge→writeGoalKnowledge
处理: classifyDeviation(6规则)→14字段知识条目→KnowledgeStore.insert
结果: PKB中新增一条goal_execution类型知识块

## 架构层: L4(knowledge-feedback消费KnowledgeStore) + L3(goal-lifecycle集成)

## Done 标准
[ ] extractGoalKnowledge: Goal关闭→14字段知识条目
[ ] classifyDeviation: 6条判定规则全覆盖
[ ] writeGoalKnowledge: 调用KnowledgeStore.insert写入PKB
[ ] checkBenchmarkThreshold: ≥3同类Goal→行业基准汇总
[ ] goal-lifecycle.ts: TODO替换为实际调用
[ ] 降级: KnowledgeStore插入失败→log.warn+不阻断Goal关闭
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=9测试: classify 6(6条规则各1) + extract 2(正常/异常) + benchmark 1(阈值触发)
