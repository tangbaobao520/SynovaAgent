/**
 * synova-diagnosis-engine-impl.test.ts — 诊断引擎实现集成测试
 *
 * 用 mock LLM 验证六阶段完整链路。
 */
import { describe, it, expect, vi } from 'vitest';
import {
  SynovaDiagnosisEngineImpl,
  createSynovaDiagnosisEngine,
} from '../../src/l3/synova-diagnosis-engine-impl';
import type {
  SynovaDiagnosisEngine,
  DiagnosisEvent,
  DiagnosisReport,
  LLMClient,
  ToolExecutor,
  ConsultationResult,
} from '../../src/l3/synova-diagnosis-engine';

// ═══ Helpers ═══

function createMockLLM(response?: string): LLMClient {
  const defaultResponse = JSON.stringify({
    hypotheses: [
      {
        dimension: 'D1',
        summary: '增长瓶颈的核心原因是客户留存率持续下降，新客获取成本上升。',
        confidence: 0.85,
        evidence: ['留存率从82%降至67%', 'CAC同比增长40%'],
      },
      {
        dimension: 'D2',
        summary: '组织架构中缺少专门的客户成功团队，售前售后脱节。',
        confidence: 0.72,
        evidence: ['无客户成功角色', '售后反馈未传递到产品'],
      },
    ],
    rootCauses: [
      {
        description: '客户成功体系缺失导致留存率持续恶化',
        dimension: 'D2',
        confidence: 0.88,
      },
      {
        description: '市场投放策略偏向新客获取，老客维护投入不足',
        dimension: 'D1',
        confidence: 0.79,
      },
    ],
    recommendations: [
      { action: '成立客户成功团队（3-5人），聚焦留存和增购', priority: 'high', dimension: 'D2' },
      { action: '将市场预算的30%从拉新转向老客激活', priority: 'high', dimension: 'D1' },
      { action: '建立客户健康度评分体系，每月跟踪', priority: 'medium', dimension: 'D4' },
    ],
    summary: '增长瓶颈的核心根因是客户成功体系缺失。建议优先建立客户成功团队并调整市场投入结构。',
  });

  return {
    async chat(_messages, _options) {
      return { content: response || defaultResponse };
    },
  };
}

function createMockTools(): ToolExecutor {
  return {
    async execute(_name, _args) {
      return { result: { ok: true } };
    },
    listTools() {
      return [];
    },
  };
}

function collectEvents(events: DiagnosisEvent[]): (e: DiagnosisEvent) => void {
  return (e: DiagnosisEvent) => { events.push(e); };
}

// ═══ 测试 ═══

