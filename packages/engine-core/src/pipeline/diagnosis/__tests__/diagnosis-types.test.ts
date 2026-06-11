/**
 * diagnosis-types.test.ts — Agent 运行时类型单元测试
 *
 * 对标 Claw-Code: Given/When/Then 注释布局 + 具体断言
 */

import {
  DiagnosisErrorCode,
  StructuredDiagnosisReport,
  RootCause,
  CausalChain,
  DiagnosisEvidence,
  DiagnosisEvent,
  DiagnosisHypothesis,
  AgentIterationState,
  DiagnosisPermissionLevel,
} from '../types';

// ====================================================================
// StructuredDiagnosisReport — 金字塔结构序列化
// ====================================================================

describe('StructuredDiagnosisReport', () => {
  const makeReport = (): StructuredDiagnosisReport => ({
    ceoSummary: '团队在 Knowledge Sharing 维度存在显著断裂，根源是文档系统缺失导致的信息孤岛。',
    gapRadar: { knowledge_sharing: 0.32, decision_making: 0.68, communication: 0.55 },
    keyFindings: [
      { moduleId: 'knowledge-flow', severity: 'critical', detail: '跨部门知识传递成功率仅 12%', evidenceRefs: ['ev-001', 'ev-002'] },
      { moduleId: 'decision-latency', severity: 'high', detail: '决策平均耗时 3.2 天', evidenceRefs: ['ev-003'] },
    ],
    evidenceChain: [
      { id: 'ev-001', source: 'interviewee', content: '我不知道其他组在做什么', confidence: 0.92, timestamp: '2026-05-30T10:00:00Z', phase: 1, dimension: 'knowledge_sharing', isPrivate: true, privateReason: '提及具体人名', roleId: 'eng-lead' },
      { id: 'ev-002', source: 'module', content: '文档系统查询命中率 8%', confidence: 0.98, timestamp: '2026-05-30T10:00:01Z', phase: 1, dimension: 'knowledge_sharing', isPrivate: false, moduleId: 'knowledge-flow' },
    ],
    rootCauseTree: {
      rootCauses: [
        {
          id: 'rc-001', dimension: 'knowledge_sharing', confidence: 0.87,
          supportingEvidence: ['ev-001', 'ev-002'],
          causalChain: {
            nodes: [
              { id: 'n1', label: '无统一文档平台', type: 'root_cause', dimension: 'knowledge_sharing', severity: 0.9 },
              { id: 'n2', label: '知识散落个人设备', type: 'symptom', dimension: 'knowledge_sharing', severity: 0.7 },
            ],
            edges: [{ from: 'n1', to: 'n2', label: '导致', strength: 0.85 }],
          },
          description: '缺少统一的团队知识库导致信息散落在个人设备上',
        },
      ],
      contradictions: [],
      generatedAt: '2026-05-30T10:05:00Z',
    },
    actionRecommendations: ['部署团队 Wiki 并建立周更新制度', '设立知识共享 OKR 纳入绩效考核'],
    generatedAt: '2026-05-30T10:05:00Z',
    durationMs: 4200,
    degradedModules: [],
  });

  it('serializes full pyramid structure round-trip', () => {
    // Given: a complete report with all pyramid levels
    const original = makeReport();

    // When: JSON.stringify → JSON.parse
    const json = JSON.stringify(original);
    const restored: StructuredDiagnosisReport = JSON.parse(json);

    // Then: all fields preserved, no undefined properties
    expect(restored.ceoSummary).toBe(original.ceoSummary);
    expect(restored.gapRadar.knowledge_sharing).toBe(0.32);
    expect(restored.keyFindings).toHaveLength(2);
    expect(restored.keyFindings[0].severity).toBe('critical');
    expect(restored.evidenceChain).toHaveLength(2);
    expect(restored.evidenceChain[0].isPrivate).toBe(true);
    expect(restored.rootCauseTree.rootCauses).toHaveLength(1);
    expect(restored.rootCauseTree.rootCauses[0].causalChain.nodes).toHaveLength(2);
    expect(restored.rootCauseTree.rootCauses[0].causalChain.edges).toHaveLength(1);
    expect(restored.actionRecommendations).toHaveLength(2);
    expect(restored.durationMs).toBe(4200);
  });

  it('preserves empty degradedModules array (not undefined)', () => {
    // Given: a report with empty degradedModules
    const report = makeReport();

    // When: JSON round-trip
    const restored = JSON.parse(JSON.stringify(report));

    // Then: degradedModules is still an empty array, not undefined/null
    expect(Array.isArray(restored.degradedModules)).toBe(true);
    expect(restored.degradedModules).toHaveLength(0);
  });

  it('handles reports with degraded modules in round-trip', () => {
    // Given: a report where 2 modules failed
    const report = { ...makeReport(), degradedModules: ['attention-allocator', 'identity-extractor'] };

    // When: JSON round-trip
    const restored = JSON.parse(JSON.stringify(report));

    // Then: degradedModules preserved exactly
    expect(restored.degradedModules).toEqual(['attention-allocator', 'identity-extractor']);
  });
});

