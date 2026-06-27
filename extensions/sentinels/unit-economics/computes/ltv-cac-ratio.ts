export interface LtvCacResult { ltvCac: number; ltv: number; cac: number; degraded: boolean; }
export function computeLtvCac(financials: Array<{ customerLifetimeValue: number; customerAcquisitionCost: number }>): LtvCacResult {
  if (financials.length === 0) return { ltvCac: 0, ltv: 0, cac: 0, degraded: true };
  const ltv = financials.reduce((s, f) => s + (f.customerLifetimeValue || 0), 0);
  const cac = financials.reduce((s, f) => s + (f.customerAcquisitionCost || 0), 0);
  return { ltvCac: cac > 0 ? Math.round((ltv / cac) * 100) / 100 : (ltv > 0 ? 99 : 0), ltv, cac, degraded: false };
}
