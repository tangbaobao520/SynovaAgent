/**
 * unit-economics/aggregate.ts — I10 单位经济可持续性哨兵
 *
 * 集成 7 个 compute 函数:
 *   ① ltv-cac-ratio       — 客户终身价值 vs 获客成本
 *   ② gross-margin-per-unit — 单位毛利率
 *   ③ variable-costs      — 变动/固定成本分类 (P0新增)
 *   ④ marginal-contribution — 按客户群边际贡献 (P0新增)
 *   ⑤ fixed-cost-rigidity  — 固定成本刚性评估 (P0新增)
 *   ⑥ scenario-simulation  — 砍掉低产群的利润模拟 (P0新增)
 *   ⑦ break-even           — 盈亏平衡分析 (P0新增)
 */
import type { SentinelFinding } from '../../../src/sentinel/types';
import type { GraphTraversal } from '../../../src/l4/graph-traversal';
import { computeLtvCac } from './computes/ltv-cac-ratio';
import { computeUnitMargin } from './computes/gross-margin-per-unit';
import { computeVariableCosts } from './computes/variable-costs';
import { computeMarginalContribution } from './computes/marginal-contribution';
import { computeFixedCostRigidity } from './computes/fixed-cost-rigidity';
import { computeScenarioSimulation } from './computes/scenario-simulation';
import { computeBreakEven } from './computes/break-even';
import { createLogger } from '@synova/logger';
const log = createLogger('sentinel/unit-economics');

interface GraphStoreReader {
  queryNodes(t: string, f?: Record<string, unknown>, g?: string): Array<{ id: string; type: string; props: Record<string, unknown> }>;
  queryEdges?(t?: string, from?: string, to?: string, g?: string): Array<{ id: string; type: string; from: string; to: string; weight: number; props: Record<string, unknown> }>;
}

