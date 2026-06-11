/**
 * diagnosis-archive.test.ts — 诊断归档测试
 */

import {
  archiveDiagnosis,
  getArchive,
  queryArchives,
  getTeamHistory,
  getLatestDiagnosis,
  cleanupArchive,
  resetArchive,
  extractKnowledge,
} from '../diagnosis-archive';
import type { StructuredDiagnosisReport } from '../types';

function makeReport(overrides: Partial<StructuredDiagnosisReport> = {}): StructuredDiagnosisReport {
  return {
    generatedAt: new Date().toISOString(),
    teamId: 'test-team',
    ceoSummary: '整体健康',
    gapRadar: {
      '信息流': 20,
      '决策权': 35,
      '信任与心理安全': 50,
      '分工合理性': 60,
      '冲突解决': 70,
      '目标对齐': 80,
    },
    rootCauses: [],
    recommendations: [],
    ...overrides,
  } as StructuredDiagnosisReport;
}

beforeEach(() => {
  resetArchive();
});

describe('diagnosis-archive', () => {
  describe('archiveDiagnosis', () => {
    it('creates an archive entry with auto-generated ID', () => {
      const report = makeReport();
      const entry = archiveDiagnosis(report, 't1', ['urgent']);

      expect(entry.id).toMatch(/^diag-t1-/);
      expect(entry.teamId).toBe('t1');
      expect(entry.summary).toBe('整体健康');
      expect(entry.tags).toContain('urgent');
    });

    it('sets topRiskDimensions from gapRadar (highest scores = highest risk)', () => {
      const report = makeReport({
        gapRadar: { '信息流': 90, '决策权': 80, '信任与心理安全': 30, '分工合理性': 20 },
      });
      const entry = archiveDiagnosis(report, 't1');

      expect(entry.topRiskDimensions).toHaveLength(3);
      expect(entry.topRiskDimensions[0]).toBe('信息流');
      expect(entry.topRiskDimensions[1]).toBe('决策权');
      expect(entry.topRiskDimensions[2]).toBe('信任与心理安全');
    });

    it('auto-trims oldest entry when store exceeds 200 entries', () => {
      for (let i = 0; i < 200; i++) {
        archiveDiagnosis(makeReport({
          generatedAt: new Date(2020, 0, 1 + i).toISOString(),
          ceoSummary: `Old ${i}`,
        }), 'bulk-team');
      }

      const newest = makeReport({
        ceoSummary: 'Newest',
        generatedAt: new Date(2025, 0, 1).toISOString(),
      });
      archiveDiagnosis(newest, 'bulk-team');

      const all = queryArchives({ teamId: 'bulk-team' });
      expect(all.length).toBeLessThanOrEqual(200);
      expect(all.some(e => e.summary === 'Newest')).toBe(true);
      expect(all.some(e => e.summary === 'Old 0')).toBe(false);
    });
  });

  describe('getArchive', () => {
    it('retrieves by ID', () => {
      const entry = archiveDiagnosis(makeReport(), 't1');
      const found = getArchive(entry.id);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(entry.id);
    });

    it('returns null for unknown ID', () => {
      expect(getArchive('nonexistent')).toBeNull();
    });
  });

  describe('queryArchives', () => {
    it('filters by teamId', () => {
      archiveDiagnosis(makeReport(), 'qa-a');
      archiveDiagnosis(makeReport(), 'qa-b');

      const result = queryArchives({ teamId: 'qa-a' });
      expect(result).toHaveLength(1);
      expect(result[0].teamId).toBe('qa-a');
    });

    it('filters by date range', () => {
      archiveDiagnosis(makeReport({ generatedAt: '2024-03-01T00:00:00Z', ceoSummary: 'March' }), 'qa-1');
      archiveDiagnosis(makeReport({ generatedAt: '2024-06-01T00:00:00Z', ceoSummary: 'June' }), 'qa-1');

      const result = queryArchives({ teamId: 'qa-1', from: '2024-04-01T00:00:00Z' });
      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('June');
    });

    it('filters by tags', () => {
      archiveDiagnosis(makeReport(), 'qa-1', ['quarterly']);
      archiveDiagnosis(makeReport(), 'qa-1', ['emergency']);

      const result = queryArchives({ teamId: 'qa-1', tags: ['emergency'] });
      expect(result).toHaveLength(1);
      expect(result[0].tags).toContain('emergency');
    });

    it('filters by keyword in summary', () => {
      archiveDiagnosis(makeReport({ ceoSummary: '信息流严重阻塞' }), 'qa-kw');
      archiveDiagnosis(makeReport({ ceoSummary: '团队沟通顺畅' }), 'qa-kw');

      const result = queryArchives({ teamId: 'qa-kw', keyword: '阻塞' });
      expect(result).toHaveLength(1);
      expect(result[0].summary).toBe('信息流严重阻塞');
    });

    it('filters by keyword in tags', () => {
      archiveDiagnosis(makeReport(), 'qa-kw', ['critical-issue']);
      archiveDiagnosis(makeReport(), 'qa-kw', ['normal']);

      const result = queryArchives({ teamId: 'qa-kw', keyword: 'critical' });
      expect(result).toHaveLength(1);
    });

    it('sorts by desc (default)', () => {
      archiveDiagnosis(makeReport({ generatedAt: '2024-01-01T00:00:00Z' }), 'qa-sort');
      archiveDiagnosis(makeReport({ generatedAt: '2024-06-01T00:00:00Z' }), 'qa-sort');

      const result = queryArchives({ teamId: 'qa-sort' });
      expect(result).toHaveLength(2);
      expect(new Date(result[0].timestamp).getTime())
        .toBeGreaterThan(new Date(result[1].timestamp).getTime());
    });

    it('sorts ascending when order=asc', () => {
      archiveDiagnosis(makeReport({ generatedAt: '2024-01-01T00:00:00Z' }), 'qa-asc');
      archiveDiagnosis(makeReport({ generatedAt: '2024-06-01T00:00:00Z' }), 'qa-asc');

      const result = queryArchives({ teamId: 'qa-asc', order: 'asc' });
      expect(result).toHaveLength(2);
      expect(new Date(result[0].timestamp).getTime())
        .toBeLessThan(new Date(result[1].timestamp).getTime());
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        archiveDiagnosis(makeReport({ generatedAt: `2024-0${i + 1}-01T00:00:00Z` }), 'qa-lim');
      }
      const result = queryArchives({ teamId: 'qa-lim', limit: 3 });
      expect(result).toHaveLength(3);
    });
  });

  describe('getTeamHistory', () => {
    it('returns most recent N entries for a team', () => {
      for (let i = 0; i < 5; i++) {
        archiveDiagnosis(makeReport({ generatedAt: `2024-0${i + 1}-01T00:00:00Z` }), 'hist-1');
      }

      const history = getTeamHistory('hist-1', 3);
      expect(history).toHaveLength(3);
      expect(new Date(history[0].timestamp).getTime())
        .toBeGreaterThan(new Date(history[1].timestamp).getTime());
    });

    it('defaults to limit=10', () => {
      for (let i = 0; i < 15; i++) {
        archiveDiagnosis(makeReport({
          generatedAt: `2024-${String(i + 1).padStart(2, '0')}-01T00:00:00Z`,
        }), 'hist-2');
      }
      expect(getTeamHistory('hist-2')).toHaveLength(10);
    });
  });

  describe('getLatestDiagnosis', () => {
    it('returns most recent entry for a team', () => {
      archiveDiagnosis(makeReport({ generatedAt: '2024-01-01T00:00:00Z', ceoSummary: 'first' }), 'latest-1');
      archiveDiagnosis(makeReport({ generatedAt: '2024-06-01T00:00:00Z', ceoSummary: 'latest' }), 'latest-1');

      const found = getLatestDiagnosis('latest-1');
      expect(found).not.toBeNull();
      expect(found!.summary).toBe('latest');
    });

    it('returns null for unknown team', () => {
      expect(getLatestDiagnosis('unknown-team')).toBeNull();
    });
  });

  describe('cleanupArchive', () => {
    it('removes entries older than maxAgeMs', () => {
      archiveDiagnosis(makeReport({
        generatedAt: new Date(Date.now() - 86400000).toISOString(),
      }), 'clean-1');

      const removed = cleanupArchive(3600000);
      expect(removed).toBe(1);
      expect(queryArchives({ teamId: 'clean-1' })).toHaveLength(0);
    });

    it('keeps recent entries', () => {
      archiveDiagnosis(makeReport(), 'clean-2');
      const removed = cleanupArchive(3600000);
      expect(removed).toBe(0);
      expect(queryArchives({ teamId: 'clean-2' })).toHaveLength(1);
    });
  });

  describe('extractKnowledge', () => {
    it('returns empty results when fewer than 2 entries', () => {
      archiveDiagnosis(makeReport(), 'ek-1');
      const knowledge = extractKnowledge('ek-1');
      expect(knowledge.persistentPatterns).toHaveLength(0);
      expect(knowledge.recurringDimensions).toHaveLength(0);
      expect(knowledge.maturityTrend).toBe(0);
    });

    it('detects recurring dimensions appearing in >=60% of diagnoses', () => {
      // 5 entries across 5 dimensions. 信息流 always top (100%), 决策权 top in
      // first 3 only (60%), 信任 top in first 2 only (40%). Extra dims ensure ties don't inflate counts.
      for (let i = 0; i < 5; i++) {
        archiveDiagnosis(makeReport({
          generatedAt: `2024-0${i + 1}-01T00:00:00Z`,
          gapRadar: {
            '信息流': 90 - i,
            '决策权': i < 3 ? 80 : 10,
            '信任与心理安全': i < 2 ? 70 : 10,
            '分工合理性': 20 + i,
            '冲突解决': 15 + i,
          },
        }), 'ek-2');
      }

      const knowledge = extractKnowledge('ek-2');
      expect(knowledge.recurringDimensions).toContain('信息流');
      expect(knowledge.recurringDimensions).toContain('决策权');
      expect(knowledge.recurringDimensions).not.toContain('信任与心理安全');
    });

    it('computes improved and degraded dimensions', () => {
      archiveDiagnosis(makeReport({
        generatedAt: '2024-01-01T00:00:00Z',
        gapRadar: { '信息流': 0.3, '决策权': 0.8, '信任与心理安全': 0.5 },
      }), 'ek-3');
      archiveDiagnosis(makeReport({
        generatedAt: '2024-06-01T00:00:00Z',
        gapRadar: { '信息流': 0.72, '决策权': 0.35, '信任与心理安全': 0.5 },
      }), 'ek-3');

      const knowledge = extractKnowledge('ek-3');
      expect(knowledge.improvedDimensions).toContain('信息流');
      expect(knowledge.degradedDimensions).toContain('决策权');
    });

    it('calculates positive maturity trend for overall improvement', () => {
      archiveDiagnosis(makeReport({
        generatedAt: '2024-01-01T00:00:00Z',
        gapRadar: { '信息流': 0.3, '决策权': 0.4 },
      }), 'ek-4');
      archiveDiagnosis(makeReport({
        generatedAt: '2024-06-01T00:00:00Z',
        gapRadar: { '信息流': 0.8, '决策权': 0.8 },
      }), 'ek-4');

      const knowledge = extractKnowledge('ek-4');
      expect(knowledge.maturityTrend).toBeGreaterThan(0);
    });

    it('calculates negative maturity trend for overall degradation', () => {
      archiveDiagnosis(makeReport({
        generatedAt: '2024-01-01T00:00:00Z',
        gapRadar: { '信息流': 0.8, '决策权': 0.7 },
      }), 'ek-5');
      archiveDiagnosis(makeReport({
        generatedAt: '2024-06-01T00:00:00Z',
        gapRadar: { '信息流': 0.3, '决策权': 0.2 },
      }), 'ek-5');

      const knowledge = extractKnowledge('ek-5');
      expect(knowledge.maturityTrend).toBeLessThan(0);
    });
  });
});
