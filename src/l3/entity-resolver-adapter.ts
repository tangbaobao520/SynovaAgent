/**
 * l3/entity-resolver-adapter.ts — L3 适配层: 实体解析 (D292)
 *
 * 铁律 39: L2 禁触 L4。L2 diagnosis-launcher 动态 import 经此适配器访问 L4 entity-resolver。
 * 纯代理 — 转发 resolveEntitiesL3 同一实现, 不修改逻辑。
 */
export { resolveEntitiesL3 } from '../l4/entity-resolver';
