# SynovaAgent — D71 Goal存储+生命周期引擎 实施方案 v1.0

> 2026-07-14 | 第13份权威文档（增长导航系统工程规范）第一章
> 执行标准: Anthropic 工程纪律 · 铁律 0-2 (spec→test→impl→wire) · 五层架构 · 垂直切片
> **此文档为 claude code 的唯一执行依据。不依赖任何其他文档或口头记忆。**

---

## 执行约束（每次提交前必须回答的 5 问）

```
1. 接线检查: 新 export 谁调用？（grep 确认调用方存在，不是"我相信会有人调"）
2. 异常处理: 每个 catch 有 log + degraded？（铁律 24+31）
3. 类型安全: as any = 0？（铁律 38 — pre-commit 硬阻断）
4. 测试覆盖: 测试有 expect() 断言？（不是空壳）
5. 残留清理: 有死代码吗？旧文件删了？旧函数还有引用？
```

---

## 当前状态（2026-07-14 审计确认）

- 分支: `feat/prompt-architecture`
- `src/growth/` 目录: **不存在** — 增长导航全部代码需新建
- 可复用基建（全部grep验证过接口真实存在）:
  - GraphBridge.createNode: `src/l4/graph-bridge.ts:32` — `createNode(type: string, props: Record<string,unknown>, graph: string): string`，支持任意type
  - PolicyEngine: `src/security/policy-engine.ts:17` — `StandardOperations` 10条SOI常量
  - AuditStore: `src/l4/audit-store.ts` — D41产出，支持 `log()` 写入
  - SentinelRegistry: `src/sentinel/types.ts:107` — `computeKind: 'aggregate'` 已支持
  - Manifest加载模式: D53/D65已建立文件驱动模式，Goal可对标
- 不可复用的旧代码（不改动）:
  - `src/sentinel/adapters/goal-alignment-sentinel.ts` — 旧的SOG-based哨兵（@deprecated）
  - `src/agent/workspace-service.ts` — 旧的子工作区逻辑（D74/D75替换）
- `actionRecommendations` 在 `packages/engine-core/src/pipeline/diagnosis/types.ts` 中为 `string[]`，D71不修改此文件（修改属于D77集成任务）

---

## 做了什么

### 1. src/growth/goal-types.ts — Goal 28字段TypeScript接口（新建）

权威文档第一章 §3.1 完整28字段接口。契约优先——JSDoc定义输入/输出/降级。

```typescript
interface Goal {
  goalId: string;
  orgId: string;
  proposalId: string;          // 来源Proposal ID (D72)
  diagnosisId: string;         // 来源诊断报告 ID
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
  status: GoalStatus;
  ownerDeptId: string;         // 负责部门
  assignedTo?: string;         // 负责人
  createdAt: string;
  deadline: string;            // ISO-8601
  metrics: GoalMetric[];       // 绑定的可量化指标
  successCriteria: SuccessCriterion[];  // 完成条件清单
  dependsOn: string[];         // 依赖的其他Goal ID
  conflictsWith: string[];     // 冲突的其他Goal ID
  reDiagnosisCount: number;    // 轻量级再诊断次数
  createdBy: { role: string; departmentId?: string };
  lastModifiedAt: string;
  plannedDurationDays: number;
  actualDurationDays?: number;
  rootCause?: string;          // 从诊断报告继承
  tags?: string[];
  props?: Record<string, unknown>;
}

type GoalStatus = 'draft' | 'pending_ga' | 'active' | 'completed' | 'abandoned' | 'paused' | 'archived';

interface GoalMetric {
  metricName: string;
  currentValue: number;
  targetValue: number;
  unit: string;
  computeContractId: string;   // 如 'COMPUTE-BREAK-EVEN-v1'
  baselinePeriod?: { start: string; end: string };
}

interface SuccessCriterion {
  criterion: string;
  verificationMethod: 'metric_threshold' | 'manual_review' | 'external_audit';
  verified: boolean;
  verifiedAt?: string;
}
```

### 2. src/growth/goal-store.ts — Goal持久化存储（新建）

基于GraphStore的 `GOAL` 类型节点存储。复用 `src/l4/graph-bridge.ts:119` 的 `createNode(type, props, graph)`。

