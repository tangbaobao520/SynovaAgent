/**
 * tests/cycles/cross-scale-validator.test.ts — 跨尺度验证器测试
 *
 * 覆盖: 2规则 + 2矩阵 + 1集成 + 1降级 = 6
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { validateOverflowSignals } from '../../src/cycles/cross-scale-validator';
import type { GraphStore } from '../../src/l4/graph-bridge';
import type { OverflowSnapshot } from '../../src/cycles/overflow-compute';

type MockSnapshot = {
  cycleId: string;
  month: string;
  overflowValue: number;
  trendDirection: 'rising' | 'stable' | 'declining';
  maturity: 'learning' | 'active' | 'mature';
};

const BASE_SNAPSHOT = {
  unit: '', trend: '', trendDelta: 0, isIndustryBaseline: false,
  momChange: 0, momChangePercent: 0, yoyChange: null, yoyChangePercent: null,
  consecutiveDirection: 0, degraded: false,
};

function makeStore(snapshots: MockSnapshot[]): GraphStore {
  const data = snapshots.map(s => ({
    id: `${s.cycleId}:${s.month}`,
    enterpriseId: 'e1',
    cycleId: s.cycleId,
    month: s.month,
    overflowValue: s.overflowValue,
    trendDirection: s.trendDirection,
    maturity: s.maturity,
    ...BASE_SNAPSHOT,
  }));

  return {
    createNode() { return ''; },
    queryNodes(type, filters) {
      return data
        .filter(d => !filters || Object.entries(filters).every(([k, v]) => d[k] === v))
        .map(d => ({ id: d.id, type: 'OVERFLOW_SNAPSHOT', props: d as unknown as Record<string, unknown> }));
    },
    getNode: () => null, updateNode: () => {}, createNodes: () => [],
    createEdge: () => '', createEdges: () => [], queryEdges: () => [],
    deleteNode: () => {}, deleteEdge: () => {}, traverse: () => null,
    findPaths: () => [], queryTriples: () => [], getNodeAtTime: () => null,
  };
}

describe('cross-scale-validator', () => {
  describe('规则 1: 快升 + 慢降', () => {
    it('现金升+人才降 → 返回警告', () => {
      const store = makeStore([
        { cycleId: 'cash-cycle', month: '2026-07', overflowValue: 100, trendDirection: 'rising', maturity: 'active' },
        { cycleId: 'talent-cycle', month: '2026-07', overflowValue: 50, trendDirection: 'declining', maturity: 'mature' },
      ]);
      const warnings = validateOverflowSignals('e1', store);
      const match = warnings.find(w => w.type === 'fast_up_slow_down');
      expect(match).toBeDefined();
      expect(match?.verdict).toContain('不可持续');
    });
  });

  describe('规则 2: 慢升 + 快降', () => {
    it('人才升+现金降 → 返回警告', () => {
      const store = makeStore([
        { cycleId: 'cash-cycle', month: '2026-07', overflowValue: 50, trendDirection: 'declining', maturity: 'active' },
        { cycleId: 'talent-cycle', month: '2026-07', overflowValue: 100, trendDirection: 'rising', maturity: 'mature' },
      ]);
      const warnings = validateOverflowSignals('e1', store);
      const match = warnings.find(w => w.type === 'slow_up_fast_down');
      expect(match).toBeDefined();
    });
  });

  describe('矩阵验证', () => {
    it('客户升+现金降 → 返回警告', () => {
      const store = makeStore([
        { cycleId: 'customer-cycle', month: '2026-07', overflowValue: 80, trendDirection: 'rising', maturity: 'active' },
        { cycleId: 'cash-cycle', month: '2026-07', overflowValue: 30, trendDirection: 'declining', maturity: 'active' },
      ]);
      const warnings = validateOverflowSignals('e1', store);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
    });

    it('快稳+慢稳 → 无警告', () => {
      const store = makeStore([
        { cycleId: 'cash-cycle', month: '2026-07', overflowValue: 100, trendDirection: 'stable', maturity: 'active' },
        { cycleId: 'talent-cycle', month: '2026-07', overflowValue: 50, trendDirection: 'stable', maturity: 'mature' },
      ]);
      const warnings = validateOverflowSignals('e1', store);
      expect(warnings.length).toBe(0);
    });
  });

  describe('降级', () => {
    it('GraphStore 无数据 → 空数组', () => {
      const store = makeStore([]);
      const warnings = validateOverflowSignals('e1', store);
      expect(warnings).toEqual([]);
    });
  });
});
