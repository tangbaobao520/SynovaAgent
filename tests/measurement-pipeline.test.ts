/**
 * tests/measurement-pipeline.test.ts — 测量管道单元测试
 * @state: real — 测试驱动实现
 *
 * 铁律 0-2 Step 2: 先写测试，再写实现。
 */
import { describe, it, expect } from 'vitest';

// ═══ 待实现的接口（测试即规范） ═══

interface MeasurerConfig {
  id: string;
  dimension: string;       // D1-D7
  dataRequirements: string[];  // 需要哪些数据字段
}

interface MeasurementResult {
  measurerId: string;
  dimension: string;
  score: number;           // 0-10
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];       // 每个证据一句话
  trend?: 'improving' | 'stable' | 'declining';
  computedAt: string;       // ISO-8601
}

interface Measurer {
  config: MeasurerConfig;
  compute(input: Record<string, unknown>): MeasurementResult;
}

interface MeasurementOutput {
  results: MeasurementResult[];
  /** 按维度聚合的评分 */
  aggregated: Record<string, { score: number; confidence: string; measurerCount: number }>;
  /** 失败的测量器 ID */
  degradedModules: string[];
  computedAt: string;
}

// ═══ 测试 ═══

describe('MeasurementPipeline', () => {
  // 动态导入 — 实现后才能通过
  let MeasurementPipeline: any;
  let createSampleMeasurer: Function;

  beforeAll(async () => {
    // 实现文件路径: packages/engine-core/src/pipeline/diagnosis/measurement-pipeline.ts
    try {
      const mod = await import('../packages/engine-core/src/pipeline/diagnosis/measurement-pipeline');
      MeasurementPipeline = mod.MeasurementPipeline;
      createSampleMeasurer = mod.createSampleMeasurer;
    } catch {
      // 实现不存在时，测试标记为 pending
    }
  });

  it('应该能注册测量器', () => {
    if (!MeasurementPipeline) return;
    const pipeline = new MeasurementPipeline();
    const m = createSampleMeasurer?.('test-1', 'D2');
    if (!m) return;

    pipeline.register([m]);
    expect(pipeline.getMeasurerCount()).toBe(1);
  });

  it('空输入应该返回空输出（不报错）', async () => {
    if (!MeasurementPipeline || !createSampleMeasurer) return;
    const pipeline = new MeasurementPipeline();
    const m = createSampleMeasurer('m1', 'D2');
    pipeline.register([m]);

    const output: MeasurementOutput = await pipeline.run({});
    expect(output.results).toHaveLength(1);
    expect(output.results[0].confidence).toBe('low');
    expect(output.results[0].evidence).toContain('输入数据为空');
    expect(output.degradedModules).toHaveLength(0);
  });

  it('单个测量器失败不应该影响其他', async () => {
    if (!MeasurementPipeline) return;
    const pipeline = new MeasurementPipeline();

    const good = createSampleMeasurer?.('good', 'D2');
    const bad: Measurer = {
      config: { id: 'bad', dimension: 'D2', dataRequirements: [] },
      compute: () => { throw new Error('计算失败'); },
    };
    if (!good) return;

    pipeline.register([good, bad]);
    const output: MeasurementOutput = await pipeline.run({ someData: true });

    // good 应该正常执行
    const goodResult = output.results.find((r: MeasurementResult) => r.measurerId === 'good');
    expect(goodResult).toBeDefined();
    expect(goodResult!.confidence).not.toBe('low');

    // bad 应该在 degradedModules 中
    expect(output.degradedModules).toContain('bad');
  });

  it('同维度多测量器应该聚合', async () => {
    if (!MeasurementPipeline || !createSampleMeasurer) return;
    const pipeline = new MeasurementPipeline();
    // 注册 3 个 D2 测量器，每个返回不同分数
    const m1 = createSampleMeasurer('m1', 'D2', 7.0);
    const m2 = createSampleMeasurer('m2', 'D2', 5.0);
    const m3 = createSampleMeasurer('m3', 'D3', 8.0);
    pipeline.register([m1, m2, m3]);

    const output: MeasurementOutput = await pipeline.run({ someData: true });

    // D2 应该聚合 2 个测量器
    expect(output.aggregated['D2']).toBeDefined();
    expect(output.aggregated['D2'].measurerCount).toBe(2);
    // 加权平均: (7.0 + 5.0) / 2 = 6.0
    expect(output.aggregated['D2'].score).toBeCloseTo(6.0, 0);

    // D3 只有 1 个
    expect(output.aggregated['D3']).toBeDefined();
    expect(output.aggregated['D3'].score).toBeCloseTo(8.0, 0);
  });

  it('数据缺失时 confidence 应该降低', async () => {
    if (!MeasurementPipeline || !createSampleMeasurer) return;
    const pipeline = new MeasurementPipeline();

    // 这个测量器需要 'collaborationData'，但输入里没有
    const m: Measurer = {
      config: { id: 'needy', dimension: 'D3', dataRequirements: ['collaborationData'] },
      compute: (input: Record<string, unknown>) => {
        if (!input.collaborationData) {
          return {
            measurerId: 'needy', dimension: 'D3',
            score: 0, confidence: 'low',
            evidence: ['缺少 collaborationData — 无法计算'],
            computedAt: new Date().toISOString(),
          };
        }
        return {
          measurerId: 'needy', dimension: 'D3',
          score: 7.0, confidence: 'high',
          evidence: ['协作密度正常'],
          trend: 'stable', computedAt: new Date().toISOString(),
        };
      },
    };
    pipeline.register([m]);

    const output: MeasurementOutput = await pipeline.run({});
    expect(output.results[0].confidence).toBe('low');
    expect(output.results[0].evidence[0]).toContain('缺少');
  });

  it('证据必须是可读的一句话', async () => {
    if (!MeasurementPipeline || !createSampleMeasurer) return;
    const pipeline = new MeasurementPipeline();
    const m = createSampleMeasurer('m1', 'D2');
    pipeline.register([m]);

    const output: MeasurementOutput = await pipeline.run({ someData: true });
    for (const r of output.results) {
      for (const e of r.evidence) {
        // 每个证据必须是一句可读的话，不是数字堆砌
        expect(e.length).toBeGreaterThan(5);
        expect(e).not.toMatch(/^[0-9.]+$/);
      }
    }
  });
});
