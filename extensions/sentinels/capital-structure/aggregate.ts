/**
 * capital-structure/aggregate.ts — F2 资本结构健康度哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeDebtEquityRatio } from './computes/debt-equity-ratio';
import { computeInterestCoverage } from './computes/interest-coverage';
import { computeDebtStructure } from './computes/debt-structure';
import { createLogger } from '@synova/logger';

const log = createLogger('sentinel/capital-structure');
interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }

export const capitalStructureSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
    let usedTraversal = false;
    try {
      try { if (traversal) { const r = traversal.traverse([teamId], ['FUNDS']); if (r.nodes[0]) { finNodes = r.nodes; usedTraversal = true; } } } catch (err: unknown) { log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径'); }
      if (!usedTraversal) { finNodes = store.queryNodes('Financial', { teamId }); }
      const financials = finNodes.map(n => ({
        totalDebt: Number(n.props.totalDebt) || 0,
        shortTermDebt: Number(n.props.shortTermDebt) || Number(n.props.shortTermBorrowing) || 0,
        longTermDebt: Number(n.props.longTermDebt) || 0,
        equity: Number(n.props.equity) || 0,
        operatingIncome: Number(n.props.operatingIncome) || Number(n.props.operatingCashFlow) || 0,
        interestExpense: Number(n.props.interestExpense) || 0,
      }));

      const de = computeDebtEquityRatio(financials);
      const ic = computeInterestCoverage(financials);
      const findings: SentinelFinding[] = [];

      // F2c: 短债比
      if (financials.length > 0) {
        const shortTermDebt = financials.reduce((s, f) => s + f.shortTermDebt, 0) / financials.length;
        const totalDebtAvg = financials.reduce((s, f) => s + f.totalDebt, 0) / financials.length;
        const ds = computeDebtStructure({ shortTermDebt, totalDebt: totalDebtAvg });
        if (!ds.degraded) {
          if (ds.signal === 'critical') {
            findings.push({ id: `f2-ds-crit-${now.getTime()}`, severity: 'critical', title: `短债占比过高 (${(ds.shortTermRatio * 100).toFixed(0)}%)`, description: `短期债务占总债务 ${(ds.shortTermRatio * 100).toFixed(0)}%，超过 70% 警戒线。`, evidence: [`短债比: ${(ds.shortTermRatio * 100).toFixed(0)}%`], suggestion: '延长债务期限，用长期融资置换短期借款。', detectedAt: checkedAt });
          } else if (ds.signal === 'warning') {
            findings.push({ id: `f2-ds-warn-${now.getTime()}`, severity: 'warning', title: `短债占比偏高 (${(ds.shortTermRatio * 100).toFixed(0)}%)`, description: `短期债务占比 ${(ds.shortTermRatio * 100).toFixed(0)}%，超过 50%。`, evidence: [`短债比: ${(ds.shortTermRatio * 100).toFixed(0)}%`], suggestion: '优化债务期限结构。', detectedAt: checkedAt });
          }
        }
      }

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
