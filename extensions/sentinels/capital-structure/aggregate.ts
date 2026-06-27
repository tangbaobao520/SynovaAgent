/**
 * capital-structure/aggregate.ts — F2 资本结构健康度哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeDebtEquityRatio } from './computes/debt-equity-ratio';
import { computeInterestCoverage } from './computes/interest-coverage';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/capital-structure');
interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }

export const capitalStructureSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      const finNodes = store.queryNodes('FINANCIAL', { teamId });
      const financials = finNodes.map(n => ({
        totalDebt: Number(n.props.totalDebt) || 0,
        longTermDebt: Number(n.props.longTermDebt) || 0,
        equity: Number(n.props.equity) || 0,
        operatingIncome: Number(n.props.operatingIncome) || Number(n.props.operatingCashFlow) || 0,
        interestExpense: Number(n.props.interestExpense) || 0,
      }));

      const de = computeDebtEquityRatio(financials);
      const ic = computeInterestCoverage(financials);
      const findings: SentinelFinding[] = [];

      if (!de.degraded && de.debtEquity > 2.5) {
        findings.push({ id: `f2-de-crit-${now.getTime()}`, severity: 'critical', title: `负债权益比过高 (${de.debtEquity.toFixed(1)})`, description: `负债/权益 > 2.5，财务杠杆过高。`, evidence: [`D/E: ${de.debtEquity.toFixed(1)}`, `长期负债占比: ${(de.longTermDebtRatio * 100).toFixed(0)}%`], suggestion: '考虑降杠杆：偿还债务或增资。', detectedAt: checkedAt });
      } else if (!de.degraded && de.debtEquity > 1.5) {
        findings.push({ id: `f2-de-warn-${now.getTime()}`, severity: 'warning', title: `负债权益比偏高 (${de.debtEquity.toFixed(1)})`, description: 'D/E > 1.5，需关注。', evidence: [`D/E: ${de.debtEquity.toFixed(1)}`], suggestion: '评估债务偿还计划。', detectedAt: checkedAt });
      }

      if (!ic.degraded && ic.icr < 1.5) {
        findings.push({ id: `f2-icr-crit-${now.getTime()}`, severity: 'critical', title: `利息覆盖倍数过低 (${ic.icr.toFixed(1)}x)`, description: `EBIT/利息 < 1.5，偿债能力不足。`, evidence: [`ICR: ${ic.icr.toFixed(1)}x`, `EBIT: ${ic.ebit}`, `利息: ${ic.interestExpense}`], suggestion: '改善经营现金流或重组债务。', detectedAt: checkedAt });
      } else if (!ic.degraded && ic.icr < 3.0) {
        findings.push({ id: `f2-icr-warn-${now.getTime()}`, severity: 'warning', title: `利息覆盖倍数偏低 (${ic.icr.toFixed(1)}x)`, description: 'EBIT/利息 < 3.0。', evidence: [`ICR: ${ic.icr.toFixed(1)}x`], suggestion: '监控盈利和利率变化。', detectedAt: checkedAt });
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[capital-structure] check 失败');
      return [{ id: `f2-error-${now.getTime()}`, severity: 'warning', title: '资本结构检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }];
    }
  },
};
