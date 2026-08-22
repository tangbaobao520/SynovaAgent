/**
 * tests/agent/loop-handlers.test.ts — D333 进化循环真实化 (N13 接线) + D475 五处理器真实化
 *
 * 覆盖:
 *   D333 loop-3: 正常信号→真实动作计数 / 无信号→degraded / collector 不可用→degraded
 *                边界: 零动作 / 回写错误 / 全部 pending / MainAgent 集成 (degraded + completed)
 *   D475 loop-1/2/4/5/6: 每 handler 正常路径 / 降级路径 / 边界（store 不可用 / 计数回写失败 /
 *                调度器初始化竞态重试 / 窗口零新增 / 写入复读验证）+ MainAgent 路由集成
 *
 * red 基准 (修复前, S-5 证据): diagnosis/navigation/overflow 恒 success:true 零真实执行
 *   （5 红）；knowledge-store.recentStats 不存在（4 红）。修复后全部转绿。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { LoopTriggerConfig } from '../../src/loops/loop-trigger-config';
import type { GraphBridgeLike } from '../../src/growth/goal-types';
import type { CycleConfig } from '../../src/cycles/cycle-types';

const mocks = vi.hoisted(() => ({
  getAggregatedSignals: vi.fn(),
  processFeedbackSignals: vi.fn(),
  applyEvolutionActions: vi.fn(),
}));

vi.mock('../../src/growth/feedback-collector', () => ({
  getFeedbackCollector: () => ({ getAggregatedSignals: mocks.getAggregatedSignals }),
}));

vi.mock('../../src/loops/middle-evolution-engine', () => ({
  processFeedbackSignals: mocks.processFeedbackSignals,
  applyEvolutionActions: mocks.applyEvolutionActions,
}));

import {
  defaultEvolutionHandler,
  defaultDiagnosisHandler,
  defaultNavigationHandler,
  defaultSelfCheckHandler,
  defaultKnowledgeAccumulationHandler,
  defaultOverflowHandler,
  setDiagnosisDeps,
  setNavigationDeps,
  setSelfCheckDeps,
  setKnowledgeDeps,
  setOverflowDeps,
  type DiagnosisDeps,
  type SelfCheckDeps,
} from '../../src/agent/loop-handlers';
import { MainAgent } from '../../src/agent/main-agent';

// ═══════════════════════════════════════════════════════════════════════════
// 共享 fake 构造器（D475 五处理器注入用）
// ═══════════════════════════════════════════════════════════════════════════

/** 最小 fake GOAL 图节点 */
function makeGoalNode(overrides: Record<string, unknown> = {}) {
  return {
    id: `node-goal-${Math.random().toString(36).slice(2, 8)}`,
    type: 'GOAL',
    props: {
      goalId: 'g1',
      title: '提升利润率',
      description: 'test goal',
      priority: 'P0',
      status: 'active',
      ownerDeptId: 'fin',
      deadline: '2099-12-31',
      metrics: [{ metricName: 'margin', currentValue: 10, targetValue: 20, unit: '%' }],
      reDiagnosisCount: 0,
      orgId: 'org-1',
      createdAt: '2026-08-01T00:00:00.000Z',
      ...overrides,
    },
  };
}

/** 内存 fake GraphBridgeLike（createNode 真实入列，queryNodes 真实过滤，updateNode 真实合并） */
function makeFakeStore(initial: Array<{ id: string; type: string; props: Record<string, unknown> }> = []) {
  const nodes = [...initial];
  const store: GraphBridgeLike = {
    createNode: vi.fn((type: string, props: Record<string, unknown>) => {
      const id = `node-created-${nodes.length + 1}`;
      nodes.push({ id, type, props });
      return id;
    }),
    getNode: vi.fn((id: string) => nodes.find((n) => n.id === id) ?? null),
    updateNode: vi.fn((id: string, props: Record<string, unknown>) => {
      const node = nodes.find((n) => n.id === id);
      if (node) node.props = { ...node.props, ...props };
    }),
    queryNodes: vi.fn((type: string, filters?: Record<string, unknown>) => {
      let result = nodes.filter((n) => n.type === type);
      if (filters) {
        for (const [k, v] of Object.entries(filters)) {
          result = result.filter((n) => String(n.props[k]) === String(v));
        }
      }
      return result.map((n) => ({ ...n, props: { ...n.props } }));
    }),
  };
  return { store, nodes };
}

