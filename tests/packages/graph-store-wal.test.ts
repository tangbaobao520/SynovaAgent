/**
 * tests/packages/graph-store-wal.test.ts — Phase 0.2 WAL 降级测试
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge
 * 铁律 33: *.test.ts 单元测试
 * 铁律 24: 错误路径有 log
 * 铁律 31: 降级信号传播
 *
 * 测试 enableWAL 函数在 NFS/SMB 不可用时的降级逻辑。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══ Mock SqliteDb 工厂 ═══

interface PragmaCall {
  sql: string;
  opts?: { simple?: boolean };
}

function createMockDb(options?: {
  pragmaResult?: unknown;
  pragmaError?: Error;
  pragmaFailOnSecond?: boolean; // 第一次成功，第二次失败（WAL 成功但 DELETE 失败）
}) {
  const calls: PragmaCall[] = [];
  let callCount = 0;

  const db = {
    exec: vi.fn(),
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn(),
    }),
    pragma: vi.fn().mockImplementation((sql: string, opts?: { simple?: boolean }) => {
      callCount++;
      calls.push({ sql, opts });

      // 模拟第二次 pragma 失败（WAL 成功了，但 DELETE 失败 — 罕见错误）
      if (options?.pragmaFailOnSecond && callCount >= 2) {
        throw options.pragmaError || new Error('DELETE pragma failed');
      }

      // 如果设置了错误，在第一次调用时抛出
      if (options?.pragmaError && callCount === 1) {
        throw options.pragmaError;
      }

      return options?.pragmaResult !== undefined ? options.pragmaResult : 'wal';
    }),
  };

  return { db, calls };
}

// 延迟导入（需要 mock 先注册）
import { enableWAL } from '../../packages/graph-store/src/graph-store';

describe('enableWAL — 正常路径', () => {
  it('应该启用 WAL 模式并设置 synchronous=NORMAL', () => {
    const { db, calls } = createMockDb({ pragmaResult: 'wal' });

    enableWAL(db as Parameters<typeof enableWAL>[0]);

    // 第一次调用: journal_mode=WAL
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[0].sql).toBe('journal_mode = WAL');
    // 第二次调用: synchronous=NORMAL
    expect(calls[1].sql).toContain('synchronous');
  });
});

describe('enableWAL — NFS/SMB 降级', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('"locking protocol" 错误应该降级到 DELETE 模式', () => {
    const { db, calls } = createMockDb({
      pragmaError: new Error('locking protocol'),
      pragmaResult: 'delete',
    });

    enableWAL(db as Parameters<typeof enableWAL>[0]);

    // 应该降级到 DELETE
    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1].sql).toBe('journal_mode = DELETE');
  });

  it('"not authorized" 错误应该降级到 DELETE 模式', () => {
    const { db, calls } = createMockDb({
      pragmaError: new Error('not authorized'),
      pragmaResult: 'delete',
    });

    enableWAL(db as Parameters<typeof enableWAL>[0]);

    expect(calls.length).toBeGreaterThanOrEqual(2);
    expect(calls[1].sql).toBe('journal_mode = DELETE');
  });

  it('WAL 返回非 "wal" 结果应该降级到 DELETE', () => {
    const { db, calls } = createMockDb({ pragmaResult: 'delete' });

    enableWAL(db as Parameters<typeof enableWAL>[0]);

    // journal_mode = DELETE 应该被调用
    expect(calls.some(c => c.sql.includes('DELETE'))).toBe(true);
  });
});

describe('enableWAL — 错误传播', () => {
  it('非 WAL 相关的错误应该向上传播', () => {
    const { db } = createMockDb({
      pragmaError: new Error('disk I/O error'),
    });

    expect(() => {
      enableWAL(db as Parameters<typeof enableWAL>[0]);
    }).toThrow('disk I/O error');
  });

  it('WAL 成功后 synchronous=NORMAL 失败应该传播', () => {
    const { db } = createMockDb({
      pragmaResult: 'wal',
      pragmaFailOnSecond: true,
      pragmaError: new Error('synchronous pragma failed'),
    });

    expect(() => {
      enableWAL(db as Parameters<typeof enableWAL>[0]);
    }).toThrow('synchronous pragma failed');
  });
});
