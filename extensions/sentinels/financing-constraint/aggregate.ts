/**
 * financing-constraint/aggregate.ts — F1 融资约束指数哨兵
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import { computeKzIndex } from './computes/kz-index';
import { createLogger } from '../../../src/logger';

const log = createLogger('sentinel/financing-constraint');

interface GraphStoreReader { queryNodes(type: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown>; }>; }

export const financingConstraintSentinel = {
  async check(store: GraphStoreReader, teamId: string): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    try {
      const finNodes = store.queryNodes('FINANCIAL', { teamId });
      const financials = finNodes.map(n => ({
        operatingCashFlow: Number(n.props.operatingCashFlow) || 0,
        netPpe: Number(n.props.netPPE) || Number(n.props.netPpe) || 0,
        totalDebt: Number(n.props.totalDebt) || 0,
        equity: Number(n.props.equity) || 0,
        cash: Number(n.props.cash) || Number(n.props.cashBalance) || 0,
      }));

      const result = computeKzIndex(financials);
      log.debug({ kzIndex: result.kzIndex }, 'KZ指数计算完成');

      if (result.kzIndex > 2.0) {
        return [{ id: `f1-kz-crit-${now.getTime()}`, severity: 'critical', title: `融资约束严重 (KZ=${result.kzIndex.toFixed(2)})`, description: 'KZ>2.0: 企业确定受到融资约束。', evidence: [`KZ: ${result.kzIndex.toFixed(2)}`, `CF/K: ${result.cfRatio.toFixed(3)}`, `杠杆: ${result.leverage.toFixed(3)}`, `现金/K: ${result.cashRatio.toFixed(3)}`, ...result.warnings], suggestion: '评估融资渠道，考虑补充资本或优化现金流。', detectedAt: checkedAt }];
      } else if (result.kzIndex > 1.0) {
        return [{ id: `f1-kz-warn-${now.getTime()}`, severity: 'warning', title: `融资约束偏紧 (KZ=${result.kzIndex.toFixed(2)})`, description: 'KZ 1.0-2.0: 可能存在融资约束。', evidence: [`KZ: ${result.kzIndex.toFixed(2)}`], suggestion: '关注现金流趋势，准备融资预案。', detectedAt: checkedAt }];
      }
      return [];
    } catch (err: unknown) {
      log.error({ err }, '[financing-constraint] check 失败');
      return [{ id: `f1-error-${now.getTime()}`, severity: 'warning', title: '融资约束检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }];
    }
  },
};
