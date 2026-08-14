# SynovaAgent -- D21 Module 5 Action 闭环设计 实施方案 v1.0

> 2026-07-22 | 权威文档 #5：Agent 主动交互系统蓝图 — Module 5
> **Action 不是对话里的一段文本——它是带有因果锚点的、可追踪的、可验证的执行承诺。D21 将 Action 升级为一级实体，与节点/边/哨兵/信号同级。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：权威文档 #5 Module 5 HTML 文件存在（SYNOVA-RESEARCH-Module-5-Action闭环设计-20260710.html）
- [x] Get-Content 读取：Module 5 §5.1 — Action 数据结构定义（signalId/conversationId/department/lifecycle/loopAssociation）
- [x] Select-String 验证：Action 接口字段已在文档中完整定义（16 个字段）
- [x] 引用 — Module 5 §5.1.1："Action 是一级实体，与节点(Entity)、边(Edge)、哨兵(Sentinel)、信号(Signal)同级"

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 执行闭环。D21 将 Action 从"对话中的一段文本"升级为一级实体——与 42 边中的节点、哨兵、信号同级。Action 由哨兵信号触发，关联到具体的 Loop 执行，有完整的生命周期（created→assigned→in_progress→verified→closed），可跨部门追踪。

### Q1：调研
- 权威文档 #5 Module 5 §5.1.1 — Action 数据结构（16 字段：id/signalId/conversationId/department/assignee/lifecycle/loopAssociation/verification 等）
- 权威文档 #5 Module 5 §5.2 — Action 生命周期六态：created→assigned→in_progress→completed→verified→closed
- 权威文档 #5 Module 5 §5.3 — 跨部门协同 Action：主部门 + 协作部门列表，各独立追踪完成状态
- D17/D18/D19 已就绪：提供信号推送、交互卡片、GA 协同——Action 闭环消费这些产出

### Q2：范围
- 最小：Action 类型定义 + ActionStore（CRUD + 生命周期状态转换）+ 集成到 sentinel 信号触发
- 不做：不构建 Action 的前端 UI、不实现 Action 的自动验证逻辑（MVP：人工标记 verified）

### Q3：验收
- 入口：哨兵 P0 信号触发 → 自动创建 Action（signalId 绑定）
- 交互：中层 manager 通过 D18 交互卡片标记 Action 完成 → GA 验证 closed
- 结果：Action 完整生命周期记录在 GraphStore 中，可追溯

### Q4：契约与测试
- @input：SentinelFinding（信号触发）+ 可选的 assignee/department
- @output：Action 实体，含完整 16 字段
- @degraded：GraphStore 不可用 → 返回空 + log.warn
- 测试：创建 Action、状态转换、跨部门协作 Action、生命周期完整性

---

## 当前状态（2026-07-22，grep 验证）

- D17 ProactivePush：已提交（0cc7ff7）—— 哨兵 P0 → 推送通知
- D18 InteractiveCardHandler：已提交（31f1152）—— 交互卡片，含 Confirm/Dismiss/Details 按钮
- D19 GAFeedbackHandler：已提交（9790414）—— GA 协同，含 correct/flag/rediagnose
- Action 类型定义：零存在
- ActionStore：零存在
- Action 生命周期管理：零存在
- 权威文档 #5 Module 5：Action 数据结构 + 生命周期 + Loop 关联 + 跨部门协同均已定义

---

## 构建内容

### 1. src/growth/action-types.ts -- Action 类型定义（新建，约 80 行）

```typescript
interface Action {
  id: string
  signalId: string          // 触发此 Action 的哨兵信号 ID（因果锚点）
  conversationId?: string    // 创建此 Action 的对话 ID
  department?: string        // 责任部门
  assignee?: string          // 负责人
  collaborators?: string[]   // 协作部门列表
  lifecycle: 'created' | 'assigned' | 'in_progress' | 'completed' | 'verified' | 'closed'
  loopAssociation?: {        // 关联的循环
    loopId: string
    scale: 'fast' | 'medium' | 'slow'
    executionId: string
  }
  verification?: {           // 验证信息
    verifiedBy: string       // 验证人（GA 或中层）
    verifiedAt: string
    evidenceRefs: string[]   // 证据引用
  }
  createdAt: string
  updatedAt: string
  closedAt?: string
}
```

### 2. src/growth/action-store.ts -- ActionStore（新建，约 150 行）

- createAction(signal, assignee?, department?)：哨兵信号 → Action
- updateLifecycle(actionId, newState)：状态转换 + 验证规则
- getActionsBySignal(signalId)：按信号查询
- getActionsByDepartment(department)：按部门查询
- getActionsByLoop(loopId, executionId)：按循环执行查询

### 3. 集成到 ProactivePush（修改 src/agent/proactive-push.ts）

在 onP0Finding 中，推送通知的同时创建 Action：
```
const action = actionStore.createAction(finding, 'unassigned', inferredDepartment);
finding.actionId = action.id;
```

---

## 不做什么

- 不构建 Action 前端 UI（后续任务）
- 不实现自动验证逻辑（MVP：人工标记 verified）
- 不修改 D17/D18/D19 的核心逻辑（只在推送时追加 Action 创建）

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- createAction(signal)：@input (SentinelFinding + assignee + department) / @output (Action with id + lifecycle='created') / 4 组 fixture
- updateLifecycle(actionId, 'completed')：normal(状态转换成功) / boundary(无效转换 → 拒绝) / error(Action 不存在) / temporal
- getActionsBySignal(signalId)：normal(返回列表) / boundary(无Action → 空列表) / error(存储不可用 → degrade)
- Action 生命周期六态验证：created→assigned→in_progress→completed→verified→closed，不可跳转

### L2a：接线测试
- ProactivePush.onP0Finding 调用 actionStore.createAction（grep "actionStore" src/agent/proactive-push.ts）
- ActionStore 的 GraphStore 依赖注入（构造函数接受 store 参数）

---

## 接线验证（铁律 4）

| 导出 | 调用方 | 验证方式 |
|------|------|------|
| ActionStore.createAction | ProactivePush.onP0Finding | grep "actionStore" src/agent/proactive-push.ts |
| action-types.ts (Action interface) | action-store.ts | grep "Action" src/growth/action-store.ts |

---

## 完成标准

```
[ ] action-types.ts：Action 接口含全部 16 个字段
[ ] action-store.ts：createAction + updateLifecycle + getActionsBySignal + getActionsByDepartment + getActionsByLoop
[ ] 生命周期六态：created → assigned → in_progress → completed → verified → closed
[ ] 状态转换验证：不可跳转（如 created 不能直接到 verified）
[ ] 集成：ProactivePush.onP0Finding 自动创建 Action
[ ] 降级：GraphStore 不可用 → createAction 返回 null + log.warn
[ ] 跨部门协作：collaborators 字段支持，各自独立追踪
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] vitest run --changed 零新增失败
[ ] ≥10 个测试：create(2) + lifecycle(4) + query(2) + 集成(2)
```

---

## 权威文档引用

- 权威文档 #5：Agent 主动交互系统蓝图 — Module 5：Action 闭环设计
  - §5.1.1：Action 数据结构（16 字段完整定义）
  - §5.2：Action 生命周期六态
  - §5.3：跨部门协同 Action 机制
- D17：ProactivePush（提供信号触发入口）
- D18：InteractiveCardHandler（提供中层完成确认入口）
- D19：GAFeedbackHandler（提供 GA 验证入口）
