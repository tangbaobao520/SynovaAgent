<!-- SYNOVA-IMPL-D254 v2.0 | 2026-07-28 | #05 M5 Action效果验证 -->
# SynovaAgent -- D254 Action 效果验证 v2.0
> v1.0 错误: `goal.source?.diagnosisReportId` 不存在——Goal 类型字段为 `diagnosisId`
> v2.0 修正: 使用实际 Goal 接口字段 `diagnosisId / proposalId`

## 代码验证
- goal-types.ts L91-138: Goal 接口——`diagnosisId: string`, `proposalId: string`, `metrics: GoalMetric[]` ✅
- Goal 无 `source` 嵌套对象 ❌ (v1.0 错误)
- goal-lifecycle.ts L125-150: `closeGoal()` 比对 actualMetrics vs targetMetrics ✅
- goal-lifecycle.ts: 无 verifyEffect 调用 ❌

## Q0-Q4
Q0: closeGoal 追踪"Goal目标是否达标", 缺失"触发Goal的原始问题是否改善"。需回溯 diagnosisId→原始哨兵 Finding→edge 参数对比。
Q2: 做——closeGoal 追加 verifyEffect: goal.diagnosisId→诊断报告→matchedEdgeIds→GraphStore.getEdgeParam(当前值) vs baseline→improved/worsened/unchanged→写入 knowledge-feedback。不做——GA纠错闭环(D239+D243已覆盖)。
Q3: Goal关闭→verifyEffect→读 edge 参数当前值→对比基线→EffectReport→knowledge-feedback→下次诊断注入硬约束
Q4: L1×3 mock测试

## 改动 (~50行, 纯后端)

### 1. src/growth/goal-lifecycle.ts — closeGoal 追加 verifyEffect (~30行)
L150 之后追加:
```typescript
const effectReport = await verifyEffect(goal, store);
```

新增函数:
```typescript
async function verifyEffect(goal: Goal, store: GraphBridgeLike): Promise<EffectReport> {
  if (!goal.diagnosisId) return { status: 'unknown', reason: '无关联诊断报告' };
  const diagnosis = store.getNode(goal.diagnosisId, 'default') as { props?: Record<string,unknown> } | null;
  const edgeIds = diagnosis?.props?.matchedEdgeIds as string[] | undefined;
  if (!edgeIds?.length) return { status: 'unknown', reason: '诊断报告无edge引用' };
  const edgeId = edgeIds[0];
  const baseline = diagnosis?.props?.baselineValues?.[edgeId] as number | undefined;
  const current = store.getEdgeParam(edgeId, 'weight'); // 当前边权重
  if (baseline == null || current == null) return { status: 'unknown', reason: '无法获取对比数据' };
  const delta = current - baseline; const pct = Math.round(delta / baseline * 100);
  const status = pct > 10 ? 'improved' : pct < -10 ? 'worsened' : 'unchanged';
  return { status, before: baseline, after: current, deltaPct: pct, edgeId, verifiedAt: new Date().toISOString() };
}
```

### 2. src/growth/knowledge-feedback.ts — 写入 EffectReport (~10行)
`writeEffectReport(report)` → agent_memory (type: 'effect_verification')

## 测试 (L1×3)
| # | 测试 |
|---|------|
| 1 | closeGoal→verifyEffect→improved (delta > 10%) |
| 2 | closeGoal→verifyEffect→worsened (delta < -10%) |
| 3 | 无 diagnosisId→unknown |

## 完成标准
Goal关闭时自动输出 EffectReport。3 tests。tsc零新增。as any=0。