// ====================================================================
// DiagnosisErrorCode — 枚举值唯一性
// ====================================================================

describe('DiagnosisErrorCode', () => {
  it('has 14 distinct error codes (9 diagnosis + 5 ontology)', () => {
    // Given: the DiagnosisErrorCode enum (expanded Phase 2)
    // When: collecting all values
    const values = Object.values(DiagnosisErrorCode);

    // Then: 14 unique string values, no duplicates
    expect(values).toHaveLength(14);
    const unique = new Set(values);
    expect(unique.size).toBe(14);
  });

  it('each code is a non-empty UPPER_SNAKE_CASE string', () => {
    // Given: the DiagnosisErrorCode enum values
    const values = Object.values(DiagnosisErrorCode);

    // When: checking each value format
    // Then: all match UPPER_SNAKE_CASE
    for (const v of values) {
      expect(typeof v).toBe('string');
      expect(v.length).toBeGreaterThan(0);
      expect(v).toMatch(/^[A-Z][A-Z_]*[A-Z]$/);
    }
  });
});

// ====================================================================
// DiagnosisEvent — 可区分联合类型
// ====================================================================

describe('DiagnosisEvent', () => {
  it('narrows phase_started event correctly', () => {
    // Given: a phase_started event
    const event: DiagnosisEvent = {
      type: 'phase_started',
      phase: 2,
      timestamp: '2026-05-30T10:01:00Z',
    };

    // When: type-narrowing switch
    // Then: phase field is accessible
    if (event.type === 'phase_started') {
      expect(event.phase).toBe(2);
    } else {
      fail('expected phase_started event');
    }
  });

  it('narrows phase_completed event with degradedModules', () => {
    // Given: a phase_completed event with one degraded module
    const event: DiagnosisEvent = {
      type: 'phase_completed',
      phase: 1,
      durationMs: 1500,
      degradedModules: ['knowledge-flow'],
      timestamp: '2026-05-30T10:02:00Z',
    };

    // When: type-narrowing
    // Then: degradedModules accessible
    if (event.type === 'phase_completed') {
      expect(event.phase).toBe(1);
      expect(event.durationMs).toBe(1500);
      expect(event.degradedModules).toContain('knowledge-flow');
    } else {
      fail('expected phase_completed event');
    }
  });

  it('narrows error event with DiagnosisErrorCode', () => {
    // Given: a recoverable error event
    const event: DiagnosisEvent = {
      type: 'error',
      code: DiagnosisErrorCode.LLM_TIMEOUT,
      message: 'Gateway LLM 超时，已重试 3 次',
      recoverable: true,
      timestamp: '2026-05-30T10:03:00Z',
    };

    // When: type-narrowing
    // Then: error-specific fields accessible
    if (event.type === 'error') {
      expect(event.code).toBe(DiagnosisErrorCode.LLM_TIMEOUT);
      expect(event.recoverable).toBe(true);
      expect(event.message).toContain('超时');
    } else {
      fail('expected error event');
    }
  });

  it('narrows report_ready event with reportUrl', () => {
    // Given: a report_ready event
    const event: DiagnosisEvent = {
      type: 'report_ready',
      reportUrl: '/api/diagnosis/reports/team-1/2026-05-30.html',
      timestamp: '2026-05-30T10:05:00Z',
    };

    // When: type-narrowing
    // Then: reportUrl accessible
    if (event.type === 'report_ready') {
      expect(event.reportUrl).toContain('team-1');
    } else {
      fail('expected report_ready event');
    }
  });

  it('narrows hypothesis_generated event with full hypothesis', () => {
    // Given: a hypothesis_generated event
    const hypothesis: DiagnosisHypothesis = {
      id: 'hyp-001',
      statement: '知识共享断裂源于缺少文档平台',
      dimensions: ['knowledge_sharing'],
      confidence: 0.78,
      supportingEvidence: ['ev-001'],
      refutingEvidence: [],
      status: 'active',
      generatedInPhase: 2,
    };
    const event: DiagnosisEvent = {
      type: 'hypothesis_generated',
      hypothesis,
      timestamp: '2026-05-30T10:02:30Z',
    };

    // When: type-narrowing
    // Then: full hypothesis object accessible
    if (event.type === 'hypothesis_generated') {
      expect(event.hypothesis.id).toBe('hyp-001');
      expect(event.hypothesis.confidence).toBe(0.78);
      expect(event.hypothesis.status).toBe('active');
    } else {
      fail('expected hypothesis_generated event');
    }
  });

  it('narrows root_cause_identified event with causal chain', () => {
    // Given: a root_cause_identified event
    const chain: CausalChain = {
      nodes: [
        { id: 'n1', label: '缺少文档规范', type: 'root_cause', dimension: 'knowledge_sharing', severity: 0.9 },
      ],
      edges: [],
    };
    const rootCause: RootCause = {
      id: 'rc-001',
      dimension: 'knowledge_sharing',
      confidence: 0.92,
      supportingEvidence: ['ev-001'],
      causalChain: chain,
      description: '团队从未建立过文档规范',
    };
    const event: DiagnosisEvent = {
      type: 'root_cause_identified',
      rootCause,
      timestamp: '2026-05-30T10:04:00Z',
    };

    // When: type-narrowing
    // Then: root cause with causal chain accessible
    if (event.type === 'root_cause_identified') {
      expect(event.rootCause.id).toBe('rc-001');
      expect(event.rootCause.causalChain.nodes[0].type).toBe('root_cause');
    } else {
      fail('expected root_cause_identified event');
    }
  });
});

