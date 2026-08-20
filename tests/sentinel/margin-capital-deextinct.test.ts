/**
 * tests/sentinel/margin-capital-deextinct.test.ts — D358 集成测试（K3 P1-2/P1-3 去灭绝）
 *
 * dev doc §4 red 基线（修复前全红）:
 *   ① 静态: 两个合并哨兵 aggregate.ts 含 `_extinct` 动态 import → 断言失败（桥接未拆）
 *   ② 真实装配: registerLoadedSentinels() 真实 loader 装配 + snake_case（erp-standard）注入
 *      → 修复前子哨兵读 camelCase（revenue/totalAssets…）Number(undefined)||0=0 → 0 findings（假空）
 *   ③ 显式 0 vs 缺失: 修复前缺失与 0 不可分（假 critical 或假 healthy）→ 断言失败
 *
 * 铁律 12: 集成测试走真实路由（registerLoadedSentinels → registry → check 包装层），不 mock 管线。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { clearSentinelCache } from '../../src/sentinel/sentinel-loader';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import type { SentinelContext } from '../../src/sentinel/types';

const SENTINELS_DIR = join(process.cwd(), 'extensions', 'sentinels');

/** GraphStoreReader mock: queryNodes 返回注入节点；queryEdges 空（traversal 降级走 queryNodes） */
function makeStore(nodes: Array<{ id: string; type: string; props: Record<string, unknown> }>) {
  return {
    queryNodes: (_type: string, _filters?: Record<string, unknown>, _graph?: string) => nodes,
    queryEdges: () => [],
    getNode: () => null,
  };
}

function ctx(store: unknown): SentinelContext {
  return { db: store, now: new Date(), teamId: 't1' };
}

let registry: ReturnType<typeof getSentinelRegistry>;

beforeEach(async () => {
  clearSentinelCache();
  destroySentinelRegistry();
  const { registerLoadedSentinels } = await import('../../src/sentinel/sentinel-loader');
  const result = await registerLoadedSentinels();
  expect(result.registered).toBeGreaterThanOrEqual(45);
  registry = getSentinelRegistry();
});

describe('① 静态: 合并哨兵无 _extinct 桥接（K3 P1-2）', () => {
  it('margin-health/aggregate.ts 不含 _extinct 引用', () => {
    const src = readFileSync(join(SENTINELS_DIR, 'margin-health', 'aggregate.ts'), 'utf-8');
    expect(src).not.toContain('_extinct');
  });

  it('capital-health/aggregate.ts 不含 _extinct 引用', () => {
    const src = readFileSync(join(SENTINELS_DIR, 'capital-health', 'aggregate.ts'), 'utf-8');
    expect(src).not.toContain('_extinct');
  });
});

describe('② 真实装配 + snake_case 注入 → 真实 finding（K3 P1-3）', () => {
  it('margin-health: erp-standard snake_case 数据 → 真实 critical', async () => {
    const margin = registry.list().find(s => s.config.id === 'sentinel-margin-health');
    expect(margin).toBeTruthy();
    const store = makeStore([{
      id: 'f1', type: 'Financial',
      props: { total_revenue: 100, gross_margin: 30, operating_expense: 40 },
    }]);
    const res = await margin!.check(ctx(store));
    // 修复前: 子哨兵读 camelCase revenue/cost → 0 → 恒空（真数据喂不进）
    // 修复后: 净利率 (30−40)/100=−0.1 ≤ |−0.05| → profit_low critical；gap −0.35 ≤ −0.15 → profit_bench critical
    expect(res.findings.some(f => f.severity === 'critical')).toBe(true);
    expect(res.findings.length).toBeGreaterThan(0);
  });

  it('capital-health: erp-standard snake_case 数据 → 真实 critical', async () => {
    const capital = registry.list().find(s => s.config.id === 'sentinel-capital-health');
    expect(capital).toBeTruthy();
    const store = makeStore([{
      id: 'f1', type: 'Financial',
      props: {
        total_revenue: 100, total_assets: 50, total_debt: 80, equity: 20,
        operating_cashflow: 10, operating_expense: 40, gross_margin: 30,
        interest_expense: 30,
      },
    }]);
    const res = await capital!.check(ctx(store));
    // D/E=4 > 2.5 → 真实 critical；ICR=10/30≈0.33 < 1.5 → 真实 critical
    expect(res.findings.some(f => f.severity === 'critical')).toBe(true);
    expect(res.findings.length).toBeGreaterThan(0);
  });
});

describe('③ 显式 0 ≠ 缺失（P1-3 语义边界）', () => {
  it('capital-health: 字段缺失 → ch-degraded warning，无 critical', async () => {
    const capital = registry.list().find(s => s.config.id === 'sentinel-capital-health');
    const store = makeStore([{ id: 'f1', type: 'Financial', props: { total_revenue: 100 } }]);
    const res = await capital!.check(ctx(store));
    expect(res.findings.some(f => f.id.startsWith('ch-degraded'))).toBe(true);
    expect(res.findings.filter(f => f.severity === 'critical')).toHaveLength(0);
  });

  it('capital-health: 字段显式 0 → 无 ch-degraded 且无 critical（修复前假 critical）', async () => {
    const capital = registry.list().find(s => s.config.id === 'sentinel-capital-health');
    const store = makeStore([{
      id: 'f1', type: 'Financial',
      props: {
        total_revenue: 0, total_assets: 0, total_debt: 0, equity: 0,
        operating_cashflow: 0, operating_expense: 0,
      },
    }]);
    const res = await capital!.check(ctx(store));
    // 入口校验放行（字段存在）→ 指标层分母 0 全部 degrade → 无 finding
    expect(res.findings.some(f => f.id.startsWith('ch-degraded'))).toBe(false);
    expect(res.findings.filter(f => f.severity === 'critical')).toHaveLength(0);
  });

  it('margin-health: 字段缺失 → mh-degraded warning，无 critical', async () => {
    const margin = registry.list().find(s => s.config.id === 'sentinel-margin-health');
    const store = makeStore([{ id: 'f1', type: 'Financial', props: {} }]);
    const res = await margin!.check(ctx(store));
    expect(res.findings.some(f => f.id.startsWith('mh-degraded'))).toBe(true);
    expect(res.findings.filter(f => f.severity === 'critical')).toHaveLength(0);
  });

  it('margin-health: 字段显式 0 → 无 mh-degraded，指标降级不产 critical', async () => {
    const margin = registry.list().find(s => s.config.id === 'sentinel-margin-health');
    const store = makeStore([{
      id: 'f1', type: 'Financial',
      props: { total_revenue: 0, gross_margin: 0, operating_expense: 0 },
    }]);
    const res = await margin!.check(ctx(store));
    expect(res.findings.some(f => f.id.startsWith('mh-degraded'))).toBe(false);
    expect(res.findings.filter(f => f.severity === 'critical')).toHaveLength(0);
  });
});
