/**
 * variable-costs.ts — I10 哨兵 compute 函数
 *
 * 从 COST_DRIVEN_BY 边数据中分类变动成本 vs 固定成本。
 * 分类规则:
 *   costType='variable' → variable
 *   item linked to CLIENT/ORDER 节点 → variable (与订单量相关)
 *   其余 → fixed
 *
 * 来源: 管理经济学(托马斯) Ch6 — 成本分类
 * 本体映射: COST_DRIVEN_BY::costType, share
 */
export interface CostItem {
  name: string;
  amount: number;
  category: 'fixed' | 'variable';
}

export interface VariableCostsResult {
  variableCosts: CostItem[];
  fixedCosts: CostItem[];
  totalVariableMonthly: number;
  totalFixedMonthly: number;
  variableRatio: number;
  degraded: boolean;
  warnings: string[];
}

export function computeVariableCosts(
  costEdges: Array<{
    name: string;
    amount: number;
    costType: string;
    linkedToNodeType?: string;
  }>,
): VariableCostsResult {
  const warnings: string[] = [];

  if (costEdges.length === 0) {
    return {
      variableCosts: [],
      fixedCosts: [],
      totalVariableMonthly: 0,
      totalFixedMonthly: 0,
      variableRatio: 0,
      degraded: true,
      warnings: ['No cost data available'],
    };
  }

  const variableCosts: CostItem[] = [];
  const fixedCosts: CostItem[] = [];

  for (const item of costEdges) {
    const normalizedType = (item.costType || '').toLowerCase();
    const linkedTo = (item.linkedToNodeType || '').toLowerCase();

    const isVariable =
      normalizedType === 'variable' ||
      linkedTo === 'client' ||
      linkedTo === 'order' ||
      linkedTo === 'customer' ||
      linkedTo === 'product';

    if (isVariable) {
      variableCosts.push({ name: item.name, amount: item.amount, category: 'variable' });
    } else {
      fixedCosts.push({ name: item.name, amount: item.amount, category: 'fixed' });
    }
  }

  const totalVariableMonthly = variableCosts.reduce((s, c) => s + Math.max(0, c.amount), 0);
  const totalFixedMonthly = fixedCosts.reduce((s, c) => s + Math.max(0, c.amount), 0);
  const totalAll = totalVariableMonthly + totalFixedMonthly;
  const variableRatio = totalAll > 0 ? totalVariableMonthly / totalAll : 0;

  return {
    variableCosts,
    fixedCosts,
    totalVariableMonthly: Math.round(totalVariableMonthly * 100) / 100,
    totalFixedMonthly: Math.round(totalFixedMonthly * 100) / 100,
    variableRatio: Math.round(variableRatio * 100) / 100,
    degraded: false,
    warnings,
  };
}