export const unitEconomicsSentinel = {
  async check(store: GraphStoreReader, teamId: string, traversal?: GraphTraversal): Promise<SentinelFinding[]> {
    const now = new Date(); const checkedAt = now.toISOString();
    const findings: SentinelFinding[] = [];
    let usedTraversal = false;

    try {
      // V4.4.0: 优先使用图遍历
      let finNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
      let clientNodes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [];
      try {
        if (traversal) {
          // @deprecated — 语义迁移由D15处理
          const finResult = traversal.traverse([teamId], ['FUNDS']);
          // @deprecated — 语义迁移由D15处理
          const clientResult = traversal.traverse([teamId], ['DEPLOYS']);
          if (finResult.nodes[0] || clientResult.nodes[0]) {
            finNodes = finResult.nodes;
            clientNodes = clientResult.nodes.filter(n => n.type === 'CLIENT');
            usedTraversal = true;
          }
        }
      } catch (err: unknown) {
        log.warn({ err, teamId }, '图遍历失败 — 降级到旧路径');
      }
      if (!usedTraversal) {
        finNodes = store.queryNodes('Financial', { teamId });
        clientNodes = store.queryNodes('Client', { teamId });
      }

      const fin = finNodes.map(n => ({
        customerLifetimeValue: Number(n.props.customerLifetimeValue) || Number(n.props.ltv) || 0,
        customerAcquisitionCost: Number(n.props.customerAcquisitionCost) || Number(n.props.cac) || 0,
        unitRevenue: Number(n.props.unitRevenue) || Number(n.props.price) || 0,
        unitCost: Number(n.props.unitCost) || Number(n.props.cogs) || 0,
        revenue: Number(n.props.revenue) || 0,
        operatingExpense: Number(n.props.operatingExpense) || 0,
      }));

      // Cost edges from COST_DRIVEN_BY (if available)
      let costEdges: Array<{ name: string; amount: number; costType: string; linkedToNodeType?: string }> = [];
      try {
        const edges = store.queryEdges?.('COST_DRIVEN_BY', undefined, undefined, teamId) || [];
        costEdges = edges.map((e: { props: Record<string, unknown>; from?: string; to?: string }) => ({
          name: String(e.props?.name || e.from || ''),
          amount: Number(e.props?.share || e.props?.amount || 0),
          costType: String(e.props?.costType || 'fixed'),
          linkedToNodeType: e.to || undefined,
        }));
      } catch (err: unknown) {
        log.warn({ err: err instanceof Error ? err.message : String(err) }, 'COST_DRIVEN_BY edges unavailable — using expense-based fallback');
        if (fin.length > 0) {
          const totalOpEx = fin.reduce((s, f) => s + f.operatingExpense, 0);
          costEdges = [{ name: 'Operating Expenses', amount: totalOpEx, costType: 'fixed', linkedToNodeType: 'Process' }];
        }
      }

      // Client groups
      const clientGroups = clientNodes.length > 0
        ? clientNodes.map((c: { id: string; props: Record<string, unknown> }) => ({
            groupId: c.id,
            revenue: Number(c.props.revenue) || Number(c.props.annualRevenue) || 0,
            variableCost: Number(c.props.variableCost) || Number(c.props.cogs) || 0,
          }))
        : fin.length > 0
          ? [{ groupId: 'default', revenue: fin.reduce((s, f) => s + f.revenue, 0) / fin.length, variableCost: fin.reduce((s, f) => s + f.unitCost, 0) / fin.length * 100 }]
          : [];

      // 2a. LTV/CAC (existing)
      const ltv = computeLtvCac(fin);
      if (!ltv.degraded) {
        if (ltv.ltvCac < 1) findings.push({ id: `i10-ltv-crit-${now.getTime()}`, severity: 'critical', title: `LTV/CAC过低 (${ltv.ltvCac.toFixed(1)}x)`, description: '< 1x, 获客成本高于客户终身价值。', evidence: [`LTV/CAC: ${ltv.ltvCac.toFixed(1)}x`, `LTV: ${ltv.ltv}`, `CAC: ${ltv.cac}`], suggestion: '降低获客成本或提升客户终身价值。', detectedAt: checkedAt });
        else if (ltv.ltvCac < 3) findings.push({ id: `i10-ltv-warn-${now.getTime()}`, severity: 'warning', title: `LTV/CAC偏低 (${ltv.ltvCac.toFixed(1)}x)`, description: '< 3x。', evidence: [`LTV/CAC: ${ltv.ltvCac.toFixed(1)}x`], suggestion: '优化获客效率。', detectedAt: checkedAt });
      }

      // 2b. Gross margin (existing)
      const um = computeUnitMargin(fin);
      if (!um.degraded && um.margin < 0.1) findings.push({ id: `i10-margin-crit-${now.getTime()}`, severity: 'critical', title: `单位毛利率过低 (${(um.margin * 100).toFixed(0)}%)`, description: '单位毛利 < 10%。', evidence: [`毛利率: ${(um.margin * 100).toFixed(0)}%`, `单位收入: ${um.unitRevenue}`, `单位成本: ${um.unitCost}`], suggestion: '审查定价策略和单位成本。', detectedAt: checkedAt });

      // 2c. Variable costs (P0 new)
      const vc = computeVariableCosts(costEdges);

      // 2d. Marginal contribution (P0 new)
      const mc = computeMarginalContribution(clientGroups);
      if (!mc.degraded && mc.negativeMcGroups > 0) {
        const negGroups = mc.groups.filter(g => !g.isPositive);
        findings.push({ id: `i10-mc-crit-${now.getTime()}`, severity: 'critical', title: `${mc.negativeMcGroups}个客户群边际贡献为负`, description: `存在 ${mc.negativeMcGroups} 个边际贡献非正客户群。`, evidence: negGroups.slice(0, 3).map(g => `${g.groupId}: MC=${g.marginalContribution}, 比率=${g.mcRatio}`), suggestion: '审查负MC客户群的成本结构或重新定价。', detectedAt: checkedAt });
      }

      // 2e. Fixed cost rigidity + scenario simulation (P0 new)
      if (!vc.degraded && vc.totalFixedMonthly > 0) {
        const rigidity = computeFixedCostRigidity(vc.fixedCosts.map(c => ({ name: c.name, amount: c.amount })));
        if (rigidity.signal === 'rigid') {
          findings.push({ id: `i10-rigidity-crit-${now.getTime()}`, severity: 'warning', title: `固定成本结构刚性 (可削减仅${((1 - rigidity.rigidityRatio) * 100).toFixed(0)}%)`, description: `固定成本 ${rigidity.totalFixed} 中仅 ${rigidity.totalReducible} 可削减。`, evidence: [`刚性比率: ${rigidity.rigidityRatio}`, `总固定成本: ${rigidity.totalFixed}`, `可削减: ${rigidity.totalReducible}`], suggestion: '优化固定成本结构。', detectedAt: checkedAt });
        }

        if (mc.groups.length > 1) {
          const currentProfit = mc.totalContribution - vc.totalFixedMonthly;
          const sim = computeScenarioSimulation(mc.groups, rigidity.costItems.map(c => ({ name: c.name, amount: c.amount, reducible: c.reducible, reductionPercent: c.reductionPercent })), currentProfit);
          if (sim.scenarios.length > 0) {
            if (sim.bestScenario && sim.bestScenario.profitChange > 0) {
              findings.push({ id: `i10-sim-opt-${now.getTime()}`, severity: 'info', title: `优化建议: 砍掉${sim.bestScenario.dropCount}个低产群可提升利润`, description: sim.bestScenario.description, evidence: [`砍掉: ${sim.bestScenario.dropCount}个群`, `利润变化: ${sim.bestScenario.profitChange > 0 ? '+' : ''}${Math.round(sim.bestScenario.profitChange * 100) / 100}`], suggestion: '考虑优化客户组合。', detectedAt: checkedAt });
            }
            if (!sim.profitImprovementPossible) {
              findings.push({ id: `i10-sim-warn-${now.getTime()}`, severity: 'warning', title: `固定成本刚性 — 砍低产群不能改善利润`, description: '模拟显示，由于固定成本不能等比例缩减，砍掉低产客户群后利润反而可能下降。', evidence: [`总场景数: ${sim.scenarios.length}`, `所有场景利润变化均 ≤ 0`], suggestion: '提高固定成本灵活性。', detectedAt: checkedAt });
            }
          }
        }

        // 2f. Break-even (P0 new)
        if (clientGroups.length > 0 && vc.totalVariableMonthly > 0) {
          const avgPrice = clientGroups.reduce((s, g) => s + (g.revenue / Math.max(g.variableCost, 1)), 0) / clientGroups.length;
          const avgVarCost = clientGroups.reduce((s, g) => s + g.variableCost, 0) / clientGroups.length;
          const bep = computeBreakEven(vc.totalFixedMonthly, avgPrice, avgVarCost, clientGroups.length);
          if (!bep.degraded && !bep.isProfitable && bep.currentUnits > 0) {
            findings.push({ id: `i10-bep-crit-${now.getTime()}`, severity: 'warning', title: `当前产量低于盈亏平衡点`, description: `需 ${Math.ceil(bep.breakEvenUnits)} 单位才能盈亏平衡。`, evidence: [`BEP: ${Math.ceil(bep.breakEvenUnits)}单位`, `安全边际: ${(bep.safetyMargin * 100).toFixed(0)}%`], suggestion: '提升产量或降低成本结构。', detectedAt: checkedAt });
          }
        }
      }

      return findings;
    } catch (err: unknown) {
      log.error({ err }, '[unit-economics] 失败');
      return [{ id: `i10-error-${now.getTime()}`, severity: 'warning', title: '单位经济检测异常', description: `${(err as Error)?.message || String(err)}`, evidence: [], suggestion: '检查数据源。', detectedAt: checkedAt }];
    }
  },
};
