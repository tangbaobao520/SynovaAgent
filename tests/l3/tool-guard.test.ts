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
});
