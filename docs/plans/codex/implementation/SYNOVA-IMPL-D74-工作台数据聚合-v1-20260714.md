# SynovaAgent — D74 工作台数据聚合 实施方案 v1.0

> 2026-07-14 | 第13份权威文档（增长导航系统工程规范）第四章
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

- D71: Goal引擎 ✅
- D72: Proposal引擎 ✅  
- D73: 方案哨兵 ✅
- D74可复用基建（grep验证）:
  - `src/growth/goal-types.ts` — Goal接口
  - `src/growth/proposal-types.ts` — Proposal接口  
  - `src/growth/goal-sentinel.ts` — 方案哨兵偏离检测
  - `D38 PolicyEngine` — 权限检查
- 工作台数据聚合代码: **零存在** — 全部新建

**⚠️ 双轨代码问题（审计发现）:**
- `src/agent/workspace-service.ts` — PRD v1.6产物，旧子工作区创建逻辑，与D74的DepartmentWorkspace完全不同的概念（旧的是"子工作区"，新的是"中层工作台数据聚合"）。**D74不修改此文件**——后续D77系统集成时统一标记@deprecated。
- `src/routes/department-workspace.ts` — 旧HTML渲染的部门工作台页面。**D74不修改此文件**——D74新建API数据端点，旧HTML页面D77替换。
- `src/agent/workspace-context-bridge.ts` — 旧的工作区上下文桥接。**D74不修改此文件**——新旧不冲突，D74的新workplace-builder消费GraphStore+Goal+Proposal+Sentinel，旧的是从AgentMemory查事实。
- 双轨处理方案：D74新建 `src/growth/workspace-builder.ts` + `src/growth/next-action-engine.ts` + `src/growth/dnd-engine.ts`。旧的3个文件保留不动，D77统一标记@deprecated并替换路由。

---

## 做了什么

### 1. src/growth/workspace-types.ts — DepartmentWorkspace完整TypeScript接口（新建）

权威文档第四章 §2完整接口定义。每个字段标注精确数据来源路径。

核心接口:
- `DepartmentWorkspace`: departmentId/name/activeGoals[]/recentAlerts[]/pendingProposals[]/diagnosticsReferenced[]/nextAction/degraded/degradedModules[]
- `ActiveGoal`: goalId/title/deviationStatus/priority/deadline/progressPercent/owner/方案哨兵状态
- `WorkspaceAlert`: alertId/severity/sourceSentinel/sourceGoal/timestamp/message/dismissed
- `PendingProposal`: proposalId/title/department/expiresAt/status/selectedPathIndex
- `DiagnosticReference`: reportId/summary/generatedAt/relevantFindings
- `NextAction`: actionType/description/priority/targetGoalId/reason
- `GoalDeviationStatus`: on_track/at_risk/deviated/critical/unknown

### 2. src/growth/workspace-builder.ts — 工作台数据聚合器（新建）

```typescript
buildDepartmentWorkspace(deptId, store, goalStore, proposalStore, sentinelRegistry): DepartmentWorkspace
```

数据聚合逻辑（每个模块独立try-catch，单点失败不影响其他）:
1. 从GraphStore查询TEAM节点 → departmentId/name
2. 从goal-store查询该部门active Goal → 对每个Goal调用goal-sentinel的computeDeviations
3. 从proposal-store查询pending Proposal
4. 从sentinelRegistry查询关联哨兵Finding
5. 从GraphStore查询最近3份诊断报告引用
6. 计算nextAction（委托给next-action-engine）

每个子模块失败 → 标记degraded + degradedModules[]记录。不阻断其他模块的数据聚合。

### 3. src/growth/next-action-engine.ts — NextAction推荐引擎（新建）

```typescript
computeNextAction(workspace: DepartmentWorkspace): NextAction | null
```

