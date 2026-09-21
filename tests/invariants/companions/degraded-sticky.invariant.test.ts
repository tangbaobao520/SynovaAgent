/**
 * tests/invariants/companions/degraded-sticky.invariant.test.ts — 伴生③镜像单测（D865 组2）
 *
 * 镜像: src/invariants/companions/degraded-sticky.invariant.ts（路径严格镜像，组2 硬要求）
 * 定位: INV-DEGRADED-STICKY 的**自身违约面**（降级写入被静默吞掉）+ 聚合粘滞记账
 * （D865 P1-2：伴生只观测不写业务状态，不反向改写 store.lastDegraded）+ 原型级回滚。
 * 深度链路（真实 addMessage 链 + 探针 + provider）留在 tests/sentinel/invariants.test.ts。
 *
 * 契约（铁律 47/48）:
 *   @input  — 检查点 = wrap SessionStore.prototype.appendEvent（观察写入结果）
 *             + SessionStore.prototype.addMessage（"抹掉"发生地）
 *   @output — void；getStickyDegradedSessions() 暴露聚合粘滞视图（探针消费）
 *   @degraded — 粘滞集只增不减（进程生命周期）；回滚钩子清空
 *   @error  — 写入降级但可见标记被抹 → InvariantError（静默吞掉，铁律 11/31 断裂）
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../../../src/store/session-store';
import { InvariantRegistry, InvariantError } from '../../../src/invariants/registry';
import { onDegradedSticky, getStickyDegradedSessions } from '../../../src/invariants/companions/degraded-sticky.invariant';

let registry: InvariantRegistry;
let db: Database.Database;
let store: SessionStore;

beforeEach(() => {
  registry = new InvariantRegistry();
  db = new Database(':memory:');
  store = new SessionStore(db);
});

afterEach(() => {
  registry.uninstallAll();
  db.close();
});

/** 造真实降级：摘掉 session_events 表（appendEvent 写入失败 → degraded）；返回可复原的 DDL */
function dropEventsTable(): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='session_events'").get() as { sql: string };
  db.exec('DROP TABLE session_events');
  return row.sql;
}

describe('伴生元数据（总纲 §9.4 notChecked）', () => {
  it('code/owner/packageName 稳定 + notChecked 非空且含 per-op 语义边界', () => {
    expect(onDegradedSticky.code).toBe('INV-DEGRADED-STICKY');
    expect(onDegradedSticky.owner).toBe('squad-b/coding');
    expect(onDegradedSticky.packageName).toBe('@synova/agent');
    expect(onDegradedSticky.notChecked.length).toBeGreaterThanOrEqual(5);
    expect(onDegradedSticky.notChecked.join('\n')).toContain('lastDegraded');
  });
});

describe('正向：无降级即无粘滞', () => {
  it('正常 addMessage → 无违约、粘滞集为空、store 降级标记保持 false', () => {
    registry.install(onDegradedSticky);
    const sid = store.createSession('org-unit').id;
    store.addMessage(sid, 'user', 'hello');
    expect(registry.statusOf('INV-DEGRADED-STICKY')?.lastFailure).toBeNull();
    expect(registry.statusOf('INV-DEGRADED-STICKY')?.hitCount).toBeGreaterThan(0);
    expect(getStickyDegradedSessions()).toEqual([]);
    expect(store.lastDegraded).toBe(false);
  });
});

describe('违约面：降级写入被静默吞掉', () => {
  it('appendEvent 降级但可见标记被抹 → InvariantError（铁律 11/31 断裂）', () => {
    registry.install(onDegradedSticky);
    const sid = store.createSession('org-unit').id;
    // 抹掉可见标记的写入：无论 store 内部怎么置位，对外读恒为 false（模拟"降级不可见"）
    Object.defineProperty(store, 'lastDegraded', {
      get: () => false,
      set: () => { /* 吞掉：写入降级但标记永远不可见 */ },
      configurable: true,
    });
    dropEventsTable();
    expect(() => store.addMessage(sid, 'user', 'boom')).toThrow(InvariantError);
    expect(registry.statusOf('INV-DEGRADED-STICKY')?.lastFailure).toContain('静默吞掉');
  });

  it('降级但标记可见（合规路径）→ 不违约，只在伴生内部记账', () => {
    registry.install(onDegradedSticky);
    const sid = store.createSession('org-unit').id;
    dropEventsTable();
    store.addMessage(sid, 'user', 'degraded-but-visible');
    expect(registry.statusOf('INV-DEGRADED-STICKY')?.lastFailure).toBeNull();
    expect(getStickyDegradedSessions()).toContain(sid);
    expect(store.lastDegraded).toBe(true); // session-store 原生置位（可见=合规）
  });
});

describe('粘滞记账（D865 P1-2：守卫不写业务状态）', () => {
  it('降级后恢复成功写入 → 聚合粘滞仍记账，且不反向改写 store.lastDegraded', () => {
    registry.install(onDegradedSticky);
    const sid = store.createSession('org-unit').id;
    const ddl = dropEventsTable();
    store.addMessage(sid, 'user', 'degraded-turn');
    expect(getStickyDegradedSessions()).toContain(sid);
    db.exec(ddl); // 恢复表 → 下一次写入成功
    store.addMessage(sid, 'user', 'healthy-turn');
    // per-op 语义：成功写入复位 store 字段（session-store 原生行为）
    expect(store.lastDegraded).toBe(false);
    // 聚合真相不被单次成功抹掉——在伴生内部记账（探针读 getStickyDegradedSessions）
    expect(getStickyDegradedSessions()).toContain(sid);
    expect(registry.statusOf('INV-DEGRADED-STICKY')?.lastFailure).toBeNull();
  });

  it('独立会话互不串扰：健康会话不进粘滞集', () => {
    registry.install(onDegradedSticky);
    const degraded = store.createSession('org-unit').id;
    const healthy = store.createSession('org-unit').id;
    const ddl = dropEventsTable();
    store.addMessage(degraded, 'user', 'degraded-turn');
    db.exec(ddl);
    store.addMessage(healthy, 'user', 'healthy-turn');
    expect(getStickyDegradedSessions()).toEqual([degraded]);
    expect(getStickyDegradedSessions()).not.toContain(healthy);
  });
});

describe('回滚面：原型级缝撤销与粘滞集清空', () => {
  it('uninstall 还原 appendEvent/addMessage 原型并清空粘滞集', () => {
    const beforeAppend = SessionStore.prototype.appendEvent;
    const beforeAdd = SessionStore.prototype.addMessage;
    registry.install(onDegradedSticky);
    const sid = store.createSession('org-unit').id;
    dropEventsTable();
    store.addMessage(sid, 'user', 'degraded-turn');
    expect(getStickyDegradedSessions()).toContain(sid);
    registry.uninstall('INV-DEGRADED-STICKY');
    expect(SessionStore.prototype.appendEvent).toBe(beforeAppend);
    expect(SessionStore.prototype.addMessage).toBe(beforeAdd);
    expect(getStickyDegradedSessions()).toEqual([]);
    expect(registry.registered).toBe(0);
  });
});
