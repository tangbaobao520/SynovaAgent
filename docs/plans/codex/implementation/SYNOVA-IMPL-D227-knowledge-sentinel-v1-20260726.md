# SynovaAgent -- D227 知识累积 + 哨兵注册 实施方案 v1.0

> 2026-07-26 | 知识回流端到端验证 + 哨兵注册运行时修复
> Gate 15: PARTIAL -> PASS | Gate 4: PARTIAL -> PASS
> 此文档为 claude code 的唯一执行依据。

---

## 权威文档原文验证(铁律 0-3)

- [x] Test-Path `src/growth/knowledge-feedback.ts` -> 存在 (extractGoalKnowledge)
- [x] Test-Path `src/l4/knowledge-store.ts` -> 存在 (知识插入方法)
- [x] Test-Path `src/sentinel/sentinel-runner.ts` -> 存在 (runSentinelForTeam)
- [x] Test-Path `src/sentinel/registry.ts` -> 存在 (SentinelRegistry)
- [x] Get-Content `knowledge-feedback.ts:18` -> "closeGoal -> extractGoalKnowledge -> classifyDeviation"
- [x] Get-Content `knowledge-feedback.ts:36-42` -> DeviationClassifier 6 类
- [x] Get-Content `goal-lifecycle.ts:142-159` -> closeGoal 调用 extractGoalKnowledge
- [x] Select-String `synova-agent.ts` -> SentinelRunner 实例化 + start 存在

---

## 当前问题

### Gate 15: 知识积累端到端未验证

`knowledge-feedback.ts` 定义了完整的知识提取流程(extractGoalKnowledge -> classifyDeviation -> KnowledgeStore.insert)，但未通过端到端集��测试验证。goal-lifecycle.ts:142-159 的 closeGoal 已调用 extractGoalKnowledge，但调用链未被测试覆盖。

### Gate 4: 哨兵注册记录 <= 1

check-gates-v2.py 检查哨兵注册记录数量。D224 wired SentinelRunner 到 synova-agent.ts，但 `registry.ts` 中注册的哨兵数量可能不足 3 个。需要确认:
- builtins.ts: registerBuiltinSentinels() 注册了多少哨兵
- synova-agent.ts:79-80 调用时机是否正确

---

## 构建内容

### 1. 知识回流端到端测试 (Gate 15)

单文件: `tests/integration/knowledge-feedback.integration.test.ts`

测试流程:
```
Goal 关闭
  -> goal-lifecycle.ts: closeGoal()
  -> knowledge-feedback.ts: extractGoalKnowledge()
     -> classifyDeviation() 返回 6 类之一
     -> GoalExecutionKnowledge (14 字段)
  -> KnowledgeStore.insert() 写入 PKB
  -> 验证: 后续查询该知识条目存在
```

### 2. 哨兵注册计数修复 (Gate 4)

检查 `src/sentinel/builtins.ts` 中 registerBuiltinSentinels 注册的哨兵数量:
- 如果 >=3 -> 确认 check-gates-v2.py 的检查逻辑正确
- 如果 <3 -> 在 synova-agent.ts 中注册更多内置哨兵(如 goal-alignment-sentinel)

验证 `src/sentinel/registry.ts` 的 listSentinelIds() 或 listAll() 返回 >=3 个已注册哨兵。

---

## 不做什么

- 不修改 knowledge-feedback.ts 的提取逻辑
- 不修改 knowledge-store.ts 的存储逻辑
- 不修改 sentinel 哨兵检测逻辑
- 不新增哨兵类型(仅注册已有哨兵)

---

## 测试要求(依据权威文档 #6)

| 层 | 内容 | 覆盖 Gate | 数量 |
|----|------|----------|------|
| L2c | closeGoal -> extractGoalKnowledge -> 6 类偏差 | Gate 15 | >=1 test |
| L2c | KnowledgeStore.insert -> 查询验证 | Gate 15 | >=1 test |
| L2c | GoalExecutionKnowledge 14 字段完整性 | Gate 15 | >=1 test |
| L1 | sentinel/registry.ts listAll() 返回 >=3 | Gate 4 | >=1 test |
| 总计 | >=4 tests, 每 test >=3 expect() | |

---

## 接线验证

```
[ ] grep "registerBuiltinSentinels" synova-agent.ts -> 调用存在
[ ] grep "SentinelRegistry" sentinel/registry.ts -> listAll 或 getCount 方法可查询注册数量
[ ] knowledge-feedback.test 中 extractGoalKnowledge 调用真实链路(不 mock closeGoal 内部)
```

---

## 完成标准

```
[ ] tests/integration/knowledge-feedback.integration.test.ts 存在
[ ] closeGoal -> extractGoalKnowledge -> KnowledgeStore.insert 全链路通过
[ ] GoalExecutionKnowledge 14 字段完整
[ ] registerBuiltinSentinels 注册 >=3 个哨兵
[ ] >=4 tests 通过
[ ] tsc --noEmit 零错误
[ ] 零 as any
```