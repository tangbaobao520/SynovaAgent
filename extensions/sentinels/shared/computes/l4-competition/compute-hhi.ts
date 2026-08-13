/**
 * compute-hhi.ts — Herfindahl-Hirschman Index 市场集中度
 *
 * 契约ID: COMPUTE-HHI-v1
 * 消费边: E-33
 * HHI = Σ(s_i^2) 其中 s_i 是第i家企业的市场份额
 *
 * D59 ME Enhance: 追加 economic_interpretation 字段
 */

/** 管理经济学语义解读 */
export interface HHIInterpretation {
  /** 市场集中度分类: concentrated / moderate / competitive */
  marketConcentrationClassification: string;
  /** 并购含义 */
  mergerImplication: string;
  /** 定价权评估 */
  pricingPowerAssessment: string;
}

export interface HHIResult {
  hhi: number;
  firmCount: number;
  top3Share: number;
  /** D59: 管理经济学语义解读 */
  economicInterpretation: HHIInterpretation;
  degraded: boolean;
  warnings: string[];
}

export function computeHHI(marketShares: number[]): HHIResult {
  const warnings: string[] = [];

  if (marketShares.length === 0) {
    return {
      hhi: 0, firmCount: 0, top3Share: 0,
      economicInterpretation: {
        marketConcentrationClassification: 'unknown',
        mergerImplication: '缺少市场份额数据',
        pricingPowerAssessment: '无法评估',
      },
      degraded: true,
      warnings: ['No market share data'],
    };
  }

  const total = marketShares.reduce((s, v) => s + v, 0);
  const normalized = total > 0 ? marketShares.map(s => s / total) : marketShares;
  const hhi = normalized.reduce((s, v) => s + v * v, 0);
  const sorted = [...normalized].sort((a, b) => b - a);
  const top3Share = sorted.slice(0, 3).reduce((s, v) => s + v, 0);

  const classification = hhi > 0.25 ? 'concentrated' : hhi > 0.1 ? 'moderate' : 'competitive';
  const mergerImplication = hhi > 0.25
    ? 'HHI>0.25，市场高度集中，并购可能引发反垄断审查'
    : hhi > 0.1
    ? 'HHI 0.1-0.25，市场适度集中，并购需关注竞争影响'
    : 'HHI<0.1，市场竞争充分，并购审查风险低';
  const pricingPower = hhi > 0.25
    ? '头部企业具备较强定价权'
    : hhi > 0.1
    ? '头部企业有一定定价权但受竞争约束'
    : '市场竞争激烈，单个企业定价权有限';

  return {
    hhi: Math.round(hhi * 10000) / 10000,
    firmCount: marketShares.length,
    top3Share: Math.round(top3Share * 10000) / 10000,
    economicInterpretation: {
      marketConcentrationClassification: classification,
      mergerImplication,
      pricingPowerAssessment: pricingPower,
    },
    degraded: false,
    warnings,
  };
}
