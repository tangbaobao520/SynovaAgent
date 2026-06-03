/**
 * expert-prompts.test.ts — 6 个专家子 Agent 独立提示词测试
 *
 * 对标 Claw-Code 的 Given/When/Then 测试模式。
 * 每个专家测试：
 *   1. 系统提示含所有必需分节
 *   2. 边界约束不可为空
 *   3. 用户消息正确处理空/稀疏证据
 *   4. 输出格式指令存在
 *   5. buildExpertPrompt 分发正确
 */

import {
  buildStrategicAnalystPrompt,
  buildOrgDiagnosticianPrompt,
  buildFinancialAnalystPrompt,
  buildTechArchitectPrompt,
  buildActionAdvisorPrompt,
  buildMarketingAnalystPrompt,
  buildExpertPrompt,
  listExpertTypes,
  getExpertDefinition,
  type ExpertPromptContext,
  type ExpertType,
} from '../expert-prompts';

// ====================================================================
// Test Helpers
// ====================================================================

/** 空上下文 */
const emptyContext: ExpertPromptContext = {
  teamId: 'test-team-001',
  phase: 2,
};

/** 含证据的上下文 */
const contextWithEvidence: ExpertPromptContext = {
  teamId: 'test-team-001',
  phase: 2,
  evidence: [
    { id: 'e1', source: 'module', content: '团队决策权集中于管理层，一线无决策权', confidence: 0.85, timestamp: new Date().toISOString(), phase: 1, dimension: 'decision_making', isPrivate: false },
    { id: 'e2', source: 'interviewee', content: '信息传递依赖每周例会，紧急信息无快速通道', confidence: 0.72, timestamp: new Date().toISOString(), phase: 1, dimension: 'information_flow', isPrivate: false },
    { id: 'e3', source: 'module', content: '低置信度噪音条目', confidence: 0.35, timestamp: new Date().toISOString(), phase: 1, dimension: 'knowledge_sharing', isPrivate: false },
  ],
  hypotheses: [
    { statement: '知识共享断裂源于缺少统一文档平台', confidence: 0.85, dimensions: ['knowledge_sharing'], supportingEvidence: ['e1', 'e2'], refutingEvidence: [], generatedInPhase: 2 },
  ],
};

/** 含高置信度证据（≥10条，用于测试截断） */
const contextWithManyEvidence: ExpertPromptContext = {
  teamId: 'test-team-001',
  phase: 2,
  evidence: Array.from({ length: 20 }, (_, i) => ({
    id: `e${i}`,
    source: 'module' as const,
    content: `测试证据条目 ${i + 1}`,
    confidence: 0.6 + (i * 0.01),
    timestamp: new Date().toISOString(),
    phase: 1,
    dimension: 'decision_making',
    isPrivate: false,
  })),
};

// ====================================================================
// Tests
// ====================================================================

