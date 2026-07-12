/**
 * debt-structure.ts — F2 哨兵 compute 函数
 *
 * 短债比 = ShortTermDebt / TotalDebt
 * 来源: 公司理财(罗斯) Ch3 — 债务期限结构
 * 阈值: >50% → 短贷长投风险
 */
export interface DebtStructureResult {
  shortTermRatio: number;
  signal: 'critical' | 'warning' | 'healthy';
  degraded: boolean;
  warnings: string[];
}

export function computeDebtStructure(fin: {
  shortTermDebt: number;
  totalDebt: number;
}): DebtStructureResult {
  const warnings: string[] = [];

  if (fin.totalDebt <= 0) {
    return {
      shortTermRatio: 0,
      signal: 'healthy',
      degraded: true,
      warnings: ['Total debt is zero — cannot compute debt structure'],
    };
  }

  const ratio = fin.shortTermDebt / fin.totalDebt;

  let signal: 'critical' | 'warning' | 'healthy';
  if (ratio > 0.7) {
    signal = 'critical';
  } else if (ratio > 0.5) {
    signal = 'warning';
  } else {
    signal = 'healthy';
  }

  if (signal !== 'healthy') {
    warnings.push(`Short-term debt is ${(ratio * 100).toFixed(0)}% of total — risk of short-term borrowing for long-term investment`);
  }

  return {
    shortTermRatio: Math.round(ratio * 100) / 100,
    signal,
    degraded: false,
    warnings,
  };
}
