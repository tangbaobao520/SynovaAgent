<!-- SYNOVA-IMPL-D238 v1.0 | 2026-07-27 | Phase 3 | Loop-6 溢出监控 -->
# SynovaAgent -- D238 Loop-6 溢出监控 v1.0
> Phase 3 | loop-scheduler.ts registerBuiltinLoops() | loop-1/2/4/5 done, loop-6 pending

## 改动 (loop-scheduler.ts registerBuiltinLoops +65行)

在 registerBuiltinLoops() 中新增 loop-6 注册:
```typescript
// loop-6: 溢出监控（月级 cron, medium 尺度）
this.scheduler.schedule('loop-6-overflow', '0 9 1 * *', async () => {
  if (!this.mainAgent) {
    log.warn('[D238] MainAgent 未注入 — 跳过 loop-6');
    return;
  }
  try {
    const result = await this.mainAgent.executeLoop('loop-6', 'medium');
    this.recordHeartbeat('loop-6');
    log.info({ status: result.status }, 'loop-6 溢出监控完成');
  } catch (err) {
    log.warn({ err }, 'loop-6 执行失败 — degraded');
  }
});
log.info('[D238] loop-6-overflow 已注册 (0 9 1 * *)');
```

Handler 逻辑: 读取各循环溢出数据 → 不足数据跳过(Phase 3降级) → 存在则计算跨循环溢出指标 → emitSignal.

## 测试 (L1×2)
| # | 测试 |
|---|------|
| 1 | loop-6 在 CronScheduler 注册 (0 9 1 * *) |
| 2 | MainAgent 未注入 → 跳过不崩溃 |

## 完成标准
loop-6 在 CronScheduler 注册 + 降级不崩溃。2 tests。tsc零新增, as any=0.
