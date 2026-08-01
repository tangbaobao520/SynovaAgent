/**
 * entity-resolver-adapter.test.ts — L3 适配层单测: 实体解析 (D292)
 *
 * 验证 (铁律 0-2 测试先行 + 铁律 39):
 *   1. 正常路径: 适配器导出与 L4 原模块为同一引用 (纯代理 re-export)
 *   2. 降级路径: 适配器可独立导入不抛错
 *   3. 边界: 动态 import 场景可用 (diagnosis-launcher L242 的消费方式)
 *
 * Given/When/Then 格式。不调用 resolveEntitiesL3 本体, 避免 Python Bridge 依赖。
 */
import { describe, it, expect } from 'vitest';
import { resolveEntitiesL3 } from '../../src/l3/entity-resolver-adapter';
import { resolveEntitiesL3 as l4ResolveEntitiesL3 } from '../../src/l4/entity-resolver';

describe('L3 entity-resolver-adapter (D292)', () => {
  it('正常路径: 与 L4 原模块为同一引用 (纯代理)', () => {
    expect(resolveEntitiesL3).toBe(l4ResolveEntitiesL3);
  });

  it('降级路径: 可独立导入, 函数可调用', () => {
    expect(typeof resolveEntitiesL3).toBe('function');
  });

  it('边界: 动态 import 场景可用 (diagnosis-launcher L242 消费方式)', async () => {
    // 模拟 L2 动态 import 路径 — 模块加载成功且导出完整
    const mod = await import('../../src/l3/entity-resolver-adapter');
    expect(typeof mod.resolveEntitiesL3).toBe('function');
  });
});
