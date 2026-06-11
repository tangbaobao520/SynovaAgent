/**
 * __tests__/differentiation-validation.test.ts — 差异化实质性验证测试
 *
 * 被测系统: src/pipeline/diagnosis/differentiation-validation.ts
 * Mock 边界: 不 mock 核心计算；mock LLM judge 函数
 * 时间处理: 不涉及
 */
import { describe, it, expect, vi } from 'vitest';
import {
  validateDifferentiation,
  refineWithLLM,
} from '../differentiation-validation';
import type { GapSnapshot } from '../types';

// ── Helper: build a mock GapSnapshot ──
function mockSnapshot(overrides: Partial<Record<string, number>> = {}): GapSnapshot {
  const defaults: Record<string, number> = {
    information_flow: 6,
    knowledge_sharing: 6,
    authority_gradient: 6,
    trust_incentive: 6,
    division_of_labor: 6,
    external_interface: 6,
  };
  const merged = { ...defaults, ...overrides };

  const gaps = {} as any;
  for (const [dim, score] of Object.entries(merged)) {
    gaps[dim] = { mode: 'test', engineScore: score, confidence: 'medium', sourceBreakdown: {} };
  }

  return {
    teamId: 'test-team',
    observedAt: new Date().toISOString(),
    sourcePipeline: 'manual_trigger',
    gaps,
  };
}

// ═══════════════════════════════════════════════════════════
// validateDifferentiation
// ═══════════════════════════════════════════════════════════

describe('validateDifferentiation', () => {
  it('无差异化主张时返回 null', () => {
    expect(validateDifferentiation({
      claimed: '',
      customerPerceptions: ['品质好', '靠谱'],
    })).toBeNull();
  });

  it('客户感知数据不足时返回 null', () => {
    expect(validateDifferentiation({
      claimed: '品质最好的协同软件',
      customerPerceptions: ['就这一个'],
    })).toBeNull();
  });

  it('声称与感知对齐 + 组织支撑 → reliable（需 LLM 语义判定）', async () => {
    const init = validateDifferentiation({
      claimed: '品质最好的协同软件',
      customerPerceptions: [
        '品质很好，协同体验流畅',
        '品质比竞品好，团队都在用',
        '协同平台品质确实不错',
      ],
      snapshot: mockSnapshot({ information_flow: 7, knowledge_sharing: 7, external_interface: 6 }),
    })!;

    expect(init).not.toBeNull();
    // 纯规则判定不足以识别 CJK 语义等价 → 初始为 collapsed
    expect(init.method).toBe('rule');
    expect(init.semanticEquivalence).toBeNull();

    // LLM 判定语义等价后 → reliable
    const llmJudge = vi.fn().mockResolvedValue({ equivalent: true, confidence: 0.88 });
    const refined = await refineWithLLM(init, llmJudge);

    expect(refined.method).toBe('llm_assisted');
    expect(refined.semanticEquivalence).toBe(true);
    expect(refined.verdict).toBe('reliable');
    expect(refined.perceivedKeywords.length).toBeGreaterThan(0);
    expect(refined.interpretation).toContain('可靠');
  });

  it('文本不重叠 → collapsed（初始阶段，无LLM）', () => {
    const result = validateDifferentiation({
      claimed: '最高品质的协同软件',
      customerPerceptions: [
        '便宜，能用就行',
        '价格实惠',
        '比别家便宜一半',
      ],
      snapshot: mockSnapshot(),
    })!;

    expect(result).not.toBeNull();
    // 文本完全不重叠 → semanticEquivalence 为 null → collapsed
    expect(result.verdict).toBe('collapsed');
    expect(result.degraded).toBe(true);
  });

  it('声称与感知对齐但组织不支撑 → fake', () => {
    const result = validateDifferentiation({
      claimed: '品质最好的协同软件',
      customerPerceptions: [
        '品质最好的协同工具一直在用',
        '品质好的协同平台确实不错',
        '协同品质最好的软件',
      ],
      snapshot: mockSnapshot({
        information_flow: 3,
        knowledge_sharing: 2,
        external_interface: 3,
      }),
    })!;

    expect(result).not.toBeNull();
    expect(result.verdict).toBe('fake');
    expect(result.orgCapabilitySupport.supports).toBe(false);
    expect(result.orgCapabilitySupport.gaps.length).toBeGreaterThan(0);
    expect(result.interpretation).toContain('虚假');
  });

  it('无快照时组织支撑标记为不支持', () => {
    const result = validateDifferentiation({
      claimed: '品质最好的协同软件',
      customerPerceptions: [
        '品质好', '品质很好', '品质棒',
      ],
      // no snapshot
    })!;

    expect(result).not.toBeNull();
    expect(result.orgCapabilitySupport.supports).toBe(false);
    expect(result.orgCapabilitySupport.gaps[0]).toContain('无组织能力快照');
  });

  it('perceivedKeywords 返回客户用词', () => {
    const result = validateDifferentiation({
      claimed: '最快交付',
      customerPerceptions: [
        '他们速度很快',
        '交付速度OK',
        '快是快，但质量一般',
      ],
      snapshot: mockSnapshot(),
    })!;

    expect(result.perceivedKeywords.some(w => w.includes('快') || w.includes('速度'))).toBe(true);
  });

  it('文本重叠度在 0-1 之间', () => {
    const result = validateDifferentiation({
      claimed: '品质最好的协同软件',
      customerPerceptions: [
        '品质好的协同工具',
        '协同软件品质不错',
      ],
      snapshot: mockSnapshot(),
    })!;

    expect(result.textOverlap).toBeGreaterThanOrEqual(0);
    expect(result.textOverlap).toBeLessThanOrEqual(1);
  });
});

