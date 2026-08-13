/**
 * l3/graph-traversal-adapter.ts — L3 适配层: 图遍历 (D292)
 *
 * 铁律 39: L2 禁触 L4。本适配器是 L2(agent) → L3(适配) → L4(graph-traversal) 的合规桥接点。
 * 纯代理 — 转发 createGraphTraversal 同一实现, 不修改逻辑, 消费方行为零改变。
 */
export { createGraphTraversal } from '../l4/graph-traversal';
