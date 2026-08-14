# SynovaAgent — D72 Proposal引擎+三选一确认 实施方案 v1.0

> 2026-07-14 | 第13份权威文档（增长导航系统工程规范）第二章
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

- D71: Goal存储+生命周期引擎 ✅ — `src/growth/goal-types.ts` + `goal-store.ts` + `goal-lifecycle.ts`
- `src/growth/` 目录: D71已建立，D72同目录追加
- Proposal代码: **零存在** — 全部新建
- 可复用:
  - `src/growth/goal-types.ts` — GraphBridgeLike/AuditStoreLike/PolicyEngineLike 接口
  - `src/growth/goal-store.ts` — createGoal() 直接消费Proposal→Goal映射输出
  - D71的StandardExpertReport→Goal映射表 — D72消费诊断报告生成Proposal时引用
- 权威文档第二章完整定义了Proposal 11态状态机 + 3条路径 + 非理想路径处理

---

## 做了什么

### 1. src/growth/proposal-types.ts — Proposal完整TypeScript接口（新建）

权威文档第二章完整接口定义。11态状态机 + 3条可选路径。

**核心接口:**
- `Proposal`: id/diagnosisReportId/title/department/paths[3]/selectedPathIndex/context/status/timeline/auditLog
- `ProposalPath`: label/riskLevel/expectedImpact/tradeoffs/recommendationReason/isDefault/goals[]/pressureTestResults[]
- `ProposalStatus`: 11态 — `draft → pending_selection → selected → pending_ga_confirmation → confirmed → executing → completed` + `expired/disputed/regenerating/ga_rejected`
- `ProposalTimeline`: createdAt/selectedAt/confirmedAt/expiresAt/completedAt
- `ProposalDispute`: reason/alternativeEvidence/suggestedConfidence

**非理想路径（4条）:**
1. 超时: 5工作日未选 → 自动选默认路径 + 通知中层 + 通知GA
2. 变更: 已确认后中层想改 → 最多2次 → 超限通知GA
3. 遗忘: 7天无信号 → 提醒 → 再过7天 → 通知GA
4. 中层拒绝: 附理由 → 轻量级再诊断 → 重新生成Proposal → 仍拒绝 → GA裁决

### 2. src/growth/proposal-store.ts — Proposal持久化存储（新建）

基于GraphStore `PROPOSAL` 节点:
- `createProposal(diagnosisReport, dept)` — 从诊断报告创建Proposal
- `getProposal(id)` / `listByDept(deptId)` / `listPending(orgId)`
- `selectPath(proposalId, pathIndex, actor)` — 中层选择路径
- `confirmByGa(proposalId)` / `rejectByGa(proposalId, reason)` — GA确认/驳回
- `checkExpiry()` — 检查超时 → 自动选默认

### 3. src/growth/proposal-engine.ts — Proposal引擎（新建）

- `generateProposalFromDiagnosis(report, dept)` — 诊断建议→3条路径展开
- `generateGoalFromProposal(proposal, selectedPath)` — 选中路径→Goal（调用D71 createGoal）
- `handleDispute(proposalId, dispute)` — 处理中层异议 → 触发轻量级再诊断(D75)
- `checkExpiryAndAutoSelect()` — 超时处理定时任务

### 4. 测试文件

---

## 不做什么

- 不创建方案级哨兵 — D73
- 不创建轻量级再诊断引擎 — D75（Proposal只触发，不实现）
- 不修改D71 goal-store/createGoal（只消费其输出）
- 不修改诊断报告输出管线

---

## 架构层

L4（本体层: `src/growth/proposal-types.ts` + `proposal-store.ts`）+ L2（编排层: `proposal-engine.ts`）

---

## 实施优先级

| 顺序 | 步骤 | 工时 | 文件 |
|:---:|-------|:---:|------|
| 1 | proposal-types.ts | 2h | 完整接口定义 |
| 2 | proposal-store.ts | 3h | CRUD + 11态状态机 + GraphStore |
| 3 | proposal-engine.ts | 2h | 3路径展开 + 自动超时 + GA确认流 |
| 4 | 测试文件 | 2h | 3个测试文件 |

**总工时: 9h（约1.5工作日）**

---

## 完成标准

```
[ ] proposal-types.ts: Proposal 11态状态机 + ProposalPath + ProposalTimeline + ProposalDispute，全部JSDoc
[ ] proposal-types.ts: 4条非理想路径(超时/变更/遗忘/拒绝)完整定义
[ ] proposal-store.ts: createProposal/getProposal/selectPath/confirmByGa/rejectByGa/checkExpiry 6函数
[ ] proposal-store.ts: 11态状态转换规则验证（非法转换拒绝）
[ ] proposal-store.ts: 每次状态变更写入AuditStore
[ ] proposal-engine.ts: generateProposalFromDiagnosis — 诊断建议→3条路径
[ ] proposal-engine.ts: generateGoalFromProposal — 调用D71 createGoal
[ ] proposal-engine.ts: handleDispute — 异议处理+再诊断触发
[ ] 消费D71 goal-store的createGoal函数（依赖注入）
[ ] zero as any
[ ] npx tsc --noEmit 零新增错误
[ ] npx vitest run --changed 零新增失败
[ ] >=18测试: proposal-store 8(创建/查询/选择/确认/超时/过期/非法转换/审计) + proposal-engine 6(3路径生成/Goal生成/异议/超时自动/GA驳回/GA确认) + types-validation 4
```

---

## 权威文档引用

- 第13份权威文档: 增长导航系统工程规范 第二章（Proposal与三选一确认机制）
  - §1: Proposal存在理由 — 诊断建议到Goal的转换层
  - §2: Proposal TypeScript接口 — 11态状态机完整定义
  - §3: 3条可选路径 + 默认选择逻辑
  - §4: 非理想路径 — 超时/变更/遗忘/拒绝 + 假设压力测试
  - §5: GA确认/驳回流程
  - 第五章 §8.1: Goal操作权限矩阵 — proposal确认时PolicyEngine检查