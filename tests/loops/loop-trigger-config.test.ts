/**
 * tests/loops/loop-trigger-config.test.ts — D91 多尺度触发矩阵测试
 */
import { describe, it, expect } from 'vitest';

describe('LOOP_TRIGGER_MATRIX — 配置验证', () => {
  it('有6个循环配置', async () => {
    const { LOOP_TRIGGER_MATRIX } = await import('../../src/loops/loop-trigger-config');
    expect(LOOP_TRIGGER_MATRIX).toHaveLength(6);
  });

  it('每循环有3个scale(fast/medium/slow)', async () => {
    const { LOOP_TRIGGER_MATRIX } = await import('../../src/loops/loop-trigger-config');
    for (const loop of LOOP_TRIGGER_MATRIX) {
      expect(loop.scales).toHaveLength(3);
      const names = loop.scales.map((s) => s.name);
      expect(names).toContain('fast');
      expect(names).toContain('medium');
      expect(names).toContain('slow');
    }
  });

  it('每个scale有有效的period和triggerType', async () => {
    const { LOOP_TRIGGER_MATRIX } = await import('../../src/loops/loop-trigger-config');
    for (const loop of LOOP_TRIGGER_MATRIX) {
      for (const scale of loop.scales) {
        expect(scale.period).toBeTruthy();
        expect(['cron', 'event', 'hybrid']).toContain(scale.triggerType);
        expect(scale.coverage).toBeTruthy();
        expect(scale.condition).toBeTruthy();
      }
    }
  });

  it('validateLoopConfig 通过验证', async () => {
    const { LOOP_TRIGGER_MATRIX, validateLoopConfig } = await import('../../src/loops/loop-trigger-config');
    const errors = validateLoopConfig(LOOP_TRIGGER_MATRIX);
    expect(errors).toHaveLength(0);
  });
});

describe('LoopScheduler — 注册与查询', () => {
  it('registerDefaultLoops 注册6个循环', async () => {
    const { LoopScheduler } = await import('../../src/loops/loop-scheduler');
    const scheduler = new LoopScheduler();
    const count = scheduler.registerDefaultLoops();
    expect(count).toBe(6);
    expect(scheduler.listLoops()).toHaveLength(6);
  });

  it('getNextTrigger 返回正确的结构', async () => {
    const { LoopScheduler } = await import('../../src/loops/loop-scheduler');
    const scheduler = new LoopScheduler();
    scheduler.registerDefaultLoops();
    const info = scheduler.getNextTrigger('loop-1', 'fast');
    expect(info).not.toBeNull();
    expect(info!.loopId).toBe('loop-1');
    expect(info!.scale).toBe('fast');
    expect(info!.triggerType).toBe('hybrid');
  });

  it('未注册的loop返回null', async () => {
    const { LoopScheduler } = await import('../../src/loops/loop-scheduler');
    const scheduler = new LoopScheduler();
    const info = scheduler.getNextTrigger('nonexistent', 'fast');
    expect(info).toBeNull();
  });
});

describe('onEvent — 事件驱动触发', () => {
  it('sentinel:P0事件触发loop-1 fast scale', async () => {
    const { LoopScheduler } = await import('../../src/loops/loop-scheduler');
    const scheduler = new LoopScheduler();
    scheduler.registerDefaultLoops();
    const triggered = scheduler.onEvent({ type: 'sentinel:P0' });
    expect(triggered.length).toBeGreaterThan(0);
    expect(triggered.some((t) => t.loopId === 'loop-1' && t.scale === 'fast')).toBe(true);
  });

  it('不匹配的事件类型返回空', async () => {
    const { LoopScheduler } = await import('../../src/loops/loop-scheduler');
    const scheduler = new LoopScheduler();
    scheduler.registerDefaultLoops();
    const triggered = scheduler.onEvent({ type: 'unknown:event' });
    expect(triggered).toHaveLength(0);
  });
});

describe('降级路径', () => {
  it('CronScheduler为null时仅降级日志不崩溃', async () => {
    const { LoopScheduler } = await import('../../src/loops/loop-scheduler');
    const scheduler = new LoopScheduler();
    // 不传入 scheduler → 降级
    const count = scheduler.registerDefaultLoops();
    expect(count).toBe(6);
    expect(scheduler.listLoops()).toHaveLength(6);
  });

  it('setEnabled false 后 onEvent 不触发', async () => {
    const { LoopScheduler } = await import('../../src/loops/loop-scheduler');
    const scheduler = new LoopScheduler();
    scheduler.registerDefaultLoops();
    scheduler.setEnabled(false);
    const triggered = scheduler.onEvent({ type: 'sentinel:P0' });
    expect(triggered).toHaveLength(0);
  });
});
