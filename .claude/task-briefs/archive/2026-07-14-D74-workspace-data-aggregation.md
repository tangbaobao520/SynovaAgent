## Q0: 定位 — 项目拼图 + 文件审计
### a) 项目拼图
Synova = AI 诊断 Agent。D74 = 中层工作台数据聚合。L4(workspace-types/builder) + L2(next-action/dnd) + L1(routes)。
src/growth/ 已有: goal-types/proposal-types/goal-store/goal-sentinel/proposal-store/proposal-engine。
之前: D71 Goal引擎 ✅, D72 Proposal引擎 ✅, D73 方案哨兵 ✅。
### b) 文件审计
grep "queryNodes TEAM\|NodeType.RESOURCE_TEAM" → src/l4/graph-bridge.ts 有 TEAM 查询
grep "SentinelRegistry\|getSentinelRegistry" → src/sentinel/registry.ts 有注册表
grep "createServer\|import.*routes/workspace" → src/server.ts 未挂载新 workspace 路由
### c) 决策
src/growth/ 下新建 workspace-types.ts / workspace-builder.ts / next-action-engine.ts / dnd-engine.ts
src/routes/workspace.ts 新建（与旧 PRD v1.6 routes/workspace.ts 不同路径? 同名文件需注意）
src/server.ts 挂载新路由

## Q1: 调研 — 业界最佳实践 / Anthropic 决策链 / memory 历史教训
a) 业界: 工作台数据聚合 = "后端 BFF (Backend-For-Frontend)" 模式。每层独立 try-catch，总入口暴露 degraded 信号。
b) 架构: workspace-builder 是聚合器，不直接调 DB，通过依赖注入的接口查询各 store。
c) memory/: engine-core-split-fraud → 不建桥接，真写代码。
   plan-actual-closure → 对照 D74 spec 逐项验收。

## Q2: 范围 — 正确的最简方案
做什么：
- workspace-types.ts: DepartmentWorkspace + 6个子接口，JSDoc标注数据来源
- workspace-builder.ts: buildDepartmentWorkspace 5步聚合
- next-action-engine.ts: computeNextAction 决策树
- dnd-engine.ts: shouldDeliver 免打扰规则
- routes/workspace.ts: 4 GET + 1 PUT 端点
- server.ts: 挂载
不做什么（含文件路径）：
- 不修改 src/agent/workspace-service.ts（旧 PRD v1.6）
- 不修改 src/routes/department-workspace.ts（旧 HTML 渲染）
- 不修改 src/agent/workspace-context-bridge.ts（旧上下文桥接）
- 不修改 src/growth/goal-types.ts / proposal-types.ts / goal-store.ts 等现有文件
- 不实现前端渲染

## Q3: 验收 — 入口 → 交互 → 结果
入口: GET /api/workspace/:deptId → 调用 buildDepartmentWorkspace
处理: 5步聚合(每步独立try-catch) → 装饰nextAction → DND过滤告警
结果: JSON DepartmentWorkspace 响应

## 架构层:
L4(workspace-types/builder) + L2(next-action/dnd) + L1(routes)

## Done 标准
[ ] workspace-types.ts: DepartmentWorkspace+ActiveGoal+WorkspaceAlert+PendingProposal+NextAction+DiagnosticReference+GoalDeviationStatus 全部 JSDoc
[ ] workspace-builder.ts: buildDepartmentWorkspace — 5步聚合，每步独立 try-catch
[ ] workspace-builder.ts: 单模块失败→标记degraded+degradedModules
[ ] next-action-engine.ts: computeNextAction — 决策树5分支
[ ] dnd-engine.ts: shouldDeliver — P0始终/P1周推1次/P2周汇总/免打扰时段/消后7天
[ ] routes/workspace.ts: 4 GET端点 + 1 PUT端点
[ ] server.ts: 挂载新 workspace 路由
[ ] 不修改旧 workspace 3个文件
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=16测试
