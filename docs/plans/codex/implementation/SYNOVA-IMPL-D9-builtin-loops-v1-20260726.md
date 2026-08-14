# SynovaAgent -- D9 内置循环激活 (Built-in Loops) 实施方案 v1.0

> 2026-07-26 | 权威文档 #4 Agent 工程能力对标 — 5 内置循环 + 附录 A v2.0 Gate 12
> **D8a-D8g L2 升级完成后，激活 2 个核心业务循环。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/loops/loop-trigger-config.ts` 存在（D91，6 循环×3 尺度触发矩阵），`src/agent/main-agent.ts` 存在（D8a，registerLoop/executeLoop/getLoopStatus），`src/loops/loop-scheduler.ts` 存在（D91+D223）
- [x] Get-Content 读取：loop-trigger-config.ts — 6 循环定义：loop-1（enterprise_diagnosis，季度诊断循环，L57-80）/ loop-2（department_navigation，周度部门导航，L85-108）/ loop-3（ga_evolution，月度 GA 进化，L113-127）/ loop-4（system_self_check，日度系统自检）/ loop-5（knowledge_accumulation，按需知识积累）/ loop-6（overflow_monitor，月度溢出监控）
- [x] Select-String 验证：main-agent.ts L156-202 — `executeLoop(loopId, scale)` 方法含 D8g 预算检查 + D8f 收敛引擎。LoopExecutionRecord 含 loopId/scale/status/durationMs/output/startedAt/completedAt
- [x] 引用 — 附录 A Gate 12："核心循环定时运行，CronScheduler 注册了至少 5 个业务循环"

---

## 问题根因

D8a-D8g 构建了完整的 L2 循环执行引擎——MainAgent 可注册、执行、查询循环。D91 定义了 6 循环×3 尺度的触发矩阵。D223 追加了心跳追踪。但**没有一个循环被 CronScheduler 实际注册并定时执行**——系统自检循环（loop-4）和知识积累循环（loop-5）在 D91 中被标注但从未在 CronScheduler 的 `schedule()` 中注册。Gate 12 因此保持 PARTIAL——循环定义存在但未定时运行。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 持续运行层——内置循环激活。在 LoopScheduler/CronScheduler 中注册 2 个最低可行循环——loop-4（系统自检，24h）和 loop-5（知识积累，按需+周度）。不要求全部 6 循环立刻运行——先激活 2 个验证管线。

### Q1：调研
- loop-trigger-config.ts L135+：loop-4（system_self_check）— 快尺度（24h cron），检查哨兵状态/专家状态/数据新鲜度
- loop-trigger-config.ts L150+：loop-5（knowledge_accumulation）— 中尺度（每周），从 PKB 提取 enterprise_facts、更新知识图谱
- CronScheduler API：`scheduler.schedule(id, cronExpr, handler)` — D94 混合触发支持
- D223 loop-scheduler.ts：已有 `registerHeartbeatCheck()` 注册 24h 停滞检查——同模式可复用

### Q2：范围
- 最小：(A) 在 CronScheduler 注册 loop-4（`0 0 * * *` 每日 0 点）→ 执行系统自检 → 产出 LoopExecutionRecord → D223 心跳记录。(B) 在 CronScheduler 注册 loop-5（`0 0 * * 0` 每周日）→ 执行知识积累 → 产出 enterprise_facts → KnowledgeStore 写入
- 不做：不实现 loop-1/2/3/6（需完整诊断管线运行后才能激活）

### Q3：验收
- 入口：CronScheduler 定时触发 → MainAgent.executeLoop('loop-4') → 产出 LoopExecutionRecord
- 交互：loop-4 执行后 → D223 recordHeartbeat → 24h 后 checkStagnation 不再报告 loop-4 停滞
- 结果：CronScheduler 的 cron_jobs 表中新增 2 条注册记录 → Gate 12 从 PARTIAL 推进

### Q4：契约与测试
- @input：无（CronScheduler 定时触发）
- @output：LoopExecutionRecord + D223 心跳记录
- @degraded：MainAgent 不可用 → 跳过 + degraded
- 测试：loop-4 注册(1) + loop-5 注册(1) + 手动触发成功(1) = 3 tests

---

## 构建内容

### 1. 修改 src/loops/loop-scheduler.ts — 注册 2 个内置循环

在 `registerHeartbeatCheck()` 附近追加：

```typescript
// D9: loop-4 — 系统自检（每日 0 点）
this.scheduler.schedule('loop-4-self-check', '0 0 * * *', async () => {
  const result = await this.mainAgent.executeLoop('loop-4', 'fast');
  this.recordHeartbeat('loop-4');
  log.info({ status: result.status }, 'loop-4 系统自检完成');
});

// D9: loop-5 — 知识积累（每周日 0 点）
this.scheduler.schedule('loop-5-knowledge', '0 0 * * 0', async () => {
  const result = await this.mainAgent.executeLoop('loop-5', 'medium');
  this.recordHeartbeat('loop-5');
  log.info({ status: result.status }, 'loop-5 知识积累完成');
});
```

---

## 不做什么

- 不实现 loop-1/2/3/6（需完整诊断管线激活）
- 不修改 MainAgent 核心逻辑
- 不修改 loop-trigger-config.ts 定义

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- CronScheduler 中注册了 loop-4 和 loop-5 任务
- 手动调用 `executeLoop('loop-4')` → 返回 LoopExecutionRecord
- MainAgent 不可用 → 跳过 + degraded
- 3 个测试

---

## 完成标准

```
[ ] loop-4 在 CronScheduler 注册（cron: 0 0 * * *）
[ ] loop-5 在 CronScheduler 注册（cron: 0 0 * * 0）
[ ] loop-4 执行后 recordHeartbeat
[ ] loop-5 执行后 recordHeartbeat
[ ] 降级: MainAgent 不可用 → 跳过 + degraded
[ ] CronScheduler cron_jobs 表中新增 2 条记录
[ ] ≥3 个测试
```
