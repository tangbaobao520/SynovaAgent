/**
 * synova-diagnosis-engine.test.ts — 诊断引擎接口契约测试
 *
 * 验证 SynovaDiagnosisEngine 接口的类型完整性 + 行为契约。
 * 不测试实现（实现还没写），只测试接口定义是否正确。
 */
import { describe, it, expect } from 'vitest';
import type {
  SynovaDiagnosisEngine,
  InitiatorProfile,
  DiagnosisScope,
  DiagnosisEvent,
  DiagnosisReport,
  ConsultationResult,
  DiagnosisEngineFactory,
} from '../../src/l3/synova-diagnosis-engine';
// 运行时符号在实现阶段导出，接口定义阶段仅验证类型契约

// ═══ 契约 1: 接口结构完整性 ═══

describe('SynovaDiagnosisEngine 接口契约', () => {
  it('接口定义 runConsultation 方法', () => {
    // 类型级验证 — 编译时检查，运行时验证 mock 满足接口
    const mock: SynovaDiagnosisEngine = {
      async runConsultation(_teamId, _initiator, _scope, _onEvent) {
        return {
          teamId: 'test',
          report: createEmptyReport('test'),
          totalDurationMs: 100,
          degradedModules: [],
        };
      },
    };
    expect(mock).toBeDefined();
    expect(typeof mock.runConsultation).toBe('function');
  });

  it('runConsultation 接受 2-4 个参数', async () => {
    const calls: string[] = [];
    const mock: SynovaDiagnosisEngine = {
      async runConsultation(teamId, initiator, scope, onEvent) {
        calls.push(`teamId=${teamId}`);
        if (scope) calls.push(`depth=${scope.depth}`);
        if (onEvent) onEvent({ type: 'phase_started', phase: 0, timestamp: new Date().toISOString() });
        return { teamId, report: createEmptyReport(teamId), totalDurationMs: 0, degradedModules: [] };
      },
    };

    // 最少参数
    await mock.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: [] });
    expect(calls).toContain('teamId=t1');

    // 带 scope
    await mock.runConsultation('t2', { role: '管理者', name: 'x', teamId: 't2', concerns: ['增长'] }, { depth: 'deep' });
    expect(calls).toContain('depth=deep');

    // 带 onEvent
    const events: DiagnosisEvent[] = [];
    await mock.runConsultation('t3', { role: '部门负责人', name: 'y', teamId: 't3', concerns: ['团队'] }, undefined, (e) => events.push(e));
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('phase_started');
  });
});

// ═══ 契约 2: Discriminated Union 类型收窄 ═══

describe('DiagnosisEvent discriminated union', () => {
  it('phase_started 事件包含 phase 字段', () => {
    const event: DiagnosisEvent = {
      type: 'phase_started',
      phase: 0,
      timestamp: new Date().toISOString(),
      label: '组织访谈',
    };
    expect(event.type).toBe('phase_started');
    if (event.type === 'phase_started') {
      expect(event.phase).toBe(0);
      expect(event.label).toBe('组织访谈');
    }
  });

  it('hypothesis_generated 事件包含 expert + confidence', () => {
    const event: DiagnosisEvent = {
      type: 'hypothesis_generated',
      phase: 2,
      timestamp: new Date().toISOString(),
      summary: '现金流问题是增长瓶颈的根因',
      confidence: 0.85,
      expert: 'finance',
      dimension: 'D1',
    };
    if (event.type === 'hypothesis_generated') {
      expect(event.expert).toBe('finance');
      expect(event.confidence).toBeGreaterThan(0.8);
      expect(event.dimension).toBe('D1');
    }
  });

  it('error 事件包含 code + recoverable', () => {
    const event: DiagnosisEvent = {
      type: 'error',
      timestamp: new Date().toISOString(),
      code: 'LLM_TIMEOUT',
      message: 'LLM 调用超时',
      recoverable: true,
    };
    if (event.type === 'error') {
      expect(event.code).toBe('LLM_TIMEOUT');
      expect(event.recoverable).toBe(true);
    }
  });

  it('switch exhaustiveness check 编译时验证', () => {
    // 编译时类型安全：如果缺少 case，TypeScript 报错
    const handleEvent = (event: DiagnosisEvent): string => {
      switch (event.type) {
        case 'phase_started':       return `P${event.phase} started`;
        case 'phase_completed':     return `P${event.phase} done (${event.durationMs}ms)`;
        case 'evidence_added':      return `evidence: ${event.moduleId}`;
        case 'contradiction_detected': return `contradiction: ${event.dimension}`;
        case 'hypothesis_generated': return `hypothesis: ${event.expert} (${event.confidence})`;
        case 'hypothesis_refuted':  return `refuted: ${event.hypothesisId}`;
        case 'root_cause_identified': return `root cause: ${event.rootCause}`;
        case 'report_ready':        return `report: ${event.reportId}`;
        case 'error':               return `error: ${event.code}`;
        case 'degraded':            return `degraded: ${event.moduleId}`;
        case 'expert_hypothesis':   return `expert: ${event.expert}`;
        case 'community_reports':   return `community: ${event.count}`;
        case 'entity_resolution':   return `entity: ${event.autoMerged}`;
        case 'graph_update':        return `graph: ${event.nodesCreated}`;
        case 'right_column_update': return `right column`;
        case 'llm_response':        return `llm: ${event.contentPreview.slice(0, 20)}`;
        case 'llm_fallback':        return `fallback: ${event.reason}`;
        default: {
          // 编译时 exhaustiveness check
          const _exhaustive: never = event;
          return `unknown: ${(_exhaustive as DiagnosisEvent).type}`;
        }
      }
    };

    const e: DiagnosisEvent = { type: 'phase_started', phase: 1, timestamp: '2026-01-01' };
    expect(handleEvent(e)).toContain('P1');
  });
});

