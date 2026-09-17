/**
 * compute-receivable-overdue-rate.ts — 应收账款逾期率计算
 *
 * 契约ID: COMPUTE-RECEIVABLE-OVERDUE-RATE-v1
 * 模块: cash-runway
 * 消费边: FUNDS, PRODUCES
 * 输入: store: GraphStoreReader — 通过 queryNodes 获取财务节点
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(比率0-1), unit:'比率', confidence:'high',
 *               evidence:['应收: N', '现金: N'],
 *               degraded:false, warnings:[], computedAt }
 * 输出(降级1 — 无数据): { value:0, unit:'比率', confidence:'low', degraded:true,
 *               warnings:['无财务数据 — 无法计算应收逾期率'] }   ← 节点数为 0
 * 输出(降级2 — 现金字段缺失, D803 切片③新增): { value:0, unit:'比率', confidence:'low', degraded:true,
 *               warnings:['现金字段缺失 — 无法计算应收逾期率'] } ← 应收>0 而现金链属性全缺
 * 边界: 现金显式 0 → 比率 0（0 是合法值，不降级）；应收缺失 → 0 不告警（无害，S2 行12）
 * 超时: 5秒。不抛异常。
 *
 * 字段选择契约（D803 切片③收敛，S2 表逐行登记）:
 *   现金链   = cash_balance → cash     （**删除 `|| total_revenue` 挪用**——分母必须是现金，不是收入）
 *   应收链   = accounts_receivable → receivables（遍历分支与回退分支统一，对齐本体 schema `receivables`）
 *               — 修复前遍历分支只读 `accounts_receivable`、回退分支只读 `receivables`，同一分子两个口径
 *   守卫原语 = pickPresentNumber（见 compute-cash-runway-months.ts）——按属性存在性区分
 *             「现金未上报」（→ degraded，比率不可算）与「现金为 0」（合法值，按既有语义算 0）。
 */
import type { GraphStoreReader } from '../../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../../src/l4/graph-traversal';
import { CASH_PROP_CHAIN, pickPresentNumber } from './compute-cash-runway-months';
import type { ComputeInput, ComputeOutput } from './compute-cash-runway-months';

/** 应收链候选字段（按优先级；`accounts_receivable` 为遍历分支遗留别名，`receivables` 为本体 schema 名） */
const RECEIVABLE_PROP_CHAIN = ['accounts_receivable', 'receivables'] as const;

export async function computeReceivableOverdueRate(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let totalCash = 0;
  let receivable = 0;
  let hasData = false;
  let cashPropPresent = false;

  try {
    if (input.traversal) {
      try {
        const result = input.traversal.traverse([input.teamId], ['FUNDS']);
        if (result.nodes[0]) {
          for (const n of result.nodes) {
            const cash = pickPresentNumber(n.props, CASH_PROP_CHAIN);
            if (cash.found) cashPropPresent = true;
            totalCash += cash.value;
            receivable += pickPresentNumber(n.props, RECEIVABLE_PROP_CHAIN).value;
          }
          hasData = true;
        }
      } catch (err: unknown) {
        warnings.push(`图遍历失败: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!hasData) {
      const nodes = store.queryNodes('Financial');
      if (nodes.length > 0) {
        for (const n of nodes) {
          const cash = pickPresentNumber(n.props, CASH_PROP_CHAIN);
          if (cash.found) cashPropPresent = true;
          totalCash += cash.value;
          receivable += pickPresentNumber(n.props, RECEIVABLE_PROP_CHAIN).value;
        }
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        unit: '比率',
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无财务数据 — 无法计算应收逾期率'],
        computedAt,
      };
    }

    // D803 切片③ 降级2（S2 行12 / S4 行2 同构）: 有应收但现金未上报 → 比率的分母不存在。
    // 修复前: 现金属性缺失 → totalCash=0 → 走 `totalCash > 0 ? … : 0` 分支 → 比率 0 →
    //         不告警（静默假阴性，把「不知道」说成「没问题」）。
    // 修复口径: 分母不可得 → 诚实降级；现金显式 0 仍是合法值，不降级。
    if (receivable > 0 && !cashPropPresent) {
      return {
        value: 0,
        unit: '比率',
        confidence: 'low',
        evidence: [`应收: ${receivable}`],
        degraded: true,
        warnings: ['现金字段缺失 — 无法计算应收逾期率'],
        computedAt,
      };
    }

    const overdueRate = totalCash > 0 ? receivable / totalCash : 0;

    return {
      value: Math.round(overdueRate * 100) / 100,
      unit: '比率',
      confidence: 'high',
      evidence: [`应收: ${receivable}`, `现金: ${totalCash}`],
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      value: 0,
      unit: '比率',
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
