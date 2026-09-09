/**
 * tests/agent/graph-store-service.test.ts — L2 GraphStore 装配服务（D603 簇3）配对测试
 *
 * 契约（铁律 47）—— src/agent/graph-store-service.ts：
 *   @input  无（读 engine-context 全局 db）
 *   @output SqliteGraphStore 实例（schema 已就绪）
 *   @degraded 引擎上下文未初始化 → getDatabase() 抛出原样传播（fail-closed；
 *             auth.ts 内存 Map 降级 / agent-observer 500 degraded 语义均依赖此）
 *
 * 覆盖矩阵（铁律 48）：[降级] getDatabase 抛错原样传播 / [正常] db 可用时真实构造 /
 * [边界] 同 db 二次构造互相独立（兜底语义＝修复前 L1 每次直构）/ [回归] 类型出口
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import { createSystemGraphStore, type SqliteGraphStore } from '../../src/agent/graph-store-service';
import { SqliteGraphStore as SqliteGraphStoreClass } from '../../src/adapters/sqlite-graph-store';
import { getDatabase } from '../../src/init/engine-context';

const memDb = new Database(':memory:');

vi.mock('../../src/init/engine-context', () => ({
  getDatabase: vi.fn(),
}));

const mockedGetDatabase = vi.mocked(getDatabase);

beforeAll(() => {
  // SqliteGraphStore 构造即建 schema（graph_nodes/graph_triples…），内存库承载
  memDb.pragma('journal_mode = MEMORY');
  mockedGetDatabase.mockImplementation(() => memDb);
});

afterAll(() => {
  try { memDb.close(); } catch { /* 已关闭不掩盖断言 */ }
});

describe('createSystemGraphStore — 全局 db 兜底构造', () => {
  it('[正常] 构造成功：返回 SqliteGraphStore 实例，图查询表面可用', () => {
    const store = createSystemGraphStore();

    expect(store).toBeInstanceOf(SqliteGraphStoreClass);
    expect(typeof (store as unknown as { queryNodes: unknown }).queryNodes).toBe('function');
  });

  it('[降级] getDatabase 抛错（引擎未初始化）→ 原样传播，不吞不降级（fail-closed）', () => {
    mockedGetDatabase.mockImplementation(() => {
      throw new Error('数据库未初始化，请先调用 initEngineContext()');
    });
    try {
      expect(() => createSystemGraphStore()).toThrow(/未初始化/);
    } finally {
      mockedGetDatabase.mockImplementation(() => memDb); // 还原，不污染后续用例
    }
  });

  it('[边界] 同 db 二次构造返回独立实例（兜底语义＝修复前 L1 每次直构，非单例）', () => {
    const a = createSystemGraphStore();
    const b = createSystemGraphStore();

    expect(a).not.toBe(b);
  });

  it('[回归] 类型出口：SqliteGraphStore 类型可从本模块导入（L1 零 adapters 路径依赖的依据）', () => {
    const probe: SqliteGraphStore | undefined = undefined;
    expect(probe).toBeUndefined();
  });
});
