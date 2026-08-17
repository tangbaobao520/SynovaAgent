/**
 * tests/sentinel/sentinel-threshold-wiring.test.ts — D356 阈值告警接线 + 降级拦截测试
 *
 * 覆盖 K3 全链路审计 (AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813) 两缺陷:
 *   P0-1: sentinel-loader.ts 注册时从不挂 manifest → cash-runway/revenue-health 阈值 finding 死代码
 *   P1-1: degraded value=0 穿过阈值门控 → 无数据误报 critical「现金流危急」
 *
 * red 基线: 修复前 ①loader 注册后 manifest 仍 null ②经 registry 端到端阈值 finding=0
 *           ③degraded 场景产 critical。修复后三处全部反转 (dev doc §4 S-5)。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { loadSentinels, registerLoadedSentinels } from '../../src/sentinel/sentinel-loader';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { cashRunwaySentinel } from '../../extensions/sentinels/cash-runway/aggregate';
import { revenueHealthSentinel } from '../../extensions/sentinels/revenue-health/aggregate';
import type { SentinelManifest } from '../../src/sentinel/sentinel-loader';

/** 按哨兵名取真实 manifest.json 阈值（非测试构造，保证与生产一致） */
function manifestOf(name: string): SentinelManifest {
  const { sentinels } = loadSentinels();
  const found = sentinels.find(s => s.manifest.name === name);
  if (!found) throw new Error(`manifest 未找到: ${name}`);
  return found.manifest;
}

/** mock GraphStoreReader: 按 fixture 返回 Financial 节点 */
function storeWith(financials: Array<{ id: string; props: Record<string, unknown> }>): {
  queryNodes(type: string, filters?: Record<string, unknown>): Array<{ id: string; type: string; props: Record<string, unknown> }>;
} {
  return {
    queryNodes(type: string, _filters?: Record<string, unknown>) {
      if (type !== 'Financial') return [];
      return financials.map(f => ({ ...f, type: 'Financial' }));
    },
  };
}

/** 越阈 fixture: 跑道 100/100=1 个月 (critical≤6) + 应收/现金比 0.5 (critical≥0.3) */
const overThresholdStore = () => storeWith([
  { id: 'f1', props: { cashBalance: 100, operatingExpenses: 100, accountsReceivable: 50 } },
]);
/** 无财务数据 store（compute 全部降级, value=0） */
const emptyStore = () => storeWith([]);

describe('D356 P0-1: loader 注册装配路径挂载 manifest', () => {
  beforeEach(() => {
    destroySentinelRegistry();
    cashRunwaySentinel.manifest = null;
    revenueHealthSentinel.manifest = null;
  });

  it('注册后哨兵对象 manifest 已挂载（修复前 null → red）', async () => {
    const { registered } = await registerLoadedSentinels();
    expect(registered).toBeGreaterThan(0);

    // 物理断言: 生产装配路径把 manifest 挂到了 aggregate 导出的哨兵对象上
    expect(cashRunwaySentinel.manifest?.name).toBe('cash-runway');
    expect(cashRunwaySentinel.manifest?.thresholds.cash_runway_months.critical).toBe(6);
    expect(revenueHealthSentinel.manifest?.name).toBe('revenue-health');
    expect(revenueHealthSentinel.manifest?.thresholds.revenue_growth.critical).toBe(-0.05);
  });

  it('经 loader 注册的 registry 哨兵阈值路径可达（端到端装配契约）', async () => {
    await registerLoadedSentinels();
    const sentinel = getSentinelRegistry().get('sentinel-cash-runway');
    expect(sentinel).toBeTruthy();

    const result = await sentinel!.check({ db: overThresholdStore(), now: new Date(), teamId: 't1' });
    expect(result.ok).toBe(true);
    // 修复前 manifest 未挂载 → 阈值 finding 恒 0（死代码）→ red
    expect(result.findings.some(f => f.id === 'cash_critical')).toBe(true);
    expect(result.findings.some(f => f.id === 'ar_critical')).toBe(true);
  });
});

