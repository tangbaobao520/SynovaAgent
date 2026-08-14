# SynovaAgent — D71-FIX 审计问题修复 实施方案 v1.0

> 2026-07-14 | D71 逐行审计产出 | 4项问题修复
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

## 审计发现（2026-07-14 逐行审计确认）

来自对 `src/growth/` 4个文件的完整逐行审计。以下4个问题均在 D71 代码中确认。

### P1-1: createGoal 未写入审计日志

**位置**: `src/growth/goal-store.ts:102-107`
**现状**: `createGoal()` 调用 `store.createNode()` 后只写 `log.info`，不写入 AuditStore。
**影响**: Goal 的创建事件无审计轨迹。如果 Goal 创建后立即被废弃但审计缺失，无法追溯。
**权威文档**: 第一章 §8 — "每次状态变更必须写入 AuditStore"。createGoal 将 status 设为 'draft'，这是首次状态设置，应计为审计事件。

### P1-2: closeGoal 两次独立 store 操作无事务原子性

**位置**: `src/growth/goal-lifecycle.ts:147-167`
**现状**: closeGoal 先调用 `store.updateNode()` 更新 actualMetrics（L159），再调用 `updateGoalStatus()` 转状态为 completed（L167）。两次独立 store 操作——如果第一次成功但第二次失败，数据不一致。
**影响**: GraphStore 中 Goal 的 metrics 已变为闭环数据但状态仍为 'active'，status 和 metrics 脱节。
**权威文档**: 第一章 §3.4 — "闭环验证机制：Goal关闭时自动检查关联诊断指标"。原子性是闭环验证的前提。

### P2-1: 零 src/ 调用方

**位置**: 整个 `src/growth/` 目录
**现状**: D71 的 4 个源文件在 `src/` 中无任何 import。D71 是基础类型+存储层，消费方为 D72（Proposal引擎）和 D77（主Agent集成）。
**影响**: 无运行时影响。但 pre-commit 组5（新export有调用方）会拒绝 commit。
**处置**: 在 goal-types.ts 文件头部添加 `@wire-target` 注释声明消费方。不修改 pre-commit 门禁（这是物理阻断，必须在代码中有实际引用或豁免声明）。

### P3-1: updateGoalStatus 审计写入是 fire-and-forget

**位置**: `src/growth/goal-store.ts:192-198`
**现状**: 审计日志写入使用 `.catch()` 静默降级。进程在这之前崩溃→审计丢失。
**影响**: D41（AuditStore）采用相同模式。属已知设计权衡——审计日志不应阻塞业务操作。
**处置**: 不修改。添加 JSDoc 说明此设计决策。符合铁律24+31。

---

## 修复方案

### 修复 P1-1: createGoal 增加审计日志

在 `createGoal` 的 `store.createNode()` 成功后、`return goalId` 之前增加:
```typescript
// 写入创建审计日志（fire-and-forget，失败不阻断）
audit.write({
  orgId: goal.orgId,
  actorId: `system:goal-store`,
  actorRole: 'system',
  action: 'goal.created',
  targetType: 'GOAL',
  targetId: goalId,
  newValue: JSON.stringify({ title: goal.title, ownerDeptId: goal.ownerDeptId }),
}).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  log.warn({ err: msg, goalId }, 'Goal creation audit log write failed');
});
```

**函数签名变更**: `createGoal(goal, store, graph?)` → `createGoal(goal, store, audit, graph?)`
新增参数 `audit: AuditStoreLike`。

### 修复 P1-2: closeGoal 合并为单次 store + audit 操作

将 L147-167 的两步操作合并。不再先 updateNode 再 updateGoalStatus。改为在 updateGoalStatus 中扩展支持附带属性更新。

**方案**: 修改 `updateGoalStatus` 函数，接受可选的 `extraProps` 参数:
```typescript
function updateGoalStatus(
  goalId: string,
  newStatus: GoalStatus,
  store: GraphBridgeLike,
  audit: AuditStoreLike,
  graph: string = 'growth',
  extraProps?: Partial<Goal>,  // NEW: 同时更新的额外属性
): void
```

closeGoal 改为:
```typescript
updateGoalStatus(goalId, 'completed', store, audit, 'growth', {
  metrics: actualMetrics,
  actualDurationDays: actualDays,
});
```

一次 store.updateNode + 一次 audit.write。原子性保证。

### 修复 P2-1: 添加 @wire-target 注释

在 `src/growth/goal-types.ts` 文件头部添加:
```typescript
/**
 * @wire-target — D72 (Proposal引擎) 消费 Goal 类型定义
 * @wire-target — D77 (主Agent集成) 消费 StandardExpertReport→Goal 映射
 * @wire-target — D73 (方案哨兵) 消费 Goal.goalId 注册方案哨兵
 */
```

### 修复 P3-1: 保持现状，添加设计说明 JSDoc

在 `updateGoalStatus` 的审计写入 `.catch()` 上添加:
```typescript
// 设计决策: 审计日志使用 fire-and-forget 模式。
// 审计写入失败不应阻塞 Goal 状态变更（铁律31降级传播）。
// 进程崩溃导致审计丢失是可接受风险——状态变更本身已持久化到 GraphStore。
```

---

## 文件变更清单

| 文件 | 变更 | 行数估算 |
|------|------|---------|
| src/growth/goal-store.ts | P1-1: createGoal 增加 audit 参数 + 审计写入 | +12 |
| src/growth/goal-store.ts | P1-2: updateGoalStatus 扩展 extraProps 参数 | +8 |
| src/growth/goal-lifecycle.ts | P1-2: closeGoal 改用单次 updateGoalStatus + extraProps | -13 / +5 |
| src/growth/goal-types.ts | P2-1: 文件头 @wire-target 注释 | +4 |
| src/growth/goal-store.ts | P3-1: JSDoc 设计说明 | +3 |
| src/growth/goal-lifecycle.ts | transitionGoal: createGoal 新签名适配 | +1 |

**仅修改 src/growth/ 下文件。不改测试文件（测试覆盖不变，但需确认31测试全通过）。**

---

## 不做什么

- 不修改测试文件（现有31测试已在修补后重新验证）
- 不修改 pre-commit 门禁
- 不修改 D41 AuditStore
- 不修改 D77 消费逻辑
- 不创建新文件

---

## 架构层

L4（本体层: `src/growth/goal-store.ts` + `goal-lifecycle.ts` — 存储原子性修正）

---

## 完成标准

```
[ ] P1-1: createGoal 函数签名变更为 (goal, store, audit, graph?)，新增审计写入
[ ] P1-2: updateGoalStatus 接受可选 extraProps，closeGoal 改为单次调用
[ ] P1-2: closeGoal 不再两次独立 store 操作，原子性保证
[ ] P2-1: goal-types.ts 文件头部声明 @wire-target (D72/D77/D73)
[ ] P3-1: updateGoalStatus 审计 .catch 上方添加设计决策 JSDoc
[ ] createGoal 审计写入降级: catch → log.warn，不阻断创建
[ ] 零新增 import（复用现有 AuditStoreLike/Goal 类型）
[ ] 零 as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run tests/growth/ 31测试全部通过（签名变更后）
[ ] transitionGoal 调用 createGoal 适配新签名（如果有调用createGoal的地方）
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范
  - 第一章 §3.4: 闭环验证机制 — "完成不等于有效"
  - 第一章 §8: PolicyEngine(D38)集成 — "每次状态变更写入 AuditStore"
  - 铁律 24: catch + log + degraded
  - 铁律 31: 降级信号传播