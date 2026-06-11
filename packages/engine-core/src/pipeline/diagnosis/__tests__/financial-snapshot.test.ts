/**
 * financial-snapshot.test.ts — 财务报表分析测试
 */

import {
  computeFinancialSnapshot,
  assessFinancialImpact,
  createEmptyEntry,
  validateEntry,
} from '../financial-snapshot';
import type { FinancialEntry } from '../financial-snapshot';

function makeEntry(overrides: Partial<FinancialEntry> = {}): FinancialEntry {
  return {
    period: '2026-Q1',
    startDate: '2026-01-01',
    endDate: '2026-03-31',
    revenue: 1_000_000,
    cost: 400_000,
    operatingExpenses: 200_000,
    ebitda: 400_000,
    operatingCashFlow: 350_000,
    cashBalance: 1_500_000,
    headcount: 10,
    ...overrides,
  };
}

describe('financial-snapshot', () => {
  describe('computeFinancialSnapshot', () => {
    it('throws when entries array is empty', () => {
      expect(() => computeFinancialSnapshot({ teamId: 't1', entries: [] }))
        .toThrow('至少需要一个财务条目');
    });

    it('computes gross margin correctly', () => {
      // Given: revenue=1M, cost=400K → grossProfit=600K → grossMargin=0.6
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry()],
      });

      expect(snapshot.grossMargin).toBe(0.6);
    });

    it('computes net margin correctly', () => {
      // Given: revenue=1M, cost=400K, opEx=200K → netProfit=400K → netMargin=0.4
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry()],
      });

      expect(snapshot.netMargin).toBe(0.4);
    });

    it('computes revenue per head', () => {
      // Given: revenue=1M, headcount=10 → 100K/head
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry()],
      });

      expect(snapshot.revenuePerHead).toBe(100000);
    });

    it('computes cost per head', () => {
      // Given: cost=400K, headcount=10 → 40K/head
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry()],
      });

      expect(snapshot.costPerHead).toBe(40000);
    });

    it('computes revenue YoY growth', () => {
      // Given: current revenue=1.2M, previous=1.0M → growth=0.2
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [
          makeEntry({ period: '2025-Q1', startDate: '2025-01-01', endDate: '2025-03-31', revenue: 1_000_000 }),
          makeEntry({ period: '2026-Q1', startDate: '2026-01-01', endDate: '2026-03-31', revenue: 1_200_000 }),
        ],
      });

      expect(snapshot.revenueYoYGrowth).toBe(0.2);
    });

    it('returns null YoY growth with single entry', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry()],
      });

      expect(snapshot.revenueYoYGrowth).toBeNull();
      expect(snapshot.profitYoYGrowth).toBeNull();
    });

    it('profit YoY growth: handles negative-to-positive transition', () => {
      // Given: previous profit=-100K, current profit=200K
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [
          makeEntry({ period: '2025-Q1', startDate: '2025-01-01', endDate: '2025-03-31', revenue: 500_000, cost: 400_000, operatingExpenses: 200_000 }),
          makeEntry({ period: '2026-Q1', startDate: '2026-01-01', endDate: '2026-03-31', revenue: 1_000_000, cost: 400_000, operatingExpenses: 200_000 }),
        ],
      });

      // prev profit = 500K-400K-200K = -100K; curr profit = 1M-400K-200K = 400K
      // growth = (400K - (-100K)) / |-100K| = 500K / 100K = 5.0
      expect(snapshot.profitYoYGrowth).toBe(5.0);
    });

    it('cash flow: healthy when opCashFlow > 0 and cashBalance > 3× opEx', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({
          operatingCashFlow: 100_000,
          cashBalance: 1_000_000,
          operatingExpenses: 200_000,
        })],
      });

      expect(snapshot.cashFlowHealth).toBe('healthy');
    });

    it('cash flow: tight when opCashFlow > 0 but low cashBalance', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({
          operatingCashFlow: 50_000,
          cashBalance: 250_000,
          operatingExpenses: 200_000,
        })],
      });

      expect(snapshot.cashFlowHealth).toBe('tight');
    });

    it('cash flow: critical when opCashFlow <= 0 and cashBalance <= opEx', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({
          operatingCashFlow: -10_000,
          cashBalance: 150_000,
          operatingExpenses: 200_000,
        })],
      });

      expect(snapshot.cashFlowHealth).toBe('critical');
    });

    it('cash flow: unknown when operatingCashFlow is undefined', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({ operatingCashFlow: undefined, cashBalance: undefined })],
      });

      expect(snapshot.cashFlowHealth).toBe('unknown');
    });

    it('sorts entries by startDate ascending', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [
          makeEntry({ period: 'Q2', startDate: '2026-04-01', endDate: '2026-06-30' }),
          makeEntry({ period: 'Q1', startDate: '2026-01-01', endDate: '2026-03-31' }),
        ],
      });

      expect(snapshot.current.period).toBe('Q2');
      expect(snapshot.previous!.period).toBe('Q1');
    });

    it('handles zero revenue gracefully (margin=0 not NaN)', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({ revenue: 0, cost: 0 })],
      });

      expect(snapshot.grossMargin).toBe(0);
      expect(snapshot.netMargin).toBe(0);
      expect(snapshot.revenuePerHead).toBe(0);
    });

    it('handles zero headcount gracefully (perHead=0 not Infinity)', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({ headcount: 0 })],
      });

      expect(snapshot.revenuePerHead).toBe(0);
      expect(snapshot.costPerHead).toBe(0);
    });
  });

  describe('assessFinancialImpact', () => {
    it('returns none for healthy finances', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry()],
      });

      const impact = assessFinancialImpact(snapshot);
      expect(impact.stressImpactLevel).toBe('none');
      expect(impact.affectedDimensions).toHaveLength(0);
    });

    it('returns high for critical cash flow', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({
          operatingCashFlow: -50_000,
          cashBalance: 100_000,
          operatingExpenses: 200_000,
        })],
      });

      const impact = assessFinancialImpact(snapshot);
      expect(impact.stressImpactLevel).toBe('high');
      expect(impact.affectedDimensions).toContain('信任与心理安全');
      expect(impact.affectedDimensions).toContain('决策权分配');
    });

    it('returns high for revenue decline >30%', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [
          makeEntry({ period: '2025-Q1', startDate: '2025-01-01', endDate: '2025-03-31', revenue: 1_000_000 }),
          makeEntry({ period: '2026-Q1', startDate: '2026-01-01', endDate: '2026-03-31', revenue: 500_000 }),
        ],
      });

      const impact = assessFinancialImpact(snapshot);
      expect(impact.stressImpactLevel).toBe('high');
    });

    it('returns medium for tight cash flow', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({
          operatingCashFlow: 50_000,
          cashBalance: 250_000,
          operatingExpenses: 200_000,
        })],
      });

      const impact = assessFinancialImpact(snapshot);
      expect(impact.stressImpactLevel).toBe('medium');
    });

    it('returns medium for net margin below 5%', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({ revenue: 1_000_000, cost: 800_000, operatingExpenses: 160_000 })],
      });
      // net margin = (1000-800-160)/1000 = 40/1000 = 0.04

      const impact = assessFinancialImpact(snapshot);
      expect(impact.stressImpactLevel).toBe('medium');
    });

    it('returns low for net margin below 15%', () => {
      const snapshot = computeFinancialSnapshot({
        teamId: 't1',
        entries: [makeEntry({ revenue: 1_000_000, cost: 600_000, operatingExpenses: 300_000 })],
      });
      // net margin = (1000-600-300)/1000 = 100/1000 = 0.10

      const impact = assessFinancialImpact(snapshot);
      expect(impact.stressImpactLevel).toBe('low');
    });
  });

  describe('createEmptyEntry', () => {
    it('creates a zero-filled template entry', () => {
      const entry = createEmptyEntry('2026-Q2', '2026-04-01', '2026-06-30');

      expect(entry.period).toBe('2026-Q2');
      expect(entry.revenue).toBe(0);
      expect(entry.cost).toBe(0);
      expect(entry.operatingExpenses).toBe(0);
      expect(entry.headcount).toBe(1);
    });
  });

  describe('validateEntry', () => {
    it('returns valid for correct entry', () => {
      const result = validateEntry(makeEntry());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects negative revenue', () => {
      const result = validateEntry(makeEntry({ revenue: -100 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('收入不能为负数');
    });

    it('rejects negative cost', () => {
      const result = validateEntry(makeEntry({ cost: -100 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('成本不能为负数');
    });

    it('rejects negative operating expenses', () => {
      const result = validateEntry(makeEntry({ operatingExpenses: -100 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('运营费用不能为负数');
    });

    it('rejects zero headcount', () => {
      const result = validateEntry(makeEntry({ headcount: 0 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('团队人数必须大于零');
    });

    it('rejects negative headcount', () => {
      const result = validateEntry(makeEntry({ headcount: -5 }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('团队人数必须大于零');
    });

    it('rejects endDate before startDate', () => {
      const result = validateEntry(makeEntry({ startDate: '2026-06-30', endDate: '2026-01-01' }));
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('开始日期不能晚于结束日期');
    });
  });
});
