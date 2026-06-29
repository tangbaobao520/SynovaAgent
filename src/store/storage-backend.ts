/**
 * store/storage-backend.ts — 可替换存储后端 (Slice 2.2)
 *
 * 定义 StorageBackend 接口，支持 memory（开发/测试）和 sqlite（生产）。
 * 替换 engine-context 的硬编码内存模式。
 *
 * Iron law #31: 所有操作返回 {value, degraded} 标记。
 */
import Database from 'better-sqlite3';
import { createLogger } from '@synova/logger';

const log = createLogger('store/storage-backend');

// ═══ Types ═══

/** Storage entry */
export interface StorageEntry {
  key: string;
  value: string;
  namespace: string;
  updatedAt: string;
}

/** Result with degraded signal */
export interface StorageResult<T> {
  value: T;
  degraded: boolean;
  reason?: string;
}

/** Query filter */
export interface StorageQuery {
  namespace?: string;
  keyPrefix?: string;
  limit?: number;
}

// ═══ Interface ═══

/**
 * Pluggable storage backend.
 *
 * engine-core's EngineContext.storage is typed against this interface.
 * Switch between MemoryStorageBackend (dev/test) and SqliteStorageBackend (prod).
 */
export interface StorageBackend {
  /** Get a single value by key */
  get(key: string, namespace?: string): Promise<StorageResult<string | null>>;

  /** Set a key-value pair */
  set(key: string, value: string, namespace?: string): Promise<StorageResult<void>>;

  /** Delete a key */
  delete(key: string, namespace?: string): Promise<StorageResult<boolean>>;

  /** Query entries by namespace / key prefix */
  query(filter: StorageQuery): Promise<StorageResult<StorageEntry[]>>;

  /** Check if backend is healthy */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;
}

// ═══ Memory Backend (dev/test) ═══

/**
 * In-memory storage backend for development and testing.
 * Data is lost on process exit — no persistence.
 */
export class MemoryStorageBackend implements StorageBackend {
  private store = new Map<string, StorageEntry>();

  private makeKey(key: string, namespace = 'default'): string {
    return `${namespace}:${key}`;
  }

  async get(key: string, namespace?: string): Promise<StorageResult<string | null>> {
    const entry = this.store.get(this.makeKey(key, namespace));
    return { value: entry?.value ?? null, degraded: false };
  }

  async set(key: string, value: string, namespace?: string): Promise<StorageResult<void>> {
    const fullKey = this.makeKey(key, namespace);
    this.store.set(fullKey, {
      key,
      value,
      namespace: namespace || 'default',
      updatedAt: new Date().toISOString(),
    });
    return { value: undefined, degraded: false };
  }

  async delete(key: string, namespace?: string): Promise<StorageResult<boolean>> {
    const existed = this.store.delete(this.makeKey(key, namespace));
    return { value: existed, degraded: false };
  }

  async query(filter: StorageQuery): Promise<StorageResult<StorageEntry[]>> {
    let entries = [...this.store.values()];
    if (filter.namespace) entries = entries.filter(e => e.namespace === filter.namespace);
    if (filter.keyPrefix) entries = entries.filter(e => e.key.startsWith(filter.keyPrefix!));
    if (filter.limit) entries = entries.slice(0, filter.limit);
    return { value: entries, degraded: false };
  }

  async healthCheck(): Promise<{ healthy: boolean }> {
    return { healthy: true };
  }
}

// ═══ SQLite Backend (production) ═══

/**
 * SQLite-persisted storage backend for production.
 *
 * Uses a simple key-value table, suitable for engine-context
 * global state, feature flags, and small serialized objects.
 * NOT for large binary blobs — use GraphStore for ontology data.
 */
export class SqliteStorageBackend implements StorageBackend {
  private db: Database.Database;
  private degraded = false;

  constructor(db: Database.Database) {
    this.db = db;
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS storage_kv (
        full_key TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        namespace TEXT NOT NULL DEFAULT 'default',
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_storage_namespace ON storage_kv(namespace);
    `);
  }

  async get(key: string, namespace?: string): Promise<StorageResult<string | null>> {
    try {
      const row = this.db
        .prepare('SELECT value FROM storage_kv WHERE full_key = ?')
        .get(this.makeKey(key, namespace)) as { value: string } | undefined;
      return { value: row?.value ?? null, degraded: this.degraded };
    } catch (err: any) {
      log.warn({ err, key, namespace }, 'StorageBackend.get 失败');
      return { value: null, degraded: true, reason: err.message };
    }
  }

  async set(key: string, value: string, namespace?: string): Promise<StorageResult<void>> {
    try {
      const fullKey = this.makeKey(key, namespace);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO storage_kv (full_key, key, value, namespace, updated_at)
           VALUES (?, ?, ?, ?, datetime('now'))`,
        )
        .run(fullKey, key, value, namespace || 'default');
      return { value: undefined, degraded: this.degraded };
    } catch (err: any) {
      log.warn({ err, key, namespace }, 'StorageBackend.set 失败');
      return { value: undefined, degraded: true, reason: err.message };
    }
  }

  async delete(key: string, namespace?: string): Promise<StorageResult<boolean>> {
    try {
      const result = this.db
        .prepare('DELETE FROM storage_kv WHERE full_key = ?')
        .run(this.makeKey(key, namespace));
      return { value: result.changes > 0, degraded: this.degraded };
    } catch (err: any) {
      log.warn({ err, key, namespace }, 'StorageBackend.delete 失败');
      return { value: false, degraded: true, reason: err.message };
    }
  }

  async query(filter: StorageQuery): Promise<StorageResult<StorageEntry[]>> {
    try {
      let sql = 'SELECT key, value, namespace, updated_at AS updatedAt FROM storage_kv WHERE 1=1';
      const params: unknown[] = [];
      if (filter.namespace) {
        sql += ' AND namespace = ?';
        params.push(filter.namespace);
      }
      if (filter.keyPrefix) {
        sql += ' AND key LIKE ?';
        params.push(`${filter.keyPrefix}%`);
      }
      sql += ' ORDER BY updated_at DESC';
      if (filter.limit) {
        sql += ' LIMIT ?';
        params.push(filter.limit);
      }
      const rows = this.db.prepare(sql).all(...params) as StorageEntry[];
      return { value: rows, degraded: this.degraded };
    } catch (err: any) {
      log.warn({ err, filter }, 'StorageBackend.query 失败');
      return { value: [], degraded: true, reason: err.message };
    }
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    try {
      this.db.prepare('SELECT 1 FROM storage_kv LIMIT 0').run();
      return { healthy: true };
    } catch (err: any) {
      return { healthy: false, error: err.message };
    }
  }

  private makeKey(key: string, namespace = 'default'): string {
    return `${namespace}:${key}`;
  }
}