/** 最小聚合信号 (D93 AggregatedSignal 形状) */
function makeSignal(overrides: Partial<{ key: string; decision: string; targetType: string; count: number }> = {}) {
  return {
    key: 'reject:sentinel_alert:',
    decision: 'reject',
    targetType: 'sentinel_alert',
    count: 3,
    latestTimestamp: '2026-08-17T00:00:00.000Z',
    targetIds: ['s1'],
    ...overrides,
  };
}

/** 最小循环配置 (同 main-agent.test.ts 惯例) */
function makeLoopConfig(overrides?: Partial<LoopTriggerConfig>): LoopTriggerConfig {
  return {
    loopId: 'loop-3',
    loopName: 'GA Evolution',
    scales: [
      { name: 'fast', period: '0 9 * * 1', triggerType: 'cron', coverage: 'test', condition: 'test' },
    ],
    ...overrides,
  };
}

/** 最小进化动作 (D92 EvolutionAction 形状) */
function makeAction() {
  return {
    type: 'threshold_adjust',
    reason: '哨兵 s1 被标注为 false alarm 3 次',
    parameter: { sentinelKey: 's1' },
    confidence: 0.3,
    triggeredAt: '2026-08-17T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.applyEvolutionActions.mockReturnValue({ applied: 0, skipped: 0, errors: [] });
});

describe('D333 — defaultEvolutionHandler 真实化 (N13 接线)', () => {
  it('有聚合信号 → 调用引擎两函数 + 返回真实计数', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 1, skipped: 0, errors: [] });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.output).toContain('聚合信号 1 条');
    expect(result.output).toContain('applied=1');
    expect(mocks.getAggregatedSignals).toHaveBeenCalledTimes(1);
    expect(mocks.processFeedbackSignals).toHaveBeenCalledTimes(1);
    expect(mocks.applyEvolutionActions).toHaveBeenCalledTimes(1);
  });

  it('无聚合信号 → degraded:true + 不调用引擎', async () => {
    mocks.getAggregatedSignals.mockReturnValue([]);

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('无聚合信号');
    expect(mocks.processFeedbackSignals).not.toHaveBeenCalled();
    expect(mocks.applyEvolutionActions).not.toHaveBeenCalled();
  });

  it('collector 不可用 (抛异常) → degraded:true + error', async () => {
    mocks.getAggregatedSignals.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('db unavailable');
  });

  it('有信号但零进化动作 → degraded:true + 不调用回写', async () => {
    mocks.getAggregatedSignals.mockReturnValue([makeSignal({ count: 2 })]);
    mocks.processFeedbackSignals.mockReturnValue([]);

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('未达触发阈值');
    expect(mocks.applyEvolutionActions).not.toHaveBeenCalled();
  });

  it('回写部分失败 (errors>0) → degraded:true + error + 计数', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 0, skipped: 1, errors: ['thresholds.json 写入失败'] });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('thresholds.json 写入失败');
    expect(result.output).toContain('applied=0');
  });

  it('回写全部 pending (applied=0, errors=0) → degraded:true', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 0, skipped: 1, errors: [] });

    const result = await defaultEvolutionHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('pending');
  });
});

