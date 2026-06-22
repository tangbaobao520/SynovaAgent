/**
 * cost-health/aggregate.ts — 成本健康哨兵
 *
 * 综合 N 个计算指标 → 1 条 Finding。
 * 数据通过 L4 GraphStore 接口获取，不直接查 SQLite。
 *
 * V3.7 Batch 2
 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/cost-health');

export const costHealthSentinel = {
  manifest: null as SentinelManifest | null, // 由 loader 注入

  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];

    try {
      // 1. 毛利率变化率
      const financialNodes = store.queryNodes('FINANCIAL', { teamId });
      const costNodes = financialNodes.filter(n => (n.props.financialType as string) === 'cost');
      const revenueNodes = financialNodes.filter(n => (n.props.financialType as string) === 'revenue');

      if (revenueNodes.length > 0 && costNodes.length > 0) {
        const revenue = (revenueNodes[0].props.amount as number) || 0;
        const cost = (costNodes[0].props.amount as number) || 0;
        const grossMargin = revenue > 0 ? (revenue - cost) / revenue : 0;

        if (this.manifest) {
          const t = this.manifest.thresholds.gross_margin;
          if (grossMargin <= t.critical) {
            findings.push({
              id: 'cost_gross_margin_critical',
              severity: 'critical',
              title: '毛利率严重下降',
              description: `毛利率 ${(grossMargin * 100).toFixed(1)}%，低于 critical 阈值 ${(t.critical * 100).toFixed(0)}%。`,
              detectedAt: new Date().toISOString(),
            });
          } else if (grossMargin <= t.warning) {
            findings.push({
              id: 'cost_gross_margin_warning',
              severity: 'warning',
              title: '毛利率下降',
              description: `毛利率 ${(grossMargin * 100).toFixed(1)}%，低于 warning 阈值 ${(t.warning * 100).toFixed(0)}%。`,
              detectedAt: new Date().toISOString(),
            });
          }
        }
      }

      // 2. 固定/变动成本比
      const fixedCost = costNodes.reduce((s, n) => s + ((n.props.fixedAmount as number) || 0), 0);
      const totalCost = costNodes.reduce((s, n) => s + ((n.props.amount as number) || 0), 0);
      if (totalCost > 0 && this.manifest) {
        const fixedRatio = fixedCost / totalCost;
        const t = this.manifest.thresholds.fixed_ratio;
        if (fixedRatio >= t.critical) {
          findings.push({
            id: 'cost_fixed_ratio_critical',
            severity: 'critical',
            title: '固定成本占比过高',
            description: `固定成本占比 ${(fixedRatio * 100).toFixed(1)}%，超出 critical 阈值 ${(t.critical * 100).toFixed(0)}%。成本结构僵化。`,
            evidence: [`固定成本: ${fixedCost}`, `总成本: ${totalCost}`],
            suggestion: '审查固定成本构成，寻找可变成本化机会（外包、按需资源）。',
            detectedAt: new Date().toISOString(),
          });
        } else if (fixedRatio >= t.warning) {
          findings.push({
            id: 'cost_fixed_ratio_warning',
            severity: 'warning',
            title: '固定成本占比偏高',
            description: `固定成本占比 ${(fixedRatio * 100).toFixed(1)}%，超出 warning 阈值 ${(t.warning * 100).toFixed(0)}%。`,
            detectedAt: new Date().toISOString(),
          });
        }
      }

      if (findings.length > 0) {
        log.info({ teamId, count: findings.length }, '成本健康检查完成');
      }
    } catch (err: any) {
      log.warn({ err, teamId }, '成本健康检查失败 — degraded');
    }

    return findings;
  },
};
