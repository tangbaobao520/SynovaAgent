/**
 * packages/graph-store/src/index.ts — @synova/graph-store 公开 API
 *
 * Phase 3: GraphStore 独立。替代旧 @synova/diagnosis-engine 的 createGraphStore。
 * Phase 0.2: 新增删除权限检查器。
 */

export { createSynovaGraphStore, setGraphStoreDeletePermissionChecker, clearGraphStoreDeletePermissionChecker } from './graph-store';
export type { SynovaGraphStore, PermissionChecker } from './graph-store';
export type { SqliteDb, GraphStore, GraphStoreReader } from './types';
