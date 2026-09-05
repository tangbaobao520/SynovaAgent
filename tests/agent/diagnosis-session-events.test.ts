/**
 * diagnosis-session-events.test.ts — D487 (D394 片2-A): GA 诊断会话事件化装配
 *
 * 验证 D500 事件溯源地基在生产链路的装配:
 *   ① consult 一次后 session_events 含诊断事件流（diagnosis_phase/module/report）
 *   ② 事件流可回放: seq 严格单调 + payload 可解析 + phase→module→report 顺序
 *   ③ 双写失败显式降级: appendEvent 物理失败时诊断不崩（铁律 24/31）
 *   ④ 投影隔离: deriveMessages 跳过诊断事件（log-only），消息投影不变
 *   ⑤ 未装配 sessionStore 时诊断降级不崩（可选依赖边界）
 *
 * Given/When/Then 格式，fake engine 可控（red 先行: ①②④ 现状失败）。
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { SessionStore } from '../../src/store/session-store';
import { DiagnosisLauncher, type SessionStoreLike } from '../../src/agent/diagnosis-launcher';
import type { DiagnosisEngine, DiagnosisEvent, ConsultationResult } from '../../src/l2-interfaces/diagnosis-engine';
import type { EngineContext } from '../../src/agent/engine-context';
import { ToolRegistry } from '../../src/agent/tools';

// ═══ Fake DiagnosisEngine — 确定性发射 阶段→模块 两类事件后返回报告 ═══

function makeFakeEngine(): DiagnosisEngine {
  return {
    async runConsultation(teamId, _initiator, onEvent): Promise<ConsultationResult> {
      onEvent?.({ type: 'phase_started', phase: 1, label: '数据采集', confidence: 0.9 });
      onEvent?.({ type: 'interim_finding', phase: 2, message: '客户集中度过高', confidence: 0.7 });
      return { teamId, report: { summary: '测试诊断报告' }, totalDurationMs: 42, degradedModules: [] };
    },
  };
}

// ═══ Fake EngineContext — 最小装配（可选组件全部 null，走降级分支） ═══

function makeCtx(opts: { sessionStore?: SessionStoreLike; sessionId: string }): EngineContext {
  const ctx: EngineContext = {
    provider: { name: 'fake-d487' } as unknown as EngineContext['provider'],
    messages: [],
    orgId: 'org-d487',
    sessionId: opts.sessionId,
    toolRegistry: new ToolRegistry(),
    hookRunner: null,
    eventBus: null,
    evidenceCollector: null,
    corroborationEngine: null,
    graphBridge: null,
    graphStore: null,
    flags: { enableCommunityReports: false, enableEntityResolution: false },
    loggerPrefix: 'test',
    diagnosisEngine: makeFakeEngine(),
  };
  if (opts.sessionStore) {
    (ctx as { sessionStore?: SessionStoreLike }).sessionStore = opts.sessionStore;
  }
  return ctx;
}

/** 建内存库 + 会话 + 已装配 store 的 ctx（诊断事件落流的目标会话） */
function makeAssembled(): { db: Database.Database; store: SessionStore; sessionId: string; ctx: EngineContext } {
  const db = new Database(':memory:');
  const store = new SessionStore(db);
  const session = store.createSession('org-d487');
  const ctx = makeCtx({ sessionStore: store, sessionId: session.id });
  return { db, store, sessionId: session.id, ctx };
}

describe('D487: GA 诊断会话事件化装配（D500 地基接线）', () => {
  it('① consult 后 session_events 含诊断事件流（diagnosis_phase/module/report）', async () => {
    const { store, sessionId, ctx } = makeAssembled();
    const launcher = new DiagnosisLauncher(ctx, makeFakeEngine());

    const result = await launcher.startDiagnosis('GA', '测试GA');

    expect(result).not.toBeNull();
    const events = store.getEvents(sessionId);
    const types = events.map(e => e.eventType);
    expect(types).toContain('diagnosis_phase');
    expect(types).toContain('diagnosis_module');
    expect(types).toContain('diagnosis_report');
  });

  it('② 事件流可回放: seq 严格单调 + payload 可解析 + phase→module→report 顺序', async () => {
    const { store, sessionId, ctx } = makeAssembled();
    const launcher = new DiagnosisLauncher(ctx, makeFakeEngine());

    await launcher.startDiagnosis('GA', '测试GA');

    const events = store.getEvents(sessionId);
    expect(events.length).toBeGreaterThanOrEqual(3);
    // seq 严格单调（D500 不变量: append-only + MAX(seq)+1）
    for (let i = 1; i < events.length; i++) {
      expect(events[i].seq).toBe(events[i - 1].seq + 1);
    }
    // payload 全部可解析（回放前提）
    for (const ev of events) {
      expect(() => JSON.parse(ev.payloadJson)).not.toThrow();
    }
    // 顺序: 阶段事件先于模块事件，报告事件最后落
    const types = events.map(e => e.eventType);
    expect(types.indexOf('diagnosis_phase')).toBeLessThan(types.indexOf('diagnosis_module'));
    expect(types.indexOf('diagnosis_report')).toBe(types.length - 1);
  });

  it('③ 双写失败显式降级: appendEvent 物理失败时诊断不崩', async () => {
    const { db, sessionId, ctx } = makeAssembled();
    // 物理破坏事件表——appendEvent 内部 catch → degraded（铁律 24/31）
    db.exec('DROP TABLE session_events');
    const launcher = new DiagnosisLauncher(ctx, makeFakeEngine());

    const result = await launcher.startDiagnosis('GA', '测试GA');

    // 事件写失败不阻断诊断主流程
    expect(result).not.toBeNull();
    expect(result?.teamId).toBe('org-d487');
    expect(result?.report).toEqual({ summary: '测试诊断报告' });
  });

  it('④ 投影隔离: deriveMessages 跳过诊断事件，消息投影不变', () => {
    const db = new Database(':memory:');
    const store = new SessionStore(db);
    const session = store.createSession('org-d487');

    // 诊断事件插入必须成功（CHECK 约束已扩展）
    expect(store.appendEvent(session.id, 'diagnosis_phase', { phase: 1 }).ok).toBe(true);
    store.addMessage(session.id, 'user', '开始诊断');
    expect(store.appendEvent(session.id, 'diagnosis_module', { type: 'interim_finding' }).ok).toBe(true);
    expect(store.appendEvent(session.id, 'diagnosis_report', { summary: '报告' }).ok).toBe(true);

    // 投影只含 surface 事件（message），诊断事件 log-only 跳过
    const msgs = store.deriveMessages(session.id);
    expect(msgs.length).toBe(1);
    expect(msgs[0].role).toBe('user');
    expect(msgs[0].content).toBe('开始诊断');
  });

  it('⑤ 未装配 sessionStore 时诊断降级不崩', async () => {
    const ctx = makeCtx({ sessionId: 'sess-no-store' });
    const launcher = new DiagnosisLauncher(ctx, makeFakeEngine());

    const result = await launcher.startDiagnosis('GA', '测试GA');

    expect(result).not.toBeNull();
    expect(result?.totalDurationMs).toBe(42);
  });
});
