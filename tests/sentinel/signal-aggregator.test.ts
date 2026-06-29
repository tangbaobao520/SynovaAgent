/** tests/sentinel/signal-aggregator.test.ts — 信号聚合引擎单元测试 */
import { describe, it, expect } from 'vitest';
import { aggregateSignals } from '../../src/sentinel/signal-aggregator';
import type { SentinelCheckResult } from '../../src/sentinel/types';

function makeResult(sentinelId: string, findings: Array<{ severity: 'critical' | 'warning' | 'info'; title: string }>): SentinelCheckResult {
  return { sentinelId, ok: true, findings: findings.map((f, i) => ({ id: `${sentinelId}-${i}`, severity: f.severity, title: f.title, description: '', evidence: [], suggestion: '', detectedAt: new Date().toISOString() })), durationMs: 0, checkedAt: new Date().toISOString() };
}

describe('aggregateSignals', () => {
  it('Given 单哨兵单 finding → 1 个聚合信号, 严重度不变', () => {
    const r = aggregateSignals([makeResult('sentinel-gap-dynamics', [{ severity: 'warning', title: '能力差距: 偏低' }])]);
    expect(r.signals.length).toBe(1);
    expect(r.signals[0].severity).toBe('warning');
    expect(r.signals[0].recommendedExperts).toContain('org');
  });

  it('Given 3 个不同哨兵指向同一实体 → critical (交叉升级)', () => {
    const results = [
      makeResult('sentinel-cpc', [{ severity: 'warning', title: '团队A: 协议缺失' }]),
      makeResult('sentinel-gap-dynamics', [{ severity: 'warning', title: '团队A: 能力差距' }]),
      makeResult('sentinel-path-dependency', [{ severity: 'info', title: '团队A: 路径依赖' }]),
    ];
    const r = aggregateSignals(results);
    expect(r.signals.length).toBe(1);
    expect(r.signals[0].severity).toBe('critical');
    expect(r.stats.criticalSignals).toBe(1);
  });

  it('Given 多实体 findings → 按实体分组聚合', () => {
    const results = [
      makeResult('sentinel-cpc', [{ severity: 'warning', title: '部门A: 协议缺失' }]),
      makeResult('sentinel-gap-dynamics', [{ severity: 'warning', title: '部门B: 能力差距' }]),
    ];
    const r = aggregateSignals(results);
    expect(r.signals.length).toBe(2);
  });

  it('Given 空 results → 0 信号', () => {
    const r = aggregateSignals([]);
    expect(r.signals.length).toBe(0);
    expect(r.stats.totalFindings).toBe(0);
  });

  it('Given risk 类别哨兵 → 推荐 strategic + finance 专家', () => {
    const r = aggregateSignals([makeResult('sentinel-key-person-risk', [{ severity: 'critical', title: '关键人: 张三' }])]);
    expect(r.signals[0].recommendedExperts).toContain('strategic');
    expect(r.signals[0].recommendedExperts).toContain('finance');
  });
});
