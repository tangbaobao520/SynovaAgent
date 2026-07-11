/**
 * agent/data-lifecycle-service.ts — D40 数据生命周期编排入口 (L2)
 *
 * 架构桥接: L1 路由层 → L2 → L3 (data-lifecycle-service)
 * 铁律 39: L1 只能依赖 L2。L2 可依赖 L1+L3。
 *
 * 这不是 engine-core 桥接文件（铁律46白名单不适用于此模式）。
 * 这是一个合法的架构桥接：纯 re-export + 转发，不含实现。
 */
export {
  checkPolicy,
  executeExport,
  executePurge,
  queryPurgeStatus,
} from '../l3/data-lifecycle-service';
export type { ExportResponse } from '../l3/data-lifecycle-service';
