/**
 * src/cycles/investment-advisor.ts — 投资建议引擎
 *
 * D90: 传导方向模拟（非精确预测）+ 承诺清单 + 执行约束因子。
 *
 * 契约:
 *   @input  — cycleId + 投资金额 + 方向 + GraphStore
 *   @output — InvestmentSimulationResult（含承诺清单 + 约束因子）
 *   @degraded — 数据不足时降级
 */
import { createLogger } from '@synova/logger';
import type { GraphStore } from '../l4/graph-bridge';
import type { CycleConfig } from './cycle-types';
import type { OverflowSnapshot } from './overflow-compute';
import { getCycleSnapshots, getLatestSnapshot } from './overflow-graph-bridge';

const log = createLogger('cycles/investment-advisor');

// ═══ Types ═══

export interface CommitmentItem {
  action: string;
  commitment: 'can_do' | 'cannot_do';
  reason: string;
  estimatedImpact: string;
}

export interface ExecutionConstraint {
  factor: string;
  level: 'low' | 'medium' | 'high';
  description: string;
  mitigable: boolean;
}

export interface RelativeEffectRanking {
  cycleId: string;
  cycleName: string;
  marginalOverflowReduction: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface InvestmentSimulationResult {
  cycleId: string;
  investmentAmount: number;
  direction: string;
  simulatedAt: string;
  /** 传导方向模拟描述 */
  conductionDescription: string;
  /** 承诺清单 */
  commitments: CommitmentItem[];
  /** 执行约束因子 */
  constraints: ExecutionConstraint[];
  /** 相对效果排序 */
  relativeEffectRanking: RelativeEffectRanking[];
  /** 当前溢出快照 */
  currentSnapshot: OverflowSnapshot | null;
  degraded: boolean;
}

// ═══ 约束因子 ═══

const DEFAULT_CONSTRAINTS: ExecutionConstraint[] = [
  { factor: 'talent_market', level: 'medium', description: '目标领域人才市场竞争激烈', mitigable: true },
  { factor: 'team_capacity', level: 'medium', description: '当前团队产能已接近饱和', mitigable: true },
  { factor: 'funding_availability', level: 'low', description: '资金储备充足', mitigable: false },
];

// ═══ 模拟计算 ═══

/**
 * 模拟投资对指定循环的影响。
 *
 * @param cycleId - 循环 ID
 * @param amount - 投资金额（万元）
 * @param direction - 投资方向描述
 * @param cycle - 循环配置（从 CycleRegistry 获取）
 * @param store - GraphStore 实例
 * @param allCycles - 所有已注册循环（用于相对效果排序）
 * @returns InvestmentSimulationResult
 */
export function simulateInvestment(
  cycleId: string,
  amount: number,
  direction: string,
  cycle: CycleConfig,
  store: GraphStore,
  allCycles: CycleConfig[],
): InvestmentSimulationResult {
  const latest = getLatestSnapshot('default', cycleId, store);
  const snapshots = getCycleSnapshots('default', cycleId, store);

  // 传导方向模拟
  const nodes = cycle.nodes.map(n => n.label).join(' → ');
  const conductionDescription = `投资 ${amount} 万元于「${cycle.name}」(${direction})，` +
    `预计沿路径 ${nodes} 传导。` +
    `初始效应预计 ${cycle.edges[0]?.delay ?? 1} 个周期显现，` +
    `完整传导约 ${cycle.edges.reduce((s, e) => s + (e.delay ?? 1), 0)} 个周期。`;

  // 承诺清单
  const commitments: CommitmentItem[] = [
    {
      action: `增加 ${cycle.name} 预算`,
      commitment: amount > 0 ? 'can_do' : 'cannot_do',
      reason: amount > 0 ? '投资金额已确认' : '投资金额为零或负数',
      estimatedImpact: `预计可降低溢出值 ${Math.round(amount * 0.1 * 100) / 100} 个单位`,
    },
    {
      action: `优化 ${cycle.nodes.map(n => n.label).join('/')}`,
      commitment: cycle.nodes.length > 0 ? 'can_do' : 'cannot_do',
      reason: cycle.nodes.length > 0 ? '循环节点已定义' : '循环配置不完整',
      estimatedImpact: '取决于具体执行方案',
    },
    {
      action: '跨循环协同优化',
      commitment: cycle.crossCyclePropagation.length > 0 ? 'can_do' : 'cannot_do',
      reason: cycle.crossCyclePropagation.length > 0
        ? `可联动 ${cycle.crossCyclePropagation.length} 个关联循环`
        : '无跨循环传播配置',
      estimatedImpact: '间接效应，需结合关联循环评估',
    },
  ];

  // 相对效果排序：计算每个循环的边际溢出减少量
  const relativeEffectRanking: RelativeEffectRanking[] = allCycles.map(c => {
    const cLatest = getLatestSnapshot('default', c.cycleId, store);
    const cSnapshots = getCycleSnapshots('default', c.cycleId, store);
    const avg = cSnapshots.length > 0
      ? cSnapshots.reduce((s, sn) => s + sn.overflowValue, 0) / cSnapshots.length
      : 0;

    return {
      cycleId: c.cycleId,
      cycleName: c.name,
      marginalOverflowReduction: avg > 0 ? Math.round(avg * 0.15 * 100) / 100 : 0,
      confidence: cSnapshots.length >= 6 ? 'high' : cSnapshots.length >= 3 ? 'medium' : 'low',
    };
  });
  relativeEffectRanking.sort((a, b) => b.marginalOverflowReduction - a.marginalOverflowReduction);

  const result: InvestmentSimulationResult = {
    cycleId,
    investmentAmount: amount,
    direction,
    simulatedAt: new Date().toISOString(),
    conductionDescription,
    commitments,
    constraints: DEFAULT_CONSTRAINTS.map(c => ({ ...c })),
    relativeEffectRanking,
    currentSnapshot: latest,
    degraded: snapshots.length === 0,
  };

  log.info({ cycleId, amount, degraded: result.degraded }, '投资模拟完成');
  return result;
}