// ═══ 契约 3: 输入输出类型 ═══

describe('输入输出类型', () => {
  it('InitiatorProfile 最小结构', () => {
    const initiator: InitiatorProfile = {
      role: 'GA',
      name: '黄学松',
      teamId: '母婴品牌A',
      concerns: ['增长放缓', '客户流失'],
    };
    expect(initiator.role).toBe('GA');
    expect(initiator.concerns).toHaveLength(2);
  });

  it('DiagnosisDepth 类型为 string (可扩展)', () => {
    // 类型级验证：DiagnosisDepth = string，不硬编码枚举
    const depth: import('../../src/l3/synova-diagnosis-engine').DiagnosisDepth = 'quick';
    expect(typeof depth).toBe('string');
  });

  it('DiagnosisScope 可选全字段', () => {
    const scope: DiagnosisScope = {
      depth: 'deep',
      dimensions: ['D1', 'D3'],
      experts: ['finance', 'strategy'],
    };
    expect(scope.depth).toBe('deep');
    expect(scope.dimensions).toHaveLength(2);
  });

  it('DiagnosisReport 结构完整', () => {
    const report: DiagnosisReport = {
      reportId: 'rpt_001',
      teamId: 'team1',
      generatedAt: new Date().toISOString(),
      summary: '增长瓶颈在客户留存',
      expertReports: [
        { expert: 'finance', findings: ['现金流恶化'], confidence: 0.8 },
      ],
      rootCauses: [
        { description: '客户留存率下降', dimension: 'D1', confidence: 0.85 },
      ],
      recommendations: [
        { action: '优化客户成功流程', priority: 'high', expert: 'strategy' },
      ],
      raw: { version: 1 },
    };
    expect(report.rootCauses).toHaveLength(1);
    expect(report.recommendations[0].priority).toBe('high');
  });

  it('ConsultationResult 包含 degradedModules', async () => {
    const result: ConsultationResult = {
      teamId: 't1',
      report: createEmptyReport('t1'),
      totalDurationMs: 5000,
      degradedModules: ['module_a', 'module_b'],
    };
    expect(result.degradedModules).toContain('module_a');
    expect(result.totalDurationMs).toBeGreaterThan(0);
  });
});

// ═══ 契约 4: 工厂模式 ═══

describe('DiagnosisEngineFactory', () => {
  it('工厂创建引擎实例', () => {
    const factory: DiagnosisEngineFactory = (llm, tools, options) => ({
      async runConsultation(teamId, initiator, _scope, _onEvent) {
        return {
          teamId,
          report: createEmptyReport(teamId),
          totalDurationMs: 0,
          degradedModules: [],
        };
      },
    });

    const engine = factory(
      { chat: async () => ({ content: 'test' }) },
      { execute: async () => ({ result: {} }), listTools: () => [] },
      { maxToolRounds: 3 },
    );

    expect(engine).toBeDefined();
    expect(typeof engine.runConsultation).toBe('function');
  });

  it('options 可选', () => {
    const factory: DiagnosisEngineFactory = (llm, tools) => ({
      async runConsultation(teamId) {
        return { teamId, report: createEmptyReport(teamId), totalDurationMs: 0, degradedModules: [] };
      },
    });

    const engine = factory(
      { chat: async () => ({ content: '' }) },
      { execute: async () => ({ result: {} }), listTools: () => [] },
    );
    expect(engine).toBeDefined();
  });
});

// ═══ 契约 5: 降级信号传播 ═══

describe('降级信号传播 (铁律 31)', () => {
  it('degradedModules 非空时仍返回结果', async () => {
    const mock: SynovaDiagnosisEngine = {
      async runConsultation(teamId, _initiator, _scope, onEvent) {
        // 发送降级事件
        if (onEvent) {
          onEvent({
            type: 'degraded',
            phase: 1,
            moduleId: 'data_source_feishu',
            message: '飞书连接器不可用',
            timestamp: new Date().toISOString(),
          });
        }
        return {
          teamId,
          report: createEmptyReport(teamId),
          totalDurationMs: 0,
          degradedModules: ['data_source_feishu'],
        };
      },
    };

    const events: DiagnosisEvent[] = [];
    const result = await mock.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: [] }, undefined, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('degraded');
    expect(result.degradedModules).toContain('data_source_feishu');
    // 降级不阻断结果
    expect(result.report).toBeDefined();
  });

  it('error 且 recoverable=false 时仍返回部分结果', async () => {
    const mock: SynovaDiagnosisEngine = {
      async runConsultation(teamId, _initiator, _scope, onEvent) {
        if (onEvent) {
          onEvent({
            type: 'error',
            code: 'LLM_ERROR',
            message: 'LLM 不可用',
            recoverable: false,
            timestamp: new Date().toISOString(),
          });
        }
        return {
          teamId,
          report: createEmptyReport(teamId),
          totalDurationMs: 100,
          degradedModules: ['llm_provider'],
        };
      },
    };

    const events: DiagnosisEvent[] = [];
    const result = await mock.runConsultation('t1', { role: 'GA', name: 'test', teamId: 't1', concerns: [] }, undefined, (e) => events.push(e));

    expect(events).toHaveLength(1);
    expect(result.degradedModules).toHaveLength(1);
    expect(result.report).toBeDefined();
  });
});

// ═══ 辅助 ═══

function createEmptyReport(teamId: string): DiagnosisReport {
  return {
    reportId: `rpt_${teamId}_${Date.now()}`,
    teamId,
    generatedAt: new Date().toISOString(),
    summary: '',
    expertReports: [],
    rootCauses: [],
    recommendations: [],
    raw: {},
  };
}
