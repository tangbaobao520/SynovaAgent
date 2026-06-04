/**
 * engine-context.ts — engine-core 初始化注入
 *
 * 设置 SQLite 数据库 + 注入 EngineContext + 设置 StorageBackend。
 * engine-core 的所有模块依赖这些基础设施。
 */
import Database from 'better-sqlite3';
import { setEngineContext } from '@synova/diagnosis-engine';
import { createLogger } from '../logger';
import { loadConfig } from '../config';
import { SqliteStorageBackend } from '../store/storage-backend';
import * as path from 'path';
import * as fs from 'fs';

const log = createLogger('init/engine-context');

let db: Database.Database | null = null;

export function getDatabase(): Database.Database {
  if (!db) throw new Error('数据库未初始化，请先调用 initEngineContext()');
  return db;
}

export function initEngineContext(): void {
  const config = loadConfig();

  // 1. 初始化 SQLite
  const dbDir = path.dirname(config.dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  db = new Database(config.dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  log.info({ path: config.dbPath }, 'SQLite 数据库已打开');

  // 2. 注入 EngineContext (最小实现)
  setEngineContext({
    database: {
      getDb: () => db!,
    },
    logger: {
      info: (msg: string, meta?: any) => log.info(meta || {}, msg),
      warn: (msg: string, meta?: any) => log.warn(meta || {}, msg),
      error: (msg: string, meta?: any) => log.error(meta || {}, msg),
      debug: (msg: string, meta?: any) => log.debug(meta || {}, msg),
    },
  });

  // 3. 设置存储后端 (Slice 2.2: SQLite 持久化替换内存模式)
  const storageBackend = new SqliteStorageBackend(db!);
  log.info('EngineContext 注入完成 (SQLite 持久化存储模式)');
}

/** 关闭数据库连接 */
export function closeEngineContext(): void {
  if (db) {
    db.close();
    db = null;
    log.info('数据库已关闭');
  }
}
