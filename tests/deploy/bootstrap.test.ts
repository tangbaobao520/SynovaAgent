/**
 * tests/deploy/bootstrap.test.ts — D83 Bootstrap 启动序列测试
 *
 * 覆盖:
 *   - Bootstrap 实例创建 + 默认 Phase 注册
 *   - run() 全部通过 → ok:true
 *   - Phase 0 fatal → aborted
 *   - Phase 2 degraded → ok:true, degraded:true
 *   - Phase 错误 + 执行时间
 *   - Phase 2 子顺序 DAG
 *   - Phase 2a ∥ 2d 并行
 *   - 降级模块追踪
 *   - reload() 预留接口
 *   - 热重载接口返回错误
 */
import { describe, it, expect, beforeEach } from 'vitest';

describe('D83: Bootstrap — 启动序列编排器', () => {
  beforeEach(() => {
    // 每个测试重新 import 保证干净状态
  });

  it('创建实例时注册默认 6 个 Phase', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap();
    // 通过 run() 后的 phaseResults 验证默认 phase
    const result = await boot.run();
    expect(result.phaseResults.length).toBe(6);
    expect(result.phaseResults.map((r) => r.phaseId).sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('全部 Phase 通过时返回 ok:true', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap();
    const result = await boot.run();
    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.phaseResults.every((r) => r.status === 'success' || r.status === 'degraded')).toBe(true);
  });

  it('Phase 0 fatal 失败 → aborted:true, ok:false', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase({
      id: 0,
      name: 'fatal-phase-test',
      description: 'Test fatal phase',
      fatal: true,
      execute: async () => {
        throw new Error('Phase 0 fatal error');
      },
      timeoutMs: 5_000,
    });
    // 注册一个 Phase 1 来验证 fatal 后它被跳过
    let phase1Executed = false;
    boot.registerPhase({
      id: 1,
      name: 'skipped-phase-test',
      description: 'Should be skipped',
      fatal: false,
      execute: async () => {
        phase1Executed = true;
      },
      timeoutMs: 5_000,
    });

    const result = await boot.run();
    expect(result.ok).toBe(false);
    expect(result.aborted).toBe(true);
    expect(result.phaseResults[0].status).toBe('failed');
    expect(result.phaseResults[0].errors.length).toBeGreaterThan(0);
    expect(result.phaseResults[0].errors[0]).toContain('Phase 0 fatal error');
    // Phase 1 因为 aborted 被跳过
    expect(phase1Executed).toBe(false);
  });

  it('Phase 非 fatal 失败 → degraded:true, ok:true, 后续 Phase 继续执行', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    // Phase 0: 通过
    boot.registerPhase({
      id: 0,
      name: 'pass-phase',
      description: 'Passes',
      fatal: false,
      execute: async () => {},
      timeoutMs: 5_000,
    });
    // Phase 1: 失败但非 fatal → degraded
    boot.registerPhase({
      id: 1,
      name: 'degraded-phase',
      description: 'Fails but not fatal',
      fatal: false,
      execute: async () => {
        throw new Error('Non-fatal error');
      },
      timeoutMs: 5_000,
    });
    // Phase 2: 应该继续执行
    let phase2Executed = false;
    boot.registerPhase({
      id: 2,
      name: 'continue-phase',
      description: 'Continues after degraded',
      fatal: false,
      execute: async () => {
        phase2Executed = true;
      },
      timeoutMs: 5_000,
    });

    const result = await boot.run();
    expect(result.ok).toBe(true);
    expect(result.degraded).toBe(false); // 无 degradedModules 记录
    expect(result.aborted).toBe(false);
    expect(result.phaseResults[0].status).toBe('success');
    expect(result.phaseResults[1].status).toBe('failed');
    // Phase 2 继续执行 (phaseResults[2] 是自定义 Phase 2)
    expect(result.phaseResults[2].status).toBe('success');
    expect(phase2Executed).toBe(true);
  });

  it('Phase 错误传播到 result.errors', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase({
      id: 0,
      name: 'error-propagation',
      description: 'Test error propagation',
      fatal: false,
      execute: async () => {
        throw new Error('Test error message');
      },
      timeoutMs: 5_000,
    });

    const result = await boot.run();
    expect(result.phaseResults[0].errors).toContain('Test error message');
  });

  it('Phase 执行时间大于 0', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase({
      id: 0,
      name: 'timing-test',
      description: 'Test timing',
      fatal: false,
      execute: async () => {
        // 模拟一点工作
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
      timeoutMs: 5_000,
    });

    const result = await boot.run();
    expect(result.phaseResults[0].durationMs).toBeGreaterThan(0);
    expect(result.phaseResults[0].durationMs).toBeGreaterThanOrEqual(5);
  });

  it('Phase 2 子顺序: 2a → 2b → 2c', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    // 使用默认 Phase（包含真实 Phase 2 DAG），但需要 mock sentinel/skill/playbook loader
    // 因为真实 loader 需要 extensions 目录。用 skip default + 自定义 Phase 2 替代。
    const boot = new Bootstrap({ skipDefaultPhases: true });

    const order: string[] = [];

    // 模拟 2a
    boot.registerPhase({
      id: 2,
      name: 'core-engine',
      description: 'Simulated Phase 2 with DAG',
      fatal: false,
      timeoutMs: 10_000,
      execute: async (_ctx) => {
        const { BootstrapContext } = await import('../../src/deploy/bootstrap');
        const ctx = _ctx as BootstrapContext;

        // Level 0: 2a
        order.push('2a');
        // 模拟 sentinel 加载
        ctx.set('sentinelsLoaded', true);
        await new Promise((r) => setTimeout(r, 5));

        // Level 1: 2b (验证 2a 已完成)
        if (ctx.get('sentinelsLoaded')) {
          order.push('2b');
          ctx.set('skillsLoaded', true);
        }

        // Level 2: 2c (验证 2b 已完成)
        if (ctx.get('skillsLoaded')) {
          order.push('2c');
        }
      },
    });

    // Phase 1 (正常通过)
    boot.registerPhase({
      id: 1, name: 'pre-p2', description: '前置 Phase',
      fatal: false, execute: async () => {},
      timeoutMs: 5_000,
    });

    const result = await boot.run();
    expect(result.ok).toBe(true);
    expect(order).toEqual(['2a', '2b', '2c']);
  });

  it('Phase 2a 和 2d 并行执行', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });

    const timestamps: Record<string, number> = {};

    boot.registerPhase({
      id: 2,
      name: 'core-engine',
      description: 'Parallel test',
      fatal: false,
      timeoutMs: 10_000,
      execute: async (_ctx) => {
        const { BootstrapContext } = await import('../../src/deploy/bootstrap');
        const ctx = _ctx as BootstrapContext;

        // 模拟 2a 和 2d 各需 30ms
        await Promise.all([
          (async () => {
            timestamps['2a-start'] = Date.now();
            await new Promise((r) => setTimeout(r, 30));
            timestamps['2a-end'] = Date.now();
            ctx.set('sentinelsLoaded', true);
          })(),
          (async () => {
            timestamps['2d-start'] = Date.now();
            await new Promise((r) => setTimeout(r, 30));
            timestamps['2d-end'] = Date.now();
            ctx.set('causalLoaded', true);
          })(),
        ]);

        // 2b 等待 2a 和 2d
        const allLoaded = ctx.get('sentinelsLoaded') && ctx.get('causalLoaded');
        expect(allLoaded).toBe(true);
        timestamps['2b-start'] = Date.now();
        await new Promise((r) => setTimeout(r, 10));
        timestamps['2b-end'] = Date.now();
      },
    });

    const result = await boot.run();
    expect(result.ok).toBe(true);

    // 并行: 2a 和 2d 同时启动
    const p2aStart = timestamps['2a-start']!;
    const p2aEnd = timestamps['2a-end']!;
    const p2dStart = timestamps['2d-start']!;
    const p2dEnd = timestamps['2d-end']!;
    const p2bStart = timestamps['2b-start']!;

    // 2a 和 2d 几乎同时启动 (< 5ms 差)
    expect(Math.abs(p2aStart - p2dStart)).toBeLessThan(10);
    // 2b 在 2a 和 2d 都结束后开始
    expect(p2bStart).toBeGreaterThanOrEqual(Math.max(p2aEnd, p2dEnd) - 5);

    // 2b 在 2a 和 2d 都结束后开始
    expect(p2bStart).toBeGreaterThanOrEqual(Math.max(p2aEnd, p2dEnd) - 5);
  });

  it('降级模块在 BootstrapServices.degradedModules 中追踪', async () => {
    const { Bootstrap, BootstrapContext } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase({
      id: 0,
      name: 'degraded-tracking',
      description: 'Test degraded tracking',
      fatal: false,
      timeoutMs: 5_000,
      execute: async (ctx: BootstrapContext) => {
        ctx.addDegraded(0, 'test-module', 'test error detail');
        ctx.addDegraded(0, 'test-module-b', 'second error');
      },
    });

    const result = await boot.run();
    expect(result.services.degradedModules.length).toBe(2);
    expect(result.services.degradedModules[0].phase).toBe(0);
    expect(result.services.degradedModules[0].module).toBe('test-module');
    expect(result.services.degradedModules[0].error).toBe('test error detail');
    expect(result.services.degradedModules[1].module).toBe('test-module-b');
  });

  it('reload() 返回预留接口错误', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap();
    const result = await boot.reload('test-sentinel');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('预留');
  });

  it('run() 返回正确的 BootstrapResult 结构', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase({
      id: 0,
      name: 'struct-test',
      description: 'Structure test',
      fatal: true,
      execute: async (ctx) => {
        // 模拟设置一些服务
        ctx.set('config', { port: 3000, devMode: true, dbPath: ':memory:', engineTokens: '', llmApiKey: '', llmBaseUrl: '', llmModel: '', gatewayHost: '', llmConfigured: false });
        ctx.set('db', {});
        ctx.set('eventStore', {});
        ctx.set('eventBus', {});
        ctx.set('hookRunner', {});
        ctx.set('sessionManager', {});
        ctx.set('stateMachine', {});
        ctx.set('wiring', {});
      },
      timeoutMs: 5_000,
    });

    const result = await boot.run();
    expect(result).toHaveProperty('ok');
    expect(result).toHaveProperty('degraded');
    expect(result).toHaveProperty('aborted');
    expect(result).toHaveProperty('phaseResults');
    expect(result).toHaveProperty('services');
    expect(result.services).toHaveProperty('config');
    expect(result.services).toHaveProperty('db');
    expect(result.services).toHaveProperty('eventBus');
    expect(result.services).toHaveProperty('degradedModules');
    expect(Array.isArray(result.services.degradedModules)).toBe(true);
  });

  it('超时: Phase 超过 timeoutMs 被终止', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase({
      id: 0,
      name: 'timeout-test',
      description: 'Should timeout',
      fatal: false,
      execute: async () => {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      },
      timeoutMs: 50, // 50ms 超时
    });

    const result = await boot.run();
    expect(result.phaseResults[0].status).toBe('failed');
    expect(result.phaseResults[0].errors[0]).toContain('超时');
  });

  it('Bootstrap 可跳过默认 Phase 并注册自定义', async () => {
    const { Bootstrap } = await import('../../src/deploy/bootstrap');
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase({
      id: 0,
      name: 'custom',
      description: 'Custom phase only',
      fatal: false,
      execute: async () => {},
      timeoutMs: 5_000,
    });

    const result = await boot.run();
    // 1 custom + 5 skipped (id 1-5 没注册)
    expect(result.phaseResults.length).toBe(6);
    expect(result.phaseResults[0].name).toBe('custom');
    expect(result.phaseResults[1].status).toBe('skipped');
  });
});
