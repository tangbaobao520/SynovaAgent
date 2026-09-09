/**
 * agent/graph-store-service.ts — GraphStore 装配服务 (L2)
 * @state: real
 *
 * D603 跨层修复（扫描报告 §三 簇3 图存储簇）: SqliteGraphStore 构造 + getDatabase
 * 句柄直取从 L1（routes/auth、routes/agent-observer）移出到本 L2 服务（铁律 39）。
 *
 * 注入优先语义由调用方保留（app.locals.graphStore ← server.ts:259 Bootstrap Phase 1c
 * 单例注入）；本服务是未注入环境（独立测试挂载/降级路径）的行为等价兜底——
 * 与修复前 L1 直构 `new SqliteGraphStore(getDatabase())` 逐字节一致，异常原样传播。
 *
 * L1→L2 ✅ | L2→L4(adapters)/L5(init) 装配职责 ✅（先例: conversation-engine.ts:44 同款直构）
 */

import { SqliteGraphStore } from '../adapters/sqlite-graph-store';
import { getDatabase } from '../init/engine-context';

// L1 类型出口 — L1 不再出现 adapters/sqlite-graph-store 值依赖
export type { SqliteGraphStore } from '../adapters/sqlite-graph-store';

/**
 * createSystemGraphStore — 全局 db 上的 SqliteGraphStore 兜底构造。
 * getDatabase() 未初始化时抛出（fail-closed），调用方既有 try-catch 语义不变
 * （如 auth.ts getUserStore 的内存 Map 降级）。
 */
export function createSystemGraphStore(): SqliteGraphStore {
  return new SqliteGraphStore(getDatabase());
}
