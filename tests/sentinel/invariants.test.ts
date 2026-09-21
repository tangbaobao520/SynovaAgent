/**
 * tests/sentinel/invariants.test.ts — D831 P-2 运行期不变量机制（首批 3 条）
 *
 * 四组验收（派单 ⑤ + D831 卡 acceptance_points）:
 *   1. 负向：注入违约 → InvariantError（HTTP 层 5xx 语义），错误消息含 owner 名
 *   2. 正向：正常路径 → 无违约、lastFailure 为空、hitCount 增加
 *   3. 探针：registered ≥3；跑完正向用例后 ≥3 条 hitCount>0；registered==0 → 启动失败
 *   4. 原子回滚：第 3 条伴生 install 抛错 → 启动失败且已装第 1、2 条 wrap 撤销（无残留）
 *   5. 异步纪律：install 返回类型为 void（类型级断言）
 *
 * 全部穿真实实现：真实 InvariantRegistry + 真实 SessionStore（better-sqlite3 内存库）
 * + 真实 provider 工厂（createOpenAICompatibleProvider）出站路径 + 真实 Bootstrap Phase。
 * 禁 grep 命中当完成（验收标准-穿真实入口-v1）。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import express from 'express';
import { SessionStore } from '../../src/store/session-store';
import { createOpenAICompatibleProvider } from '../../src/providers/base';
import type { LLMProvider } from '../../src/providers/types';
import {
  InvariantRegistry,
  InvariantError,
  onToolSchemaSent,
  onToolCallPairing,
  onDegradedSticky,
  getStickyDegradedSessions,
  RUNTIME_INVARIANT_COMPANIONS,
  createRuntimeInvariantsPhase,
  invariantRegistry,
  invariantHealthRoutes,
} from '../../src/invariants';
import { Bootstrap } from '../../src/deploy/bootstrap';
import { callWithResilience } from '../../src/llm/retry-middleware';

// ═══ 夹具 ═══

let registry: InvariantRegistry;
let db: Database.Database;
let store: SessionStore;
let fetchUnderWrap: typeof globalThis.fetch;
const originalGlobalFetch = globalThis.fetch;

/** 底层 fetch 桩：记录出站 body，返回最小合法 chat 响应（真实 provider 链路用） */
function stubUpstreamFetch(): { calls: string[]; fetch: typeof globalThis.fetch } {
  const calls: string[] = [];
  const stub: typeof globalThis.fetch = async (input, init) => {
    if (typeof init?.body === 'string') calls.push(init.body);
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: 'ok' } }],
        model: 'stub-model',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  };
  return { calls, fetch: stub };
}

beforeEach(() => {
  registry = new InvariantRegistry();
  db = new Database(':memory:');
  store = new SessionStore(db);
  const stub = stubUpstreamFetch();
  fetchUnderWrap = stub.fetch;
  globalThis.fetch = stub.fetch;
});

afterEach(() => {
  globalThis.fetch = originalGlobalFetch;
  registry.uninstallAll();
  invariantRegistry.uninstallAll();
  db.close();
});

function makeProvider(): LLMProvider {
  return createOpenAICompatibleProvider({
    name: 'stub-provider',
    baseUrl: 'http://invariant-test.local/v1',
    model: 'stub-model',
    apiKey: 'test-key',
    getHeaders: () => ({}),
  });
}

/** 建真实会话行（agent_messages/session_events 有 FK → agent_sessions），返回会话 id */
function createRealSession(): string {
  return store.createSession('org-inv').id;
}

// ═══ 1. 负向：注入违约 → InvariantError + 消息含 owner ═══