describe('D356 P1-1: degraded 结果不穿过阈值门控', () => {
  beforeEach(() => {
    destroySentinelRegistry();
    cashRunwaySentinel.manifest = null;
    revenueHealthSentinel.manifest = null;
  });

  it('无数据时 cash-runway 不产 critical，改发 degraded 提示（修复前穿门控 → red）', async () => {
    // 手动挂 manifest 复现 K3 活运行 [B] 组生产形态（与 loader 装配后等价）
    cashRunwaySentinel.manifest = manifestOf('cash-runway');

    const findings = await cashRunwaySentinel.check(emptyStore(), 't1');

    // 修复前: degraded value=0 ≤ critical 6 → cash_critical 误报 → red
    expect(findings.filter(f => f.severity === 'critical')).toHaveLength(0);
    expect(findings.some(f => f.id === 'cr_runway_degraded')).toBe(true);
    expect(findings.some(f => f.id === 'cr_overdue_degraded')).toBe(true);
    const degraded = findings.find(f => f.id === 'cr_runway_degraded');
    expect(degraded?.severity).toBe('warning');
  });

  it('收入计算降级时 revenue-health 不产 critical，改发 degraded 提示', async () => {
    revenueHealthSentinel.manifest = manifestOf('revenue-health');
    // 复现降级路径: aggregate 的 queryNodes('Financial', {teamId}) 有收入节点（L41 守卫通过），
    // 但 computeRevenueGrowth 内部查询（filter 键为 teamId 值）失败 → degraded:true, value=0。
    // 修复前: 降级被 !degraded 静默跳过 → 0 findings（静默降级，铁律 31）→ red
    const revenueNode = { id: 'f1', props: { financialType: 'revenue', amount: 1000 } };
    const degrading = {
      queryNodes(type: string, filters?: Record<string, unknown>): Array<{ id: string; type: string; props: Record<string, unknown> }> {
        if (type !== 'Financial') return [];
        if (filters && 'teamId' in filters) return [{ ...revenueNode, type: 'Financial' }];
        throw new Error('growth compute query failed');
      },
    };

    const findings = await revenueHealthSentinel.check(degrading, 't1');

    expect(findings.filter(f => f.severity === 'critical')).toHaveLength(0);
    expect(findings.some(f => f.id === 'rev_growth_degraded')).toBe(true);
    const degraded = findings.find(f => f.id === 'rev_growth_degraded');
    expect(degraded?.severity).toBe('warning');
  });
});

describe('D356 回归: 正常数据仍按阈值产出 finding', () => {
  beforeEach(() => {
    destroySentinelRegistry();
    cashRunwaySentinel.manifest = null;
    revenueHealthSentinel.manifest = null;
  });

  it('越阈财务数据仍产出 critical（阈值路径不被 degraded 拦截误伤）', async () => {
    cashRunwaySentinel.manifest = manifestOf('cash-runway');

    const findings = await cashRunwaySentinel.check(overThresholdStore(), 't1');

    expect(findings.some(f => f.id === 'cash_critical')).toBe(true);
    expect(findings.some(f => f.id === 'ar_critical')).toBe(true);
    expect(findings.some(f => f.id === 'cr_runway_degraded')).toBe(false);
    expect(findings.some(f => f.id === 'cr_overdue_degraded')).toBe(false);
  });

  it('正常区间数据不产 finding（阈值判断未被破坏）', async () => {
    cashRunwaySentinel.manifest = manifestOf('cash-runway');
    // 跑道 1000/100=10 个月（12>10>6 → warning），应收比 0.05（<0.15 → 无告警）
    const healthy = storeWith([
      { id: 'f1', props: { cashBalance: 1000, operatingExpenses: 100, accountsReceivable: 50 } },
    ]);

    const findings = await cashRunwaySentinel.check(healthy, 't1');

    expect(findings.some(f => f.id === 'cash_warning')).toBe(true);
    expect(findings.filter(f => f.severity === 'critical')).toHaveLength(0);
    expect(findings.some(f => f.id === 'ar_critical')).toBe(false);
  });
});