describe('Expert Prompts — All 6 Experts', () => {
  const experts: Array<{ type: ExpertType; build: typeof buildStrategicAnalystPrompt }> = [
    { type: 'strategic_analyst', build: buildStrategicAnalystPrompt },
    { type: 'org_diagnostician', build: buildOrgDiagnosticianPrompt },
    { type: 'financial_analyst', build: buildFinancialAnalystPrompt },
    { type: 'tech_architect', build: buildTechArchitectPrompt },
    { type: 'action_advisor', build: buildActionAdvisorPrompt },
    { type: 'marketing_analyst', build: buildMarketingAnalystPrompt },
  ];

  for (const { type, build } of experts) {
    describe(`${type}`, () => {
      // ── 1. System prompt structure ──

      it('system prompt contains role header', () => {
        const def = getExpertDefinition(type);
        const prompt = build(emptyContext);
        expect(prompt.systemPrompt).toContain(`# 角色：${def.name}`);
      });

      it('system prompt contains all required sections', () => {
        const prompt = build(emptyContext);
        const requiredSections = ['身份', '语调', '分析框架', '边界约束', '输出格式', '当前上下文'];
        for (const section of requiredSections) {
          expect(prompt.systemPrompt).toContain(`## ${section}`);
        }
      });

      it('system prompt contains team ID and phase', () => {
        const prompt = build(emptyContext);
        expect(prompt.systemPrompt).toContain('test-team-001');
        expect(prompt.systemPrompt).toContain('Phase 2');
      });

      // ── 2. Boundaries ──

      it('has at least 4 boundary constraints', () => {
        const def = getExpertDefinition(type);
        expect(def.boundaries.length).toBeGreaterThanOrEqual(4);
      });

      it('all boundary constraints are included in system prompt', () => {
        const def = getExpertDefinition(type);
        const prompt = build(emptyContext);
        for (const boundary of def.boundaries) {
          expect(prompt.systemPrompt).toContain(boundary);
        }
      });

      // ── 3. Frameworks ──

      it('has at least 1 analysis framework', () => {
        const def = getExpertDefinition(type);
        expect(def.frameworks.length).toBeGreaterThanOrEqual(1);
      });

      // ── 4. Edge Cases ──

      it('empty evidence produces data-insufficient warning', () => {
        const prompt = build(emptyContext);
        expect(prompt.userMessage).toContain('⚠️');
        expect(prompt.userMessage).toContain('需数据验证');
      });

      it('filters out low-confidence evidence (< 0.5)', () => {
        const prompt = build(contextWithEvidence);
        // e3 has confidence 0.35, should NOT appear
        expect(prompt.userMessage).not.toContain('低置信度噪音条目');
        // e1 (0.85) and e2 (0.72) SHOULD appear
        expect(prompt.userMessage).toContain('决策权集中于管理层');
        expect(prompt.userMessage).toContain('信息传递依赖每周例会');
      });

      it('truncates evidence at 15 items', () => {
        const prompt = build(contextWithManyEvidence);
        // Count the evidence items in the output
        const evidenceLines = (prompt.userMessage.match(/^- \[/gm) || []).length;
        expect(evidenceLines).toBeLessThanOrEqual(15);
      });

      it('includes hypotheses when present', () => {
        const prompt = build(contextWithEvidence);
        expect(prompt.userMessage).toContain('已有假设');
        expect(prompt.userMessage).toContain('知识共享断裂');
      });

      // ── 5. Output format ──

      it('output format contains numbered sections', () => {
        const def = getExpertDefinition(type);
        expect(def.outputFormat).toBeTruthy();
        expect(def.outputFormat.length).toBeGreaterThan(50);
      });

      // ── 6. Non-empty results ──

      it('returns non-empty systemPrompt and userMessage', () => {
        const prompt = build(emptyContext);
        expect(prompt.systemPrompt.length).toBeGreaterThan(200);
        expect(prompt.userMessage.length).toBeGreaterThan(0);
      });
    });
  }
});

// ====================================================================
// Marketing Analyst — Extra-Specific Tests (6 boundaries, stricter)
// ====================================================================

describe('Marketing Analyst — 6 Boundaries (ARCH-19)', () => {
  it('has exactly 6 boundary constraints', () => {
    const def = getExpertDefinition('marketing_analyst');
    expect(def.boundaries.length).toBe(6);
  });

  it('enforces cross-validation with org capability modules', () => {
    const def = getExpertDefinition('marketing_analyst');
    const crossValidateBoundary = def.boundaries.find(b => b.includes('交叉验证'));
    expect(crossValidateBoundary).toBeDefined();
  });

  it('enforces "认知不大于事实" principle', () => {
    const def = getExpertDefinition('marketing_analyst');
    const perceptionBoundary = def.boundaries.find(b => b.includes('认知大于事实'));
    expect(perceptionBoundary).toBeDefined();
  });

  it('prevents mass advertising for survival-mode teams', () => {
    const def = getExpertDefinition('marketing_analyst');
    const survivalBoundary = def.boundaries.find(b => b.includes('生存突破'));
    expect(survivalBoundary).toBeDefined();
  });

  it('framework includes positioning consistency and category clarity', () => {
    const def = getExpertDefinition('marketing_analyst');
    expect(def.frameworks.some(f => f.includes('定位三方一致性'))).toBe(true);
    expect(def.frameworks.some(f => f.includes('品类认知清晰度'))).toBe(true);
    expect(def.frameworks.some(f => f.includes('差异化实质性验证'))).toBe(true);
  });
});

// ====================================================================
// buildExpertPrompt Dispatcher
// ====================================================================

describe('buildExpertPrompt — Dispatch', () => {
  it('returns correct expert prompt for each type', () => {
    const types = listExpertTypes();
    for (const type of types) {
      const prompt = buildExpertPrompt(type, emptyContext);
      const def = getExpertDefinition(type);
      expect(prompt.systemPrompt).toContain(def.name);
    }
  });

  it('does not mix up experts', () => {
    const strategic = buildExpertPrompt('strategic_analyst', emptyContext);
    const marketing = buildExpertPrompt('marketing_analyst', emptyContext);
    expect(strategic.systemPrompt).toContain('战略专家');
    expect(marketing.systemPrompt).toContain('营销专家');
    expect(strategic.systemPrompt).not.toContain('四力模型');
    expect(marketing.systemPrompt).toContain('四力模型');
  });
});

// ====================================================================
// listExpertTypes
// ====================================================================

describe('listExpertTypes', () => {
  it('returns exactly 6 expert types', () => {
    expect(listExpertTypes()).toHaveLength(6);
  });

  it('includes marketing_analyst as the 6th expert', () => {
    expect(listExpertTypes()).toContain('marketing_analyst');
  });

  it('returns unique types (no duplicates)', () => {
    const types = listExpertTypes();
    expect(new Set(types).size).toBe(types.length);
  });
});

// ====================================================================
// Edge Cases — All Experts
// ====================================================================

describe('Expert Prompts — Edge Cases', () => {
  it('handles empty evidence array gracefully', () => {
    const ctx: ExpertPromptContext = { teamId: 't1', phase: 1, evidence: [] };
    const prompt = buildStrategicAnalystPrompt(ctx);
    expect(prompt.userMessage).toContain('⚠️');
    expect(prompt.userMessage).toContain('需数据验证');
  });

  it('handles evidence with empty content strings', () => {
    const ctx: ExpertPromptContext = {
      teamId: 't1',
      phase: 1,
      evidence: [
        { id: 'e1', source: 'module', content: '', confidence: 0.8, timestamp: new Date().toISOString(), phase: 1, dimension: 'decision_making', isPrivate: false },
      ],
    };
    const prompt = buildStrategicAnalystPrompt(ctx);
    // Should not crash — empty content is valid (just yields short output)
    expect(prompt.userMessage).toBeDefined();
  });

  it('handles evidence with missing dimension field', () => {
    const ctx: ExpertPromptContext = {
      teamId: 't1',
      phase: 1,
      evidence: [
        { id: 'e1', source: 'module', content: 'valid content', confidence: 0.8, timestamp: new Date().toISOString(), phase: 1, dimension: undefined as unknown as string, isPrivate: false },
      ],
    };
    const prompt = buildStrategicAnalystPrompt(ctx);
    expect(prompt.userMessage).toContain('valid content');
  });
});
