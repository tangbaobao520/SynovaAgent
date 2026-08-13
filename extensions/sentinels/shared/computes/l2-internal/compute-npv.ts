/**
 * compute-npv.ts — 净现值 (Net Present Value)
 *
 * 契约ID: COMPUTE-NPV-v1
 * 消费边: E-34
 * NPV = Σ(CashFlow_t / (1+r)^t) - InitialInvestment
 *
 * D59 ME Enhance: 追加 economic_interpretation 字段
 */

/** 管理经济学语义解读 */
export interface NPVInterpretation {
  /** NPV解读: value_creating / breakeven / value_destroying */
  npvInterpretation: string;
  /** 折现率敏感度 */
  discountSensitivity: string;
  /** 投资建议 */
  investmentAdvice: string;
}

export interface NPVResult {
  npv: number;
  irr: number;
  paybackPeriod: number;
  /** D59: 管理经济学语义解读 */
  economicInterpretation: NPVInterpretation;
  degraded: boolean;
  warnings: string[];
}

export function computeNPV(
  initialInvestment: number,
  cashFlows: number[],
  discountRate: number,
): NPVResult {
  const warnings: string[] = [];

  if (initialInvestment <= 0 || cashFlows.length === 0) {
    return {
      npv: 0, irr: 0, paybackPeriod: 0,
      economicInterpretation: {
        npvInterpretation: 'value_destroying',
        discountSensitivity: '数据不足无法评估',
        investmentAdvice: '缺少有效的投资数据',
      },
      degraded: true,
      warnings: ['Invalid input: initial investment must be positive, cash flows not empty'],
    };
  }

  let npv = -initialInvestment;
  let cumulativeCashFlow = 0;
  let paybackPeriod = -1;

  for (let t = 0; t < cashFlows.length; t++) {
    const pv = cashFlows[t] / Math.pow(1 + discountRate, t + 1);
    npv += pv;
    if (paybackPeriod < 0) {
      cumulativeCashFlow += cashFlows[t];
      if (cumulativeCashFlow >= initialInvestment) {
        paybackPeriod = t + 1;
      }
    }
  }
  if (paybackPeriod < 0) paybackPeriod = cashFlows.length;

  // IRR approximation (simple)
  let irr = 0;
  if (npv > 0) {
    let low = 0, high = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (low + high) / 2;
      let npvMid = -initialInvestment;
      for (let t = 0; t < cashFlows.length; t++) {
        npvMid += cashFlows[t] / Math.pow(1 + mid, t + 1);
      }
      if (npvMid > 0) low = mid;
      else high = mid;
    }
    irr = Math.round((low + high) / 2 * 10000) / 10000;
  }

  const npvInterpretation = npv > 0 ? 'value_creating' : npv === 0 ? 'breakeven' : 'value_destroying';
  const discountSensitivity = npv > 0
    ? `NPV为正(${npv.toFixed(2)})，折现率每上升1% NPV变动约${(npv * 0.01).toFixed(2)}`
    : `NPV为负(${npv.toFixed(2)})，需降低折现率或改善现金流`;

  return {
    npv: Math.round(npv * 100) / 100,
    irr,
    paybackPeriod,
    economicInterpretation: {
      npvInterpretation,
      discountSensitivity,
      investmentAdvice: npv > 0
        ? '项目创造价值，建议推进'
        : '项目不创造价值，建议重新评估或放弃',
    },
    degraded: false,
    warnings,
  };
}
