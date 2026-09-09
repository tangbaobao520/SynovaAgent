/**
 * agent/session-storage-service.ts — 会话存储装配服务 (L2)
 * @state: real
 *
 * D603 跨层修复（扫描报告 §三 簇4 存储簇）: SessionStore/SQLite 的「构造」从 L1
 * （routes/sessions、cli.ts、tui-v2/lib/bootstrap）移出到本 L2 服务。
 * L1 只消费本模块返回的实例/类型，不再静态依赖
 * better-sqlite3 / store/session-store / init/engine-context（铁律 39）。
 *
 * 契约（铁律 47）:
 *   @input  createSessionStorage(dbPath) — 独立进程（CLI/TUI）显式 dbPath 装配；
 *           createSystemSessionStore() — 复用 engine-context 全局 db 的兜底装配。
 *   @output SessionStorage{db, store} / SessionStore 实例。
 *   @degraded 无 — 本服务不做降级；构造失败原样抛出，异常语义与修复前 L1 直构逐字节一致
 *           （fail-closed 由调用方既有 catch 语义保留，如 auth.ts 内存 Map 降级）。
 *
 * L1→L2 ✅ | L2→L5(store/init) 装配职责 ✅（check-architecture 仅约束 L1 直触）
 */

import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { SessionStore } from '../store/session-store';
import { getDatabase } from '../init/engine-context';

// L1 类型出口 — L1 不再出现 store/session-store 路径（含 type-position）
export type { SessionStore } from '../store/session-store';

/** 独立进程存储装配结果 */
export interface SessionStorage {
  db: Database.Database;
  store: SessionStore;
}

/**
 * createSessionStorage — CLI / TUI 独立进程的存储装配。
 * 目录创建 + WAL pragma + SessionStore 构造，与修复前 cli.ts:69-73 /
 * tui-v2/lib/bootstrap.ts:120-124 的装配序列等价。
 */
export function createSessionStorage(dbPath: string): SessionStorage {
  const resolved = path.resolve(dbPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  const store = new SessionStore(db);
  return { db, store };
}

/**
 * createSystemSessionStore — 路由兜底装配（复用 engine-context 全局 db）。
 * 行为与修复前 routes 内 `new SessionStore(getDatabase())` 一致；
 * 生产路径优先消费 server.ts 注入的 app.locals.sessionStore（Bootstrap Phase 0 单例）。
 */
export function createSystemSessionStore(): SessionStore {
  return new SessionStore(getDatabase());
}
