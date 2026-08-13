/**
 * tests/services/context-budget-tracker.test.ts — C2 上下文预算追踪器测试
 *
 * 铁律 0-2: spec → test → impl → wire → review → merge
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ContextBudgetTracker, type TokenUsage } from '../../src/services/context-budget-tracker';

describe('ContextBudgetTracker', () => {
  let tracker: ContextBudgetTracker;

  beforeEach(() => {
    tracker = new ContextBudgetTracker('test-model');
  });

  describe('record()', () => {
    it('Given usage with prompt and completion tokens, When recorded, Then snapshot shows totals', () => {
      const usage: TokenUsage = { promptTokens: 100, completionTokens: 50, totalTokens: 150 };
      tracker.record(usage, 'deepseek-chat');

      const snap = tracker.snapshot();
      expect(snap.totalSpent).toBe(150);
      expect(snap.callCount).toBe(1);
      expect(snap.byModel['deepseek-chat']).toBeDefined();
      expect(snap.byModel['deepseek-chat'].spent).toBe(150);
      expect(snap.byModel['deepseek-chat'].calls).toBe(1);
    });

    it('Given multiple records, When accumulated, Then totals sum correctly', () => {
      tracker.record({ promptTokens: 200, completionTokens: 100, totalTokens: 300 }, 'model-a');
      tracker.record({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }, 'model-b');
      tracker.record({ promptTokens: 50, completionTokens: 25, totalTokens: 75 }, 'model-a');

      const snap = tracker.snapshot();
      expect(snap.callCount).toBe(3);
      expect(snap.totalSpent).toBe(525);
      expect(snap.byModel['model-a'].spent).toBe(375);
      expect(snap.byModel['model-a'].calls).toBe(2);
      expect(snap.byModel['model-b'].spent).toBe(150);
      expect(snap.byModel['model-b'].calls).toBe(1);
    });

    it('Given cachedPromptTokens, When recorded, Then cacheHitRate reflects ratio', () => {
      tracker.record({ promptTokens: 100, completionTokens: 50, totalTokens: 150, cachedPromptTokens: 30 });

      const snap = tracker.snapshot();
      expect(snap.cacheHitRate).toBeCloseTo(0.3, 1);
    });

    it('Given record without model param, Then uses default model', () => {
      tracker.record({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });

      const snap = tracker.snapshot();
      expect(snap.byModel['test-model']).toBeDefined();
      expect(snap.byModel['test-model'].calls).toBe(1);
    });
  });

  describe('snapshot()', () => {
    it('Given no records, Then returns empty snapshot', () => {
      const snap = tracker.snapshot();
      expect(snap.totalSpent).toBe(0);
      expect(snap.callCount).toBe(0);
      expect(snap.cacheHitRate).toBe(0);
      expect(snap.burnRate).toBe(0);
    });

    it('Given records, Then burnRate is calculated from recent 5 min window', () => {
      tracker.record({ promptTokens: 1000, completionTokens: 500, totalTokens: 1500 });

      const snap = tracker.snapshot();
      // 1500 tokens / 5 min = 300 tokens/min
      expect(snap.burnRate).toBe(300);
    });
  });

  describe('wouldExceed()', () => {
    it('Given budget limit, When under limit, Then returns false', () => {
      tracker.record({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });

      expect(tracker.wouldExceed(1000, 200)).toBe(false);
    });

    it('Given budget limit, When would exceed, Then returns true', () => {
      tracker.record({ promptTokens: 900, completionTokens: 100, totalTokens: 1000 });

      expect(tracker.wouldExceed(1000, 200)).toBe(true);
    });

    it('Given limit <= 0, Then always returns false', () => {
      tracker.record({ promptTokens: 999999, completionTokens: 999999, totalTokens: 999999 });

      expect(tracker.wouldExceed(0, 1)).toBe(false);
      expect(tracker.wouldExceed(-1, 1)).toBe(false);
    });
  });

  describe('reset()', () => {
    it('Given records exist, When reset, Then snapshot is empty', () => {
      tracker.record({ promptTokens: 100, completionTokens: 50, totalTokens: 150 });
      tracker.reset();

      const snap = tracker.snapshot();
      expect(snap.totalSpent).toBe(0);
      expect(snap.callCount).toBe(0);
    });
  });

  describe('getBudgetTracker()', () => {
    it('Given multiple calls, Then returns same singleton', async () => {
      const { getBudgetTracker } = await import('../../src/services/context-budget-tracker');
      const a = getBudgetTracker();
      const b = getBudgetTracker();
      expect(a).toBe(b);
    });
  });
});
