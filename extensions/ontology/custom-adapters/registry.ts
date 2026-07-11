/**
 * custom-adapters/registry.ts — 定制适配器注册模板
 *
 * 用于注册非标准数据源的适配器配置（不在 field-mappings/ 目录下）。
 * 只需创建适配器 JSON 文件并调用 registerAdapter() 即可。
 *
 * 使用方法:
 *   1. 创建自定义适配器 JSON（参见下方示例）
 *   2. 在此文件中注册: registerAdapter('my-adapter', config)
 *   3. 重启或调用 POST /api/adapters/reload 使生效
 *
 * 如果适配器放在 field-mappings/ 目录下，则自动被 AdapterScanner 发现，
 * 无需手动注册。
 */

// import { AdapterRegistry } from '../../../src/agent/adapter-registry';

/**
 * 注册一个自定义适配器。
 *
 * @param name - 适配器名称（用于 loadFieldMapping 加载）
 * @param config - 适配器配置对象
 *
 * @example
 * registerAdapter('my-custom-source', {
 *   name: 'my-custom-source',
 *   label: '自定义数据源',
 *   targetNodeType: 'Financial',
 *   mappings: [
 *     { externalField: '收入', prop: 'total_revenue', type: 'number' },
 *   ],
 * });
 */
// function registerAdapter(
//   name: string,
//   config: { name: string; label: string; targetNodeType: string; mappings: Array<{ externalField: string; prop: string; type: string }> },
// ): void {
//   const registry = AdapterRegistry.getInstance();
//   registry.register({
//     name,
//     label: config.label,
//     targetNodeType: config.targetNodeType,
//     registeredAt: new Date().toISOString(),
//     config: {
//       name: config.name,
//       label: config.label,
//       targetNodeType: config.targetNodeType,
//       mappings: config.mappings,
//     },
//   });
// }
