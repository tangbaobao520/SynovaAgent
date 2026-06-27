export interface UnitMarginResult { margin: number; unitRevenue: number; unitCost: number; degraded: boolean; }
export function computeUnitMargin(financials: Array<{ unitRevenue: number; unitCost: number }>): UnitMarginResult {
  if (financials.length === 0) return { margin: 0, unitRevenue: 0, unitCost: 0, degraded: true };
  const rev = financials.reduce((s, f) => s + (f.unitRevenue || 0), 0);
  const cost = financials.reduce((s, f) => s + (f.unitCost || 0), 0);
  return { margin: rev > 0 ? Math.round(((rev - cost) / rev) * 100) / 100 : 0, unitRevenue: rev, unitCost: cost, degraded: false };
}
