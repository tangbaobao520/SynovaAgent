/**
 * sentinel-service-runonce.test.ts — D453 触发路径 GraphStore 构造测试
 *
 * 契约: runSentinelOnce 必须构造 GraphStore（db 非 undefined），哨兵 check 拿到
 *       带 queryNodes 的 store；GraphStore 构造失败 → 回退原始 db（不静默，非 undefined）。
 * 铁律 48: 正常路径 + 降级路径 + expect 断言（非空壳）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSentinelOnce } from '../../src/agent/sentinel-service';

let capturedCtx: Record<string, unknown> | null = null;
let throwOnConstruct = false;

vi.mock('../../src/sentinel/registry', () => ({
  getSentinelRegistry: () => ({
    get: () => ({
      check: async (ctx: Record<string, unknown>) => {
        capturedCtx = ctx;
        return { ok: true, findings: [], durationMs: 0, checkedAt: '' };
      },
    }),
  }),
}));
vi.mock('../../src/init/engine-context', () => ({
  getDatabase: () => ({ _rawDb: true }),
}));
vi.mock('../../src/adapters/sqlite-graph-store', () => ({
  SqliteGraphStore: class {
    constructor() {
      if (throwOnConstruct) throw new Error('mock construct fail');
    }
    queryNodes() {
      return [];
    }
  },
}));

describe('runSentinelOnce — D453 GraphStore 构造', () => {
  beforeEach(() => {
    capturedCtx = null;
    throwOnConstruct = false;
  });

  it('正常路径：构造 GraphStore，db 带 queryNodes（非 undefined）', async () => {
    const result = await runSentinelOnce('cash-runway');
    expect(result.ok).toBe(true);
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.db).toBeDefined();
    expect(typeof (capturedCtx!.db as { queryNodes?: unknown }).queryNodes).toBe('function');
  });

  it('降级路径：GraphStore 构造失败 → 回退原始 db（db 仍非 undefined）', async () => {
    throwOnConstruct = true;
    const result = await runSentinelOnce('cash-runway');
    expect(result.ok).toBe(true);
    expect(capturedCtx).not.toBeNull();
    expect(capturedCtx!.db).toBeDefined();
    expect(typeof (capturedCtx!.db as { queryNodes?: unknown }).queryNodes).toBe('undefined');
  });
});
