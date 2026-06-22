import { describe, it, expect } from 'vitest';
import { runAnalysis, formatAnalysisForLLM, type AnalysisResult } from '../../src/l3/analyst';
import type { SentinelFinding } from '../../src/sentinel/types';

function finding(dim: string, overrides: Partial<SentinelFinding> = {}): SentinelFinding {
  return {
    id: `f_${dim}`, severity: 'warning', dimension: dim,
    title: `${dim} 测试`, description: `${dim} 描述`,
    evidence: [], suggestion: '建议', detectedAt: new Date().toISOString(),
    ...overrides,
  };
}

function mockLLM(reply: string) {
  return { async chat() { return { content: reply }; } };
}

describe('Analyst', () => {
  it('空 Finding → 空结果', async () => {
    const r = await runAnalysis(mockLLM(''), 't1', []);
    expect(r.analyses).toHaveLength(0);
  });

  it('单维度分析', async () => {
    const r = await runAnalysis(
      mockLLM('{"summary":"现金流有问题","confidence":0.85,"insights":["回款","周期"]}'),
      't1', [finding('D1')],
    );
    expect(r.analyses).toHaveLength(1);
    expect(r.analyses[0].summary).toContain('现金流');
    expect(r.analyses[0].confidence).toBe(0.85);
    expect(r.analyses[0].insights).toContain('回款');
  });

  it('多维度分组 — 每个维度独立 LLM', async () => {
    const calls: string[] = [];
    const llm = {
      async chat(msgs: Array<{ role: string; content: string }>) {
        calls.push(msgs[0].content);
        return { content: '{"summary":"ok","confidence":0.7,"insights":["x"]}' };
      },
    };
    const r = await runAnalysis(llm, 't1', [finding('D1'), finding('D2'), finding('D1')]);
    // D1 和 D2 各一次调用
    expect(calls.length).toBe(2);
    expect(r.analyses).toHaveLength(2);
  });

  it('LLM 失败 — 维度降级不中断其他', async () => {
    const llm = {
      async chat(msgs: Array<{ role: string; content: string }>) {
        if (msgs[0].content.includes('D1')) throw new Error('fail');
        return { content: '{"summary":"ok","confidence":0.7,"insights":[]}' };
      },
    };
    const r = await runAnalysis(llm, 't1', [finding('D1'), finding('D2')]);
    expect(r.analyses).toHaveLength(2);
    expect(r.analyses.find(a => a.dimension === 'D1')!.confidence).toBe(0); // degraded
    expect(r.analyses.find(a => a.dimension === 'D2')!.confidence).toBe(0.7);
  });

  it('非 JSON 回复 — 降级为原始文本', async () => {
    const r = await runAnalysis(mockLLM('只是文本分析，不是JSON'), 't1', [finding('D1')]);
    expect(r.analyses[0].summary).toBe('只是文本分析，不是JSON');
    expect(r.analyses[0].confidence).toBe(0.5);
  });

  it('formatAnalysisForLLM', () => {
    const result: AnalysisResult = {
      analyses: [
        { dimension: 'D1', summary: '增长放缓', confidence: 0.8, insights: ['留存'] },
        { dimension: 'D2', summary: '结构问题', confidence: 0.6, insights: [] },
      ],
      totalFindings: 2,
    };
    const text = formatAnalysisForLLM(result);
    expect(text).toContain('D1');
    expect(text).toContain('增长放缓');
    expect(text).toContain('留存');
  });
});