```typescript
// 核心函数签名
function createGoal(goal: Goal, store: GraphBridgeLike): string  // 返回 goalId
function getGoal(goalId: string, store: GraphBridgeLike): Goal | null
function listGoalsByDept(deptId: string, store: GraphBridgeLike): Goal[]
function listGoalsByOrg(orgId: string, store: GraphBridgeLike): Goal[]
function updateGoalStatus(goalId: string, newStatus: GoalStatus, store: GraphBridgeLike, audit: AuditStoreLike): void
function getActiveGoalCount(orgId: string, store: GraphBridgeLike): number
```

**17条状态转换前置条件（完整清单，来自权威文档 §3.2）:**
1. `draft → pending_ga`: 28字段中 title/deadline/ownerDeptId ≥1 metric 非空
2. `pending_ga → active`: GA确认标记
3. `pending_ga → draft`: GA驳回，返回修改
4. `active → paused`: 中层或GA暂停
5. `paused → active`: 恢复执行
6. `active → completed`: 所有 SuccessCriterion.verified === true
7. `completed → archived`: 30天自动归档
8. `active → abandoned`: 仅GA权限 + 废弃原因非空
9. `abandoned → archived`: 30天自动归档
10. `draft → abandoned`: 创建者可在确认前废弃
11. `pending_ga → abandoned`: GA拒绝并废弃
12. `active → active`: 仅更新metrics（非状态变更）
13. `completed → active`: 不允许（闭环后不可重启）
14. `abandoned → *`: 不允许（废弃不可逆）
15. `archived → *`: 不允许（归档后只读）
16. `paused → abandoned`: 暂停超过90天自动废弃
17. `* → *`: 任何未列出的转换均拒绝

**每次状态变更必须:**
- 验证转换合法性（17条规则）
- 写入 AuditStore: `{goalId, from, to, actor, timestamp}`
- 级联检查: `dependsOn` 中的Goal若被废弃，当前Goal标记受影响

### 3. src/growth/goal-conflict-detector.ts — 冲突检测器（新建）

- `detectConflicts(goal, existingGoals: Goal[])`: 检查维度冲突（同一部门内两个Goal涉及同一metric但方向相反）
- `detectCascadeImpact(goalId: string, store: GraphBridgeLike)`: Goal被废弃后，检测所有 `dependsOn` 包含此Goal的兄弟Goal
- `resolveConflict(goalA: string, goalB: string, resolution: 'merge' | 'prioritize_a' | 'prioritize_b' | 'parallel')`: 记录冲突解决

### 4. src/growth/goal-lifecycle.ts — Goal生命周期管理（新建）

封装完整的7态状态机 + PolicyEngine权限:
```typescript
function transitionGoal(goalId: string, to: GoalStatus, actor: {role: string; departmentId?: string}, store: GraphBridgeLike, audit: AuditStoreLike, policy: PolicyEngineLike): void
function closeGoal(goalId: string, outcome: 'achieved' | 'partially_achieved' | 'not_achieved', actualMetrics: GoalMetric[], store: GraphBridgeLike, audit: AuditStoreLike): void
function archiveGoal(goalId: string, store: GraphBridgeLike, audit: AuditStoreLike): void
```

**closeGoal闭环验证逻辑:**
1. 比对 actualMetrics vs targetValues
2. 判断 outcome (achieved/partially_achieved/not_achieved)
3. 关联诊断指标再检查（如果原diagnosisId对应的报告指标变化>20%，标记）
4. 调用 D76 知识提取接口（`extractGoalKnowledge` — 预留，依赖D76）

### 5. StandardExpertReport → Goal 字段映射（供D77集成使用）

权威文档第五章 §2.1 映射表:
| StandardExpertReport 字段 | Goal 字段 | 规则 |
|--------------------------|----------|------|
| diagnosisId | diagnosisId | 直接复制 |
| actionRecommendations[selected].description | title | 提取前30字符 |
| actionRecommendations[selected].estimatedCost.timeline | deadline | ISO-8601 |
| actionRecommendations[selected].riskLevel | priority | high→P0, medium→P1, low→P2 |
| actionRecommendations[selected].expectedImpact | metrics[] | 每个受影响维度创建一个GoalMetric |
| crossExpertContradictions | conflictsWith | 同部门内维度冲突 → Goal冲突标记 |
| hypotheses[rootCause] | rootCause | 置信度最高的根因 |

