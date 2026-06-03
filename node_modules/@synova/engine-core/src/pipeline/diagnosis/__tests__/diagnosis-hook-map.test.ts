/**
 * diagnosis-hook-map.test.ts — 钩子系统单元测试
 */

import { DiagnosisHookMap } from '../diagnosis-hook-map';
import type { BeforePhaseContext, AfterModuleContext } from '../diagnosis-hook-map';

describe('DiagnosisHookMap — register & lifecycle', () => {
  it('starts with zero hooks of each kind', () => {
    const map = new DiagnosisHookMap();
    expect(map.count('before_phase')).toBe(0);
    expect(map.count('after_module')).toBe(0);
    expect(map.count('before_report')).toBe(0);
    expect(map.totalCount()).toBe(0);
  });

  it('registers a hook and increments count', () => {
    const map = new DiagnosisHookMap();
    map.register('before_phase', async (ctx) => ctx);
    expect(map.count('before_phase')).toBe(1);
    expect(map.totalCount()).toBe(1);
  });

  it('register returns this for chaining', () => {
    const map = new DiagnosisHookMap();
    const result = map.register('before_phase', async (ctx) => ctx);
    expect(result).toBe(map);
  });

  it('registerAll adds multiple hooks', () => {
    const map = new DiagnosisHookMap();
    map.registerAll('after_module', [
      async (ctx) => ctx,
      async (ctx) => ctx,
    ]);
    expect(map.count('after_module')).toBe(2);
  });

  it('unregister removes a specific hook', () => {
    const map = new DiagnosisHookMap();
    const fn = async (ctx: BeforePhaseContext) => ctx;
    map.register('before_phase', fn);
    expect(map.count('before_phase')).toBe(1);

    const removed = map.unregister('before_phase', fn);
    expect(removed).toBe(true);
    expect(map.count('before_phase')).toBe(0);
  });

  it('unregister returns false for unknown hook', () => {
    const map = new DiagnosisHookMap();
    const fn = async (ctx: BeforePhaseContext) => ctx;
    expect(map.unregister('before_phase', fn)).toBe(false);
  });

  it('clear removes all hooks of one kind', () => {
    const map = new DiagnosisHookMap();
    map.register('before_phase', async (ctx) => ctx);
    map.register('after_module', async (ctx) => ctx);
    map.clear('before_phase');
    expect(map.count('before_phase')).toBe(0);
    expect(map.count('after_module')).toBe(1);
  });

  it('clearAll removes all hooks', () => {
    const map = new DiagnosisHookMap();
    map.register('before_phase', async (ctx) => ctx);
    map.register('after_module', async (ctx) => ctx);
    map.register('before_report', async (ctx) => ctx);
    map.clearAll();
    expect(map.totalCount()).toBe(0);
  });

  it('has returns true only when hooks are registered', () => {
    const map = new DiagnosisHookMap();
    expect(map.has('before_phase')).toBe(false);
    map.register('before_phase', async (ctx) => ctx);
    expect(map.has('before_phase')).toBe(true);
  });
});

// ====================================================================
// DiagnosisHookMap — run pipeline
// ====================================================================

describe('DiagnosisHookMap — run pipeline', () => {
  it('runs hooks in registration order', async () => {
    const map = new DiagnosisHookMap();
    const order: number[] = [];

    map.register('before_phase', async (ctx) => {
      order.push(1);
      return ctx;
    });
    map.register('before_phase', async (ctx) => {
      order.push(2);
      return ctx;
    });

    const ctx: BeforePhaseContext = { phase: 0, teamId: 'test' };
    await map.run('before_phase', ctx);

    expect(order).toEqual([1, 2]);
  });

  it('each hook receives the previous hook output (pipe)', async () => {
    const map = new DiagnosisHookMap();

    map.register('before_phase', async (ctx) => {
      return { ...ctx, phase: 99 } as BeforePhaseContext;
    });
    map.register('before_phase', async (ctx) => {
      // 第二个 hook 收到的是第一个修改过的 phase=99
      expect(ctx.phase).toBe(99);
      return { ...ctx, phase: 100 } as BeforePhaseContext;
    });

    const ctx: BeforePhaseContext = { phase: 0, teamId: 'test' };
    const result = await map.run('before_phase', ctx);

    expect(result).not.toBeNull();
    expect(result!.phase).toBe(100);
  });

  it('returns null when a hook returns null (interrupt)', async () => {
    const map = new DiagnosisHookMap();
    let secondCalled = false;

    map.register('before_phase', async () => null); // 中断
    map.register('before_phase', async (ctx) => {
      secondCalled = true;
      return ctx;
    });

    const ctx: BeforePhaseContext = { phase: 0, teamId: 'test' };
    const result = await map.run('before_phase', ctx);

    expect(result).toBeNull();
    expect(secondCalled).toBe(false);
  });

  it('returns the final context when all hooks pass', async () => {
    const map = new DiagnosisHookMap();
    map.register('before_phase', async (ctx) => ctx);
    map.register('before_phase', async (ctx) => ctx);

    const ctx: BeforePhaseContext = { phase: 2, teamId: 'pipe-test' };
    const result = await map.run('before_phase', ctx);

    expect(result).not.toBeNull();
    expect(result!.teamId).toBe('pipe-test');
  });

  it('run with no hooks registered returns the original context', async () => {
    const map = new DiagnosisHookMap();
    const ctx: AfterModuleContext = {
      moduleId: 'hacd',
      moduleResult: {},
      teamId: 't',
      phase: 1,
    };

    const result = await map.run('after_module', ctx);

    expect(result).toBe(ctx);
  });

  it('different hook kinds are independent', async () => {
    const map = new DiagnosisHookMap();
    const beforeCalled: number[] = [];
    const afterCalled: number[] = [];

    map.register('before_phase', async (ctx) => {
      beforeCalled.push(1);
      return ctx;
    });
    map.register('after_module', async (ctx) => {
      afterCalled.push(1);
      return ctx;
    });

    await map.run('before_phase', { phase: 0, teamId: 't' });
    await map.run('after_module', { moduleId: 'm', moduleResult: {}, teamId: 't', phase: 1 });

    expect(beforeCalled).toEqual([1]);
    expect(afterCalled).toEqual([1]);
  });
});
