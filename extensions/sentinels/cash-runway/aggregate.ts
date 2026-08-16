/** cash-runway aggregate — 现金流哨兵。综合N个指标→1条Finding。V4.4.2 */
import type { GraphStoreReader, SentinelManifest } from '../../../src/sentinel/sentinel-loader';
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { createLogger } from '@synova/logger';
import { computeCashRunwayMonths } from './computes/compute-cash-runway-months';
import { computeReceivableOverdueRate } from './computes/compute-receivable-overdue-rate';
import { computeConstraintImpact } from './computes/compute-constraint-impact';
import { computeReplenishRate } from './computes/compute-replenish-rate';

const log = createLogger('sentinel/cash-runway');

export const cashRunwaySentinel = {
  manifest: null as SentinelManifest | null,
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const findings: SentinelFinding[] = [];
    try {
      const [runwayResult, overdueResult, constraintResult, replenishResult] = await Promise.all([
        computeCashRunwayMonths(store, { teamId, traversal }),
        computeReceivableOverdueRate(store, { teamId, traversal }),
        computeConstraintImpact(store, { teamId, traversal }),
        computeReplenishRate(store, { teamId, traversal }),
      ]);

      const runwayMonths = runwayResult.value;
      const overdueRate = overdueResult.value;

      if (this.manifest) {
        const t = this.manifest.thresholds;
        // P1-1 (K3 20260813): degraded 结果不穿过阈值门控 — compute 降级时 value=0，
        // 0 ≤ critical 6 会误报「现金流危急」（活运行 [B] 组实证）。短路改发
        // severity=warning 的 degraded finding（formatFindingsForLLM 只呈现
        // critical+warning，warning 保证降级信号对专家 prompt 可见 — 铁律 31）。
        if (runwayResult.degraded) {
          findings.push({
            id: 'cr_runway_degraded', severity: 'warning', title: '现金流数据不完整',
            description: `现金跑道计算降级：${runwayResult.warnings.join('；')}`,
            evidence: runwayResult.evidence,
            suggestion: '请确认财务数据是否完整。',
            detectedAt: new Date().toISOString(),
          });
        } else if (runwayMonths <= t.cash_runway_months.critical) {
          findings.push({
            id: 'cash_critical', severity: 'critical', title: `现金流危急—跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : '充足'}个月`,
            description: `现金跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : '充足'}个月，低于critical阈值${t.cash_runway_months.critical}个月。`,
            evidence: runwayResult.evidence,
            suggestion: '启动应急融资，削减非必要支出。',
            detectedAt: new Date().toISOString(),
          });
        } else if (runwayMonths <= t.cash_runway_months.warning) {
          findings.push({
            id: 'cash_warning', severity: 'warning', title: `现金流紧张—跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : 0}个月`,
            description: `现金跑道${Number.isFinite(runwayMonths) ? runwayMonths.toFixed(1) : 0}个月，低于warning阈值。`,
            detectedAt: new Date().toISOString(),
          });
        }
        if (overdueResult.degraded) {
          findings.push({
            id: 'cr_overdue_degraded', severity: 'warning', title: '应收数据不完整',
            description: `应收逾期率计算降级：${overdueResult.warnings.join('；')}`,
            evidence: overdueResult.evidence,
            suggestion: '请确认财务数据是否完整。',
            detectedAt: new Date().toISOString(),
          });
        } else if (overdueRate >= t.receivable_overdue.critical) {
          findings.push({
            id: 'ar_critical', severity: 'critical', title: '应收逾期严重',
            description: `应收/现金比${(overdueRate * 100).toFixed(0)}%，超出critical阈值。`,
            evidence: overdueResult.evidence,
            suggestion: '加速应收回收，审查信用政策。',
            detectedAt: new Date().toISOString(),
          });
        }
      }
      // T7b: CONSTRAINS — 外部约束影响
      if (constraintResult.value > 0.6) {
        findings.push({
          id: 'cash_constraint_high', severity: 'warning',
          title: '外部约束强度高',
          description: `外部约束magnitude ${(constraintResult.value * 100).toFixed(0)}% > 60%，可能限制资金使用。`,
          evidence: constraintResult.evidence,
          suggestion: '评估约束来源，制定应对策略。',
          detectedAt: new Date().toISOString(),
        });
      }
      // T7b: REPLENISHES — 资金回流率检查
      if (!replenishResult.degraded && replenishResult.value < 0.2) {
        findings.push({
          id: 'cash_low_replenish', severity: 'warning',
          title: '资金回流率低',
          description: `再投资率 ${(replenishResult.value * 100).toFixed(0)}% < 20%，资金补充不足。`,
          evidence: replenishResult.evidence,
          suggestion: '审视盈利能力，优化现金流循环。',
          detectedAt: new Date().toISOString(),
        });
      }
      if (findings.length) log.info({ teamId, count: findings.length }, '现金流检查完成');
    } catch (err: unknown) {
      log.error({ err, teamId }, '[cash-runway] check失败');
      return [{ id: `cr-error-${Date.now()}`, severity: 'warning' as const,
        title: '现金流检测异常', description: `${(err as Error)?.message || String(err)}`,
        evidence: [], suggestion: '检查Financial节点数据源。', detectedAt: new Date().toISOString() }];
    }
    return findings;
  },
};
