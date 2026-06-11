/**
 * diagnosis-prompt-builder.test.ts — Prompt 组装器测试
 */

import {
  DiagnosisPromptBuilder,
  PromptSection,
  SkillCard,
  createScopePromptBuilder,
  createHypothesisPromptBuilder,
} from '../diagnosis-prompt-builder';

describe('DiagnosisPromptBuilder', () => {
  let builder: DiagnosisPromptBuilder;

  beforeEach(() => {
    builder = new DiagnosisPromptBuilder();
  });

  it('sorts sections by priority ascending', () => {
    // Given: sections with non-sequential priorities
    builder
      .addSection({ priority: 30, content: 'THIRD', source: 'context' })
      .addSection({ priority: 10, content: 'FIRST', source: 'constitution' })
      .addSection({ priority: 20, content: 'SECOND', source: 'domain' });

    // When: building
    const result = builder.build();

    // Then: content appears in priority order (10 → 20 → 30)
    const firstIdx = result.indexOf('FIRST');
    const secondIdx = result.indexOf('SECOND');
    const thirdIdx = result.indexOf('THIRD');
    expect(firstIdx).toBeLessThan(secondIdx);
    expect(secondIdx).toBeLessThan(thirdIdx);
  });

  it('injects phase-specific context markers', () => {
    // Given: builder with Phase 2 context
    builder.withPhase(2);

    // When: building
    const result = builder.build();

    // Then: contains phase markers
    expect(result).toContain('Phase 2');
    expect(result).toContain('假设生成');
    expect(result).toContain('调用 LLM');
  });

  it('serializes skill cards correctly', () => {
    // Given: two diagnostic skill cards
    builder
      .addSkillCard({
        name: 'findExpert',
        description: '查找知识共享领域专家',
        whenToUse: '需要跨部门知识传递时',
        inputFormat: '{ "domain": "knowledge_sharing" }',
        outputFormat: '{ "experts": [...] }',
      })
      .addSkillCard({
        name: 'analyzeDecision',
        description: '分析决策链路瓶颈',
        whenToUse: '决策平均耗时 > 2 天时',
        inputFormat: '{ "teamId": "..." }',
        outputFormat: '{ "bottlenecks": [...] }',
      });

    // When: building
    const result = builder.build();

    // Then: both cards rendered with full details
    expect(result).toContain('findExpert');
    expect(result).toContain('知识共享领域专家');
    expect(result).toContain('analyzeDecision');
    expect(result).toContain('决策链路瓶颈');
  });

  it('throws for unknown phase number', () => {
    // Given: invalid phase
    // When/Then: throws
    expect(() => builder.withPhase(99)).toThrow('未知阶段');
    expect(() => builder.withPhase(-1)).toThrow('未知阶段');
  });

  it('includes custom instructions at the end', () => {
    // Given: custom instructions
    builder.addInstruction('本次诊断关注财务维度');
    builder.addInstruction('CEO 已授权查看全部数据');

    // When: building
    const result = builder.build();

    // Then: instructions appear in the output
    const specialIdx = result.indexOf('特殊指令');
    const financeIdx = result.indexOf('财务维度');
    expect(specialIdx).toBeLessThan(financeIdx);
    expect(result).toContain('CEO 已授权');
  });

  it('addSection returns this for chaining', () => {
    // Given: a new builder
    const b = new DiagnosisPromptBuilder();
    const result = b.addSection({ priority: 1, content: 'test', source: 'context' });

    // Then: returns same instance
    expect(result).toBe(b);
  });
});

// ====================================================================
// 工厂方法
// ====================================================================

describe('createScopePromptBuilder', () => {
  it('creates Phase 0 builder with scope definition content', () => {
    // Given: scope prompt builder
    const builder = createScopePromptBuilder();

    // When: building
    const result = builder.build();

    // Then: contains Phase 0 and scope-related content
    expect(result).toContain('Phase 0');
    expect(result).toContain('界定范围');
    expect(result).toContain('结构化卡片');
    expect(result).toContain('六缝隙维度');
  });
});

describe('createHypothesisPromptBuilder', () => {
  it('creates Phase 2 builder with hypothesis generation guidance', () => {
    // Given: hypothesis prompt builder
    const builder = createHypothesisPromptBuilder();

    // When: building
    const result = builder.build();

    // Then: contains Phase 2 and hypothesis guidance
    expect(result).toContain('Phase 2');
    expect(result).toContain('假设生成');
    expect(result).toContain('3-5 个诊断假设');
    expect(result).toContain('置信度 ≥ 0.6');
  });
});
