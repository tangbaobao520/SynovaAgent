# SynovaAgent — D75 轻量级再诊断引擎 实施方案 v1.0

> 2026-07-15 | 第13份权威文档（增长导航系统工程规范）第五章 §4
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

- D71: Goal引擎 ✅ — `getGoal/updateGoalStatus` 可用，Goal接口含 `ownerDeptId`
- D72: Proposal引擎 ✅ — `handleDispute` 可用（`proposal-engine.ts:257`）
- D73: 方案哨兵 ✅ — `createGoalSentinel` 返回Sentinel对象含 `check()` 方法
- D74: 工作台数据聚合 ✅
- 轻量级再诊断代码: **零存在** — 全部新建
- **审计发现**: Goal接口没有 `primaryDimension` 字段。维度推断使用 `ownerDeptId` → 部门→维度映射表。
- **审计发现**: `goalSentinelCheck` 不是导出函数——是 `createGoalSentinel` 内部的 async `check`。D75通过检查 SentinelRegistry 中方案哨兵的最近 `check` 结果来检测P0告警。
- 权威文档 §4完整定义: 1位专家 + 3-5边 + 5分钟超时 + 升级协议

---

## 做了什么

### 1. src/growth/lightweight-diagnosis.ts — 轻量级再诊断核心（新建）

```typescript
lightweightReDiagnosis(input: LightweightReDiagnosisInput): Promise<GoalAdjustmentProposal>
```

**硬约束**（权威文档§4.2）:
- maxExperts: 1
- causalEdges: 3-5条
- timeoutMs: 300_000（5分钟）
- contextStrategy: 'minimal'

**处理流程**:
1. 从goal-store获取Goal → 通过 `ownerDeptId` 推断维度: finance/marketing/org/tech/strategy（部门→维度映射表）
2. selectExpertForDimension(dimension) → 对应专家
3. selectRelevantCausalEdges(dimension, {min:3, max:5}) → 与该维度最相关的3-5条42边
4. 构建最小化上下文: {goal, recentFindings(3条哨兵Finding), disputeReason?, causalEdges}
5. 调用专家（5分钟超时→自动升级全量诊断）
6. determineAdjustmentType(expertResult) → adjust_target/abandon_goal/escalate_to_full

**维度推断映射表**（基于ownerDeptId，grep确认Goal接口含此字段）:
```typescript
function inferDimensionFromDept(ownerDeptId: string): string {
  const deptMap: Record<string, string> = {
    'finance': 'financial',
    'sales': 'market',
    'marketing': 'market',
    'hr': 'organizational',
    'engineering': 'technology',
    'operations': 'operational',
    'executive': 'strategic',
  };
  return deptMap[ownerDeptId.toLowerCase()] || 'organizational';
}
```

### 2. D73 goal-sentinel.ts 触发集成（修改）

方案哨兵的 `Sentinel.check()` 返回 `SentinelCheckResult.findings[]`。若findings中有severity='emergency'（三因子持续→P0升级）→ 自动调用 `lightweightReDiagnosis({goalId, triggeredBy:'p0_alert'})`。

**集成点**: 在 `createGoalSentinel` 的 check 函数内，`findings` 数组生成后，检测 `severity === 'emergency'` → 触发轻量级再诊断。

### 3. D72 proposal-engine.ts handleDispute 触发集成（修改）

`handleDispute`（`proposal-engine.ts:257`）返回 `{needsReDiagnosis, newStatus}`。当 `needsReDiagnosis === true` 时 → 调用 `lightweightReDiagnosis({goalId, disputeReason, triggeredBy:'dispute'})`。

---

## 不做什么

- 不实现全量诊断（已有引擎，只触发升级）
- 不修改专家提示词模板（消费D53+D58现有manifest.json）
- 不修改D74工作台
- 不新增 primaryDimension 字段到 Goal 接口（使用 ownerDeptId 推断）
- 不修改 goal-sentinel 的三因子偏离算法

---

## 架构层

L3（洞察层: 轻量级专家调度）+ L2（编排层: D73+D72触发集成）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | lightweight-diagnosis.ts | 3h | 核心引擎+超时+升级 |
| 2 | 维度推断+专家/边选择器 | 1h | inferDimensionFromDept+selectExpert |
| 3 | goal-sentinel集成 | 0.5h | emergency→触发 |
| 4 | proposal-engine handleDispute集成 | 0.5h | needsReDiagnosis→触发 |
| 5 | 测试文件 | 2h | tests/growth/lightweight-diagnosis.test.ts |

**总工时: 7h（1天）**

---

## 完成标准

```
[ ] lightweightReDiagnosis: 1专家+3-5边+5分钟超时硬约束
[ ] lightweightReDiagnosis: 超时→escalate_to_full_diagnosis
[ ] lightweightReDiagnosis: 专家返回失败→升级全量诊断
[ ] inferDimensionFromDept: ownerDeptId→5维度映射表
[ ] selectExpertForDimension: 5维度→5专家
[ ] selectRelevantCausalEdges: 每维度3-5条最相关42边
[ ] determineAdjustmentType: adjust_target/abandon_goal/escalate_to_full
[ ] D73集成: severity='emergency'→自动触发lightweightReDiagnosis
[ ] D72集成: handleDispute needsReDiagnosis=true→触发
[ ] Goal.reDiagnosisCount递增
[ ] same Goal ≥3次→自动升级全量诊断
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=12测试: lightweight 6(正常adjust/超时/专家失败/升级3次/异议触发/manual触发) + 选择器 3(维度推断/专家选择/边选择) + 集成 3(D73触发/D72触发/升级判定)
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范 第五章 §4
  - §4.2: LightweightReDiagnosisConfig/LightweightReDiagnosisInput/GoalAdjustmentProposal
  - §4.3: 5维度→5专家映射表
  - §4.4: lightweightReDiagnosis 完整伪代码
  - §5: 升级协议 — ≥3次/超时/超周期→全量诊断

- 代码接口验证:
  - `goal-store.ts`: `getGoal(goalId, store, graph)` 返回Goal（含ownerDeptId）
  - `proposal-engine.ts:257`: `handleDispute(...)` 返回 `{needsReDiagnosis, newStatus}`
  - `goal-sentinel.ts`: `createGoalSentinel` 返回Sentinel对象含 `check()` 方法