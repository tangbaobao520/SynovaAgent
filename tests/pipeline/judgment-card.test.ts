import { describe, it, expect } from 'vitest';
import {
  generateJudgmentCard,
  confidenceLevel,
  formatForSSE,
  type JudgmentCard,
} from '../../src/pipeline/judgment-card';

describe('confidenceLevel', () => {
  it('≥0.7 → high', () => {
    expect(confidenceLevel(0.7)).toBe('high');
    expect(confidenceLevel(0.95)).toBe('high');
  });

  it('0.4-0.69 → medium', () => {
    expect(confidenceLevel(0.4)).toBe('medium');
    expect(confidenceLevel(0.55)).toBe('medium');
  });

  it('<0.4 → low', () => {
    expect(confidenceLevel(0.39)).toBe('low');
    expect(confidenceLevel(0.0)).toBe('low');
  });
});

describe('generateJudgmentCard', () => {
  it('空输入 → 返回 null', () => {
    expect(generateJudgmentCard({})).toBeNull();
  });

  it('短消息 → 返回 null（内容不足）', () => {
    expect(generateJudgmentCard({ message: 'ok' })).toBeNull();
  });

  it('有效消息 + 根因/建议格式 → 返回卡片', () => {
    const card = generateJudgmentCard({
      message: '根因: 客户采购系统迁移导致的临时异常。建议: 暂缓催收，下月复查。',
      confidence: 0.78,
      phase: 3,
    });

    expect(card).not.toBeNull();
    const c = card as JudgmentCard;
    expect(c.type).toBe('judgment_card');
    expect(c.root_cause).toContain('客户采购系统迁移');
    expect(c.suggestion).toContain('暂缓催收');
    expect(c.confidence).toBe(0.78);
    expect(c.experts).toContain('诊断专家');
    expect(c.actions).toHaveLength(2);
    expect(c.actions[0].action).toBe('confirm');
    expect(c.actions[1].action).toBe('discuss');
    expect(c.cardId).toMatch(/^jc_/);
    expect(c.phase).toBe(3);
  });

  it('纯文本消息（无格式关键词）→ 首句为根因，末句为建议', () => {
    const card = generateJudgmentCard({
      message: '企业现金流连续三个月恶化，主要原因是应收账款周期延长。建议立即启动应收账款催收流程，缩短付款周期至30天。',
    });

    expect(card).not.toBeNull();
    const c = card as JudgmentCard;
    expect(c.root_cause).toContain('现金流');
    expect(c.suggestion).toContain('催收');
    expect(c.experts).toContain('诊断专家');
  });

  it('有 findings → 推断专家', () => {
    const card = generateJudgmentCard({
      message: '财务指标异常。根因: 成本结构失衡。建议: 重新审核采购合同。',
      findings: [
        { moduleId: 'finance', summary: '现金流异常', confidence: 0.85 },
        { moduleId: 'strategy', summary: '成本结构问题', confidence: 0.72 },
      ],
    });

    expect(card).not.toBeNull();
    const c = card as JudgmentCard;
    expect(c.experts).toContain('财务顾问');
    expect(c.experts).toContain('战略顾问');
    // 置信度取 findings 平均值
    expect(c.confidence).toBeCloseTo(0.785, 1);
    expect(c.dimension).toBe('finance');
  });

  it('findings 无置信度 → 使用全局置信度', () => {
    const card = generateJudgmentCard({
      message: '营销投放效率下降。根因: 渠道分散。建议: 集中预算到Top3渠道。',
      findings: [
        { moduleId: 'marketing', summary: '渠道效率问题' },
      ],
      confidence: 0.6,
    });

    expect(card).not.toBeNull();
    const c = card as JudgmentCard;
    expect(c.confidence).toBe(0.6);
    expect(c.experts).toContain('营销顾问');
  });

  it('confidence 超出 [0,1] → clamp', () => {
    const card = generateJudgmentCard({
      message: '根因: 测试数据异常。建议: 标准化数据录入流程。',
      confidence: 1.5,
    });

    expect(card).not.toBeNull();
    expect((card as JudgmentCard).confidence).toBe(1.0);
  });

  it('负置信度 → clamp 到 0', () => {
    const card = generateJudgmentCard({
      message: '根因: 测试数据异常。建议: 标准化数据录入流程。',
      confidence: -0.3,
    });

    expect(card).not.toBeNull();
    expect((card as JudgmentCard).confidence).toBe(0.0);
  });
});

describe('formatForSSE', () => {
  it('序列化为 SSE-ready 对象', () => {
    const card: JudgmentCard = {
      type: 'judgment_card',
      cardId: 'jc_test123',
      root_cause: '测试根因',
      suggestion: '测试建议',
      confidence: 0.85,
      experts: ['财务顾问'],
      actions: [
        { label: '采纳', action: 'confirm' },
        { label: '讨论', action: 'discuss' },
      ],
      dimension: 'finance',
      phase: 2,
    };

    const sse = formatForSSE(card);
    expect(sse.type).toBe('judgment_card');
    expect(sse.cardId).toBe('jc_test123');
    expect(sse.root_cause).toBe('测试根因');
    expect(sse.suggestion).toBe('测试建议');
    expect(sse.confidence).toBe(0.85);
    expect(sse.confidenceLevel).toBe('high');
    expect(sse.experts).toEqual(['财务顾问']);
    expect(sse.actions).toHaveLength(2);
    expect(sse.dimension).toBe('finance');
    expect(sse.phase).toBe(2);
  });
});

// detectCardCandidates — 内部工具函数，不导出。如有批量检测需求，通过 generateJudgmentCard 单独调用。