// ====================================================================
// AgentIterationState — 状态快照
// ====================================================================

describe('AgentIterationState', () => {
  it('tracks phase progression correctly', () => {
    // Given: initial state at Phase 0
    const state: AgentIterationState = {
      phase: 0,
      iteration: 0,
      maxIterations: 10,
      evidenceCount: 0,
      hypothesisCount: 0,
    };

    // When: advancing through phases (simulated)
    const advance = (s: AgentIterationState, toPhase: number): AgentIterationState => ({
      ...s,
      phase: toPhase,
      iteration: s.iteration + 1,
    });

    const phase1 = advance(state, 1);
    const phase2 = advance(phase1, 2);

    // Then: each state is immutable copy
    expect(state.phase).toBe(0);
    expect(phase1.phase).toBe(1);
    expect(phase2.phase).toBe(2);
    expect(phase2.maxIterations).toBe(10); // unchanged
  });
});

// ====================================================================
// DiagnosisPermissionLevel — 层级有序
// ====================================================================

describe('DiagnosisPermissionLevel', () => {
  it('has strictly increasing numeric values for 7 levels', () => {
    // Given: the DiagnosisPermissionLevel enum
    // When: comparing adjacent levels
    const levels = [
      DiagnosisPermissionLevel.EVERYONE,
      DiagnosisPermissionLevel.ORG_MEMBER,
      DiagnosisPermissionLevel.DIAGNOSIS_PARTICIPANT,
      DiagnosisPermissionLevel.INITIATOR_ONLY,
      DiagnosisPermissionLevel.FDE_OVERRIDE,
      DiagnosisPermissionLevel.ADMIN_ONLY,
      DiagnosisPermissionLevel.NEVER,
    ];

    // Then: each level is strictly greater than the previous
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeGreaterThan(levels[i - 1]);
    }
  });

  it('EVERYONE is the least restrictive, NEVER is the most', () => {
    // Given: the extremes of the permission spectrum
    // Then: EVERYONE = 0, NEVER = 6
    expect(DiagnosisPermissionLevel.EVERYONE).toBe(0);
    expect(DiagnosisPermissionLevel.NEVER).toBe(6);
  });
});
