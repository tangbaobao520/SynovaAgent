/**
 * cash-conversion-cycle.ts — F5 哨兵 compute 函数
 *
 * CCC = DIO + DSO - DPO
 * DIO = 365 / (COGS / Inventory)         — 存货周转天数
 * DSO = 365 / (Revenue / AccountsReceivable) — 应收周转天数
 * DPO = 365 / (COGS / AccountsPayable)   — 应付周转天数
 *
 * 来源: 公司理财(罗斯) Ch3; Soliman (2008)
 *
 * 本体映射: Financial::cogs, inventory, accountsReceivable, accountsPayable, revenue
 *
 * 阈值: >90天预警(制造/零售基线)
 */
export interface CCCResult {
  cccDays: number;
  dio: number;
  dso: number;
  dpo: number;
  signal: 'critical' | 'warning' | 'healthy';
  degraded: boolean;
  warnings: string[];
}

export function computeCashConversionCycle(fin: {
  cogs: number;
  inventory: number;
  accountsReceivable: number;
  accountsPayable: number;
  revenue: number;
}): CCCResult {
  const warnings: string[] = [];

  if (fin.revenue <= 0 && fin.cogs <= 0) {
    return {
      cccDays: 0,
      dio: 0,
      dso: 0,
      dpo: 0,
      signal: 'critical',
      degraded: true,
      warnings: ['Revenue and COGS both zero — cannot compute CCC'],
    };
  }

  // DIO = 365 / (COGS / Inventory)
  let dio = 0;
  if (fin.cogs > 0 && fin.inventory > 0) {
    dio = 365 / (fin.cogs / fin.inventory);
  } else {
    warnings.push(fin.inventory <= 0 ? 'Inventory is zero — DIO set to 0' : 'COGS is zero — DIO set to 0');
  }

  // DSO = 365 / (Revenue / AR)
  let dso = 0;
  if (fin.revenue > 0 && fin.accountsReceivable > 0) {
    dso = 365 / (fin.revenue / fin.accountsReceivable);
  } else {
    warnings.push(fin.accountsReceivable <= 0 ? 'Accounts receivable is zero — DSO set to 0' : 'Revenue is zero — DSO set to 0');
  }

  // DPO = 365 / (COGS / AP)
  let dpo = 0;
  if (fin.cogs > 0 && fin.accountsPayable > 0) {
    dpo = 365 / (fin.cogs / fin.accountsPayable);
  } else {
    warnings.push(fin.accountsPayable <= 0 ? 'Accounts payable is zero — DPO set to 0' : 'COGS is zero — DPO set to 0');
  }

  const cccDays = dio + dso - dpo;

  const degraded = (fin.revenue <= 0 || fin.cogs <= 0);
  if (degraded) {
    warnings.push('Partial data — CCC estimate may be unreliable');
  }

  // 制造/零售基线
  let signal: 'critical' | 'warning' | 'healthy';
  if (cccDays > 120) {
    signal = 'critical';
  } else if (cccDays > 90) {
    signal = 'warning';
  } else {
    signal = 'healthy';
  }

  return {
    cccDays: Math.round(cccDays),
    dio: Math.round(dio),
    dso: Math.round(dso),
    dpo: Math.round(dpo),
    signal,
    degraded,
    warnings,
  };
}