describe('负向：注入违约 → fail-closed', () => {
  // D865 P0-1 口径澄清: 本组用例直调 provider.chat / fetch——只证明**伴生层**在缝上抛
  // InvariantError（生产必经 callWithResilience，韧性层上抛语义由 retry-middleware 与
  // tests/integration/invariant-failclosed.integration.test.ts 穿真实 HTTP 入口覆盖）。
  it('①【伴生层直调】INV-TOOL-SCHEMA-SENT：出站请求丢 tools（经真实 provider 出站路径）→ 抛错且消息含 owner', async () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const provider = makeProvider();
    // 注入违约：消息流含 role=tool（工具对话已发生），但 opts 不带 tools
    // → base.ts 组装的出站 body 无 tools 字段 → fetch 缝违约
    await expect(
      provider.chat(
        [
          { role: 'user', content: 'q' },
          { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }] },
          { role: 'tool', tool_call_id: 'c1', content: '{"r":1}' },
        ],
        // 故意不传 tools —— D819 复发形态
      ),
    ).rejects.toThrow(/INV-TOOL-SCHEMA-SENT/);
    const status = registry.statusOf('INV-TOOL-SCHEMA-SENT');
    expect(status).toBeDefined();
    expect(status!.lastFailure).toContain('tools schema 缺失');
    // 消息含 owner 名（知道是谁的锅）
    try {
      await provider.chat([{ role: 'tool', tool_call_id: 'c1', content: '{}' }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const chain: string[] = [msg];
      let cause: unknown = err;
      while (cause instanceof Error && cause.cause !== undefined) {
        cause = cause.cause;
        chain.push(cause instanceof Error ? cause.message : String(cause));
      }
      expect(chain.join(' | ')).toContain('squad-b/coding');
      const hasInvariantError = chain.some(() => true) && (err instanceof Error ? traverseCause(err) : false);
      expect(hasInvariantError).toBe(true);
    }
  });

  it('①【伴生层直调】直接 fetch 出站违约 → reject InvariantError（原型级）', async () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const body = JSON.stringify({
      model: 'm',
      messages: [{ role: 'tool', tool_call_id: 'c1', content: '{}' }],
      // tools 缺失
    });
    await expect(
      globalThis.fetch('http://x.local/v1/chat/completions', { method: 'POST', body }),
    ).rejects.toThrow(InvariantError);
  });

  it('② INV-TOOL-CALL-PAIRING：tool 消息无前置 assistant.tool_calls 配对 → InvariantError（真实 appendEvent）', () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    expect(() =>
      store.appendEvent('s-neg', 'message', { role: 'tool', tool_call_id: 'orphan-1', content: '{}' }),
    ).toThrow(InvariantError);
    const status = registry.statusOf('INV-TOOL-CALL-PAIRING');
    expect(status!.lastFailure).toContain('orphan-1');
    expect(status!.lastFailure).not.toBeNull();
  });

  it('③ INV-DEGRADED-STICKY：降级写入被静默吞掉（可见标记被抹）→ InvariantError（真实 addMessage 路径）', () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const sid = createRealSession();
    // 故意破坏：把 store 实例的 lastDegraded 变成"永远读 false、写无效"——
    // 模拟降级标记被抹掉（违约数据流仍走真实 addMessage → appendEvent 链）
    // （lastDegraded 为 public 字段 session-store.ts:172，直接 defineProperty 即可，无需类型强转）
    Object.defineProperty(store, 'lastDegraded', {
      get: () => false,
      set: () => { /* 吞掉：写入降级但标记永远不可见 */ },
      configurable: true,
    });
    // 真实降级：drop session_events 表 → appendEvent 写入失败（degraded）
    db.exec('DROP TABLE session_events');
    expect(() => store.addMessage(sid, 'user', 'hello')).toThrow(InvariantError);
    expect(registry.statusOf('INV-DEGRADED-STICKY')!.lastFailure).toContain('静默吞掉');
  });
});

