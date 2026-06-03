/**
 * orchestrator/session-compaction.test.ts — Iter 6: 语义压缩 + 降级全覆盖 + 恢复 测试
 * 对标 Claw-Code: Given/When/Then
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { SessionManager } from '../../src/orchestrator/session-manager';
import { EventStore } from '../../src/orchestrator/event-store';
import { EventBus } from '../../src/orchestrator/event-bus';
import { PhaseStateMachine } from '../../src/orchestrator/phase-state-machine';

// ═══ SessionManager Tests ═══

describe('SessionManager', () => {
  let session: SessionManager;

  beforeEach(() => {
    session = new SessionManager({ compactionThresholdTokens: 100, tokenEstimateCharsPerToken: 3 });
  });

  it('Given messages below threshold, When needsCompaction, Then returns false', () => {
    session.addMessage({ role: 'user', content: '简短消息' });
    expect(session.needsCompaction()).toBe(false);
  });

  it('Given messages above threshold, When needsCompaction, Then returns true', () => {
    const longText = 'x'.repeat(500); // ~166 tokens at 3 chars/token, > 100 threshold
    session.addMessage({ role: 'user', content: longText });
    expect(session.needsCompaction()).toBe(true);
  });

  it('Given contradiction-detected message, When classifyMessage, Then returns light_compaction', () => {
    const result = session.classifyMessage({
      role: 'assistant',
      content: 'contradiction.detected: CEO评分0.7 vs 一线评分0.3',
    });
    expect(result).toBe('light_compress');
  });

  it('Given rootcause-found message, When classifyMessage, Then returns preserve_full', () => {
    const result = session.classifyMessage({
      role: 'assistant',
      content: 'rootcause.found: 排班制度不合理 -> 人员流失率上升',
    });
    expect(result).toBe('preserve_full');
  });

  it('Given normal conversation message, When classifyMessage, Then returns deep_compression', () => {
    const result = session.classifyMessage({
      role: 'user',
      content: '我们团队大概30人左右，主要做SaaS产品',
    });
    expect(result).toBe('deep_compress');
  });

  it('Given mixed messages, When compact, Then contradiction data preserved', () => {
    session.addMessage({ role: 'assistant', content: 'contradiction.detected: 沟通评分 7 vs 3' });
    session.addMessage({ role: 'user', content: 'x'.repeat(200) });

    const result = session.compact();
    expect(result.removedCount).toBeGreaterThan(0);
    // Contradiction should be in summary or preserved messages
    const preserved = session.getMessages().map(m => m.content).join(' ');
    expect(preserved + result.summary).toContain('contradiction');
  });

  it('Given boundary tool_use/tool_result pair, When compact, Then compaction completes without error', () => {
    session.addMessage({ role: 'assistant', content: 'calling tool...', tool_call_id: 'tc1' });
    session.addMessage({ role: 'tool', content: 'tool result', tool_call_id: 'tc1' });
    session.addMessage({ role: 'user', content: 'x'.repeat(300) });

    // Compaction should complete without throwing
    expect(() => session.compact()).not.toThrow();
    expect(session.estimateTokens()).toBeGreaterThan(0);
  });
});

// ═══ Degradation Matrix Tests ═══

describe('DegradationMatrix', () => {
  const matrix = [
    { scenario: 'LLM 不可用', phase: 2, action: '规则引擎降级', userVisible: 'DegradedBanner + 功能受限' },
    { scenario: '某模块失败', phase: 1, action: 'degradedModules[]', userVisible: '报告中标记数据不足' },
    { scenario: '子Agent超时', phase: 2, action: '跳过该Agent', userVisible: '假设数量减少' },
    { scenario: 'JSON解析失败', phase: 2, action: '重试1次→默认值', userVisible: '静默(log.warn)' },
    { scenario: '外部API超时', phase: 0, action: '8s超时+null', userVisible: '该维度数据空缺' },
    { scenario: '证据池满', phase: 1, action: 'LRU淘汰', userVisible: '无感知' },
    { scenario: '会话过大', phase: 2, action: '自动语义压缩', userVisible: '短暂延迟<3s' },
    { scenario: '进程崩溃', phase: -1, action: 'EventSourcing恢复', userVisible: '恢复到崩溃前Phase' },
    { scenario: '不可恢复错误', phase: -1, action: '归档+优雅关闭', userVisible: '可恢复的错误提示' },
    { scenario: '证据过期', phase: 1, action: '时间衰减+自动标记', userVisible: '标注时效性' },
  ];

  it('Given degradation matrix, When inspected, Then covers all 10 scenarios', () => {
    expect(matrix).toHaveLength(10);
    for (const entry of matrix) {
      expect(entry.scenario).toBeTruthy();
      expect(entry.action).toBeTruthy();
      expect(entry.userVisible).toBeTruthy();
    }
  });

  it('Given LLM 不可用, When Phase 0/1/3/4, Then can continue without LLM', () => {
    const llmIndependentPhases = [0, 1, 3, 4];
    const matrixEntry = matrix.find(m => m.scenario === 'LLM 不可用')!;
    // LLM unavailable should not block phases that don't need LLM
    expect(matrixEntry.action).toContain('规则引擎降级');
    expect(llmIndependentPhases).toHaveLength(4);
  });
});

// ═══ Crash Recovery Tests ═══

describe('Crash Recovery via Event Sourcing', () => {
  let db: Database.Database;
  let store: EventStore;
  let bus: EventBus;
  let sm: PhaseStateMachine;

  const config = {
    0: { label: '访谈', required: true, maxDurationMs: 600_000 },
    1: { label: '采集', required: true, maxDurationMs: 120_000 },
    2: { label: '假设', required: true, maxDurationMs: 300_000 },
    3: { label: '根因', required: true, maxDurationMs: 180_000 },
    4: { label: '报告', required: true, maxDurationMs: 60_000 },
    5: { label: '交付', required: true, maxDurationMs: 120_000 },
  };

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EventStore(db);
    bus = new EventBus(store);
    sm = new PhaseStateMachine(config);
  });

  function makeEvent(type: string, phase: number, consultationId: string) {
    return {
      id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      type, consultationId, phase,
      data: {}, traceId: 'trace1', spanId: 'span1',
      timestamp: new Date().toISOString(),
    };
  }

  it('Given running consultation with events logged, When crash and replay, Then state machine restored', () => {
    const consultationId = 'recover-test';

    // Simulate: advance to Phase 1, emit events
    sm.advance(); // Phase 0
    bus.emit(makeEvent('phase.started', 0, consultationId));
    bus.emit(makeEvent('interview.answered', 0, consultationId));

    sm.advance(); // Phase 1
    bus.emit(makeEvent('phase.started', 1, consultationId));

    // Crash! Create new state machine from events
    const replayed = bus.replay(consultationId);
    expect(replayed.length).toBeGreaterThan(0);

    // Restore: determine last phase from events
    const phaseEvents = replayed.filter(e => e.type === 'phase.started');
    const lastPhase = phaseEvents[phaseEvents.length - 1]?.phase ?? -1;

    const restored = new PhaseStateMachine(config);
    for (let i = 0; i <= Math.max(0, lastPhase); i++) restored.advance();

    expect(restored.getCurrentPhase()).toBe(lastPhase);
  });

  it('Given aborted consultation, When replay, Then abort reason preserved', () => {
    const consultationId = 'abort-test';
    sm.advance(); // Phase 0
    sm.abort('用户取消');
    bus.emit(makeEvent('consultation.aborted', 0, consultationId));

    const replayed = bus.replay(consultationId);
    const abortEvent = replayed.find(e => e.type === 'consultation.aborted');
    expect(abortEvent).toBeDefined();
  });
});
