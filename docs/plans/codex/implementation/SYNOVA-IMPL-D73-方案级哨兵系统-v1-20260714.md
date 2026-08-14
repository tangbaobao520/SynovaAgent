# SynovaAgent — D73 方案级哨兵系统 实施方案 v1.0

> 2026-07-14 | 第13份权威文档（增长导航系统工程规范）第三章
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

## 当前状态（2026-07-14 审计确认）

- D71: Goal存储+生命周期引擎 ✅
- D72: Proposal引擎+三选一确认 ✅
- D73可复用基建（grep验证过）:
  - `src/sentinel/types.ts:107`: `computeKind: 'aggregate'` 已存在
  - `src/sentinel/types.ts:17`: `SentinelCategory` 已有 `'growth'`
  - `D15a sentinel-loader.ts`: 支持独立命名空间 `goal-{goalId}-` 注册
  - `D38 PolicyEngine`: 权限检查可用
- 方案哨兵代码: **零存在** — 全部新建
- 权威文档第三章完整定义了方案哨兵的三因子偏离检测模型+基线建立+生命周期

---

## 做了什么

### 1. src/growth/goal-sentinel.ts — 方案哨兵核心（新建）

**registerGoalSentinel(goal, store, sentinelRegistry)**:
- 检查企业活跃方案哨兵上限（≤5个）
- 注册到 SentinelRegistry 独立命名空间 `goal-{goalId}-`
- cron: P0=每小时, 其他=每4小时
- computeKind: 'aggregate'（聚合三因子）

**goalSentinelCheck(context, goal)**:
三因子偏离检测模型:
```typescript
// 因子1: 阈值偏离 — 实际值 vs 目标值的百分比差异
const thresholdDeviation = Math.abs((actual - target) / target);
// 因子2: 趋势偏离 — 最近N个采样点的斜率 vs 预期斜率
const trendDeviation = Math.abs(actualSlope - expectedSlope);
// 因子3: 基线偏离 — 实际值 vs 基线值（基线建立期只采集不告警）
const baselineDeviation = Math.abs((actual - baseline) / baseline);
// 判定规则: 单因子→仅记录；双因子→告警；三因子→升级告警
```

**基线建立期**: Goal创建后2-4周，`baselineStatus: 'collecting'`。期间只采集不告警。采集≥2周数据后→`baselineStatus: 'active'`→启动偏离检测。

**偏离级别**:
- 单因子偏离 → 仅记录到Goal.log，不触发告警
- 双因子偏离 → P2告警（周汇总推送）
- 三因子偏离 → P1告警（周推1次）。同指标2周期持续→P0告警（即推+触发轻量级再诊断）

### 2. src/growth/goal-sentinel-lifecycle.ts — 方案哨兵生命周期（新建）

- `registerOnGoalActive(goalId)`: Goal转为active时自动注册方案哨兵
- `unregisterOnGoalClosed(goalId)`: Goal完成/废弃→注销哨兵→90天归档→物理删除
- `pauseOnGoalPaused(goalId)`: Goal暂停→暂停方案哨兵
- `resumeOnGoalResumed(goalId)`: Goal恢复→恢复方案哨兵

### 3. D71 goal-lifecycle.ts 集成（修改）

在 `transitionGoal()` 中增加钩子:
- `active` → 自动调用 `registerOnGoalActive(goalId)` 注册方案哨兵
- `completed/abandoned` → 自动调用 `unregisterOnGoalClosed(goalId)`

### 4. 测试文件

---

## 不做什么

- 不修改 SentinelRegistry 核心（只调用 register/unregister）
- 不修改 sentinel-loader.ts
- 不实现离线适应（§4.5，MVS阶段不做）
- 不实现 GoalManifest 文件持久化（后续D87术语字典统一处理）
- 不修改 D71 goal-store 核心（只在 lifecycle 层加钩子）

---

## 架构层

L3（洞察层: `src/growth/goal-sentinel.ts` + SentinelRegistry 集成）+ L4（本体层: Goal节点关联哨兵状态）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | goal-sentinel.ts | 2h | 注册+三因子偏离检测 |
| 2 | goal-sentinel-lifecycle.ts | 1h | 生命周期管理 |
| 3 | goal-lifecycle.ts 集成钩子 | 1h | transitionGoal增加哨兵注册/注销 |
| 4 | 测试文件 | 1.5h | 2个测试文件 |

**总工时: 5.5h（约1天）**

---

## 完成标准

```
[ ] goal-sentinel.ts: registerGoalSentinel — 命名空间goal-{goalId}-, 上限≤5检查
[ ] goal-sentinel.ts: goalSentinelCheck — 三因子(阈值/趋势/基线)×双因子告警规则
[ ] goal-sentinel.ts: 基线建立期 — 2-4周collecting→active
[ ] goal-sentinel.ts: 偏离级别 — 单因子记录/双因子P2/三因子P1→P0升级
[ ] goal-sentinel-lifecycle.ts: registerOnGoalActive/unregisterOnGoalClosed/pause/resume 4函数
[ ] goal-lifecycle.ts: transitionGoal中active→注册/closed→注销钩子
[ ] 消费D38 PolicyEngine权限检查
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=12测试: goal-sentinel 8(注册成功/上限拒绝/单因子记录/双因子P2/三因子P1/基线collecting/基线active/注销) + lifecycle 4(active注册/completed注销/暂停/恢复)
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范 第三章（方案级哨兵系统）
  - §1: 方案哨兵vs全局哨兵 — 粒度/触发/基线/告警/生命周期
  - §2: Manifest格式 — 4个方案专属字段
  - §3: 三因子偏离检测模型（阈值/趋势/基线）
  - §4: 基线建立等待期（2-4周）
  - §5: 生命周期（注册→基线→活跃→Goal关闭→90天归档）