// ═══════════════════════════════════════════════════════════
// refineWithLLM
// ═══════════════════════════════════════════════════════════

describe('refineWithLLM', () => {
  it('LLM判定语义等价后更新为 llm_assisted', async () => {
    const init = validateDifferentiation({
      claimed: '品质最好的协同软件',
      customerPerceptions: ['东西挺靠谱的', '产品还行'],
      snapshot: mockSnapshot({ information_flow: 7, knowledge_sharing: 7, external_interface: 6 }),
    })!;

    expect(init.method).toBe('rule');

    const llmJudge = vi.fn().mockResolvedValue({ equivalent: true, confidence: 0.85 });
    const refined = await refineWithLLM(init, llmJudge);

    expect(refined.method).toBe('llm_assisted');
    expect(refined.semanticEquivalence).toBe(true);
    expect(refined.semanticConfidence).toBe(0.85);
    expect(refined.degraded).toBe(false);
    expect(refined.verdict).toBe('reliable');
  });

  it('LLM判定不等价后变为 collapsed', async () => {
    const init = validateDifferentiation({
      claimed: '最高品质的协同软件',
      customerPerceptions: ['便宜好用', '价格实惠'],
      snapshot: mockSnapshot({ information_flow: 7, knowledge_sharing: 7, external_interface: 6 }),
    })!;

    const llmJudge = vi.fn().mockResolvedValue({ equivalent: false, confidence: 0.9 });
    const refined = await refineWithLLM(init, llmJudge);

    expect(refined.verdict).toBe('collapsed');
    expect(refined.interpretation).toContain('崩坏');
  });

  it('LLM判定等价但组织不支撑 → fake', async () => {
    const init = validateDifferentiation({
      claimed: '品质最好的协同软件',
      customerPerceptions: ['东西挺靠谱的', '品质不错的产品'],
      snapshot: mockSnapshot({ information_flow: 2, knowledge_sharing: 2 }),
    })!;

    const llmJudge = vi.fn().mockResolvedValue({ equivalent: true, confidence: 0.75 });
    const refined = await refineWithLLM(init, llmJudge);

    expect(refined.verdict).toBe('fake');
  });
});
