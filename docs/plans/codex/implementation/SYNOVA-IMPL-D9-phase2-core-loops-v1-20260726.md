# SynovaAgent -- D9 Phase 2 核心业务循环激活 实施方案 v1.0

> 2026-07-26 | 权威文档 #4 Agent 工程能力对标 — 5 内置循环
> **loop-4+5 已激活（D9 Phase 1）。Phase 2 激活 loop-1（企业诊断）+ loop-2（部门导航）。此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/loops/loop-trigger-config.ts` 存在（D91，6 循环×3 尺度），`src/loops/loop-scheduler.ts` 存在（D9 Phase 1 loop-4/5 已注册），`src/agent/main-agent.ts` 存在（D8a，executeLoop + TaskDecomposer）
- [x] Get-Content 读取：loop-trigger-config.ts L57-83 — loop-1（Enterprise Diagnosis）：季度 cron（`0 9 1 */3 *`）+ 年度 cron（`0 0 1 1 *`）+ P0 事件触发。L85-111 — loop-2（Department Navigation）：周度 cron（`0 9 * * 1`）+ 月度 cron（`0 0 1 * *`）+ P0 事件触发。main-agent.ts L170-172 — loop-1 走 TaskDecomposer 分解路径（ExpertRouter + CrossValidator + ConvergenceEngine）
- [x] Select-String 验证：loop-scheduler.ts L133 `registerBuiltinLoops()` 仅注册了 loop-4 和 loop-5——loop-1/2 未注册。main-agent.ts L117 `executeLoop()` 方法接受任意 loopId——基础设施已就绪
- [x] 引用 — D91 循环触发矩阵：loop-1 季度诊断 / loop-2 周度部门导航——定义完整但未连接到 CronScheduler

---

## 问题根因

D9 Phase 1 激活了 loop-4（自检）和 loop-5（知识积累）——这两个循环不产生业务诊断输出。核心业务循环 loop-1（企业诊断）和 loop-2（部门导航）在 loop-trigger-config.ts 中定义完整——但从未被 CronScheduler 注册。系统能启动但不能自主"看病"。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 持续运行层——核心业务循环激活。在 loop-scheduler.ts 的 `registerBuiltinLoops()` 中追加 loop-1（季度，`0 9 1 */3 *`）和 loop-2（周度，`0 9 * * 1`）的 CronScheduler 注册。与 D9 Phase 1 同模式。

### Q1：调研
- loop-1 slow 尺度配置：季度 cron `0 9 1 */3 *` + 年度 cron `0 0 1 1 *`——匹配 trigger-config.ts L63-83
- loop-2 medium 尺度配置：周度 cron `0 9 * * 1` + 月度 cron `0 0 1 * *`——匹配 trigger-config.ts L91-111
- main-agent.ts executeLoop('loop-1')→TaskDecomposer 分解→ExpertRouter→专家诊断——基础设施完整
- D8g BudgetTracker 已集成——loop-1 执行前会检查预算

### Q2：范围
- 最小：在 `registerBuiltinLoops()` 中追加 2 个 CronScheduler 注册（loop-1 slow + loop-2 medium）
- 不做：不实现 loop-3（GA 进化——需 GA 数据积累）、不实现 loop-6（溢出监控——需循环数据积累）

### Q3：验收
- CronScheduler cron_jobs 表中新增 loop-1-diagnosis 和 loop-2-navigation 两条记录
- loop-1 执行后→MainAgent.executeLoop('loop-1','slow')→TaskDecomposer→ExpertRouter→ConvergenceEngine→产出诊断报告
- loop-2 执行后→MainAgent.executeLoop('loop-2','medium')→部门工作台数据→导航建议

### Q4：契约与测试
- @input：无（CronScheduler 定时触发）
- @output：LoopExecutionRecord + D223 heartbeat 记录
- @degraded：MainAgent 未注入→跳过 + degraded
- 测试：loop-1 cron 注册(1) + loop-2 cron 注册(1) = 2 tests

---

## 构建内容

### 修改 src/loops/loop-scheduler.ts — registerBuiltinLoops() 追加 2 个 cron 注册

```typescript
// loop-1: 企业诊断（季度 cron，slow 尺度——完整诊断管线）
this.scheduler.schedule('loop-1-diagnosis', '0 9 1 */3 *', async () => {
  if (!this.mainAgent) { log.warn('MainAgent 未注入—跳过 loop-1'); return; }
  const result = await this.mainAgent.executeLoop('loop-1', 'slow');
  this.recordHeartbeat('loop-1');
  log.info({ status: result.status }, 'loop-1 企业诊断完成');
});

// loop-2: 部门导航（周度 cron，medium 尺度）
this.scheduler.schedule('loop-2-navigation', '0 9 * * 1', async () => {
  if (!this.mainAgent) { log.warn('MainAgent 未注入—跳过 loop-2'); return; }
  const result = await this.mainAgent.executeLoop('loop-2', 'medium');
  this.recordHeartbeat('loop-2');
  log.info({ status: result.status }, 'loop-2 部门导航完成');
});
```

---

## 不做什么

- 不实现 loop-3（GA 进化——需 GA 数据积累）
- 不实现 loop-6（溢出监控——需循环数据积累）
- 不修改 MainAgent 核心逻辑

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- CronScheduler 中注册了 loop-1-diagnosis 和 loop-2-navigation 任务
- MainAgent 未注入→跳过 + degraded
- 2 个测试

---

## 完成标准

```
[ ] loop-1-diagnosis 在 CronScheduler 注册（cron: 0 9 1 */3 *）
[ ] loop-2-navigation 在 CronScheduler 注册（cron: 0 9 * * 1）
[ ] 执行后 recordHeartbeat + D223 停滞检测
[ ] 降级: MainAgent 不可用 → 跳过
[ ] tsc --noEmit 零新增错误
[ ] ≥2 个测试
```

