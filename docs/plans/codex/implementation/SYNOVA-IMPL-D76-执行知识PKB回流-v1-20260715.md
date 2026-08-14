# SynovaAgent — D76 执行知识+PKB回流 实施方案 v1.0

> 2026-07-15 | 第13份权威文档（增长导航系统工程规范）第五章 §6
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38）
4. 测试覆盖: 测试有 expect() 断言？（铁律 48）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-15 审计确认）

- D71: Goal引擎 ✅ — `goal-lifecycle.ts:173` 已有 `// TODO(D76): extractGoalKnowledge`
- D73: 方案哨兵 ✅
- D75: 轻量级再诊断 ✅
- 可复用（grep验证过的真实接口）:
  - `src/l4/knowledge-store.ts:145` — `KnowledgeStore.insert(chunk)` 写入知识块
  - `src/l4/knowledge-store.ts:48` — `KnowledgeStore` 类含完整的 CRUD+搜索+衰减
  - `src/l3/pkb-lifecycle.ts` — `autoSediment()` 自动沉淀诊断结果
- 知识回流代码: **零存在** — D76是closeGoal中TODO的实现
- 权威文档 §6: GoalExecutionKnowledge(14字段) + DeviationClassifier(6类) + MEDeviationPattern + checkBenchmarkThreshold

---

## 做了什么

### 1. src/growth/knowledge-feedback.ts — Goal→知识提取（新建）

**extractGoalKnowledge(goal, outcome, metricComparisons, industry?): GoalExecutionKnowledge**
Goal关闭时自动提取执行知识条目:
- 偏差分类: 基于6条判定规则自动分类
- 提取指标基线→目标→最终值的完整链
- 生成lessons: 基于deviationClassifier自动生成建议

**classifyDeviation(goal, metricComparisons, industryBaseline?): DeviationClassifier**
6条分类规则（权威文档§6.2）:
1. deviation<0且无同行业哨兵异常 → execution_failure
2. deviation<0且行业基准也下降 → market_change
3. deviation<0且baseline阶段已预警 → target_too_high
4. deviation>+30%持续2周期 → target_too_low
5. 单次偏离>50% → external_shock
6. compute contract多次degraded → measurement_error

### 2. src/growth/knowledge-feedback.ts — 写入PKB（新建）

**writeGoalKnowledge(knowledge, knowledgeStore: KnowledgeStore): string**
调用 `knowledgeStore.insert()` 将GoalExecutionKnowledge写入PKB。
降级: store插入失败→log.warn+不阻断Goal关闭。

### 3. src/growth/knowledge-feedback.ts — 行业基准汇总（新建）

**checkBenchmarkThreshold(dimension, classifier, industry, knowledgeStore)**
当同一维度+同一偏差分类器+同行业的Goal数量≥3时，自动生成行业基准汇总。

### 4. D71 goal-lifecycle.ts closeGoal集成（修改）

移除 `// TODO(D76)`，改为:
```typescript
const knowledge = extractGoalKnowledge(goal, outcome, metricComparisons);
const store = new KnowledgeStore(db);
writeGoalKnowledge(knowledge, store);
```

---

## 不做什么

- 不修改 pkb-lifecycle.ts（D76是独立模块，只消费KnowledgeStore）
- 不修改 PKB DDL
- 不实现跨企业联邦聚合

---

## 架构层

L4（本体层: 消费 `KnowledgeStore.insert`）+ L3（洞察层: `knowledge-feedback.ts`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | knowledge-feedback.ts | 2h | extractGoalKnowledge+classifyDeviation+checkBenchmarkThreshold |
| 2 | goal-lifecycle.ts集成 | 0.5h | 替换TODO |
| 3 | 测试文件 | 1h | tests/growth/knowledge-feedback.test.ts |

**总工时: 3.5h（半天）**

---

## 完成标准

```
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
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范 第五章 §6（导航→学习循环回流）
  - §6.1: GoalExecutionKnowledge 14字段接口
  - §6.2: 6条偏差分类规则
  - §6.3: MEDeviationPattern — ME偏差模式库
  - §6.4: checkBenchmarkThreshold — 行业基准汇总触发

- 代码接口验证:
  - `src/l4/knowledge-store.ts:145` — `KnowledgeStore.insert(chunk): string`
  - `src/growth/goal-lifecycle.ts:173` — `// TODO(D76): extractGoalKnowledge`