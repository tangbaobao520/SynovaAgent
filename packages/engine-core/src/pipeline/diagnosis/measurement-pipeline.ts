/**
 * measurement-pipeline.ts — 通用测量管道
 * @state: real — 测试驱动实现, 6项测试全部通过
 *
 * L3 模块：数据进入 → N个测量器依次计算 → 聚合结果 → 输出
 * 管道不关心测量逻辑——它只负责加载、执行、收集、聚合。
 *
 * 当前状态 (2026-06-14): 管道框架就绪但零真实测量器注册。
 * 测量能力已迁移到 Sentinel 接口 (src/sentinel/)。详见 docs/SENTINEL-GAP-D1-D4-D5.md。
 * diagnosis-upload-v2.ts 中调用本管道但正确降级 (degraded=true)。
 */

// ═══ Types ═══

export interface MeasurerConfig {
  id: string;
  dimension: string;        // D1-D7
  dataRequirements: string[];  // 需要的输入字段名
}

export interface MeasurementResult {
  measurerId: string;
  dimension: string;
  score: number;            // 0-10
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];       // 每条证据一句可读的话
  trend?: 'improving' | 'stable' | 'declining';
  computedAt: string;       // ISO-8601
}

export interface Measurer {
  config: MeasurerConfig;
  compute(input: Record<string, unknown>): MeasurementResult | Promise<MeasurementResult>;
}

export interface MeasurementOutput {
  results: MeasurementResult[];
  aggregated: Record<string, {
    score: number;
    confidence: string;
    measurerCount: number;
  }>;
  degradedModules: string[];
  computedAt: string;
}

// ═══ Pipeline ═══

export class MeasurementPipeline {
  private measurers: Measurer[] = [];

  register(measurers: Measurer[]): void {
    this.measurers.push(...measurers);
  }

  getMeasurerCount(): number {
    return this.measurers.length;
  }

  /**
   * 运行所有已注册的测量器。
   * 单个测量器失败不影响其他 — 失败的加入 degradedModules。
   * 数据缺失时返回空结果，不报错。
   */
  async run(input: Record<string, unknown>): Promise<MeasurementOutput> {
    const results: MeasurementResult[] = [];
    const degradedModules: string[] = [];
    const isInputEmpty = Object.keys(input).length === 0;

    for (const m of this.measurers) {
      try {
        if (isInputEmpty) {
          // 空输入：返回 low-confidence placeholder
          results.push(this.emptyResult(m.config.id, m.config.dimension));
        } else {
          const r = await m.compute(input);
          results.push(r);
        }
      } catch (err) {
        degradedModules.push(m.config.id);
        results.push({
          measurerId: m.config.id,
          dimension: m.config.dimension,
          score: 0,
          confidence: 'low',
          evidence: ['测量器执行失败: ' + ((err as Error).message || 'unknown')],
          computedAt: new Date().toISOString(),
        });
      }
    }

    // 按维度聚合
    const aggregated = this.aggregate(results);

    return {
      results,
      aggregated,
      degradedModules,
      computedAt: new Date().toISOString(),
    };
  }

  private emptyResult(id: string, dimension: string): MeasurementResult {
    return {
      measurerId: id,
      dimension,
      score: 0,
      confidence: 'low',
      evidence: ['输入数据为空'],
      computedAt: new Date().toISOString(),
    };
  }

  private aggregate(results: MeasurementResult[]): MeasurementOutput['aggregated'] {
    const grouped = new Map<string, MeasurementResult[]>();
    for (const r of results) {
      const arr = grouped.get(r.dimension) || [];
      arr.push(r);
      grouped.set(r.dimension, arr);
    }

    const aggregated: MeasurementOutput['aggregated'] = {};
    for (const [dim, dimResults] of grouped) {
      // 加权平均（confidence: high=1.0, medium=0.5, low=0.2）
      const weights = { high: 1.0, medium: 0.5, low: 0.2 };
      let totalWeight = 0;
      let weightedSum = 0;

      for (const r of dimResults) {
        const w = weights[r.confidence];
        weightedSum += r.score * w;
        totalWeight += w;
      }

      const avgScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
      // 综合置信度：多数 high → high, 多数 low → low, 其他 → medium
      const highCount = dimResults.filter(r => r.confidence === 'high').length;
      const lowCount = dimResults.filter(r => r.confidence === 'low').length;
      const aggConfidence = highCount > dimResults.length / 2 ? 'high'
        : lowCount > dimResults.length / 2 ? 'low' : 'medium';

      aggregated[dim] = {
        score: Math.round(avgScore * 10) / 10, // 1 位小数
        confidence: aggConfidence,
        measurerCount: dimResults.length,
      };
    }

    return aggregated;
  }
}

// ═══ Sample Measurer (测试用) ═══

/**
 * 创建样本测量器。返回固定的分数。
 * 用于管道功能测试，不用于生产。
 */
export function createSampleMeasurer(
  id: string,
  dimension: string,
  score = 5.0,
): Measurer {
  return {
    config: { id, dimension, dataRequirements: ['someData'] },
    compute: (): MeasurementResult => ({
      measurerId: id,
      dimension,
      score,
      confidence: score > 3 ? 'medium' : 'low',
      evidence: ['样本测量器返回固定值 ' + score],
      trend: score > 5 ? 'improving' : 'stable',
      computedAt: new Date().toISOString(),
    }),
  };
}
