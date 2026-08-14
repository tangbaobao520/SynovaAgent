<!-- SYNOVA-IMPL-D237 v1.0 | 2026-07-27 | Phase 3 | Loop-3 GA进化 -->
# SynovaAgent -- D237 Loop-3 GA进化 v1.0
> Phase 3 | loop-scheduler.ts registerBuiltinLoops() | loop-1/2/4/5 done, loop-3/6 pending

## 现状
loop-scheduler.ts 已注册 loop-1(企业诊断/季度), loop-2(部门导航/每周), loop-4(系统自检/每日), loop-5(知识积累/每周)。
loop-3 和 loop-6 在 registerBuiltinLoops() 中无注册——Phase 3 待实现。

## 改动 (loop-scheduler.ts registerBuiltinLoops +65行)

在 registerBuiltinLoops() 中新增 loop-3 注册:
```typescript
// loop-3: GA进化（季度 cron, slow 尺度）
this.scheduler.schedule('loop-3-ga-evolution', '0 9 1 */3 *', async () => {
  if (!this.mainAgent) {
    log.warn('[D237] MainAgent 未注入 — 跳过 loop-3');
    return;
  }
  try {
    const result = await this.mainAgent.executeLoop('loop-3', 'slow');
    this.recordHeartbeat('loop-3');
    log.info({ status: result.status }, 'loop-3 GA进化完成');
  } catch (err) {
    log.warn({ err }, 'loop-3 执行失败 — degraded');
  }
});
log.info('[D237] loop-3-ga-evolution 已注册 (0 9 1 */3 *)');
```

Handler 逻辑: 检查 GA 数据是否存在 → 不存在跳过(Phase 3降级) → 存在则分析 GA 建议效果 → 调整 GA 权重/规则。

## 测试 (L1×2)
| # | 测试 |
|---|------|
| 1 | loop-3 在 CronScheduler 注册 (0 9 1 */3 *) |
| 2 | MainAgent 未注入 → 跳过不崩溃 |

## 完成标准
loop-3 在 CronScheduler 注册 + 降级不崩溃。2 tests。tsc零新增, as any=0.
