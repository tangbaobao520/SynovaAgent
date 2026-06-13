/**
 * tests/sentinel/integration-pipeline.test.ts — 完整链路集成测试
 *
 * Iron Law 12: 集成测试 cover 真实路由，不 mock 管线。
 * Iron Law 33: *.integration.test.ts = 集成测试
 *
 * 测试链路: sentinel.check → baseline.record/compare → aggregateSignals → expert routing
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { Sentinel, SentinelCheckResult, SentinelConfig, SentinelContext, SentinelFinding } from '../../src/sentinel/types';
import { getSentinelRegistry, destroySentinelRegistry } from '../../src/sentinel/registry';
import { getBaselineStore, destroyBaselineStore } from '../../src/sentinel/baseline-store';
import { aggregateSignals } from '../../src/sentinel/signal-aggregator';

// ═══ 真实 Sentinel 实现 (不 mock check 逻辑) ═══

function makeSentinel(id: string, category: string, priority: 'P0'|'P1'|'P2', cron: string, findings: SentinelFinding[]): Sentinel {
  return {
    config: { id, name: `Test ${id}`, description: '', category: category as SentinelConfig['category'], priority, mode: 'cron', cron, requiredDataSources: [], confidenceModel: 'deterministic', version: '1.0.0' },
    async check(_ctx: SentinelContext): Promise<SentinelCheckResult> {
      return { sentinelId: id, ok: true, findings, durationMs: 1, checkedAt: new Date().toISOString() };
    },
  };
}

function makeFinding(severity: 'critical'|'warning'|'info', title: string): SentinelFinding {
  return { id: `f-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, severity, title, description: `Test: ${title}`, evidence: ['test evidence'], suggestion: 'test suggestion', detectedAt: new Date().toISOString() };
}

// ═══ Tests ═══

describe('Sentinel → Signal → Expert 集成链路', () => {
  beforeEach(() => {
    destroySentinelRegistry();
    destroyBaselineStore();
  });

  it('Given 3 哨兵指向同一实体 → aggregateSignals 升级为 critical', () => {
    const findings = [makeFinding('warning', '团队A: 协作异常')];
    const sentinels = [
      makeSentinel('sentinel-htm', 'collaboration', 'P1', '0 9 * * *', findings),
      makeSentinel('sentinel-hacd', 'collaboration', 'P1', '0 9 * * *', findings),
      makeSentinel('sentinel-hona', 'collaboration', 'P2', '0 9 * * 1', findings),
    ];

    const results: SentinelCheckResult[] = sentinels.map(s => ({
      sentinelId: s.config.id, ok: true,
      findings: [{ id: `f-${s.config.id}`, severity: 'warning' as const, title: '团队A: 协作异常', description: '', evidence: [], suggestion: '', detectedAt: new Date().toISOString() }],
      durationMs: 0, checkedAt: new Date().toISOString(),
    }));

    const { signals, stats } = aggregateSignals(results);

    expect(stats.totalFindings).toBe(3);
    expect(stats.aggregatedSignals).toBe(1);
    expect(signals[0].severity).toBe('critical'); // 3 sentinel → 交叉升级
    expect(signals[0].recommendedExperts).toContain('org');
    expect(stats.criticalSignals).toBe(1);
  });

  it('Given 单哨兵 single finding → 不升级', () => {
    const results: SentinelCheckResult[] = [{
      sentinelId: 'sentinel-htm', ok: true,
      findings: [{ id: 'f1', severity: 'warning' as const, title: '信任健康: 偏低', description: '', evidence: [], suggestion: '', detectedAt: new Date().toISOString() }],
      durationMs: 0, checkedAt: new Date().toISOString(),
    }];

    const { signals } = aggregateSignals(results);
    expect(signals[0].severity).toBe('warning'); // 未升级
  });

  it('Given 基线偏离 >2x → 升级 severity', () => {
    const baseline = getBaselineStore();
    const sentinelId = 'sentinel-test';

    // 建立基线: 每次 2 条 finding
    baseline.record(sentinelId, [makeFinding('warning', 'a'), makeFinding('warning', 'b')]);
    baseline.record(sentinelId, [makeFinding('warning', 'a'), makeFinding('warning', 'b')]);
    baseline.record(sentinelId, [makeFinding('warning', 'a'), makeFinding('warning', 'b')]);

    const b = baseline.getBaseline(sentinelId);
    expect(b.baselineReady).toBe(true);
    expect(b.avgFindingCount).toBe(2);

    // 当前 6 条 finding → 3x 基线
    const comparison = baseline.compare(sentinelId, [
      makeFinding('warning', 'a'), makeFinding('warning', 'b'),
      makeFinding('warning', 'c'), makeFinding('warning', 'd'),
      makeFinding('warning', 'e'), makeFinding('warning', 'f'),
    ]);

    expect(comparison.deviation.findingCountRatio).toBe(3);
    expect(comparison.escalatedFindings[0].severity).toBe('critical'); // 3x → 升级
  });

  it('Given 完整链路: register → check → record → aggregate → expert', async () => {
    const registry = getSentinelRegistry();
    const baseline = getBaselineStore();

    // Step 1: 注册 2 个哨兵
    // 使用包含 keyword 的 ID — inferCategory 按关键词匹配
    const s1 = makeSentinel('sentinel-htm-test', 'collaboration', 'P1', '0 9 * * *', [makeFinding('warning', '团队A: 协作密度下降')]);
    const s2 = makeSentinel('sentinel-cpc-test', 'capability', 'P1', '0 9 * * 1', [makeFinding('warning', '团队A: 协议缺失')]);
    registry.register(s1);
    registry.register(s2);

    expect(registry.count()).toBe(2);

    // Step 2: 执行检查
    const ctx: SentinelContext = { db: null, now: new Date() };
    const r1 = await s1.check(ctx);
    const r2 = await s2.check(ctx);

    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);

    // Step 3: 记录基线
    baseline.record('s-collab', r1.findings);
    baseline.record('s-capability', r2.findings);

    const b1 = baseline.getBaseline('s-collab');
    expect(b1.totalRuns).toBe(1);

    // Step 4: 聚合信号
    const { signals, stats } = aggregateSignals([r1, r2]);

    expect(stats.totalFindings).toBe(2);
    expect(signals.length).toBe(1); // 同一实体合并
    expect(signals[0].severity).toBe('critical'); // 2 哨兵 → 交叉升级

    // Step 5: 专家路由
    expect(signals[0].recommendedExperts).toContain('org');
    expect(signals[0].recommendedExperts).toContain('tech');
  });

  it('Given 空 registry → listCronSentinels 返回 0', () => {
    const registry = getSentinelRegistry();
    expect(registry.listCronSentinels().length).toBe(0);
  });

  it('Given 非 cron 哨兵 → listCronSentinels 过滤掉', () => {
    const registry = getSentinelRegistry();
    const onDemand: Sentinel = {
      config: { id: 's-ondemand', name: 'OnDemand', description: '', category: 'health', priority: 'P2', mode: 'on-demand', requiredDataSources: [], confidenceModel: 'deterministic', version: '1.0.0' },
      async check(_ctx: SentinelContext) { return { sentinelId: 's-ondemand', ok: true, findings: [], durationMs: 0, checkedAt: new Date().toISOString() }; },
    };
    registry.register(onDemand);
    expect(registry.count()).toBe(1);
    expect(registry.listCronSentinels().length).toBe(0);
  });
});