/** 沿 cause 链找 InvariantError（provider.chat 会包一层 DiagnosticAgentError） */
function traverseCause(err: unknown): boolean {
  let cur: unknown = err;
  for (let i = 0; i < 5 && cur instanceof Error; i++) {
    if (cur instanceof InvariantError) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

// ═══ 2. 正向：正常路径无违约 ═══

describe('正向：正常路径 → 无违约、lastFailure 空、hitCount 增加', () => {
  it('① 真实 provider 出站（带 tools + 工具对话）→ 请求成功，lastFailure 为空', async () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const provider = makeProvider();
    const result = await provider.chat(
      [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name: 't', arguments: '{}' } }] },
        { role: 'tool', tool_call_id: 'c1', content: '{"r":1}' },
      ],
      { tools: [{ type: 'function', function: { name: 't', description: 'd', parameters: { type: 'object', properties: {} } } }] },
    );
    expect(result.content).toBe('ok');
    const status = registry.statusOf('INV-TOOL-SCHEMA-SENT')!;
    expect(status.lastFailure).toBeNull();
    expect(status.hitCount).toBeGreaterThan(0);
  });

  it('② 配对合法的 assistant.tool_calls → tool 消息序列（真实 appendEvent）→ 无违约', () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const sid = createRealSession();
    const res1 = store.appendEvent(sid, 'message', {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 't', arguments: '{}' } }],
    });
    expect(res1.ok).toBe(true);
    const res2 = store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'call_1', content: '{"r":1}' });
    expect(res2.ok).toBe(true);
    const status = registry.statusOf('INV-TOOL-CALL-PAIRING')!;
    expect(status.lastFailure).toBeNull();
    expect(status.hitCount).toBeGreaterThan(0);
  });

  it('③ 正常 addMessage（无降级）→ 无违约、粘滞集为空', () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const sid = createRealSession();
    store.addMessage(sid, 'user', 'hello');
    expect(getStickyDegradedSessions()).not.toContain(sid);
    const status = registry.statusOf('INV-DEGRADED-STICKY')!;
    expect(status.lastFailure).toBeNull();
    expect(status.hitCount).toBeGreaterThan(0);
  });

  it('③ 真实降级后粘滞：成功写入不抹掉**伴生内部**聚合降级（D865 P1-2: 不改写 store 字段）', () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const sid = createRealSession();
    // 真实降级：drop 表 → appendEvent 失败（session-store 自身置 lastDegraded=true，可见=合规）
    db.exec('DROP TABLE session_events');
    store.addMessage(sid, 'user', 'boom');
    expect(getStickyDegradedSessions()).toContain(sid);
    // 恢复表 → 下一次写入成功（per-op 语义：session-store 重置 lastDegraded=false）
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(session_id, seq)
      )
    `);
    store.addMessage(sid, 'user', 'recover');
    // D865 P1-2: 粘滞只在伴生内部记账（stickyDegradedSessions），守卫不写 store 字段——
    // 聚合真相不被单次成功抹掉（探针仍见 sid），且路由层 lastDegraded 消费方
    // （conversations.ts STORE_DEGRADED 帧）不会对健康轮次误报
    expect(getStickyDegradedSessions()).toContain(sid);
    expect(store.lastDegraded).toBe(false);
    const status = registry.statusOf('INV-DEGRADED-STICKY')!;
    expect(status.lastFailure).toBeNull(); // 粘滞是 enforcement，不是违约
  });

  it('③【D865 P1-2】守卫不写 store 字段：粘滞会话的成功 addMessage 不置 lastDegraded（防路由误报 STORE_DEGRADED）', () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const sid = createRealSession();
    db.exec('DROP TABLE session_events');
    store.addMessage(sid, 'user', 'degraded-turn');
    expect(getStickyDegradedSessions()).toContain(sid);
    db.exec(`
      CREATE TABLE IF NOT EXISTS session_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(session_id, seq)
      )
    `);
    store.addMessage(sid, 'user', 'healthy-turn');
    expect(store.lastDegraded).toBe(false); // 成功写入后 per-op 复位（session-store 原生）
    // 守卫不得反向改写（G6 能力面约束：伴生只观测不写业务状态）
    expect(store.lastDegraded).toBe(false);
    expect(getStickyDegradedSessions()).toContain(sid); // 聚合粘滞仍在伴生内部
  });
});

// ═══ 3. 探针：registered / hitCount / registered==0 启动失败 ═══

describe('反接线探针', () => {
  it('registered ≥3；正向用例后 ≥3 条 hitCount>0；每条含 code/owner/notChecked 元数据', () => {
    registry.installAll(RUNTIME_INVARIANT_COMPANIONS);
    const snap = registry.snapshot();
    expect(snap.registered).toBeGreaterThanOrEqual(3);
    // 驱动三条检查点（正向路径）
    const sid = createRealSession();
    store.appendEvent(sid, 'message', {
      role: 'assistant', content: '',
      tool_calls: [{ id: 'p1', type: 'function', function: { name: 't', arguments: '{}' } }],
    });
    store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'p1', content: '{}' });
    store.addMessage(sid, 'user', 'x');
    void Promise.resolve(globalThis.fetch('http://x.local/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }] }),
    })).catch(() => undefined);
    const snap2 = registry.snapshot();
    const withHits = snap2.invariants.filter((i) => i.hitCount > 0);
    expect(withHits.length).toBeGreaterThanOrEqual(3);
    for (const i of snap2.invariants) {
      expect(i.code).toMatch(/^INV-/);
      expect(i.owner.length).toBeGreaterThan(0);
    }
    // notChecked 元数据（总纲 §9.4）：注册表层面的物理校验在 install 里（空清单拒绝注册）
    for (const c of RUNTIME_INVARIANT_COMPANIONS) {
      expect(c.notChecked.length).toBeGreaterThan(0);
    }
  });

  it('registered==0 → 启动失败（真实 Bootstrap fatal Phase，K3 PROBE-D 做法：真 execute + 桩 installAll 空操作）', async () => {
    const phase = createRuntimeInvariantsPhase();
    // 不改写 execute（生产 index.ts 的真分支被测）——只把单例 installAll 换成空操作，
    // 使真 execute 判出注册表空转（fail-closed）
    const emptyBootstrap = new Bootstrap({ skipDefaultPhases: true });
    emptyBootstrap.registerPhase(phase);
    const originalInstallAll = invariantRegistry.installAll;
    invariantRegistry.installAll = (): void => { /* 桩：什么都不装 */ };
    try {
      const result = await emptyBootstrap.run();
      expect(result.aborted).toBe(true);
      expect(result.ok).toBe(false);
      const failed = result.phaseResults.find((r) => r.name === 'runtime-invariants');
      expect(failed?.status).toBe('failed');
      expect(failed?.errors[0]).toContain('registered==0');
    } finally {
      invariantRegistry.installAll = originalInstallAll;
    }
  });

  it('【D865 P2-3】fetch 回滚遇"已被他人替换" → snapshot.anomalies 标记（探针可见，防假绿）', () => {
    registry.install(onToolSchemaSent);
    // 模拟他人在 wrap 之后又替换了 globalThis.fetch → 回滚钩子无法还原
    const stranger: typeof globalThis.fetch = async () => new Response('{}', { status: 200 });
    globalThis.fetch = stranger;
    registry.uninstall('INV-TOOL-SCHEMA-SENT');
    // 条目已卸载，但注册表级异常登记仍在（健康探针可见）
    const snap = registry.snapshot();
    expect(snap.registered).toBe(0);
    expect(snap.anomalies.length).toBe(1);
    expect(snap.anomalies[0]).toContain('INV-TOOL-SCHEMA-SENT');
    expect(snap.anomalies[0]).toContain('已被他人替换');
  });

  it('【D865 P0-1 单元级】callWithResilience 对 InvariantError 不吞不重试 → 原样上抛', async () => {
    const provider = makeProvider();
    const bomb = new InvariantError('INV-TEST', 'squad-b/coding', '@synova/agent', '注入违约（韧性层上抛判据）');
    let chatCalls = 0;
    provider.chat = async (): Promise<never> => {
      chatCalls += 1;
      throw bomb;
    };
    await expect(
      callWithResilience(provider, [{ role: 'user', content: 'q' }]),
    ).rejects.toBe(bomb);
    expect(chatCalls).toBe(1); // 不重试（违约非瞬态故障）
  });
});

// ═══ 4. 原子回滚：第 3 条 install 抛错 → 启动失败 + 前 2 条 wrap 撤销 ═══

describe('原子回滚', () => {
  it('第 3 条伴生 install 抛错 → installAll 抛错、第 1/2 条 wrap 已撤销（无残留）', () => {
    const beforeFetch = globalThis.fetch;
    const beforeAppend = SessionStore.prototype.appendEvent;
    const beforeAdd = SessionStore.prototype.addMessage;
    const sid = createRealSession();

    const bomb = {
      ...onDegradedSticky,
      code: 'INV-BOMB',
      install: (): void => {
        throw new Error('注入：第 3 条伴生 install 失败');
      },
    };
    expect(() => registry.installAll([onToolSchemaSent, onToolCallPairing, bomb])).toThrow('第 3 条伴生 install 失败');
    // 原子回滚：注册表无部分注册
    expect(registry.registered).toBe(0);
    // 第 1 条 wrap（fetch）已撤销
    expect(globalThis.fetch).toBe(beforeFetch);
    // 第 2 条 wrap（appendEvent 配对检查）已撤销——违约数据不再被拦
    expect(SessionStore.prototype.appendEvent).toBe(beforeAppend);
    expect(() =>
      store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'ghost', content: '{}' }),
    ).not.toThrow();
    expect(SessionStore.prototype.addMessage).toBe(beforeAdd);
  });

  it('真实 Bootstrap Phase：execute 抛错 → aborted + rollback 撤销全部 wrap', async () => {
    const beforeFetch = globalThis.fetch;
    const bootstrap = new Bootstrap({ skipDefaultPhases: true });
    const failingPhase = {
      ...createRuntimeInvariantsPhase(),
      execute: async (): Promise<void> => {
        installThenThrow();
      },
    };
    function installThenThrow(): void {
      invariantRegistry.uninstallAll();
      invariantRegistry.installAll(RUNTIME_INVARIANT_COMPANIONS);
      throw new Error('注入：安装后启动序列其他步骤失败');
    }
    bootstrap.registerPhase(failingPhase);
    const result = await bootstrap.run();
    expect(result.aborted).toBe(true);
    // rollback 已把 fetch wrap 撤销（无残留监听）
    expect(globalThis.fetch).toBe(beforeFetch);
    expect(invariantRegistry.registered).toBe(0);
  });
});

// ═══ 5. 异步纪律：install 返回类型为 void（类型级断言） ═══

describe('异步纪律（类型级）', () => {
  it('伴生 install 的返回类型必须是 void（不得为 Promise）', () => {
    for (const c of RUNTIME_INVARIANT_COMPANIONS) {
      // 类型级：若 install 返回 Promise，IsPromise 为 true，false 不可赋值 → 编译期即失败
      type InstallReturn = ReturnType<typeof c.install>;
      type IsPromise = InstallReturn extends Promise<unknown> ? true : false;
      const notAPromise: IsPromise = false;
      expect(notAPromise).toBe(false);
      // 运行期旁证：同步调用 install（经注册表）不产生 thenable
      const r = new InvariantRegistry();
      expect(() => r.installAll([c])).not.toThrow();
      r.uninstallAll();
    }
  });

  it('重名注册拒绝（DSH 范式）', () => {
    registry.install(onToolSchemaSent);
    expect(() => registry.install(onToolSchemaSent)).toThrow(/already registered/);
  });

  it('无 notChecked 清单的伴生拒绝注册（总纲 §9.4 硬要求）', () => {
    const naked = { ...onToolSchemaSent, notChecked: [] };
    expect(() => registry.install(naked)).toThrow(/notChecked/);
  });
});

// ═══ 6. 探针路由自动化（真实 express Router + 真实 HTTP 监听，D831 自验复核补） ═══

describe('探针路由（GET /api/healthz/invariants，真实 HTTP）', () => {
  /**
   * 起真实 express 服务器挂 invariantHealthRoutes（探针路由挂的是模块单例 invariantRegistry，
   * 与 bootstrap Phase 6 同款实例）。探针请求用 originalGlobalFetch（未被 wrap 的原生 fetch）
   * 发出——探针请求本身不穿检查缝，注册表状态经由单例共享。
   */
  async function withProbeServer(probe: (url: string) => Promise<void>): Promise<void> {
    const app = express();
    app.use(invariantHealthRoutes);
    const server = app.listen(0);
    try {
      const addr = server.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      await probe(`http://127.0.0.1:${port}/api/healthz/invariants`);
    } finally {
      server.close();
    }
  }

  it('注册表为空 → 503 且 body.error 含 fail-closed（探针自身 fail-closed）', async () => {
    // 前提：单例在本用例前未被安装（beforeEach 不动单例，afterEach uninstallAll 兜底隔离）
    expect(invariantRegistry.registered).toBe(0);
    await withProbeServer(async (url) => {
      const res = await originalGlobalFetch(url);
      expect(res.status).toBe(503);
      const body = JSON.parse(await res.text()) as { registered: number; error: string };
      expect(body.registered).toBe(0);
      expect(body.error).toContain('fail-closed');
    });
  });

  it('install 3 条并跑一轮正向 → 200、registered=3、每条含 hitCount 字段', async () => {
    // D865 组4: installRuntimeInvariants 已退回 src/invariants/index.ts 模块内部（无真实
    // 外部调用方）——此处走**生产真路径**（bootstrap 注册的 Phase 6）装到探针路由同款单例。
    const boot = new Bootstrap({ skipDefaultPhases: true });
    boot.registerPhase(createRuntimeInvariantsPhase());
    const booted = await boot.run();
    expect(booted.ok).toBe(true);
    // 正向驱动三条检查点：配对 tool 序列（pairing，hit 在 role=tool 消息）、
    // addMessage（degraded-sticky）、chat/completions 出站（schema-sent）
    const sid = createRealSession();
    store.appendEvent(sid, 'message', {
      role: 'assistant', content: '',
      tool_calls: [{ id: 'hp1', type: 'function', function: { name: 't', arguments: '{}' } }],
    });
    store.appendEvent(sid, 'message', { role: 'tool', tool_call_id: 'hp1', content: '{}' });
    store.addMessage(sid, 'user', 'hello');
    await globalThis.fetch('http://x.local/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }] }),
    });
    await withProbeServer(async (url) => {
      const res = await originalGlobalFetch(url);
      expect(res.status).toBe(200);
      const body = JSON.parse(await res.text()) as {
        registered: number;
        invariants: Array<{ code: string; hitCount: number }>;
      };
      expect(body.registered).toBe(3);
      expect(body.invariants).toHaveLength(3);
      for (const inv of body.invariants) {
        expect(inv.code).toMatch(/^INV-/);
        expect(typeof inv.hitCount).toBe('number');
      }
      expect(body.invariants.filter((inv) => inv.hitCount > 0)).toHaveLength(3);
    });
  });
});
