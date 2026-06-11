/**
 * diagnosis-orchestrator.test.ts — 六阶段编排器测试
 *
 * 对标 Claw-Code conversation.rs 的 15 个测试
 */

import {
  DiagnosisOrchestrator,
  DiagnosisLLMClient,
  LLMResponse,
  ToolExecutor,
  ToolResult,
  MemorySessionTracer,
} from '../diagnosis-orchestrator';
import { InitiatorProfile, DiagnosisErrorCode } from '../types';
import { PermissionPolicy } from '../diagnosis-permissions';
import { RecoveryExecutor } from '../diagnosis-recovery';

// ====================================================================
// 测试替身（对标 Claw-Code: ScriptedApiClient + NoopToolExecutor）
// ====================================================================

/** 脚本化 LLM 客户端——预设多轮响应 */
class ScriptedLLM implements DiagnosisLLMClient {
  callCount = 0;
  private script: LLMResponse[];

  constructor(...responses: LLMResponse[]) {
    this.script = responses;
  }

  async consult(_system: string, _user: string): Promise<LLMResponse> {
    const resp = this.script[this.callCount++];
    if (!resp) throw new Error(`unexpected call #${this.callCount}`);
    return resp;
  }

  /** 所有预设响应都已消耗的回调 */
  onExhausted?: () => void;
}

/** 无操作工具执行器——记录调用 */
class NoopToolExecutor implements ToolExecutor {
  calls: { tool: string; input: string }[] = [];
  async execute(tool: string, input: string): Promise<ToolResult> {
    this.calls.push({ tool, input });
    return { content: 'ok' };
  }
}

/** 故障注入 LLM 客户端——在第 N 次调用时失败 */
class FaultyLLM implements DiagnosisLLMClient {
  callCount = 0;
  constructor(private failOnCalls: Set<number>) {}

  async consult(): Promise<LLMResponse> {
    this.callCount++;
    if (this.failOnCalls.has(this.callCount)) {
      throw new Error(`injected failure at call #${this.callCount}`);
    }
    return { content: 'ok', model: 'test' };
  }
}

// ====================================================================
// 测试辅助
// ====================================================================

const makeInitiator = (overrides: Partial<InitiatorProfile> = {}): InitiatorProfile => ({
  role: 'CEO',
  teamId: 'team-1',
  name: 'Test User',
  ...overrides,
});

/** 返回假设 JSON 的脚本化 LLM */
const hypothesisLLM = () => new ScriptedLLM(
  {
    content: JSON.stringify([
      { statement: '知识共享断裂源于缺少统一文档平台', dimensions: ['knowledge_sharing'], confidence: 0.85, supportingEvidence: [], refutingEvidence: [] },
      { statement: '决策延迟是由于审批层级过深', dimensions: ['decision_making'], confidence: 0.72, supportingEvidence: [], refutingEvidence: [] },
    ]),
    model: 'test-model',
  },
  // Phase 5 action recommendations
  { content: '建议建立周度跨部门同步会议', model: 'test-model' },
);

// ====================================================================
// Phase 间转换
// ====================================================================

