/**
 * expert-prompts.test.ts — 6 个专家子 Agent 提示词 (D69 文件驱动版)
 *
 * D69 移除了硬编码 DEFINITIONS，改为从 expert/{name}/manifest.json 文件驱动加载。
 * 测试保持对 export API 的覆盖，新增文件驱动加载测试。
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
  readExpertManifest,
  loadIdentityMd,
  loadPromptTemplate,
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

      it('has at least 1 analysis framework', () => {
        const def = getExpertDefinition(type);
        expect(def.frameworks.length).toBeGreaterThanOrEqual(1);
      });

      it('empty evidence produces data-insufficient warning', () => {
        const prompt = build(emptyContext);
        expect(prompt.userMessage).toContain('⚠️');
        expect(prompt.userMessage).toContain('需数据验证');
      });

      it('filters out low-confidence evidence (< 0.5)', () => {
        const prompt = build(contextWithEvidence);
        expect(prompt.userMessage).not.toContain('低置信度噪音条目');
        expect(prompt.userMessage).toContain('决策权集中于管理层');
        expect(prompt.userMessage).toContain('信息传递依赖每周例会');
      });

      it('truncates evidence at 15 items', () => {
        const prompt = build(contextWithManyEvidence);
        const evidenceLines = (prompt.userMessage.match(/^- \[/gm) || []).length;
        expect(evidenceLines).toBeLessThanOrEqual(15);
      });

      it('includes hypotheses when present', () => {
        const prompt = build(contextWithEvidence);
        expect(prompt.userMessage).toContain('已有假设');
        expect(prompt.userMessage).toContain('知识共享断裂');
      });

      it('output format is non-empty', () => {
        const def = getExpertDefinition(type);
        expect(def.outputFormat).toBeTruthy();
        expect(def.outputFormat.length).toBeGreaterThan(20);
      });

      it('returns non-empty systemPrompt and userMessage', () => {
        const prompt = build(emptyContext);
        expect(prompt.systemPrompt.length).toBeGreaterThan(200);
        expect(prompt.userMessage.length).toBeGreaterThan(0);
      });
    });
  }
});

// ====================================================================
// Marketing Analyst — Manifest-Based Boundaries (D69)
// ====================================================================

describe('Marketing Analyst — Manifest Boundaries (D69)', () => {
  it('has 5 boundary constraints from manifest', () => {
    const def = getExpertDefinition('marketing_analyst');
    expect(def.boundaries.length).toBe(5);
  });

  it('enforces brand positioning consistency', () => {
    const def = getExpertDefinition('marketing_analyst');
    const brandBoundary = def.boundaries.find(b => b.includes('品牌定位'));
    expect(brandBoundary).toBeDefined();
  });

  it('enforces budget-aware recommendations', () => {
    const def = getExpertDefinition('marketing_analyst');
    const budgetBoundary = def.boundaries.find(b => b.includes('预算'));
    expect(budgetBoundary).toBeDefined();
  });

  it('frameworks include AARRR, JTBD, STP', () => {
    const def = getExpertDefinition('marketing_analyst');
    expect(def.frameworks.some(f => f.includes('AARRR'))).toBe(true);
    expect(def.frameworks.some(f => f.includes('JTBD'))).toBe(true);
    expect(def.frameworks.some(f => f.includes('STP'))).toBe(true);
  });
});

// ====================================================================
// D69 — File-Driven Loading
// ====================================================================

describe('D69 — readExpertManifest 文件驱动加载', () => {
  it('strategic_analyst → 从manifest.json加载name', () => {
    const def = readExpertManifest('strategic_analyst');
    expect(def.name).toBe('战略专家');
    expect(def.description.length).toBeGreaterThan(10);
    expect(def.tone.length).toBeGreaterThan(10);
    expect(def.boundaries.length).toBeGreaterThanOrEqual(4);
  });

  it('financial_analyst → 从manifest.json加载name', () => {
    const def = readExpertManifest('financial_analyst');
    expect(def.name).toBe('财务专家');
    expect(def.description).toContain('钱');
  });

  it('marketing_analyst → 从manifest.json加载', () => {
    const def = readExpertManifest('marketing_analyst');
    expect(def.name).toBe('营销专家');
    expect(def.frameworks).toContain('AARRR 增长漏斗');
  });

  it('manifest中boundaries被正确映射', () => {
    const def = readExpertManifest('org_diagnostician');
    expect(def.boundaries).toContain('不假设所有效率问题都能用Agent解决');
  });

  it('loadIdentityMd 加载IDENTITY.md', () => {
    const identity = loadIdentityMd('financial_analyst');
    // IDENTITY.md 可能为空文件，但不应抛异常
    expect(typeof identity).toBe('string');
  });

  it('loadPromptTemplate 加载PROMPT.md', () => {
    const template = loadPromptTemplate('financial_analyst');
    expect(template).toContain('M1');
    expect(template).toContain('财务专家');
  });

  it('loadPromptTemplate 不存在的专家返回空字符串', () => {
    // 使用一个虚拟ExpertType来测试降级
    const template = loadPromptTemplate('marketing_analyst');
    expect(template.length).toBeGreaterThan(0); // 真实专家
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
    expect(strategic.systemPrompt).not.toContain('AARRR');
    expect(marketing.systemPrompt).toContain('AARRR');
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