---

## 不做什么

- 不创建 Proposal 引擎 — D72
- 不创建方案哨兵 — D73
- 不创建工作台聚合器 — D74
- 不创建轻量级再诊断 — D75
- 不创建知识回流提取器 — D76
- 不实现 StandardExpertReport → Goal 自动转换 — D77（本任务只定义映射表+类型）
- 不修改 `src/sentinel/adapters/goal-alignment-sentinel.ts`（@deprecated，不动）
- 不修改 `src/agent/workspace-service.ts`（旧代码，D74替换）
- 不修改 `packages/engine-core/` 下任何文件

---

## 架构层

L4（本体层: `src/growth/goal-types.ts` + `goal-store.ts`）+ L2（编排层: lifecycle调用PolicyEngine，D72/D77消费）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | goal-types.ts | 2h | 4接口 + 7态枚举 + StandardExpertReport→Goal映射表 |
| 2 | goal-store.ts | 3h | 6函数 + 17条状态转换规则 + GraphStore集成 |
| 3 | goal-conflict-detector.ts | 2h | 3函数：冲突/级联/解决 |
| 4 | goal-lifecycle.ts | 2h | 3函数：transition/close/archive + PolicyEngine |
| 5 | 测试文件 | 2h | 4个测试文件 |

**总工时: 11h（约1.5工作日）**

---

## 完成标准

```
[ ] goal-types.ts: Goal 28字段 + GoalStatus 7态 + GoalMetric + SuccessCriterion，全部JSDoc @contract
[ ] goal-types.ts: 与权威文档第一章 §3.1 Goal接口定义对齐（字段名+类型+可选性）
[ ] goal-types.ts: 含 StandardExpertReport→Goal 字段映射注释（供D77使用）
[ ] goal-store.ts: createGoal/getGoal/listByDept/listByOrg/updateGoalStatus/getActiveGoalCount 6函数全部实现
[ ] goal-store.ts: 17条状态转换规则全部在 updateGoalStatus 中验证，非法转换 throw Error
[ ] goal-store.ts: 每次状态变更写入 AuditStore（复用D41 audit-store.log）
[ ] goal-store.ts: createGoal 调用 GraphBridge.createNode(type='GOAL', props)，验证接口对齐
[ ] goal-conflict-detector.ts: detectConflicts/detectCascadeImpact/resolveConflict 3函数
[ ] goal-lifecycle.ts: transitionGoal调用PolicyEngine.evaluate() 权限检查（复用D38）
[ ] goal-lifecycle.ts: closeGoal 完成闭环验证逻辑（比对actualMetrics vs targets）
[ ] goal-lifecycle.ts: archiveGoal (completed/abandoned后30天可归档)
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=20测试: goal-store 8(创建/查询/列/更新/17条中5条核心转换/非法/上限/审计写入) + conflict-detector 6(冲突维度/无冲突/级联/依赖/解决/边界) + lifecycle 6(7态/关闭闭环/归档/权限拒绝/GA允许/闭环验证)
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范
  - 研究方案 §3: 导航循环6个介入节点（节点1=目标设定，本任务实现）
  - 第一章 §3.1: Goal 28字段TypeScript接口定义
  - 第一章 §3.2: GoalStatus 7态状态机 + 17条转换规则完整清单
  - 第一章 §3.3: successCriteria/metrics/measurement/dependsOn/conflictsWith 完整定义
  - 第一章 §3.4: 闭环验证机制 — closeGoal 逻辑
  - 第五章 §2.1: StandardExpertReport → Proposal → Goal 字段级映射
  - 第五章 §8.1: Goal操作权限矩阵 (PolicyEngine集成)

- 代码依赖（grep验证过的真实接口）:
  - `src/l4/graph-bridge.ts:32` — `createNode(type: string, props: Record<string,unknown>, graph: string): string`
  - `src/security/policy-engine.ts:17` — `StandardOperations` 10条SOI常量
  - `src/l4/audit-store.ts` — D41产出，`log(entry)` 审计写入