/**
 * tests/l3/tool-guard.test.ts — 工具守卫单元测试 (Phase G4)
 *
 * 覆盖:
 *   beforeCall — 循环检测 / 重复失败阻断 / 参数校验 / 正常放行 / 空历史
 *   afterCall — 记录结果和耗时
 *   getLoopDetections — 查询阻断记录
 * 铁律 33: *.test.ts (纯函数，依赖注入)
 * 铁律 38: as any 零容忍
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolGuard } from '../../src/l3/tool-guard';
import type { ToolCallRecord } from '../../src/l3/tool-guard';

describe('ToolGuard', () => {
  let guard: ToolGuard;

  beforeEach(() => {
    guard = new ToolGuard();
  });

  // ═══ beforeCall — 循环检测 ═══

  describe('beforeCall — 循环检测', () => {
    it('初次调用 → allow', () => {
      const decision = guard.beforeCall('web_search', { q: 'test' });
      expect(decision.allow).toBe(true);
      expect(decision.reason).toBeUndefined();
    });

    it('相同工具+相同参数 2 次 → allow（未达阈值）', () => {
      guard.beforeCall('web_search', { q: 'test' }); // 1st
      const decision = guard.beforeCall('web_search', { q: 'test' }); // 2nd
      expect(decision.allow).toBe(true);
    });

    it('相同工具+相同参数 3 次 → block（循环检测）', () => {
      guard.beforeCall('web_search', { q: 'test' }); // 1st
      guard.beforeCall('web_search', { q: 'test' }); // 2nd
      const decision = guard.beforeCall('web_search', { q: 'test' }); // 3rd
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('循环');
    });

    it('相同工具+不同参数 → 不触发循环检测', () => {
      guard.beforeCall('web_search', { q: 'first' });
      guard.beforeCall('web_search', { q: 'first' });
      const decision = guard.beforeCall('web_search', { q: 'second' }); // different params
      expect(decision.allow).toBe(true);
    });

    it('不同工具+相同参数 → 不触发循环检测', () => {
      guard.beforeCall('web_search', { q: 'test' });
      guard.beforeCall('web_search', { q: 'test' });
      const decision = guard.beforeCall('web_extract', { q: 'test' }); // different tool
      expect(decision.allow).toBe(true);
    });

    it('阻断后正常调用重置计数 → 再次调用 allow', () => {
      guard.beforeCall('web_search', { q: 'test' }); // 1st
      guard.beforeCall('web_search', { q: 'test' }); // 2nd
      guard.beforeCall('web_search', { q: 'test' }); // 3rd → block

      // 恢复正常调用（不同参数）
      const decision = guard.beforeCall('web_search', { q: 'different' });
      expect(decision.allow).toBe(true);
    });
  });

  // ═══ beforeCall — 重复失败检测 ═══

  describe('beforeCall — 重复失败检测', () => {
    it('工具连续 3 次失败 → 第 4 次调用被阻断', () => {
      // 模拟 3 次连续失败
      guard.afterCall('data_query', { error: 'rate limit' }, 100);
      guard.afterCall('data_query', { error: 'timeout' }, 100);
      guard.afterCall('data_query', { error: 'internal error' }, 100);

      // 第 4 次 beforeCall 应阻断
      const decision = guard.beforeCall('data_query', { id: '123' });
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('失败');
    });

    it('工具连续 2 次失败 → allow（未达阈值）', () => {
      guard.afterCall('data_query', { error: 'timeout' }, 100);

      const decision = guard.beforeCall('data_query', { id: '123' });
      expect(decision.allow).toBe(true);
    });

    it('失败后有成功调用 → 重置失败计数', () => {
      guard.afterCall('data_query', { error: 'fail' }, 100);
      guard.afterCall('data_query', { error: 'fail' }, 100);
      guard.afterCall('data_query', { result: 'ok' }, 50); // 成功

      const decision = guard.beforeCall('data_query', { id: '123' });
      expect(decision.allow).toBe(true);
    });

    it('不同工具互不影响失败计数', () => {
      guard.afterCall('tool_a', { error: 'fail' }, 100);
      guard.afterCall('tool_a', { error: 'fail' }, 100);

      const decision = guard.beforeCall('tool_b', { x: 1 });
      expect(decision.allow).toBe(true);
    });
  });

  // ═══ beforeCall — 参数校验 ═══

  describe('beforeCall — 参数校验', () => {
    it('参数为 null → blocked', () => {
      const decision = guard.beforeCall('data_query', null as unknown as Record<string, unknown>);
      expect(decision.allow).toBe(false);
      expect(decision.reason).toContain('参数');
    });

    it('参数为 undefined → blocked', () => {
      const decision = guard.beforeCall('data_query', undefined as unknown as Record<string, unknown>);
      expect(decision.allow).toBe(false);
    });
  });

  // ═══ afterCall ═══

  describe('afterCall', () => {
    it('记录执行结果不影响后续调用', () => {
      guard.afterCall('web_search', { results: ['a'] }, 200);
      const decision = guard.beforeCall('web_search', { q: 'other' });
      expect(decision.allow).toBe(true);
    });

    it('记录耗时', () => {
      guard.afterCall('slow_tool', { done: true }, 5000);
      // afterCall 不应抛异常
    });
  });

  // ═══ getLoopDetections ═══

  describe('getLoopDetections', () => {
    it('无阻断 → 空数组', () => {
      guard.beforeCall('safe_tool', { x: 1 });
      const detections = guard.getLoopDetections();
      expect(detections).toEqual([]);
    });

    it('循环阻断后被记录', () => {
      guard.beforeCall('web_search', { q: 'test' });
      guard.beforeCall('web_search', { q: 'test' });
      guard.beforeCall('web_search', { q: 'test' }); // 3rd → block

      const detections = guard.getLoopDetections();
      expect(detections.length).toBe(1);
      expect(detections[0].tool).toBe('web_search');
      expect(detections[0].reason).toContain('循环');
    });

    it('多次阻断分别记录', () => {
      // 工具 A 触发循环
      guard.beforeCall('tool_a', { x: 1 });
      guard.beforeCall('tool_a', { x: 1 });
      guard.beforeCall('tool_a', { x: 1 });

      // 工具 B 触发循环
      guard.beforeCall('tool_b', { y: 2 });
      guard.beforeCall('tool_b', { y: 2 });
      guard.beforeCall('tool_b', { y: 2 });

      const detections = guard.getLoopDetections();
      expect(detections.length).toBe(2);
      expect(detections.map(d => d.tool).sort()).toEqual(['tool_a', 'tool_b']);
    });
  });

  // ═══ 空历史 ═══

  describe('空历史场景', () => {
    it('空数组作为历史 → allow', () => {
      // ToolGuard 内部不依赖外部 history，但接口接受
      const decision = guard.beforeCall('fresh_tool', { p: 1 }, []);
      expect(decision.allow).toBe(true);
    });

    it('全新 ToolGuard 实例 → 所有计数归零', () => {
      const freshGuard = new ToolGuard();
      const decision = freshGuard.beforeCall('web_search', { q: 'test' });
      expect(decision.allow).toBe(true);
    });
  });

  // ═══ D473: 分级阶梯 — reminder（2 次）/ block（3 次）═══
  // 2026-08-22 修正: MAX_TOOL_ROUNDS=3（tool-loop-executor）下 5 次永远达不到
  // → 阶梯压缩为 [2 提醒, 3 阻断]（DSH repeat-tool-reminder 阶梯 [3,5,8] 参考，descope warning 中档）

  describe('beforeCall — 分级阶梯（D473）', () => {
    it('相同工具+相同参数 2 次 → reminder: allow:true + level=reminder + 消息非空', () => {
      guard.beforeCall('web_search', { q: 'test' }); // 1st
      const decision = guard.beforeCall('web_search', { q: 'test' }); // 2nd
      expect(decision.allow).toBe(true);
      expect(decision.level).toBe('reminder');
      expect(decision.reminderMessage).toBeDefined();
      expect(decision.reminderMessage!.length).toBeGreaterThan(0);
    });

    it('相同工具+相同参数 1 次 → 无提醒（正常路径）', () => {
      const decision = guard.beforeCall('web_search', { q: 'test' }); // 1st
      expect(decision.allow).toBe(true);
      expect(decision.level).toBeUndefined();
    });

    it('相同工具+相同参数 3 次 → block: allow:false + level=block（保持原 LOOP_THRESHOLD=3 语义）', () => {
      guard.beforeCall('web_search', { q: 'test' }); // 1st
      guard.beforeCall('web_search', { q: 'test' }); // 2nd → reminder
      const decision = guard.beforeCall('web_search', { q: 'test' }); // 3rd → block
      expect(decision.allow).toBe(false);
      expect(decision.level).toBe('block');
      expect(decision.reason).toContain('循环');
    });

    it('2 次提醒后不同参数 → 计数不跨 key 累计（不误伤）', () => {
      guard.beforeCall('web_search', { q: 'test' });
      guard.beforeCall('web_search', { q: 'test' }); // 2nd → reminder
      const decision = guard.beforeCall('web_search', { q: 'other' }); // 不同参数
      expect(decision.allow).toBe(true);
      expect(decision.level).toBeUndefined();
    });

    it('不同工具 → 计数隔离（不误伤）', () => {
      guard.beforeCall('web_search', { q: 'test' });
      guard.beforeCall('web_search', { q: 'test' }); // 2nd → reminder for web_search
      const decision = guard.beforeCall('web_extract', { q: 'test' }); // 不同工具
      expect(decision.allow).toBe(true);
      expect(decision.level).toBeUndefined();
    });

    it('reminder 不阻断执行：2 次调用后仍 allow（决策留给模型，DSH advisory 范式）', () => {
      const d1 = guard.beforeCall('data_query', { id: '1' });
      const d2 = guard.beforeCall('data_query', { id: '1' }); // reminder
      expect(d1.allow).toBe(true);
      expect(d2.allow).toBe(true);
      expect(d2.level).toBe('reminder');
    });

    it('3 次 block 后不同参数 → 重置，可正常调用（回归）', () => {
      guard.beforeCall('web_search', { q: 'test' });
      guard.beforeCall('web_search', { q: 'test' });
      guard.beforeCall('web_search', { q: 'test' }); // block
      const decision = guard.beforeCall('web_search', { q: 'different' });
      expect(decision.allow).toBe(true);
    });
  });
});

// ═══ D473: 超时策略测试 — ToolDefinition.timeoutMs + TOOL_TIMEOUT 结构化结果 ═══
import { describe as d2, it as i2, expect as e2 } from 'vitest';
import { ToolRegistry, ToolTimeoutError } from '../../src/agent/tools';

d2('ToolDefinition.timeoutMs — 超时契约（D473）', () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  i2('ToolTimeoutError 类存在且 name=ToolTimeoutError', () => {
    const err = new ToolTimeoutError(50);
    expect(err.name).toBe('ToolTimeoutError');
    expect(err.message).toContain('50ms');
    expect(err.timeoutMs).toBe(50);
  });

  i2('声明 timeoutMs 的慢 handler → 返回 TOOL_TIMEOUT 结构化错误（非挂起）', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'slow_tool',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      timeoutMs: 50,
      handler: async () => {
        await sleep(200);
        return { ok: true };
      },
    });
    const result = await registry.execute('slow_tool', {});
    expect(result.error).toBeDefined();
    const err = result.error as unknown as { code?: string };
    expect(err.code).toBe('TOOL_TIMEOUT');
  });

  i2('timeoutMs 内完成 → 正常结果（不误伤）', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'fast_tool',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      timeoutMs: 200,
      handler: async () => ({ ok: true }),
    });
    const result = await registry.execute('fast_tool', {});
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  i2('未声明 timeoutMs → 行为不变（无超时，保守回归）', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'no_timeout_tool',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      handler: async () => {
        await sleep(30);
        return { ok: true };
      },
    });
    const result = await registry.execute('no_timeout_tool', {});
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });

  i2('timeoutMs=0 → 不超时（边界：0 视为未启用）', async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: 'zero_tool',
      description: 'test',
      parameters: { type: 'object', properties: {} },
      timeoutMs: 0,
      handler: async () => ({ ok: true }),
    });
    const result = await registry.execute('zero_tool', {});
    expect(result.error).toBeUndefined();
    expect(result.ok).toBe(true);
  });
});