describe('D333 — MainAgent 集成 (loop-3 生产路由)', () => {
  it('无信号 → status=degraded (不再伪造 completed)', async () => {
    mocks.getAggregatedSignals.mockReturnValue([]);
    const agent = new MainAgent();
    agent.registerLoop(makeLoopConfig());

    const record = await agent.executeLoop('loop-3');

    expect(record.status).toBe('degraded');
    expect(record.degraded).toBe(true);
  });

  it('有信号 + 真实回写 → status=completed + 真实计数', async () => {
    const signal = makeSignal();
    mocks.getAggregatedSignals.mockReturnValue([signal]);
    mocks.processFeedbackSignals.mockReturnValue([makeAction()]);
    mocks.applyEvolutionActions.mockReturnValue({ applied: 1, skipped: 0, errors: [] });
    const agent = new MainAgent();
    agent.registerLoop(makeLoopConfig());

    const record = await agent.executeLoop('loop-3');

    expect(record.status).toBe('completed');
    expect(record.degraded).toBe(false);
    expect(record.output).toContain('applied=1');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D475 — loop-1 诊断循环真实化
// ═══════════════════════════════════════════════════════════════════════════

describe('D475 — defaultDiagnosisHandler 真实化 (loop-1)', () => {
  afterEach(() => setDiagnosisDeps(null));

  function installDiagnosisDeps(
    initialNodes = [makeGoalNode()],
    overrides?: Partial<DiagnosisDeps>,
  ) {
    const { store, nodes } = makeFakeStore(initialNodes);
    const callExpert = vi.fn(async () => ({
      suggestedAdjustment: 'adjust_target' as const,
      description: '指标 margin 无显著偏差，保持目标 20',
      suggestedNewTarget: 20,
      affectedMetric: 'margin',
      degraded: false,
    }));
    const deps: DiagnosisDeps = {
      getStore: () => store,
      getGoal: (goalId: string) => {
        const props = nodes.find((n) => n.type === 'GOAL' && n.props.goalId === goalId)?.props;
        if (!props) return null;
        return {
          goalId: String(props.goalId),
          title: String(props.title),
          description: String(props.description),
          priority: String(props.priority),
          status: String(props.status),
          ownerDeptId: String(props.ownerDeptId),
          deadline: String(props.deadline),
          metrics: props.metrics as Array<{ metricName: string; currentValue: number; targetValue: number; unit: string }>,
          reDiagnosisCount: typeof props.reDiagnosisCount === 'number' ? props.reDiagnosisCount : 0,
        };
      },
      callExpert,
      ...overrides,
    };
    setDiagnosisDeps(deps);
    return { store, nodes, callExpert: deps.callExpert };
  }

  it('有 active 目标 → 真实再诊断 + adjust_target + 计数回写（正常路径）', async () => {
    const { store, callExpert } = installDiagnosisDeps();

    const result = await defaultDiagnosisHandler('fast');

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.output).toContain('再诊断 1 个目标');
    expect(result.output).toContain('adjust_target');
    expect(callExpert).toHaveBeenCalledTimes(1);
    expect(store.updateNode).toHaveBeenCalledTimes(1);
  });

  it('无 active 目标 → degraded:true + 不调用专家', async () => {
    const { callExpert } = installDiagnosisDeps([makeGoalNode({ status: 'paused' })]);

    const result = await defaultDiagnosisHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('无 active 目标');
    expect(callExpert).not.toHaveBeenCalled();
  });

  it('store 不可用 (抛异常) → degraded:true + error', async () => {
    installDiagnosisDeps([], { getStore: () => { throw new Error('db unavailable'); } });

    const result = await defaultDiagnosisHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('db unavailable');
  });

  it('计数回写失败 → degraded:true +「计数回写失败 N 项」（D333 部分失败范式）', async () => {
    const { store, callExpert } = installDiagnosisDeps();
    store.updateNode.mockImplementation(() => { throw new Error('write failed'); });

    const result = await defaultDiagnosisHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('计数回写失败 1 项');
    expect(callExpert).toHaveBeenCalledTimes(1);
  });

  it('slow 尺度 → 全部 active 目标纳入（cap 10，priority 排序 P0 先）', async () => {
    const nodes = [
      makeGoalNode({ goalId: 'g1' }),
      makeGoalNode({ goalId: 'g2', priority: 'P1', createdAt: '2026-08-02T00:00:00.000Z' }),
      makeGoalNode({ goalId: 'g3', priority: 'P0', createdAt: '2026-08-05T00:00:00.000Z' }),
    ];
    const { callExpert } = installDiagnosisDeps(nodes);

    const result = await defaultDiagnosisHandler('slow');

    expect(result.success).toBe(true);
    expect(result.output).toContain('再诊断 3 个目标');
    expect(callExpert).toHaveBeenCalledTimes(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D475 — loop-2 导航循环真实化
// ═══════════════════════════════════════════════════════════════════════════

describe('D475 — defaultNavigationHandler 真实化 (loop-2)', () => {
  afterEach(() => setNavigationDeps(null));

  function installNavigationDeps(initialNodes: Array<{ id: string; type: string; props: Record<string, unknown> }>) {
    const { store, nodes } = makeFakeStore(initialNodes);
    setNavigationDeps({ getStore: () => store });
    return { store, nodes };
  }

  it('有 GOAL/PROPOSAL → 状态分布 + 完成率 + 提案摘要（正常路径）', async () => {
    const nodes = [
      makeGoalNode(),
      makeGoalNode({ goalId: 'g2' }),
      makeGoalNode({ goalId: 'g3', status: 'completed' }),
      {
        id: 'node-p1',
        type: 'PROPOSAL',
        props: {
          proposalId: 'p1',
          title: '涨价方案',
          status: 'draft',
          lastActiveAt: '2026-08-20T00:00:00.000Z',
          context: { triggeringSentinels: ['s1'] },
        },
      },
    ];
    const { store } = installNavigationDeps(nodes);

    const result = await defaultNavigationHandler('fast');

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.output).toContain('active=2');
    expect(result.output).toContain('completed=1');
    expect(result.output).toContain('完成率 33%');
    expect(result.output).toContain('近期提案 1 条');
    expect(result.output).toContain('告警关联 1 条');
    expect(store.queryNodes).toHaveBeenCalledWith('GOAL', {}, 'growth');
    expect(store.queryNodes).toHaveBeenCalledWith('PROPOSAL', {}, 'growth');
  });

  it('GOAL 图为空 → degraded:true', async () => {
    installNavigationDeps([]);

    const result = await defaultNavigationHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('无目标数据');
  });

  it('store 不可用 (抛异常) → degraded:true + error', async () => {
    setNavigationDeps({ getStore: () => { throw new Error('db unavailable'); } });

    const result = await defaultNavigationHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('db unavailable');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D475 — loop-4 系统自检循环（新增专属处理器）
// ═══════════════════════════════════════════════════════════════════════════

describe('D475 — defaultSelfCheckHandler (loop-4)', () => {
  afterEach(() => setSelfCheckDeps(null));

  function installSelfCheckDeps(overrides?: Partial<SelfCheckDeps>) {
    const deps: SelfCheckDeps = {
      getDatabase: vi.fn(() => ({ prepare: vi.fn(() => ({ get: vi.fn(() => ({ ok: 1 })) })) })),
      getExpertRegistry: vi.fn(() => ({ listTypes: vi.fn(() => ['strategy', 'org', 'finance']) })),
      getScheduler: vi.fn(async () => ({})),
      ...overrides,
    };
    setSelfCheckDeps(deps);
    return deps;
  }

  it('slow 三查全过 → success + 逐项标记（正常路径）', async () => {
    const { getDatabase, getScheduler } = installSelfCheckDeps();

    const result = await defaultSelfCheckHandler('slow');

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.output).toContain('系统自检循环 [slow]');
    expect(result.output).toContain('db=ok');
    expect(result.output).toContain('experts=ok(3 位)');
    expect(result.output).toContain('scheduler=ok');
    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(getScheduler).toHaveBeenCalledTimes(1);
  });

  it('registry 为空 → degraded:true + 逐项失败标记', async () => {
    installSelfCheckDeps({ getExpertRegistry: vi.fn(() => ({ listTypes: vi.fn(() => []) })) });

    const result = await defaultSelfCheckHandler('slow');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('experts=fail');
    expect(result.output).toContain('db=ok');
  });

  it('调度器初始化竞态 → tick 重试一次后成功', async () => {
    const { getScheduler } = installSelfCheckDeps({
      getScheduler: vi.fn()
        .mockRejectedValueOnce(new Error('CronScheduler 初始化未完成'))
        .mockResolvedValueOnce({}),
    });

    const result = await defaultSelfCheckHandler('medium');

    expect(result.success).toBe(true);
    expect(result.output).toContain('scheduler=ok');
    expect(getScheduler).toHaveBeenCalledTimes(2);
  });

  it('fast 只查 DB+experts，不查 scheduler（尺度分档）', async () => {
    const { getDatabase, getScheduler } = installSelfCheckDeps();

    const result = await defaultSelfCheckHandler('fast');

    expect(result.success).toBe(true);
    expect(getDatabase).toHaveBeenCalledTimes(1);
    expect(getScheduler).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D475 — loop-5 知识积累循环（新增专属处理器）
// ═══════════════════════════════════════════════════════════════════════════

describe('D475 — defaultKnowledgeAccumulationHandler (loop-5)', () => {
  afterEach(() => setKnowledgeDeps(null));

  function installKnowledgeDeps(total = 5) {
    const recentStats = vi.fn(() => ({
      total,
      byDomain: total > 0 ? { finance: total } : {},
      bySourceType: total > 0 ? { document: total } : {},
    }));
    setKnowledgeDeps({ getStore: () => ({ recentStats }) });
    return { recentStats };
  }

  it('近30天有新增 → success + 真实计数（正常路径）', async () => {
    const { recentStats } = installKnowledgeDeps(5);

    const result = await defaultKnowledgeAccumulationHandler('slow');

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.output).toContain('近30天新增知识 5 条');
    expect(result.output).toContain('finance=5');
    expect(recentStats).toHaveBeenCalledTimes(1);
  });

  it('窗口内零新增 → degraded:true（不搞绿灯零积累）', async () => {
    installKnowledgeDeps(0);

    const result = await defaultKnowledgeAccumulationHandler('slow');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('近30天新增知识 0 条');
  });

  it('store 不可用 (抛异常) → degraded:true + error', async () => {
    setKnowledgeDeps({ getStore: () => { throw new Error('db unavailable'); } });

    const result = await defaultKnowledgeAccumulationHandler('slow');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('db unavailable');
  });

  it('fast → 近1天窗口（尺度分档）', async () => {
    installKnowledgeDeps(2);

    const result = await defaultKnowledgeAccumulationHandler('fast');

    expect(result.success).toBe(true);
    expect(result.output).toContain('近1天新增知识 2 条');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D475 — loop-6 溢出监控循环真实化
// ═══════════════════════════════════════════════════════════════════════════

describe('D475 — defaultOverflowHandler 真实化 (loop-6)', () => {
  afterEach(() => setOverflowDeps(null));

  /** 最小循环配置（cash-cycle.cycle.json 同款形状） */
  const CASH_CYCLE: CycleConfig = {
    cycleId: 'cash-cycle',
    name: '现金流循环',
    description: 'test',
    version: '1.0.0',
    applicableIndustries: [],
    nodes: [
      { id: 'revenue', label: '营收', type: 'flow', initialValue: 800, unit: '万元/年' },
      { id: 'cost', label: '总成本', type: 'flow', initialValue: 760, unit: '万元/年' },
      { id: 'profit', label: '利润', type: 'stock', initialValue: 40, unit: '万元' },
      { id: 'reinvestment', label: '再投资', type: 'flow', initialValue: 20, unit: '万元/年' },
    ],
    edges: [],
    overflowFormula: {
      condition: 'profit.currentValue < 0',
      targetNode: 'reinvestment',
      formula: 'max(0, profit.currentValue * 0.3)',
      minDataMaturity: 'high',
    },
    dataMaturity: 'high',
    mapping: [],
    crossCyclePropagation: [],
  };

  /** 最小 fake 溢出快照节点 */
  function makeSnapshotNode(overrides: Record<string, unknown> = {}) {
    return {
      id: `node-snap-${Math.random().toString(36).slice(2, 8)}`,
      type: 'OVERFLOW_SNAPSHOT',
      props: {
        cycleId: 'cash-cycle',
        month: '2026-06',
        overflowValue: 12,
        unit: '万元',
        trend: 'test',
        trendDelta: 0,
        maturity: 'active',
        isIndustryBaseline: false,
        momChange: 0,
        momChangePercent: 0,
        yoyChange: null,
        yoyChangePercent: null,
        trendDirection: 'stable',
        consecutiveDirection: 0,
        degraded: false,
        enterpriseId: 'org-1',
        ...overrides,
      },
    };
  }

  function installOverflowDeps(initialNodes = [makeGoalNode()]) {
    const { store, nodes } = makeFakeStore(initialNodes);
    const getCycles = vi.fn(async () => [CASH_CYCLE]);
    setOverflowDeps({ getStore: () => store, getCycles });
    return { store, nodes, getCycles };
  }

  it('有历史快照 → computeOverflow + 写入 + 复读验证 → written=1（正常路径）', async () => {
    const history = [makeSnapshotNode({ month: '2026-06' }), makeSnapshotNode({ month: '2026-07' })];
    const { store, getCycles } = installOverflowDeps([makeGoalNode(), ...history]);

    const result = await defaultOverflowHandler('fast');

    expect(result.success).toBe(true);
    expect(result.degraded).toBe(false);
    expect(result.output).toContain('written=1');
    expect(store.createNode).toHaveBeenCalled();
    expect(getCycles).toHaveBeenCalledTimes(1);
  });

  it('无历史快照 (dataPoints<2) → degraded:true +「无历史快照数据」', async () => {
    installOverflowDeps([makeGoalNode()]);

    const result = await defaultOverflowHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.output).toContain('written=0');
    expect(result.error).toContain('无历史快照数据');
  });

  it('写入未生效 (复读找不到本月快照) → degraded:true +「写入验证失败」', async () => {
    const history = [makeSnapshotNode({ month: '2026-06' }), makeSnapshotNode({ month: '2026-07' })];
    const { store } = installOverflowDeps([makeGoalNode(), ...history]);
    // createNode 不真实入列 → writeOverflowSnapshot 静默成功，复读验证失败
    store.createNode.mockImplementation(() => 'node-created-x');

    const result = await defaultOverflowHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('写入验证失败 1 个');
  });

  it('store 不可用 (抛异常) → degraded:true + error', async () => {
    setOverflowDeps({
      getStore: () => { throw new Error('db unavailable'); },
      getCycles: vi.fn(async () => [CASH_CYCLE]),
    });

    const result = await defaultOverflowHandler('fast');

    expect(result.success).toBe(false);
    expect(result.degraded).toBe(true);
    expect(result.error).toContain('db unavailable');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// D475 — MainAgent 集成（loop-4/loop-5 专属路由, K3 P1 修复验证）
// ═══════════════════════════════════════════════════════════════════════════

describe('D475 — MainAgent 集成 (loop-4/loop-5 专属路由)', () => {
  afterEach(() => {
    setSelfCheckDeps(null);
    setKnowledgeDeps(null);
  });

  it('loop-4 → defaultSelfCheckHandler（不再落 diagnosis）', async () => {
    setSelfCheckDeps({
      getDatabase: vi.fn(() => ({ prepare: vi.fn(() => ({ get: vi.fn(() => ({ ok: 1 })) })) })),
      getExpertRegistry: vi.fn(() => ({ listTypes: vi.fn(() => ['strategy']) })),
      getScheduler: vi.fn(async () => ({})),
    });
    const agent = new MainAgent();
    agent.registerLoop(makeLoopConfig({ loopId: 'loop-4', loopName: 'System Self-Check' }));

    const record = await agent.executeLoop('loop-4');

    expect(record.status).toBe('completed');
    expect(record.output).toContain('系统自检循环');
    expect(record.output).toContain('db=ok');
  });

  it('loop-5 → defaultKnowledgeAccumulationHandler（不再错挂 evolution）', async () => {
    setKnowledgeDeps({
      getStore: () => ({
        recentStats: vi.fn(() => ({
          total: 3,
          byDomain: { finance: 3 },
          bySourceType: { document: 3 },
        })),
      }),
    });
    const agent = new MainAgent();
    agent.registerLoop(makeLoopConfig({ loopId: 'loop-5', loopName: 'Knowledge Accumulation' }));

    const record = await agent.executeLoop('loop-5');

    expect(record.status).toBe('completed');
    expect(record.output).toContain('近1天新增知识 3 条');
    expect(record.output).toContain('知识积累循环');
  });
});
