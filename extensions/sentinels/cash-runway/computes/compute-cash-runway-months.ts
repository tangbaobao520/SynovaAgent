/**
 * compute-cash-runway-months.ts — 现金跑道月数计算
 *
 * 契约ID: COMPUTE-CASH-RUNWAY-MONTHS-v1
 * 模块: cash-runway
 * 消费边: FUNDS
 * 输入: store: GraphStoreReader — 通过 FUNDS 边遍历获取现金流节点
 *       input: { teamId, traversal? }
 * 输出(正常): { value: number(月数), unit:'个月', confidence:'high',
 *               evidence:['总现金: N', '月消耗: N'],
 *               degraded:false, warnings:[], computedAt }
 * 输出(降级1 — 无数据): { value:0, unit:'个月', confidence:'low', degraded:true,
 *               warnings:['无财务数据 — 无法计算现金跑道'] }   ← 节点数为 0
 * 输出(降级2 — 现金字段缺失, D803 切片③新增): { value:0, unit:'个月', confidence:'low', degraded:true,
 *               warnings:['现金字段缺失 — 无法计算跑道'] }      ← 有节点但现金链
 *               （cash_balance / cash）属性**全缺**
 * 边界: 月消耗=0且总现金>0 → Infinity(充足); 两者=0 → 0
 * 超时: 5秒。不抛异常。
 *
 * 字段选择契约（D803 切片③收敛，S2 表逐行登记）:
 *   现金链 = cash_balance → cash          （**删除 `|| total_revenue` 挪用**——K3 断裂②同构：
 *                                         total_revenue 是收入不是现金，挪用会把「10 个月跑道」
 *                                         伪装成「充足」，反向污染 10-4 判定）
 *   消耗链 = monthly_burn → operating_expense → total_cost → amount（amount 为 S2 表登记的遗留别名，
 *                                         本卡不清——清理属独立任务）
 *   守卫原语 = pickPresentNumber —— 按**属性存在性**区分「属性缺失」（→ degraded）与
 *             「值为 0」（合法值，照常走公式）；`a || b || 0` 会把两者混为一谈（S4 行2 误报根因）。
 */
import type { GraphStoreReader } from '../../../../src/l4/graph-traversal';
import type { GraphTraversal } from '../../../../src/l4/graph-traversal';

export interface ComputeInput {
  teamId: string;
  traversal?: GraphTraversal;
}

export interface ComputeOutput<T> {
  value: T;
  unit?: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  degraded: boolean;
  warnings: string[];
  computedAt: string;
}

/** 现金链候选字段（按优先级；写侧 erp-standard 产出 `cash`，`cash_balance` 为遍历分支遗留别名） */
export const CASH_PROP_CHAIN = ['cash_balance', 'cash'] as const;

/** 月消耗链候选字段（按优先级；`amount` 为 S2 表登记的遗留别名，本卡不清） */
const BURN_PROP_CHAIN = ['monthly_burn', 'operating_expense', 'total_cost', 'amount'] as const;

/**
 * pickPresentNumber — 存在性守卫原语（D803 切片③）
 *
 * 契约（铁律 47）:
 *   @input  props — 节点/边属性袋；keys — 候选字段名，按优先级排列
 *   @output — { found: 是否存在至少一个**存在**（非 undefined/null）的候选键;
 *               value: 首个存在且可解析为有限数值的候选值，否则 0 }
 *   @degraded — 属性存在但不可解析为有限数（NaN/Infinity/非数）→ found=true, value=0；
 *               **不把「有键但值坏」误判为「键缺失」**（调用方按 found 决定是否降级）
 *   @error  — 不抛异常
 *
 * 为什么不用 `a || b || 0`（本函数存在的唯一理由）:
 *   ① `||` 让值 0 穿透到下一个候选（cash=0 + total_revenue=100万 → 现金被算成 100 万）；
 *   ② `||` 无法区分「公司真没钱」（cash=0，应告警）与「没上报现金」（属性缺失，应降级）——
 *      这正是 S4 行2「部分字段缺失 → 误报 critical」的根因。
 */
export function pickPresentNumber(
  props: Record<string, unknown>,
  keys: readonly string[],
): { found: boolean; value: number } {
  let found = false;
  for (const k of keys) {
    const raw = props[k];
    if (raw === undefined || raw === null) continue;
    found = true;
    const n = Number(raw);
    if (Number.isFinite(n)) return { found: true, value: n };
  }
  return { found, value: 0 };
}

export async function computeCashRunwayMonths(
  store: GraphStoreReader,
  input: ComputeInput,
): Promise<ComputeOutput<number>> {
  const warnings: string[] = [];
  const computedAt = new Date().toISOString();
  let totalCash = 0;
  let monthlyBurn = 0;
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
            monthlyBurn += pickPresentNumber(n.props, BURN_PROP_CHAIN).value;
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
          monthlyBurn += pickPresentNumber(n.props, BURN_PROP_CHAIN).value;
        }
        hasData = true;
      }
    }

    if (!hasData) {
      return {
        value: 0,
        unit: '个月',
        confidence: 'low',
        evidence: [],
        degraded: true,
        warnings: ['无财务数据 — 无法计算现金跑道'],
        computedAt,
      };
    }

    // D803 切片③ 降级2（S4 行2，K3 断裂②收尾）: 现金属性全缺 ≠ 现金为 0。
    // 修复前: 属性缺失 → totalCash=0 → 命中 critical 6 → 误报「现金流危急—跑道0.0个月」
    //（把「没上报现金」当成「公司没钱」）。区分口径 = 属性存在性，值 0 仍走正常公式。
    if (!cashPropPresent) {
      return {
        value: 0,
        unit: '个月',
        confidence: 'low',
        evidence: [`月消耗: ${monthlyBurn.toFixed(0)}`],
        degraded: true,
        warnings: ['现金字段缺失 — 无法计算跑道'],
        computedAt,
      };
    }

    const runwayMonths = monthlyBurn > 0 ? totalCash / monthlyBurn : (totalCash > 0 ? Infinity : 0);
    const display = Number.isFinite(runwayMonths) ? Math.round(runwayMonths * 10) / 10 : Infinity;

    if (runwayMonths > 60) {
      warnings.push('跑道超过5年 — 请验证现金数据准确性');
    }

    return {
      value: display,
      unit: '个月',
      confidence: 'high',
      evidence: [`总现金: ${totalCash}`, `月消耗: ${monthlyBurn.toFixed(0)}`],
      degraded: false,
      warnings,
      computedAt,
    };
  } catch (err: unknown) {
    return {
      value: 0,
      unit: '个月',
      confidence: 'low',
      evidence: [],
      degraded: true,
      warnings: [`计算失败: ${err instanceof Error ? err.message : String(err)}`],
      computedAt,
    };
  }
}
