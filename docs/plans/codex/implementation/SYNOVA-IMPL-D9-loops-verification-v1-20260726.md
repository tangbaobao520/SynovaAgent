# SynovaAgent -- D9-LOOPS 核心循环验证与激活 实施方案 v1.0

> 2026-07-26 | 验证 6 循环 x 3 尺度触发矩阵 + LoopScheduler 自检
> Gate 12 (核心循环定时运行): PARTIAL -> PASS
> 此文档为 claude code 的唯一执行依据。

---

## 权威文档原文验证(铁律 0-3)

- [x] Test-Path `src/loops/loop-scheduler.ts` -> 存在 (D91 + D223, 含 heartbeat/stall检测)
- [x] Test-Path `src/loops/loop-trigger-config.ts` -> 存在 (D91, LOOP_TRIGGER_MATRIX)
- [x] Get-Content `loop-trigger-config.ts:55` -> `LOOP_TRIGGER_MATRIX` 6 循环 loop-1~loop-6
- [x] Get-Content `loop-scheduler.ts:195` -> `registerDefaultLoops()` 方法存在
- [x] Get-Content `loop-scheduler.ts:70-102` -> `STALL_THRESHOLD_CYCLES=3` + `registerHeartbeatCheck()` + `emitSignal`
- [x] Select-String `synova-agent.ts` -> `LoopScheduler` 零引用 -- 从未被实例化

---

## 当前状态

`loop-trigger-config.ts` 定义了 6 个业务循环:
- loop-1: Enterprise Diagnosis (周/月/季)
- loop-2: Department Navigation (2h事件/周/月)
- loop-3: GA Evolution (月/季/半年)
- loop-4: System Self-Check (日/周/月)
- loop-5: Knowledge Accumulation (周/月/季)
- loop-6: Middle Evolution Engine (日/周/月)

`loop-scheduler.ts` 有 `registerDefaultLoops()` 方法，执行时调用 `this.scheduler.schedule()` 注册 18 个 cron job。

**但 LoopScheduler 从未被实例化交给 CronScheduler。** synova-agent.ts 中 `rg LoopScheduler` 零结果。Gate 12 判为 PARTIAL 的根因。

---

## 构建内容

### 1. 自检 registerDefaultLoops()

- 确认 LOOP_TRIGGER_MATRIX 6 个循环配置的 `period` 格式符合 cron 规范
- 确认 `validateLoopConfig()` 对 6 个循环全部返回 valid
- 如果 STALL_THRESHOLD_CYCLES=3 的 heartbeat 检查文件路径 `.codex/heartbeat/` 不存在，创建该目录逻辑

### 2. LoopScheduler 自包含测试

Mock CronScheduler 后验证:

| 测试 | 内容 |
|------|------|
| 注册 | registerDefaultLoops() 返回 count=6 |
| 事件触发 | onEvent('sentinel:P0', payload) 查询到对应循环 |
| 查询 | getNextTrigger('loop-1', 'fast') 返回正确下次触发时间 |
| 心跳 | 模拟 4 周期无输出 -> StagnationReport.stalled 含 loop-id |
| 告警 | SYSTEM_SILENCE 触发后 emitSignal 传入 red 状态 |

### 3. LoopScheduler 接收 CronScheduler

确认构造函数 `new LoopScheduler(scheduler?: CronSchedulerLike)` 接受可选 CronScheduler:

```typescript
// loop-scheduler.ts:81-83
constructor(scheduler?: CronSchedulerLike) {
    this.scheduler = scheduler ?? null;
}
```

当 scheduler 为 null 时进入降级模式——registerDefaultLoops 只验证配置不注册 cron job。**这是正确的设计。D224-WIRING 负责传真实的 CronScheduler。**

---

## 不做什么

- **不修改 `synova-agent.ts`** -- wiring 属于 D224-WIRING
- 不新增循环(loop-1~loop-6 已定义)
- 不修改 cron 表达式
- 不触发真实 Cron 执行(仅测试中验证注册逻辑)

---

## 测试要求(依据权威文档 #6 测试体系规范)

| 层 | 内容 | 数量 |
|----|------|------|
| L1 | validateLoopConfig() 对 6 循环全 valid | >=1 test |
| L2a | registerDefaultLoops(mock CronScheduler) -> 6 个 schedule 调用 | >=1 test |
| L2a | onEvent('sentinel:P0') 查询 next trigger | >=1 test |
| L2a | getNextTrigger('loop-1', 'fast') 返回正确时间 | >=1 test |
| L2b | StagnationReport: 模拟 4 周期无输出 -> stalled 包含 loop-id | >=1 test |
| L2b | SYSTEM_SILENCE -> emitSignal('loop-scheduler', 'red', ...) | >=1 test |
| 总计 | >=6 tests, 每 test >=3 expect() | |

---

## 完成标准

```
[ ] registerDefaultLoops(mock) 返回 6(或更高)
[ ] validateLoopConfig() 对 6 循环全通过
[ ] 心跳: STALL_THRESHOLD=3 周期无输出 -> stalled array 含 loop-id
[ ] 告警: SYSTEM_SILENCE 触发 emitSignal('loop-scheduler', 'red', ...)
[ ] >=6 tests 通过
[ ] tsc --noEmit 零错误
[ ] 零 as any
```
