/**
 * tests/loops/d9-loops-verification.test.ts — D9 核心循环验证
 *
 * Gate 12: 验证 6 循环 × 3 尺度触发矩阵 + LoopScheduler 自检
 * 约束: ≥6 tests / 每 test ≥3 expect()
 */
import { describe, it, expect } from 'vitest';
import { validateLoopConfig, LOOP_TRIGGER_MATRIX } from '../../src/loops/loop-trigger-config';
import { LoopScheduler } from '../../src/loops/loop-scheduler';

describe('D9 — LOOP_TRIGGER_MATRIX 6循环×3尺度', () => {
  it('6个循环全部有3个scale', () => {
    expect(LOOP_TRIGGER_MATRIX).toHaveLength(6);
    for (const loop of LOOP_TRIGGER_MATRIX) {
      expect(loop.scales).toHaveLength(3);
      expect(loop.loopId).toBeTruthy();
      expect(loop.loopName).toBeTruthy();
    }
  });

  it('18个scale全部有有效的cron/period', () => {
    let totalScales = 0;
    for (const loop of LOOP_TRIGGER_MATRIX) {
      for (const scale of loop.scales) {
        totalScales++;
        expect(scale.period).toBeTruthy();
        expect(['cron', 'event', 'hybrid']).toContain(scale.triggerType);
        expect(['fast', 'medium', 'slow']).toContain(scale.name);
        expect(scale.coverage).toBeTruthy();
        expect(scale.condition).toBeTruthy();
      }
    }
    expect(totalScales).toBe(18);
  });

  it('validateLoopConfig 全部通过', () => {
    const errors = validateLoopConfig(LOOP_TRIGGER_MATRIX);
    expect(errors).toHaveLength(0);
  });
});

describe('D9 — LoopScheduler 自检', () => {
  it('registerDefaultLoops 返回 6', () => {
    const s = new LoopScheduler();
    const count = s.registerDefaultLoops();
    expect(count).toBe(6);
    expect(s.listLoops()).toHaveLength(6);
  });

  it('事件触发: sentinel:P0 匹配 loop-1 fast', () => {
    const s = new LoopScheduler();
    s.registerDefaultLoops();
    const triggered = s.onEvent({ type: 'sentinel:P0' });
    expect(triggered.length).toBeGreaterThanOrEqual(1);
    const match = triggered.find(t => t.loopId === 'loop-1' && t.scale === 'fast');
    expect(match).toBeDefined();
    expect(match!.loopId).toBe('loop-1');
  });

  it('getNextTrigger 返回正确结构', () => {
    const s = new LoopScheduler();
    s.registerDefaultLoops();
    const info = s.getNextTrigger('loop-1', 'fast');
    expect(info).not.toBeNull();
    expect(info!.loopId).toBe('loop-1');
    expect(info!.scale).toBe('fast');
    expect(info!.triggerType).toBe('hybrid');
    expect(info!.remainingMs).toBeGreaterThanOrEqual(0);
  });

  it('不存在循环的 getNextTrigger 返回 null', () => {
    const s = new LoopScheduler();
    const info = s.getNextTrigger('nonexistent', 'fast');
    expect(info).toBeNull();
  });
});

describe('D9 — 降级模式', () => {
  it('无 CronScheduler → registerDefaultLoops 仍返回 6', () => {
    const s = new LoopScheduler();
    expect(s.registerDefaultLoops()).toBe(6);
  });

  it('禁用调度器后事件不触发', () => {
    const s = new LoopScheduler();
    s.registerDefaultLoops();
    s.setEnabled(false);
    expect(s.onEvent({ type: 'sentinel:P0' })).toHaveLength(0);
  });
});
