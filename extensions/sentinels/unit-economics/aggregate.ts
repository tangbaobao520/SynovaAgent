import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeLtvCac } from './computes/ltv-cac-ratio';
import { computeUnitMargin } from './computes/gross-margin-per-unit';
import { createLogger } from '../../../src/logger';
const log = createLogger('sentinel/unit-economics');
interface GraphStoreReader { queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>; }
export const unitEconomicsSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      const finNodes = store.queryNodes('FINANCIAL', { teamId });
      const fin = finNodes.map(n => ({ customerLifetimeValue: Number(n.props.customerLifetimeValue) || Number(n.props.ltv) || 0, customerAcquisitionCost: Number(n.props.customerAcquisitionCost) || Number(n.props.cac) || 0, unitRevenue: Number(n.props.unitRevenue) || Number(n.props.price) || 0, unitCost: Number(n.props.unitCost) || Number(n.props.cogs) || 0 }));
      const ltv = computeLtvCac(fin); const um = computeUnitMargin(fin); const f: SentinelFinding[] = [];
      if (!ltv.degraded && ltv.ltvCac < 1) f.push({ id: `i10-ltv-crit-${now.getTime()}`, severity: 'critical', title: `LTV/CAC过低 (${ltv.ltvCac.toFixed(1)}x)`, description: '< 1x, 获客成本高于客户终身价值。', evidence: [`LTV/CAC: ${ltv.ltvCac.toFixed(1)}x`, `LTV: ${ltv.ltv}`, `CAC: ${ltv.cac}`], suggestion: '降低获客成本或提升客户终身价值。', detectedAt: checkedAt });
      else if (!ltv.degraded && ltv.ltvCac < 3) f.push({ id: `i10-ltv-warn-${now.getTime()}`, severity: 'warning', title: `LTV/CAC偏低 (${ltv.ltvCac.toFixed(1)}x)`, description: '< 3x。', evidence: [`LTV/CAC: ${ltv.ltvCac.toFixed(1)}x`], suggestion: '优化获客效率。', detectedAt: checkedAt });
      if (!um.degraded && um.margin < 0.1) f.push({ id: `i10-margin-crit-${now.getTime()}`, severity: 'critical', title: `单位毛利率过低 (${(um.margin*100).toFixed(0)}%)`, description: '单位毛利 < 10%。', evidence: [`毛利率: ${(um.margin*100).toFixed(0)}%`, `单位收入: ${um.unitRevenue}`, `单位成本: ${um.unitCost}`], suggestion: '审查定价策略和单位成本。', detectedAt: checkedAt });
      return f;
    } catch (err: unknown) { log.error({ err }, '[unit-economics] 失败'); return [{ id: `i10-error-${now.getTime()}`, severity: 'warning', title: '检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }]; }
  },
};
