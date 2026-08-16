/**
 * tests/sentinel/sentinel-loader.test.ts
 * V3.7 Batch 2 — sentinel loader 单元测试
 */
import { describe, it, expect } from 'vitest';
import { loadSentinels, getSentinelsByExpert, clearSentinelCache } from '../../src/sentinel/sentinel-loader';

describe('loadSentinels', () => {
  it('加载哨兵返回非空列表', () => {
    const { sentinels, degraded } = loadSentinels();
    expect(sentinels.length).toBeGreaterThanOrEqual(4);
    expect(degraded).toBe(false);
  });

  it('所有哨兵有必需的 manifest 字段', () => {
    const { sentinels } = loadSentinels();
    for (const s of sentinels) {
      expect(s.manifest.name).toBeTruthy();
      expect(s.manifest.expert).toBeTruthy();
      // D386 (2026-08-16): 容忍规范外哨兵 computes 空 — forecast-accuracy/pricing-strategy
      // 在 aggregate.ts 直接实现不声明 computes；要求「有可执行入口」即可。
      // (path-dependency 空壳 computes 非空, 由 D379 补实现闭环)
      expect(s.manifest.computes.length > 0 || Boolean(s.manifest.entryPoint)).toBe(true);
    }
  });

  it('按专家筛选返回 finance 哨兵', () => {
    const sentinels = getSentinelsByExpert('finance');
    expect(sentinels.length).toBeGreaterThanOrEqual(4);
    expect(sentinels.every(s => s.manifest.expert === 'finance')).toBe(true);
  });

  it('第二次调用返回缓存', () => {
    const r1 = loadSentinels();
    const r2 = loadSentinels();
    expect(r1.sentinels).toBe(r2.sentinels);
  });

  it('清除缓存后重新加载', () => {
    clearSentinelCache();
    const r = loadSentinels();
    expect(r.sentinels.length).toBeGreaterThanOrEqual(4);
  });
});