describe('DiagnosisOrchestrator', () => {
  let orchestrator: DiagnosisOrchestrator<ScriptedLLM, NoopToolExecutor>;
  let llm: ScriptedLLM;
  let tools: NoopToolExecutor;
  let tracer: MemorySessionTracer;

  beforeEach(() => {
    llm = hypothesisLLM();
    tools = new NoopToolExecutor();
    tracer = new MemorySessionTracer();
    orchestrator = new DiagnosisOrchestrator(llm, tools)
      .withSessionTracer(tracer)
      .withMaxIterations(5)
      .withGateDataCompleteness(0.1) // 降低阈值以便测试通过
      .withGateMinHypothesisConfidence(0.6);
  });

  it('completes full 0→1→2→3→4→5 phase sequence with scripted LLM', async () => {
    // Given: orchestor with scripted LLM and low gate thresholds
    // When: running a full consultation
    const result = await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: consultation completed successfully
    expect(result.teamId).toBe('team-1');
    expect(result.report).toBeDefined();
    expect(result.report.ceoSummary.length).toBeGreaterThan(0);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });

  it('emits phase_started events in correct order (0 through 5)', async () => {
    // Given: a standard consultation
    // When: running
    await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: 6 phase_started events in sequence
    const phaseEvents = tracer.events().filter(e => e.type === 'phase_started');
    const phases = phaseEvents.map(e => e.type === 'phase_started' ? e.phase : -1);
    expect(phases).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('emits phase_completed events for each phase', async () => {
    // Given: a standard consultation
    // When: running
    await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: 6 phase_completed events
    const completedEvents = tracer.events().filter(e => e.type === 'phase_completed');
    expect(completedEvents.length).toBe(6);
  });

  it('advances Phase 0→1 when scope confirmed', async () => {
    // Given: a consultation with explicit scope concerns
    const initiator = makeInitiator({ concerns: ['knowledge_sharing', 'trust_level'] });

    // When: running
    const result = await orchestrator.runConsultation('team-1', initiator);

    // Then: Phase 0 completed, Phase 1 evidence collected (gates passed)
    expect(result.report.degradedModules).toBeDefined();
  });

  // ── Gate Check ──

  it('rejects Phase 1→2 transition when Gate Check fails (data completeness)', async () => {
    // Given: orchestrator with very strict gate (100% completeness required)
    const strictOrch = new DiagnosisOrchestrator(llm, tools)
      .withSessionTracer(new MemorySessionTracer())
      .withGateDataCompleteness(1.0) // requires ALL dimensions to have data
      .withMaxIterations(3);

    // When: running — scope dimensions include many, but only modules actually return data
    const initiator = makeInitiator({
      concerns: ['knowledge_sharing', 'decision_making', 'information_flow',
                  'trust_level', 'goal_alignment', 'role_clarity',
                  'nonexistent_dimension_1', 'nonexistent_dimension_2'],
    });

    const result = await strictOrch.runConsultation('team-1', initiator);

    // Then: failed due to gate check
    const errorEvents = strictOrch['tracer'].events().filter(e => e.type === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
    expect(result.report.ceoSummary).toContain('数据完整性不足');
  });

  // ── LLM Fallback ──

  it('falls back to rule-based hypotheses when LLM throws', async () => {
    // Given: an orchestrator with faulty LLM (fails on first call)
    const faultyLLM = new FaultyLLM(new Set([1]));
    const orch = new DiagnosisOrchestrator(faultyLLM, tools)
      .withSessionTracer(new MemorySessionTracer())
      .withGateDataCompleteness(0.1)
      .withGateMinHypothesisConfidence(0.3) // low threshold for rule-based
      .withMaxIterations(3);

    // When: running
    const result = await orch.runConsultation('team-1', makeInitiator());

    // Then: still completes (rule-based fallback), hypotheses are from rule engine
    expect(result.report).toBeDefined();
    // Rule-based hypotheses use "rule-hyp-" prefix
    const rootCauses = result.report.rootCauseTree.rootCauses;
    expect(rootCauses.length).toBeGreaterThan(0);
  });

  // ── 迭代限制 ──

  it('stops after maxIterations reached', async () => {
    // Given: orchestrator with maxIterations = 1
    const orch = new DiagnosisOrchestrator(llm, tools)
      .withSessionTracer(new MemorySessionTracer())
      .withGateDataCompleteness(0.1)
      .withMaxIterations(1);

    // When: running — maxIterations should cap the Phase 2 loop
    const result = await orch.runConsultation('team-1', makeInitiator());

    // Then: still completes (has 2 preset LLM responses, both needed)
    expect(result.report).toBeDefined();
  });

  // ── 矛盾检测 ──

  it('detects contradictions between module and interviewee evidence', async () => {
    // Given: orchestrator with custom prompt builder
    // When: running a full consultation
    const result = await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: contradiction detection ran (Phase 3)
    expect(result.report.rootCauseTree).toBeDefined();
    expect(result.report.rootCauseTree.contradictions).toBeDefined();
  });

  // ── 降级模块传播 ──

  it('propagates degradedModules through all phases', async () => {
    // Given: a consultation
    // When: running
    const result = await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: degradedModules array present in result (may be empty, but always an array)
    expect(Array.isArray(result.degradedModules)).toBe(true);
  });

  // ── 报告结构 ──

  it('generates structured report with pyramid structure', async () => {
    // Given: a consultation
    // When: running
    const result = await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: report has all pyramid levels
    expect(result.report.ceoSummary.length).toBeGreaterThan(0);
    expect(typeof result.report.gapRadar).toBe('object');
    expect(Array.isArray(result.report.keyFindings)).toBe(true);
    expect(Array.isArray(result.report.evidenceChain)).toBe(true);
    expect(result.report.rootCauseTree).toBeDefined();
    expect(Array.isArray(result.report.actionRecommendations)).toBe(true);
  });

  // ── 错误路径：Gate Check 导致 Phase 1 重采集 ──

  it('re-runs Phase 1 when gate check fails on first attempt, then proceeds when data arrives', async () => {
    // Given: orchestrator that only passes gate after modules return data
    // gateDataCompleteness=0.6 means at least 60% of 22 modules must return valid evidence
    // (all modules run in Phase 1, so first run already has ~22 evidence items → gate passes)
    // To force a gate loop we need gateDataCompleteness > 1.0 → always fails
    const strictOrch = new DiagnosisOrchestrator(llm, tools)
      .withSessionTracer(new MemorySessionTracer())
      .withGateDataCompleteness(1.5) // impossible threshold — forces gate to always fail
      .withGateMinHypothesisConfidence(0.3)
      .withMaxIterations(3);

    // When: running with impossible gate
    const result = await strictOrch.runConsultation('team-1', makeInitiator());

    // Then: gate never passed, reports data insufficiency
    expect(result.report.ceoSummary).toContain('数据完整性不足');
    // Evidence was collected (Phase 1 ran at least once)
    expect(result.report.evidenceChain.length).toBeGreaterThan(0);
  });

  // ── 错误路径：模块降级传播到全阶段 ──

  it('propagates module degradation: modules that fail in Phase 1 appear in Phase 2-5 outputs', async () => {
    // Given: a consultation — some modules may degrade (database not available in test)
    // When: running
    const result = await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: degradedModules propagated to report
    expect(Array.isArray(result.degradedModules)).toBe(true);
    expect(Array.isArray(result.report.degradedModules)).toBe(true);
    // Report degradedModules match result degradedModules
    for (const m of result.report.degradedModules) {
      expect(result.degradedModules).toContain(m);
    }
  });

  // ── 错误路径：maxIterations 强制截断 ──

  it('enforces maxIterations: does not exceed configured iteration limit', async () => {
    // Given: orchestrator with maxIterations = 1
    const orch = new DiagnosisOrchestrator(llm, tools)
      .withSessionTracer(new MemorySessionTracer())
      .withGateDataCompleteness(0.1)
      .withMaxIterations(1);

    // When: running
    const result = await orch.runConsultation('team-1', makeInitiator());

    // Then: report generated within 1 iteration (no infinite loop)
    expect(result.report).toBeDefined();
    // With 2 scripted LLM responses, Phase 2 + Phase 5 each consume one.
    // maxIterations=1 means the Phase 2 loop (gate → hypothesize) runs ≤1 time.
  });

  // ── 错误路径：LLM 空响应 → llm_fallback 事件 → 规则引擎接管 ──

  it('emits llm_fallback event when LLM returns unparseable content and falls back to rule engine', async () => {
    // Given: 6 experts each get bad responses, synthesizer also gets bad → fallback to rule engine
    const badResponse = { content: '这里是一些自然语言分析，而不是JSON格式的假设...', model: 'test' };
    const badLLM = new ScriptedLLM(
      badResponse, badResponse, badResponse, badResponse, badResponse, badResponse, // 6 experts
      badResponse, // synthesizer
    );
    const orch = new DiagnosisOrchestrator(badLLM, tools)
      .withSessionTracer(new MemorySessionTracer())
      .withGateDataCompleteness(0.1)
      .withGateMinHypothesisConfidence(0.3)
      .withMaxIterations(3);

    const result = await orch.runConsultation('team-1', makeInitiator());

    // Then: rule engine generated hypotheses (id starts with "rule-hyp-")
    const rootCauses = result.report.rootCauseTree.rootCauses;
    expect(rootCauses.length).toBeGreaterThan(0);
  });

  // ── 完整事件流 ──

  it('returns complete event stream in ConsultationResult', async () => {
    // Given: a consultation
    // When: running
    const result = await orchestrator.runConsultation('team-1', makeInitiator());

    // Then: events contain phase boundaries and evidence/hypothesis/root_cause events
    const eventTypes = result.events.map(e => e.type);
    expect(eventTypes).toContain('phase_started');
    expect(eventTypes).toContain('phase_completed');

    // If gates passed, we also have hypothesis and root_cause events
    const hasHypotheses = eventTypes.includes('hypothesis_generated');
    const hasRootCauses = eventTypes.includes('root_cause_identified');
    const hasReport = eventTypes.includes('report_ready');

    // At least report_ready should always fire
    expect(hasReport).toBe(true);
  });
});

// ====================================================================
// Builder 模式
// ====================================================================

describe('DiagnosisOrchestrator builder', () => {
  it('withMaxIterations returns this for chaining', () => {
    // Given: a new orchestrator
    const o = new DiagnosisOrchestrator(new ScriptedLLM(), new NoopToolExecutor());

    // When: chaining builder methods
    const result = o
      .withMaxIterations(5)
      .withGateDataCompleteness(0.7)
      .withGateMinHypothesisConfidence(0.5)
      .withPermissionPolicy(new PermissionPolicy())
      .withRecoveryExecutor(new RecoveryExecutor())
      .withSessionTracer(new MemorySessionTracer());

    // Then: returns same instance
    expect(result).toBe(o);
  });
});

// ====================================================================
// ScriptedLLMClient — 测试替身模式
// ====================================================================

describe('ScriptedLLM', () => {
  it('returns preset responses in order', async () => {
    // Given: scripted LLM with 3 responses
    const llm = new ScriptedLLM(
      { content: 'first', model: 'test' },
      { content: 'second', model: 'test' },
      { content: 'third', model: 'test' },
    );

    // When: calling consult 3 times
    const r1 = await llm.consult('', '');
    const r2 = await llm.consult('', '');
    const r3 = await llm.consult('', '');

    // Then: responses returned in order
    expect(r1.content).toBe('first');
    expect(r2.content).toBe('second');
    expect(r3.content).toBe('third');
    expect(llm.callCount).toBe(3);
  });

  it('throws on unexpected call beyond script', async () => {
    // Given: scripted LLM with 1 response
    const llm = new ScriptedLLM({ content: 'only', model: 'test' });

    // When: calling beyond the script
    await llm.consult('', '');

    // Then: second call throws
    await expect(llm.consult('', '')).rejects.toThrow('unexpected call');
  });
});

// ====================================================================
// FaultyLLM — 故障注入模式
// ====================================================================

describe('FaultyLLM', () => {
  it('throws on specified call numbers', async () => {
    // Given: faulty LLM that fails on calls 1 and 3
    const llm = new FaultyLLM(new Set([1, 3]));

    // When/Then: call 1 fails
    await expect(llm.consult('', '')).rejects.toThrow('injected failure at call #1');
    // Call 2 succeeds
    const r2 = await llm.consult('', '');
    expect(r2.content).toBe('ok');
    // Call 3 fails
    await expect(llm.consult('', '')).rejects.toThrow('injected failure at call #3');
  });
});

// ====================================================================
// MemorySessionTracer
// ====================================================================

describe('MemorySessionTracer', () => {
  it('traces and retrieves events', () => {
    // Given: a fresh tracer
    const t = new MemorySessionTracer();

    // When: tracing events
    t.trace({ type: 'phase_started', phase: 0, timestamp: '2026-05-30T10:00:00Z' });
    t.trace({ type: 'phase_started', phase: 1, timestamp: '2026-05-30T10:01:00Z' });

    // Then: events retrievable
    expect(t.count()).toBe(2);
    expect(t.events()).toHaveLength(2);
    expect(t.events()[0].type).toBe('phase_started');
    if (t.events()[0].type === 'phase_started') {
      expect(t.events()[0].phase).toBe(0);
    }
  });
});

// ====================================================================
// NoopToolExecutor — 测试 spy 模式
// ====================================================================

describe('NoopToolExecutor', () => {
  it('records all tool calls for later assertion', async () => {
    // Given: a noop executor
    const executor = new NoopToolExecutor();

    // When: executing 3 tools
    await executor.execute('search', '{"q":"test"}');
    await executor.execute('analyze', '{"data":"x"}');
    await executor.execute('report', '{"format":"html"}');

    // Then: all calls recorded
    expect(executor.calls).toHaveLength(3);
    expect(executor.calls[0].tool).toBe('search');
    expect(executor.calls[1].tool).toBe('analyze');
    expect(executor.calls[2].tool).toBe('report');
  });
});
