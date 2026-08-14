# SynovaAgent -- D226 Goal 生命周期端到端集成测试 实施方案 v1.0

> 2026-07-26 | 创建 Goal 全生命周期端到端集成测试
> Gates 8/9/10/11: 多个 PARTIAL -> PASS
> 此文档为 claude code 的唯一执行依据。

---

## 权威文档原文验证(铁律 0-3)

- [x] Test-Path `src/growth/goal-store.ts` -> 存在 (createGoal)
- [x] Test-Path `src/growth/goal-sentinel.ts` -> 存在 (三因子偏离模型)
- [x] Test-Path `src/growth/goal-sentinel-lifecycle.ts` -> 存在 (方案哨兵注册)
- [x] Test-Path `src/growth/lightweight-diagnosis.ts` -> 存在 (D75, 5分钟超时)
- [x] Test-Path `src/growth/goal-lifecycle.ts` -> 存在 (closeGoal + 6类偏差)
- [x] Test-Path `src/growth/proposal-engine.ts` -> 存在 (诊断->Goal提案)
- [x] Get-Content `goal-sentinel.ts:12` -> "同指标 2 周期持续->P0 告警"
- [x] Get-Content `lightweight-diagnosis.ts:10-13` -> maxExperts=1, causalEdges=3-5, timeoutMs=300000
- [x] Get-Content `goal-lifecycle.ts:125-128` -> closeGoal(goalId, outcome, actualMetrics) 完整签名

---

## 构建内容

### 1. 端到端集成测试: Goal 全生命周期

单文件: `tests/integration/goal-lifecycle.integration.test.ts`

测试流程覆盖:

```
1. 创建 Goal (createGoal)
   -> goal-store.ts: createGoal() 返回 goalId

2. Goal 追踪 (Gate 9)
   -> goal-sentinel.ts: 方案哨兵注册 -> 模拟采样数据
   -> 双因子偏离 -> P2 告警
   -> 同指标 2 周期持续 -> P0 告警

3. P0 再诊断 (Gate 10)
   -> P0 信号 -> lightweight-diagnosis.ts: triggerReDiagnosis()
   -> 验证 maxExperts=1, causalEdges 在 3-5 范围, timeoutMs=300000
   -> 验证升级协议: 同一 Goal >=3 次再诊断 -> escalate_to_full_diagnosis

4. Goal 关闭 (Gate 11)
   -> goal-lifecycle.ts: closeGoal(goalId, outcome, actualMetrics)
   -> 验证 actualMetrics vs goal.metrics 偏差比对
   -> 验证 6 类偏差分类器全部存在且可调用

5. 知识提取 (Gate 15 前置)
   -> closeGoal 后提取 GoalExecutionKnowledge
   -> 验证 14 字段知识条目结构
```

### 2. Goal 数据准备

- 使用内存 GraphStoreLike adapter (复用 SqliteGraphStore)
- Mock Goal 对象(至少含 title/deadline/ownerDeptId/2+ metrics)
- Mock 时间推进模拟多周期采样偏离(P0 阈值 = 2 周期持续)

---

## 不做什么

- 不修改任何 goal/growth 模块源码(只读调用)
- 不修改哨兵注册逻辑
- 不修改 lightweight-diagnosis 的硬约束参数
- 不新增 Goal 状态或转换规则

---

## 测试要求(依据权威文档 #6)

| 层 | 内容 | 覆盖 Gate | 数量 |
|----|------|----------|------|
| L2c | createGoal -> goalId + sentinel 注册 | Gate 8 | >=1 test |
| L2c | 双因子偏离(P2) -> 2周期持续(P0) | Gate 9 | >=1 test |
| L2c | P0 -> lightweight-diagnosis -> 升级协议 | Gate 10 | >=1 test |
| L2c | closeGoal -> 偏差比对 -> 6分类器 | Gate 11 | >=1 test |
| L2c | closeGoal -> extractGoalKnowledge -> 14字段 | Gate 15前置 | >=1 test |
| 总计 | >=5 tests, 每 test >=3 expect() | |

---

## 接线验证

```
[ ] grep -rn "goal-lifecycle.integration" tests/ -> 测试文件存在
[ ] 测试调用链不 mock 中间步骤(真实函数调用路径: createGoal -> getGoal -> closeGoal)
```

---

## 完成标准

```
[ ] tests/integration/goal-lifecycle.integration.test.ts 存在
[ ] Goal 创建 -> sentinel 注册 -> P2/P0 告警 -> 再诊断 -> 关闭 -> 知识提取 全链路通过
[ ] >=5 tests 通过
[ ] vitest --run --reporter=verbose 零失败
[ ] tsc --noEmit 零错误
[ ] 零 as any
```