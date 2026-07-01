import { describe, it, expect } from 'vitest';
import { EvolutionMetrics } from '@synova/evolution';

describe('EvolutionMetrics', () => {
  it('初始计数全零', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    const snap = m.getSnapshot();
    expect(snap.counters.correctionsProcessed).toBe(0);
    expect(snap.counters.thresholdsAdjusted).toBe(0);
    expect(snap.counters.proposalsCreated).toBe(0);
    expect(snap.counters.errors).toBe(0);
    expect(snap.counters.coolingPeriodSkips).toBe(0);
    expect(snap.counters.boundProtections).toBe(0);
  });

  it('recordCorrection → 计数递增', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    m.recordCorrection();
    m.recordCorrection();
    expect(m.getSnapshot().counters.correctionsProcessed).toBe(2);
  });

  it('recordThresholdAdjustment → 计数 + sentinel 统计', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    m.recordThresholdAdjustment('F1_KZ', 2.0, 1.6);
    m.recordThresholdAdjustment('F1_KZ', 1.6, 1.28);
    expect(m.getSnapshot().counters.thresholdsAdjusted).toBe(2);
  });

  it('recordProposalCreate → 计数递增', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    m.recordProposalCreate('test', 'prop_1');
    expect(m.getSnapshot().counters.proposalsCreated).toBe(1);
  });

  it('recordProposalApprove → 计数递增', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    m.recordProposalApprove('prop_1');
    expect(m.getSnapshot().counters.proposalsApproved).toBe(1);
  });

  it('recordError → 计数递增', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    m.recordError('test error');
    expect(m.getSnapshot().counters.errors).toBe(1);
  });

  it('recordCoolingSkip → 计数递增', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    m.recordCoolingSkip('F1_KZ', 3.2);
    expect(m.getSnapshot().counters.coolingPeriodSkips).toBe(1);
  });

  it('recordBoundProtection → 计数递增', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    m.recordBoundProtection('F1_KZ', 0.03, 0.05);
    expect(m.getSnapshot().counters.boundProtections).toBe(1);
  });

  it('recentLogs 不超过 MAX_LOG_ENTRIES', () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    for (let i = 0; i < 1500; i++) {
      m.recordCorrection();
    }
    expect(m.getSnapshot().recentLogs.length).toBeLessThanOrEqual(1000);
  });

  it('startedAt 在 reset 后更新', async () => {
    const m = EvolutionMetrics.getInstance();
    m.reset();
    const snap1 = m.getSnapshot();
    await new Promise(r => setTimeout(r, 10)); // 等 10ms 确保时间戳变化
    m.reset();
    const snap2 = m.getSnapshot();
    expect(snap1.startedAt).not.toBe(snap2.startedAt);
  });
});
