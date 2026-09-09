/**
 * tests/agent/session-storage-service.test.ts — L2 会话存储装配服务（D603 簇4）配对测试
 *
 * 契约（铁律 47）—— src/agent/session-storage-service.ts：
 *   @input  createSessionStorage(dbPath) 显式路径装配 / createSystemSessionStore() 全局 db 兜底
 *   @output SessionStorage{db, store} / SessionStore 实例
 *   @degraded createSessionStorage 路径不可创建 → 原样抛出（fail-closed，不静默）；
 *            createSystemSessionStore 引擎上下文未初始化 → 抛出（与修复前 L1 直构一致）
 *
 * 覆盖矩阵（铁律 48）：[正常] 临时路径装配+WAL / [边界] 嵌套目录自动创建 /
 * [降级] 不可创建路径抛错、引擎未初始化抛错 / [回归] 类型出口（L1 零 store/ 路径依赖的依据）
 */
import { describe, it, expect, afterAll } from 'vitest';
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { createSessionStorage, createSystemSessionStore, type SessionStore } from '../../src/agent/session-storage-service';
import { SessionStore as RealSessionStore } from '../../src/store/session-store';

const tmpDirs: string[] = [];

afterAll(() => {
  for (const d of tmpDirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* 清理失败不掩盖断言结果 */ }
  }
});

describe('createSessionStorage — 独立进程装配（CLI/TUI）', () => {
  it('[正常] 临时路径装配：返回 db+store，WAL 已开启，store 为 SessionStore 实例', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'd603-ss-'));
    tmpDirs.push(dir);
    const dbPath = path.join(dir, 'synova.db');

    const { db, store } = createSessionStorage(dbPath);

    expect(existsSync(dbPath)).toBe(true);
    expect(store).toBeInstanceOf(RealSessionStore);
    const mode = (db.pragma('journal_mode', { simple: true }) as string).toLowerCase();
    expect(mode).toBe('wal');
    // 存储行为真实可用（建会话→读回）
    const created = store.createSession('d603-test-org');
    expect(store.getSession(created.id)?.orgId).toBe('d603-test-org');
    db.close();
  });

  it('[边界] 嵌套目录不存在 → 自动创建（与修复前 cli/bootstrap mkdir 序列等价）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'd603-ss-'));
    tmpDirs.push(dir);
    const dbPath = path.join(dir, 'a', 'b', 'synova.db');

    const { db } = createSessionStorage(dbPath);

    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  it('[降级] 目标路径被同名文件占位 → 构造失败原样抛出（fail-closed，不吞）', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'd603-ss-'));
    tmpDirs.push(dir);
    const blocker = path.join(dir, 'blocker');
    writeFileSync(blocker, 'not a directory');
    const dbPath = path.join(blocker, 'synova.db');

    expect(() => createSessionStorage(dbPath)).toThrow();
  });
});

describe('createSystemSessionStore — 路由兜底装配', () => {
  it('[降级] 引擎上下文未初始化 → 抛错（与修复前 L1 直构 getDatabase() 抛错语义一致）', () => {
    // 本测试文件独立 worker，engine-context 未被任何测试初始化
    expect(() => createSystemSessionStore()).toThrow(/未初始化|not init/i);
  });

  it('[回归] 类型出口：SessionStore 类型可从本模块导入（L1 零 store/ 路径依赖的依据）', () => {
    // 类型位置使用（编译期断言）——运行时以哨兵值锁定导入面
    const probe: SessionStore | undefined = undefined;
    expect(probe).toBeUndefined();
    expect(typeof createSystemSessionStore).toBe('function');
  });
});