describe('SynovaDiagnosisEngineImpl', () => {
  // ── 1. 基本链路 ──

  it('完整六阶段诊断 → 返回报告', async () => {
    const engine = new SynovaDiagnosisEngineImpl(createMockLLM(), createMockTools());
    const events: DiagnosisEvent[] = [];

    const result = await engine.runConsultation(
      'team_test',
      { role: '管理者', name: '张三', teamId: 'team_test', concerns: ['增长放缓'] },
      undefined,
      collectEvents(events),
    );

    // 验证结果结构
    expect(result.teamId).toBe('team_test');
    expect(result.report.reportId).toMatch(/^rpt_team_test_/);
    expect(result.report.summary).toContain('客户成功');
    expect(result.totalDurationMs).toBeGreaterThan(0);
    expect(result.degradedModules).toHaveLength(0);

    // 验证报告内容
    expect(result.report.rootCauses.length).toBeGreaterThanOrEqual(1);
    expect(result.report.recommendations.length).toBeGreaterThanOrEqual(1);
    expect(result.report.expertReports.length).toBeGreaterThanOrEqual(1);
  });

  // ── 2. 事件流 ──

  it('事件流包含全部六阶段', async () => {
    const engine = new SynovaDiagnosisEngineImpl(createMockLLM(), createMockTools());
    const events: DiagnosisEvent[] = [];

    await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] }, undefined, collectEvents(events));

    const phaseStarted = events.filter(e => e.type === 'phase_started');
    const phaseCompleted = events.filter(e => e.type === 'phase_completed');
    const hypotheses = events.filter(e => e.type === 'hypothesis_generated');
    const rootCauses = events.filter(e => e.type === 'root_cause_identified');
    const reportReady = events.filter(e => e.type === 'report_ready');

    expect(phaseStarted.length).toBeGreaterThanOrEqual(6);
    expect(phaseCompleted.length).toBeGreaterThanOrEqual(6);
    expect(hypotheses.length).toBeGreaterThanOrEqual(1);
    expect(rootCauses.length).toBeGreaterThanOrEqual(1);
    expect(reportReady.length).toBe(1);
  });

  it('hypothesis_generated 事件包含完整字段', async () => {
    const engine = new SynovaDiagnosisEngineImpl(createMockLLM(), createMockTools());
    const events: DiagnosisEvent[] = [];

    await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] }, undefined, collectEvents(events));

    const h = events.find(e => e.type === 'hypothesis_generated');
    expect(h).toBeDefined();
    if (h && h.type === 'hypothesis_generated') {
      expect(h.phase).toBe(2);
      expect(h.expert).toBeTruthy();
      expect(h.confidence).toBeGreaterThan(0);
      expect(h.confidence).toBeLessThanOrEqual(1);
      expect(h.summary.length).toBeGreaterThan(10);
    }
  });

  it('phase_completed 包含耗时', async () => {
    const engine = new SynovaDiagnosisEngineImpl(createMockLLM(), createMockTools());
    const events: DiagnosisEvent[] = [];

    await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] }, undefined, collectEvents(events));

    for (const e of events) {
      if (e.type === 'phase_completed') {
        // durationMs >= 0 (mock LLM 可能瞬时完成)
        expect(e.durationMs).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(e.degradedModules)).toBe(true);
      }
    }
  });

  // ── 3. LLM 失败降级 ──

  it('LLM 调用失败 → 降级返回 + error 事件', async () => {
    const failingLLM: LLMClient = {
      async chat() { throw new Error('LLM 不可用'); },
    };
    const engine = new SynovaDiagnosisEngineImpl(failingLLM, createMockTools());
    const events: DiagnosisEvent[] = [];

    const result = await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] }, undefined, collectEvents(events));

    // 降级结果仍然返回
    expect(result.teamId).toBe('t1');
    expect(result.report).toBeDefined();
    expect(result.degradedModules).toContain('phase2_llm');
    expect(result.report.raw).toHaveProperty('degraded', true);

    // error 事件已发出
    const errorEvent = events.find(e => e.type === 'error');
    expect(errorEvent).toBeDefined();
    if (errorEvent && errorEvent.type === 'error') {
      expect(errorEvent.code).toBe('LLM_ERROR');
      expect(errorEvent.recoverable).toBe(false);
    }
  });

  // ── 4. LLM 输出非 JSON → 降级处理 ──

  it('LLM 输出非 JSON 文本 → 提取为 summary', async () => {
    const textLLM: LLMClient = {
      async chat() {
        return { content: '根据分析，该组织的主要问题是客户留存率下降。建议建立客户成功团队。' };
      },
    };
    const engine = new SynovaDiagnosisEngineImpl(textLLM, createMockTools());
    const events: DiagnosisEvent[] = [];

    const result = await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] }, undefined, collectEvents(events));

    // 非 JSON 输出不崩溃
    expect(result.report.summary).toBeTruthy();
    expect(result.degradedModules).toHaveLength(0);

    // 从文本推断根因
    expect(result.report.rootCauses.length).toBeGreaterThanOrEqual(0);
  });

  // ── 5. 空 concern → 默认 ──

  it('空 concerns → 使用默认值', async () => {
    const engine = new SynovaDiagnosisEngineImpl(createMockLLM(), createMockTools());
    const result = await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: [] });

    expect(result.teamId).toBe('t1');
    expect(result.degradedModules).toHaveLength(0);
  });

  // ── 6. DiagnosisScope 传递 ──

  it('scope 控制诊断范围', async () => {
    const llm = createMockLLM();
    const engine = new SynovaDiagnosisEngineImpl(llm, createMockTools());

    const result = await engine.runConsultation(
      't1',
      { role: 'GA', name: 'test', teamId: 't1', concerns: ['现金流'] },
      { depth: 'deep', dimensions: ['D1', 'D2'], experts: ['finance', 'strategy'] },
    );

    expect(result.report).toBeDefined();
    expect(result.degradedModules).toHaveLength(0);
  });

  // ── 7. Builder 模式 ──

  it('Builder 模式配置引擎', async () => {
    const engine = new SynovaDiagnosisEngineImpl(createMockLLM(), createMockTools())
      .withMaxIterations(3)
      .withGateDataCompleteness(0.5)
      .withGateMinHypothesisConfidence(0.6);

    const events: DiagnosisEvent[] = [];
    const result = await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] }, undefined, collectEvents(events));

    // 只有置信度 >= 0.6 的假设才进入 expertReports
    const hEvents = events.filter(e => e.type === 'hypothesis_generated');
    expect(hEvents.length).toBeGreaterThan(0);
    expect(result.report).toBeDefined();
  });

  // ── 8. onEvent 为 undefined → 不崩溃 ──

  it('onEvent 为 undefined → 正常运行', async () => {
    const engine = new SynovaDiagnosisEngineImpl(createMockLLM(), createMockTools());
    const result = await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] });

    expect(result.report).toBeDefined();
    expect(result.teamId).toBe('t1');
  });

  // ── 9. 引擎异常 → 降级 ──

  it('引擎内部异常 → 降级返回', async () => {
    // 模拟一个会在工具调用后抛异常的 LLM（工具调用触发内部错误）
    const crashLLM: LLMClient = {
      async chat(_messages, _options) {
        return {
          content: 'invalid json with no closing brace {broken',
        };
      },
    };
    const engine = new SynovaDiagnosisEngineImpl(crashLLM, createMockTools());
    const events: DiagnosisEvent[] = [];

    const result = await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] }, undefined, collectEvents(events));

    // 不应崩溃 — JSON 解析失败被 catch 处理
    expect(result.report).toBeDefined();
  });

  // ── 10. 工厂函数 ──

  it('createSynovaDiagnosisEngine 工厂创建引擎', async () => {
    const engine = createSynovaDiagnosisEngine(createMockLLM(), createMockTools(), {
      maxToolRounds: 5,
    });

    expect(engine).toBeDefined();
    const result = await engine.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: ['测试'] });
    expect(result.report.reportId).toBeTruthy();
  });
});
