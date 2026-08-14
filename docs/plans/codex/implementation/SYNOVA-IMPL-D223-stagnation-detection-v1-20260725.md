# SynovaAgent -- D223 静默停滞检测 (Gate 13) 实施方案 v1.0

> 2026-07-25 | 附录 A v2.0 Gate 13 — 静默停滞检测
> **loop-scheduler.ts 零 silence/stagnation 代码。追加心跳追踪 + 停滞告警。**
> **此文档为 claude code 的唯一执行依据。**

---

## 权威文档原文验证（铁律 0-3）

- [x] Test-Path 确认：`src/loops/loop-scheduler.ts` 存在（D91），`src/cron/scheduler.ts` 存在（D94 hybrid trigger）
- [x] Get-Content 读取：附录 A Gate 13 — 通过条件：`src/loops/` 下含静默检测逻辑（代码含 silence/stagnation/stall/heartbeat 关键词）。静默检测周期性运行（约 24h），输出 system_heartbeat 信号。任一核心循环超 3 周期未产生输出 → SYSTEM_SILENCE 告警
- [x] Select-String 验证：`rg "silence|stagnation|stall|heartbeat" src/loops/loop-scheduler.ts` → 零匹配。loop-scheduler.ts 当前无任何停滞检测
- [x] 引用 — Gate 13 当前状态："❌ 未通过——loop-scheduler.ts 不含任何静默/停滞检测代码"

---

## 问题根因

附录 A Gate 13 要求系统能自检——发现自身已经停止工作。loop-scheduler.ts 管理 6 个循环的触发调度，但没有任何逻辑检测"某个循环是否已经停止产出"。循环可能静默死亡而无人知晓。

---

## V4.5.0 -- 强制任务启动（Q1-Q4）

### Q0：项目身份
SynovaAgent 持续运行层 — 静默停滞检测。在 loop-scheduler.ts 中追加心跳记录机制 + 停滞检测逻辑。每个循环执行后记录心跳时间戳 → 24 小时周期性检查 → 任一循环超 3 个周期未产出 → SYSTEM_SILENCE 告警。

### Q1：调研
- loop-scheduler.ts 管理 6 循环×3 尺度的触发调度（LOOP_TRIGGER_MATRIX）
- CronScheduler 提供周期性任务注册（`schedule()` 方法）
- 心跳记录可存储在 `.codex/heartbeat.json`（简单文件方案）或 CronScheduler 的 cron_jobs 表中
- Gate 13 要求 24h 检查周期——可通过 CronScheduler 注册 `system-heartbeat-check` 任务

### Q2：范围
- 最小：在 loop-scheduler.ts 中追加 `recordHeartbeat(loopId)` 方法 + `checkStagnation()` 方法（24h 周期）→ 写入心跳文件 → 检测停滞 → SYSTEM_SILENCE 告警
- 不做：不修改现有循环触发逻辑、不新增外部依赖

### Q3：验收
- 入口：循环执行后调用 `recordHeartbeat('loop-1')` → 写入心跳时间戳
- 交互：24h 后 `checkStagnation()` 运行 → 扫描 6 循环的最后心跳 → 3 周期无产出 → 告警
- 结果：告警写入 `system_health` 日志 + 通过 D214 emitSignal 发送

### Q4：契约与测试
- @input：无（自动读取心跳文件）
- @output：StagnationReport { stalled: string[], healthy: string[], checkedAt }
- @degraded：心跳文件不存在 → 所有循环标记为 unknown + degraded
- 测试：无停滞(1) + 单循环停滞(1) + 3 周期停滞(1) + 心跳文件缺失降级(1) = 4 tests

---

## 构建内容

### 1. 修改 src/loops/loop-scheduler.ts — 追加心跳 + 停滞检测（约 80 行新增）

```typescript
// 心跳记录接口
interface HeartbeatRecord {
  loopId: string;
  lastOutputAt: string;
  cycleCount: number;
}

// 心跳追踪
private heartbeatFile = '.codex/heartbeat.json';

recordHeartbeat(loopId: string): void {
  // 读取或初始化心跳文件
  // 更新该循环的 lastOutputAt + cycleCount++
  // 写入心跳文件
}

// 停滞检测（每 24h CronScheduler 触发）
async checkStagnation(): Promise<StagnationReport> {
  // 读取心跳文件
  // 逐循环计算：当前时间 - lastOutputAt > 3 * cycleDuration？
  // 停滞 → 写入 SYSTEM_SILENCE 告警
  // 通过 emitSignal('heartbeat', status, reason) 写入 D214 信号
}
```

### 2. 在 CronScheduler 注册 24h 停滞检查

```typescript
scheduler.schedule('system-heartbeat-check', '0 0 * * *', async () => {
  await loopScheduler.checkStagnation();
});
```

### 3. 在循环执行后追加心跳记录

每个循环的 `executeLoop()` 完成后调用 `this.recordHeartbeat(loopId)`。

---

## 不做什么

- 不修改现有循环触发逻辑
- 不新增文件（仅修改 loop-scheduler.ts）
- 不修改 CronScheduler 核心

---

## 测试要求（依据权威文档 #6 测试体系规范）

### L1：单元契约测试
- 所有循环心跳正常 → stalled=[ ], healthy=6
- loop-1 最后一次心跳超过 3 周期 → stalled=['loop-1']
- 心跳文件不存在 → 所有循环 unknown + degraded
- recordHeartbeat 后立即 checkStagnation → 无停滞（刚更新）
- 4 个测试

---

## 完成标准

```
[ ] loop-scheduler.ts: recordHeartbeat(loopId) 方法
[ ] loop-scheduler.ts: checkStagnation() 方法
[ ] CronScheduler 注册 system-heartbeat-check（24h）
[ ] 循环执行后自动调用 recordHeartbeat
[ ] 停滞检测: 超 3 周期 → SYSTEM_SILENCE 告警
[ ] 降级: 心跳文件不存在 → unknown + degraded
[ ] 零 as any（铁律 38）
[ ] tsc --noEmit 零新增错误
[ ] ≥4 个测试
```
