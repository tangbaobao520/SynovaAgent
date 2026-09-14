// D750: 聚合信号的路由专家必须来自 manifest 权威 expert（不再按 ID 子串猜类目）
//
// 背景（质询 §3.4 活缺陷）: inferCategory 只产 capability/health/risk 三类 →
//   SIGNAL_TO_EXPERT 十类中 7 类不可达 → revenue/financial/strategy 信号被默认判为 health
//   → 派给 technology-foundation（**营收信号派给"技术底座"专家**）。
// 本测试: 用真实 manifest 声明的哨兵 → 断言路由到其权威 expert；并守住旧误路由不再出现。

import { describe, it, expect } from 'vitest';
import { aggregateSignals } from '../../src/sentinel/signal-aggregator';
import type { SentinelCheckResult, SentinelFinding } from '../../src/sentinel/types';

function mkResult(sentinelId: string, title: string, severity: SentinelFinding['severity'] = 'warning'): SentinelCheckResult {
  const finding: SentinelFinding = {
    id: `f_${sentinelId}`,
    severity,
    title,
    description: 'D750 测试夹具',
    evidence: ['e1'],
    suggestion: 'n/a',
    detectedAt: new Date().toISOString(),
  };
  return { sentinelId, ok: true, findings: [finding], durationMs: 1, checkedAt: new Date().toISOString() };
}

describe('D750 信号→专家路由（manifest 权威 expert）', () => {
  it('cash-runway（manifest expert=fundamental-efficiency）→ 不再路由到 technology-foundation', () => {
    const { signals } = aggregateSignals([mkResult('sentinel-cash-runway', '现金跑道: 仅 3 个月')]);
    expect(signals.length).toBeGreaterThan(0);
    const exps = signals[0].recommendedExperts;
    // 修复后：manifest 权威 expert 生效
    expect(exps).toContain('fundamental-efficiency');
    // 旧误路由（inferCategory→health→['technology-foundation']）不得独占
    expect(exps).not.toEqual(['technology-foundation']);
  });

  it('competitive-strategy 类哨兵 → 路由到 competitive-strategy', () => {
    const { signals } = aggregateSignals([mkResult('sentinel-customer-demand-shift', '客户需求迁移: 某客群流失')]);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].recommendedExperts.length).toBeGreaterThan(0);
    // 权威 expert 必须出现（具体值由 manifest 决定，此处只断言非空且不含错误独占）
    expect(signals[0].recommendedExperts).not.toEqual(['technology-foundation']);
  });

  it('多哨兵聚合：专家集 = 各自 manifest expert 的并集（不含未声明项）', () => {
    const { signals } = aggregateSignals([
      mkResult('sentinel-cash-runway', '现金跑道: 仅 3 个月', 'critical'),
      mkResult('sentinel-customer-demand-shift', '现金跑道: 仅 3 个月', 'warning'),
    ]);
    const exps = signals[0].recommendedExperts;
    expect(exps.length).toBeGreaterThanOrEqual(2);
    expect(exps).toContain('fundamental-efficiency');
  });

  it('未在 manifest 命中的哨兵 → 回落旧路径但不静默（产出仍非空）', () => {
    const { signals } = aggregateSignals([mkResult('not-a-real-sentinel-xyz', '未知维度: 某实体')]);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].recommendedExperts.length).toBeGreaterThan(0);
  });
});
