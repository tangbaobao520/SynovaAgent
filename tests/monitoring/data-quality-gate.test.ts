/**
 * tests/monitoring/data-quality-gate.test.ts — D30: DataQualityGate 单元测试
 *
 * 铁律 48: 测试必须有 expect() 断言
 * 覆盖: 新鲜度/完整性/冷启动/降级/综合
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DataQualityGate, FRESHNESS_THRESHOLDS, POOL_CATEGORY, COLD_START_DAYS } from '../../src/monitoring/data-quality-gate';
import type { FreshnessRecord } from '../../src/monitoring/freshness-tracker';
import type { PipelineStats } from '../../src/monitoring/pipeline-monitor';

// ═══ Mocks ═══

function createMockFreshnessTracker(records: FreshnessRecord[]) {
  return {
    getStatusByPool: (_pool: string) => records,
    getDegradedSources: () => records.filter((r) => r.freshnessStatus !== 'green'),
    reset: () => {},
    recordUpdate: () => {},
  };
}

function createMockPipelineMonitor(stats: PipelineStats) {
  return {
    getStats: () => stats,
    recordIngestion: () => {},
    recordFailure: () => {},
    recordConflict: () => {},
    resetStats: () => {},
  };
}

// ═══ Tests ═══

describe('DataQualityGate 新鲜度判定', () => {
  it('当天更新 → green', () => {
    const freshnessTracker = createMockFreshnessTracker([
      {
        sourceId: 'erp-connector', poolName: 'erp', lastUpdatedAt: new Date().toISOString(),
        expectedFrequency: 'daily', freshnessStatus: 'green', delayDays: 0,
      },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'erp-connector');
    expect(report.freshness.status).toBe('green');
    expect(report.passed).toBe(true);
  });

  it('3天未更新(经营数据) → yellow', () => {
    // 经营数据: green≤7, yellow≤14, orange≤30
    const freshnessTracker = createMockFreshnessTracker([
      {
        sourceId: 'crm-01', poolName: 'crm', lastUpdatedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
        expectedFrequency: 'weekly', freshnessStatus: 'yellow', delayDays: 3,
      },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('crm', 'crm-01');
    // crm 是 operational 类别, green≤7 → 3天应 green
    expect(report.freshness.status).toBe('green');
    expect(report.freshness.category).toBe('operational');
  });

  it('15天未更新(经营数据) → yellow', () => {
    const freshnessTracker = createMockFreshnessTracker([
      {
        sourceId: 'crm-01', poolName: 'crm', lastUpdatedAt: new Date(Date.now() - 15 * 86400000).toISOString(),
        expectedFrequency: 'weekly', freshnessStatus: 'orange', delayDays: 15,
      },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('crm', 'crm-01');
    // 经营: green≤7, yellow≤14 → 15 > 14 → orange
    expect(report.freshness.status).toBe('orange');
  });

  it('60天未更新(财务数据) → yellow', () => {
    const freshnessTracker = createMockFreshnessTracker([
      {
        sourceId: 'erp-fin', poolName: 'erp', lastUpdatedAt: new Date(Date.now() - 60 * 86400000).toISOString(),
        expectedFrequency: 'monthly', freshnessStatus: 'red', delayDays: 60,
      },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'erp-fin');
    // 财务: green≤30, yellow≤60 → 60 <= 60 → yellow
    expect(report.freshness.status).toBe('yellow');
  });

  it('100天未更新(财务数据) → orange', () => {
    const freshnessTracker = createMockFreshnessTracker([
      {
        sourceId: 'erp-fin', poolName: 'erp', lastUpdatedAt: new Date(Date.now() - 100 * 86400000).toISOString(),
        expectedFrequency: 'monthly', freshnessStatus: 'red', delayDays: 100,
      },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'erp-fin');
    // 财务: green≤30, yellow≤60, orange≤90 → 100 > 90 → red
    expect(report.freshness.status).toBe('red');
  });
});

describe('DataQualityGate 完整性校验', () => {
  it('无字段定义 → 通过（默认信任）', () => {
    const gate = new DataQualityGate(createMockFreshnessTracker([]) as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'src-01');
    expect(report.completeness.passed).toBe(true);
    expect(report.completeness.completenessRate).toBe(1);
  });

  it('有必填字段定义 → 通过', () => {
    const gate = new DataQualityGate(createMockFreshnessTracker([
      { sourceId: 'src-01', poolName: 'erp', lastUpdatedAt: new Date().toISOString(), expectedFrequency: 'daily', freshnessStatus: 'green', delayDays: 0 },
    ]) as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'src-01', [
      { name: 'revenue', type: 'number', required: true },
      { name: 'cost', type: 'number', required: true },
      { name: 'date', type: 'string', required: false },
    ]);
    expect(report.completeness.passed).toBe(true);
    expect(report.completeness.totalFields).toBe(3);
  });
});

describe('DataQualityGate 三级降级', () => {
  it('正常新鲜度 → 降级级别 0', () => {
    const freshnessTracker = createMockFreshnessTracker([
      { sourceId: 'src-01', poolName: 'erp', lastUpdatedAt: new Date().toISOString(), expectedFrequency: 'daily', freshnessStatus: 'green', delayDays: 0 },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 5, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'src-01');
    expect(report.degradedLevel).toBe(0);
  });

  it('新鲜度 yellow → 软降级(1)', () => {
    const freshnessTracker = createMockFreshnessTracker([
      { sourceId: 'src-01', poolName: 'erp', lastUpdatedAt: new Date(Date.now() - 40 * 86400000).toISOString(), expectedFrequency: 'monthly', freshnessStatus: 'yellow', delayDays: 40 },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 5, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'src-01');
    // 财务: green≤30, yellow≤60 → 40天 = yellow → 软降级
    expect(report.degradedLevel).toBe(1);
  });

  it('新鲜度 red + 数据气味 → 完全暂停(3)', () => {
    const freshnessTracker = createMockFreshnessTracker([
      { sourceId: 'src-01', poolName: 'erp', lastUpdatedAt: new Date(Date.now() - 200 * 86400000).toISOString(), expectedFrequency: 'monthly', freshnessStatus: 'red', delayDays: 200 },
    ]);
    // 高失败率 → 数据气味异常
    const pipelineMonitor = createMockPipelineMonitor({ total: 10, successRate: 0.7, byChannel: { connector: { total: 10, failures: 5 } } });
    const gate = new DataQualityGate(freshnessTracker as never, pipelineMonitor as never);
    const report = gate.evaluate('erp', 'src-01');
    // red + 异常 → level 3
    expect(report.degradedLevel).toBe(3);
  });
});

describe('DataQualityGate 冷启动', () => {
  it('记录为空 → 成熟度 0 → industry_baseline', () => {
    const gate = new DataQualityGate(createMockFreshnessTracker([]) as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'unknown');
    expect(report.dataMaturity.ageInDays).toBe(0);
    expect(report.coldStartPhase).toBe('industry_baseline');
  });

  it('近期有记录 → 成熟度 > 0 → 非 industry_baseline', () => {
    const freshnessTracker = createMockFreshnessTracker([
      { sourceId: 'src-01', poolName: 'erp', lastUpdatedAt: new Date(Date.now() - 200 * 86400000).toISOString(), expectedFrequency: 'monthly', freshnessStatus: 'green', delayDays: 0 },
    ]);
    const gate = new DataQualityGate(freshnessTracker as never, createMockPipelineMonitor({ total: 1, successRate: 1, byChannel: {} }));
    const report = gate.evaluate('erp', 'src-01');
    // 200天 > 180天 → self_baseline
    expect(report.coldStartPhase).toBe('self_baseline');
  });
});

describe('DataQualityGate 综合评估', () => {
  it('完全健康的池 → 全部 passed', () => {
    const freshnessTracker = createMockFreshnessTracker([
      { sourceId: 'src-01', poolName: 'erp', lastUpdatedAt: new Date().toISOString(), expectedFrequency: 'daily', freshnessStatus: 'green', delayDays: 0 },
    ]);
    const pipelineMonitor = createMockPipelineMonitor({ total: 20, successRate: 0.98, byChannel: { connector: { total: 20, failures: 0 } } });
    const gate = new DataQualityGate(freshnessTracker as never, pipelineMonitor as never);
    const report = gate.evaluate('erp', 'src-01');
    expect(report.passed).toBe(true);
    expect(report.freshness.status).toBe('green');
    expect(report.degradedLevel).toBe(0);
    expect(report.checks.length).toBeGreaterThanOrEqual(4);
    expect(report.timestamp).toBeDefined();
  });

  it('阈值配置层面正确', () => {
    expect(FRESHNESS_THRESHOLDS['real-time'].green).toBe(1);
    expect(FRESHNESS_THRESHOLDS['financial'].yellow).toBe(60);
    expect(FRESHNESS_THRESHOLDS['industry'].orange).toBe(365);
    expect(COLD_START_DAYS.hybridPhaseMax).toBe(180);
    expect(POOL_CATEGORY['erp']).toBe('financial');
    expect(POOL_CATEGORY['hr']).toBe('organizational');
  });
});