决策树（基于偏离状态/优先级/截止日期）:
- 有critical Goal → actionType='review_critical_goal', 推荐优先处理该Goal
- 有pending Proposal即将过期(<2天) → actionType='confirm_proposal', 推荐确认方案
- 全部on_track → actionType='review_dashboard', 推荐查看工作台全景
- 无活跃数据 → null

### 4. src/growth/dnd-engine.ts — 免打扰规则引擎（新建）

```typescript
shouldDeliver(alert: WorkspaceAlert, dndConfig: DNDConfig): boolean
```

规则矩阵:
- P0告警 → 始终推送（不受免打扰限制）
- P1告警 → 周推1次（同一Goal+同一哨兵在7天内不重复）
- P2告警 → 周汇总（不单独推送，出现在周报摘要中）
- 用户自定义免打扰时段 → 延迟推送（时段结束后即时补推）
- 已被用户dismiss的告警 → 7天内不重复推送同一类型

### 5. src/routes/workspace.ts — 工作台API端点（新建）

```
GET  /api/workspace/:deptId              — 部门工作台全量数据
GET  /api/workspace/:deptId/goals        — 部门活跃Goal列表
GET  /api/workspace/:deptId/alerts       — 部门告警（受免打扰过滤）
GET  /api/workspace/:deptId/next-action  — 推荐下一步行动
PUT  /api/workspace/alerts/:id/dismiss   — 手动消除告警
```

---

## 不做什么

- 不修改 `src/agent/workspace-service.ts`（旧PRD v1.6代码，D77处理）
- 不修改 `src/routes/department-workspace.ts`（旧HTML页面，D77替换）
- 不修改 `src/agent/workspace-context-bridge.ts`（旧桥接，D77评估后废弃）
- 不实现前端渲染（D74只做数据聚合，不碰UI）

---

## 架构层

L4（本体层: `src/growth/workspace-types.ts` + `workspace-builder.ts`）+ L2（编排层: `next-action-engine` + `dnd-engine`）+ L1（交互层: `routes/workspace.ts`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | workspace-types.ts | 1.5h | DepartmentWorkspace + 子接口 |
| 2 | workspace-builder.ts | 2.5h | 5步数据聚合 + 降级 |
| 3 | next-action-engine.ts | 1.5h | 决策树实现 |
| 4 | dnd-engine.ts | 1.5h | 免打扰规则矩阵 |
| 5 | routes/workspace.ts + server.ts | 1h | 4端点 + 路由挂载 |
| 6 | 测试文件 | 2h | 4个测试文件 |

**总工时: 10h（约1.5工作日）**

---

## 完成标准

```
[ ] workspace-types.ts: DepartmentWorkspace + ActiveGoal + WorkspaceAlert + PendingProposal + NextAction 全部JSDoc
[ ] workspace-types.ts: 每个字段标注数据来源路径（如"从sentinel-{id}.latestResult.findings[0].severity"）
[ ] workspace-builder.ts: buildDepartmentWorkspace — 5步聚合，每步独立try-catch
[ ] workspace-builder.ts: 单模块失败→标记degraded+degradedModules，不阻断其他模块
[ ] next-action-engine.ts: computeNextAction — 决策树含5个分支
[ ] dnd-engine.ts: shouldDeliver — P0始终/P1周推1次/P2周汇总/免打扰延迟/消后7天
[ ] routes/workspace.ts: 4个GET端点 + 1个PUT端点
[ ] server.ts: 挂载workspace路由
[ ] 不修改旧workspace 3个文件
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=16测试: workspace-builder 6(全量/单模块降级/全降级/空部门/无Goal/边界) + next-action 5(critical/pending/ontrack/null/边界) + dnd 5(P0/P1/P2/免打扰/消后)
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范 第四章（中层工作台数据模型）
  - §1: 五条总设计原则
  - §2: DepartmentWorkspace完整TypeScript接口
  - §3: nextAction生成规则
  - §4: 免打扰规则引擎
  - §5: 证据链弹窗数据模型
  - §6: 数据源映射表（精确到42边参数/compute contractId/哨兵ID）