/**
 * tests/sentinel/capital-health-degraded.test.ts — D356 P1-3 缺字段误报修复测试
 *
 * 覆盖 K3 全链路审计 (AGENT-CAPABILITY-FULL-CHAIN-AUDIT-20260813) P1-3 / T3-a:
 * capital-health 合并三个 _extinct 退役子哨兵，子哨兵对缺失字段 `Number(x)||0`
 * 兜底成 0 产出假 critical（实测: 注入 {revenue:100} 单 Financial 节点 → 2 critical）。
 *
 * 修复方案 (dev doc §4.5 决策): capital-health 入口字段完整性校验 —
 * 调用子哨兵前查 Financial 节点必填字段，缺失即返回 degraded finding 并跳过子哨兵；
 * 不改 _extinct 子哨兵（重写是 D358）。
 *
 * red 基线: 修复前部分字段注入产 2 critical（icr=0 假 critical + 资产周转率 0 假 critical）→ red。
 */
import { describe, it, expect } from 'vitest';
import { capitalHealthSentinel } from '../../extensions/sentinels/capital-health/aggregate';
import type { SentinelFinding } from '../../src/sentinel/types';

interface MockNode {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

function storeWith(nodes: MockNode[]) {
  return {
    queryNodes(_type: string, _filters?: Record<string, unknown>): MockNode[] {
      return nodes;
    },
  };
}

/** K3 T3-a 复现 fixture: 只有 revenue 的 Financial 节点（其余字段全缺失） */
const partialFinancial = () => storeWith([
  { id: 'f1', type: 'Financial', props: { revenue: 100 } },
]);

/** 完整字段 fixture: 六组必填字段全齐（D/E=80/20=4 → 真实 critical；ICR=10/30 → 真实 critical） */
const completeFinancial = () => storeWith([
  {
    id: 'f1', type: 'Financial',
    props: {
      revenue: 100, totalAssets: 50, totalDebt: 80, equity: 20,
      operatingIncome: 10, interestExpense: 30, operatingExpenses: 40,
    },
  },
]);

describe('D356 P1-3: capital-health 缺字段不默认为 0', () => {
  it('部分字段注入不产 critical，改发 degraded 提示（修复前产 2 critical → red）', async () => {
    const findings = await capitalHealthSentinel.check(partialFinancial(), 't1');

    // 修复前: ICR ebit=0/interest=0 → icr=0 < 1.5 critical + 资产周转率 totalAssets=0 → 0 < 0.5 critical → red
    expect(findings.filter(f => f.severity === 'critical')).toHaveLength(0);
    expect(findings.some(f => f.id.startsWith('ch-degraded'))).toBe(true);

    const degraded = findings.find(f => f.id.startsWith('ch-degraded')) as SentinelFinding;
    expect(degraded.severity).toBe('warning');
    // degraded finding 必须点名缺失字段，可指导补数（不是静默吞掉）
    expect(degraded.evidence[0]).toContain('totalDebt');
    expect(degraded.evidence[0]).toContain('equity');
  });

  it('完整字段仍正常产出 finding（回归: 字段校验不误伤真数据）', async () => {
    const findings = await capitalHealthSentinel.check(completeFinancial(), 't1');

    // D/E=4 > 2.5 + ICR=0.33 < 1.5 → 子哨兵真实产出 critical（与修复前一致）
    expect(findings.some(f => f.severity === 'critical')).toBe(true);
    expect(findings.some(f => f.id.startsWith('ch-degraded'))).toBe(false);
  });

  it('无 Financial 节点返回空 findings（维持 K3 T2-b 空库基线行为）', async () => {
    const findings = await capitalHealthSentinel.check(storeWith([]), 't1');
    expect(findings).toHaveLength(0);
  });

  it('存储查询抛错返回 warning 错误 finding，不误报 critical', async () => {
    const broken = {
      queryNodes(): MockNode[] {
        throw new Error('db connection lost');
      },
    };

    const findings = await capitalHealthSentinel.check(broken, 't1');

    expect(findings.filter(f => f.severity === 'critical')).toHaveLength(0);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings.every(f => f.severity === 'warning')).toBe(true);
  });

  it('字段显式为 0 视为合法数据（缺失≠零，边界态）', async () => {
    // revenue 与债务字段显式 0: 合法数据（无收入/无负债企业），入口校验只判存在性，
    // 不得把显式 0 判为"字段缺失"（否则会拦住真数据、误导用户补数）
    const zeroValued = storeWith([
      {
        id: 'f1', type: 'Financial',
        props: {
          revenue: 0, totalAssets: 0, totalDebt: 0, equity: 0,
          operatingIncome: 0, interestExpense: 0, operatingExpenses: 0,
        },
      },
    ]);

    const findings = await capitalHealthSentinel.check(zeroValued, 't1');

    // 入口校验放行（字段存在）→ 子哨兵处理全 0 数据，不触发 ch-degraded
    expect(findings.some(f => f.id.startsWith('ch-degraded'))).toBe(false);
  });
});
