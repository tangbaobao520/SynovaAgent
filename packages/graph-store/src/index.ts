/**
 * packages/graph-store/src/index.ts — @synova/graph-store 公开 API
 *
 * Phase 3: GraphStore 独立。替代旧 @synova/diagnosis-engine 的 createGraphStore。
 */

export { createSynovaGraphStore } from './graph-store';
export type { SynovaGraphStore } from './graph-store';
export type { SqliteDb, GraphStore, GraphStoreReader } from './types';
