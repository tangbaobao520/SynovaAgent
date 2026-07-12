/**
 * tests/tools/tool-registry.test.ts — D65 ToolRegistry 单元测试
 *
 * 覆盖:
 * - register + invoke → 调用注册的tool函数
 * - invoke未注册的tool → 返回null
 * - register同名 → 后者覆盖前者
 * - list → 返回全部已注册工具
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ToolRegistry } from '../../src/tools/tool-registry';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    registry = new ToolRegistry();
  });

  it('register + invoke → 调用注册的tool函数', () => {
    registry.register({
      name: 'double',
      version: '1.0.0',
      description: 'Doubles a number',
      fn: (params) => {
        const n = params.n as number;
        return { result: n * 2 };
      },
      inputSchema: { n: 'number' },
      outputType: '{ result: number }',
    });

    const result = registry.invoke('double', { n: 5 });
    expect(result).toEqual({ result: 10 });
  });

  it('invoke未注册的tool → 返回null', () => {
    const result = registry.invoke('does-not-exist', {});
    expect(result).toBeNull();
  });

  it('register同名 → 后者覆盖前者', () => {
    registry.register({
      name: 'greet',
      version: '1.0.0',
      description: 'Greet v1',
      fn: () => 'hello',
      inputSchema: {},
      outputType: 'string',
    });
    registry.register({
      name: 'greet',
      version: '2.0.0',
      description: 'Greet v2',
      fn: () => 'hi there',
      inputSchema: {},
      outputType: 'string',
    });

    const result = registry.invoke('greet', {});
    expect(result).toBe('hi there');
  });

  it('list → 返回全部已注册工具', () => {
    registry.register({
      name: 'a', version: '1.0.0', description: '', fn: () => 1,
      inputSchema: {}, outputType: 'number',
    });
    registry.register({
      name: 'b', version: '1.0.0', description: '', fn: () => 2,
      inputSchema: {}, outputType: 'number',
    });

    expect(registry.list().length).toBe(2);
  });
});
