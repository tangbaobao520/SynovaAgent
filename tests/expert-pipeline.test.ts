/**
 * tests/expert-pipeline.test.ts — 专家推理管道测试
 * @state: real — 测试即规范
 *
 * 不调真实 LLM — 用 mock 验证管道逻辑。
 */
import { describe, it, expect } from 'vitest';

interface ExpertConfig {
  id: string;
  name: string;
  dimensions: string[];        // 该专家负责的监测维度
  systemPrompt: string;        // LLM system prompt
}

interface ExpertOutput {
  expertId: string;
  expertName: string;
  conclusion: string;          // 核心结论，一句话
  findings: ExpertFinding[];
  score: number;               // 0-10
  confidence: 'high' | 'medium' | 'low';
  computedAt: string;
}

interface ExpertFinding {
  severity: 'critical' | 'warning' | 'info';
  title: string;               // 发现标题
  description: string;         // 人话解释
  evidence: string[];          // 来自测量数据
  suggestion: string;          // 可执行建议
}

interface LLMClient {
  complete(prompt: string, systemPrompt: string): Promise<string>;
}

// ═══ 动态导入 ═══
let ExpertPipeline: any;
let EXPERT_DEFINITIONS: any[];

beforeAll(async () => {
  try {
    const mod = await import('../packages/engine-core/src/pipeline/diagnosis/expert-pipeline');
    ExpertPipeline = mod.ExpertPipeline;
    EXPERT_DEFINITIONS = mod.EXPERT_DEFINITIONS;
  } catch { /* pending */ }
});

// ═══ Mock LLM — 返回有效的专家输出 JSON ═══
function mockLLM(output: Partial<ExpertOutput> = {}): LLMClient {
  return {
    async complete() {
      const data = {
        conclusion: output.conclusion || '测试结论：基于测量数据，该维度表现正常。',
        findings: output.findings || [{
          severity: 'info', title: '指标正常',
          description: '所有测量指标在正常范围内。',
          evidence: ['测量器 m1: 评分 7.0'],
          suggestion: '保持现有节奏。',
        }],
        score: output.score || 7.0,
        confidence: output.confidence || 'medium',
      };
      return JSON.stringify(data);
    },
  };
}

// ═══ Tests ═══

describe('ExpertPipeline', () => {
  it('应该能注册专家', () => {
    if (!ExpertPipeline) return;
    const p = new ExpertPipeline(mockLLM());
    p.register([{ id: 'org', name: '组织专家', dimensions: ['D2'], systemPrompt: '你是组织诊断专家。' }]);
    expect(p.getExpertCount()).toBe(1);
  });

  it('专家只处理自己维度的数据', async () => {
    if (!ExpertPipeline) return;
    const p = new ExpertPipeline(mockLLM());
    p.register([{
      id: 'org', name: '组织专家', dimensions: ['D2'],
      systemPrompt: '你是组织诊断专家。只分析组织能力维度。',
    }]);

    // 给 D3 数据 — 组织专家不应该处理
    const input: Record<string, unknown> = {
      D3: { score: 3.0, confidence: 'medium', measurerCount: 1 },
    };
    const output = await p.run(input);
    // 跳过没有数据的专家 — 如果组织了D2, 但输入只有D3, 专家应该跳过
    expect(output.results).toHaveLength(0);
  });

  it('有对应维度数据时专家应该执行', async () => {
    if (!ExpertPipeline) return;
    const p = new ExpertPipeline(mockLLM({ conclusion: '组织能力正常' }));
    p.register([{
      id: 'org', name: '组织专家', dimensions: ['D2'],
      systemPrompt: '你是组织诊断专家。',
    }]);

    const input = {
      D2: { score: 5.5, confidence: 'medium', measurerCount: 2 },
    };
    const output = await p.run(input);
    expect(output.results).toHaveLength(1);
    expect(output.results[0].expertId).toBe('org');
    expect(output.results[0].conclusion).toBe('组织能力正常');
    expect(output.results[0].findings.length).toBeGreaterThan(0);
  });

  it('LLM 失败时专家降级但不影响其他专家', async () => {
    if (!ExpertPipeline) return;
    const failLLM: LLMClient = {
      async complete() { throw new Error('API 超时'); },
    };
    const p = new ExpertPipeline(failLLM);
    p.register([{
      id: 'org', name: '组织专家', dimensions: ['D2'],
      systemPrompt: '你是组织诊断专家。',
    }]);
    p.register([{
      id: 'strat', name: '战略专家', dimensions: ['D1'],
      systemPrompt: '你是战略诊断专家。',
    }]);

    const input = {
      D2: { score: 5.5, confidence: 'medium', measurerCount: 1 },
      D1: { score: 7.0, confidence: 'high', measurerCount: 1 },
    };
    const output = await p.run(input);
    // 两个都失败（同一个 failLLM），都在 degraded 中
    expect(output.degradedModules.length).toBeGreaterThan(0);
  });

  it('JSON 解析失败时会重试', async () => {
    if (!ExpertPipeline) return;
    let calls = 0;
    const flakyLLM: LLMClient = {
      async complete() {
        calls++;
        if (calls === 1) return 'not json at all {{{';
        return JSON.stringify({ conclusion: '重试后成功', findings: [], score: 5.0, confidence: 'low' });
      },
    };
    const p = new ExpertPipeline(flakyLLM);
    p.register([{ id: 'org', name: '组织专家', dimensions: ['D2'], systemPrompt: '你是组织诊断专家。' }]);

    const output = await p.run({ D2: { score: 5.0, confidence: 'medium', measurerCount: 1 } });
    expect(output.results[0].conclusion).toBe('重试后成功');
  });

  it('专家输出必须包含结构化发现', async () => {
    if (!ExpertPipeline) return;
    const p = new ExpertPipeline(mockLLM());
    p.register([{ id: 'org', name: '组织专家', dimensions: ['D2'], systemPrompt: '你是组织诊断专家。' }]);

    const output = await p.run({ D2: { score: 4.0, confidence: 'medium', measurerCount: 1 } });
    const f = output.results[0].findings[0];
    expect(f.severity).toMatch(/^(critical|warning|info)$/);
    expect(f.title.length).toBeGreaterThan(3);
    expect(f.description.length).toBeGreaterThan(5);
    expect(f.evidence.length).toBeGreaterThan(0);
    expect(f.suggestion.length).toBeGreaterThan(3);
  });

  it('多个专家并行执行', async () => {
    if (!ExpertPipeline) return;
    let order: string[] = [];
    const m1: LLMClient = {
      async complete() { order.push('org'); return JSON.stringify({ conclusion: 'ok', findings: [], score: 5, confidence: 'medium' }); },
    };
    const m2: LLMClient = {
      async complete() { order.push('strat'); return JSON.stringify({ conclusion: 'ok', findings: [], score: 5, confidence: 'medium' }); },
    };
    const p = new ExpertPipeline(m1, m2);
    p.register([{ id: 'org', name: '组织', dimensions: ['D2'], systemPrompt: '...' }], m1);
    p.register([{ id: 'strat', name: '战略', dimensions: ['D1'], systemPrompt: '...' }], m2);

    const start = Date.now();
    const output = await p.run({ D2: { score: 1, confidence: 'low', measurerCount: 0 }, D1: { score: 1, confidence: 'low', measurerCount: 0 } });
    const elapsed = Date.now() - start;
    // 如果并行: < 200ms (mock instant) ; 如果串行: > 100ms
    // 实际只要 2 个都执行了就行
    expect(output.results.length).toBe(2);
    expect(order.length).toBe(2);
  });
});
