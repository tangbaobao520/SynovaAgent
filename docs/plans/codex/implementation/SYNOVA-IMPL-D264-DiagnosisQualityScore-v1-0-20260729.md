<!-- SYNOVA-IMPL-D264 v1.0 | 2026-07-29 | 权威17 §四 Phase 0 -->
# SynovaAgent -- D264 诊断质量评分字段 v1.0
> 权威17 工程规格 §四.3: knowledge-feedback.ts GoalExecutionKnowledge 增加 diagnosisQualityScore

## 代码验证
- src/growth/knowledge-feedback.ts: 存在 ✅
- GoalExecutionKnowledge 接口: 无 diagnosisQualityScore 字段 ❌

## Q0-Q4
Q0: product-health.py 的"诊断质量"维度需要读取 GoalExecutionKnowledge.diagnosisQualityScore。当前接口缺失。
Q2: 做——GoalExecutionKnowledge 新增 `diagnosisQualityScore?: number`，writeGoalKnowledge 写入时自动计算。
Q3: product-health.py 读取 → >=0.7 healthy, 0.7>degraded>0.4, <=0.4 critical

## 改动 (knowledge-feedback.ts, ~10行)

### src/growth/knowledge-feedback.ts
```typescript
export interface GoalExecutionKnowledge {
  // ... existing fields
  diagnosisQualityScore?: number;  // 0.0-1.0, 诊断报告的用户反馈评分
}
```
writeGoalKnowledge 内赋值: `diagnosisQualityScore = knowledge.confidence * 0.7 + (outcome === 'achieved' ? 0.3 : 0)`

## 测试 (L1×2)
| # | 测试 |
|---|------|
| 1 | diagnosisQualityScore 持久化+读取 |
| 2 | 默认值 = undefined → product-health 处理为 degraded |

## 完成标准
diagnosisQualityScore 字段可用。tsc零新增, as any=0。
