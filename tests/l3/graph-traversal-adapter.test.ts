/**
 * graph-traversal-adapter.test.ts — L3 适配层单测: 图遍历 (D292)
 *
 * 验证 (铁律 0-2 测试先行 + 铁律 39):
 *   1. 正常路径: 适配器导出与 L4 原模块为同一引用 (纯代理 re-export — 零逻辑转发)
 *   2. 降级路径: 适配器可独立导入不抛错
 *   3. 边界: 签名契约保持 (接受 GraphStoreReader, 返回 GraphTraversal)
 *
 * Given/When/Then 格式。L4 原模块仅用于引用对比, 不调用函数本体。
 */
import { describe, it, expect } from 'vitest';
import { createGraphTraversal } from '../../src/l3/graph-traversal-adapter';
import { createGraphTraversal as l4CreateGraphTraversal } from '../../src/l4/graph-traversal';

describe('L3 graph-traversal-adapter (D292)', () => {
  it('正常路径: 与 L4 原模块为同一引用 (纯代理)', () => {
    expect(createGraphTraversal).toBe(l4CreateGraphTraversal);
  });

  it('降级路径: 可独立导入, 函数可调用', () => {
    expect(typeof createGraphTraversal).toBe('function');
  });

  it('边界: 签名契约保持 (接受 GraphStoreReader, 返回 GraphTraversal)', () => {
    // 编译期验证 — 最小 mock store 满足 GraphStoreReader 契约
    const store = {
      queryNodes: (_type: string) => [],
      queryEdges: () => [],
      getNode: (_id: string) => null,
    };
    const traversal = createGraphTraversal(store);
    expect(typeof traversal.traverse).toBe('function');
  });
});
