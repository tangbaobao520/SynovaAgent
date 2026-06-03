/**
 * organization-knowledge-builder.test.ts — 组织知识库构建器测试
 */

import {
  addKnowledge,
  upsertKnowledge,
  getKnowledge,
  queryKnowledge,
  citeKnowledge,
  deleteKnowledge,
  getKnowledgeStats,
  resetKnowledge,
  extractFromDiagnosis,
} from '../organization-knowledge-builder';
import type { OrgKnowledgeEntry } from '../organization-knowledge-builder';

function makeEntry(overrides: Partial<Omit<OrgKnowledgeEntry, 'id' | 'citationCount' | 'version' | 'createdAt'>> = {}) {
  return {
    type: 'pattern' as const,
    title: '高效信息流模式',
    description: '通过定期1对1沟通确保信息对齐',
    sourceTeamId: 'team-1',
    dimensions: ['信息流'],
    tags: ['沟通', '信息流'],
    evidenceStrength: 0.85,
    applicableTo: ['startup', 'tech'] as ('startup' | 'sme' | 'enterprise' | 'tech' | 'non-tech')[],
    ...overrides,
  };
}

beforeEach(() => {
  resetKnowledge();
});

describe('organization-knowledge-builder', () => {
  describe('addKnowledge', () => {
    it('creates entry with auto-generated ID', () => {
      const entry = addKnowledge(makeEntry());
      expect(entry.id).toMatch(/^ok-/);
      expect(entry.type).toBe('pattern');
      expect(entry.citationCount).toBe(0);
      expect(entry.version).toBe(1);
      expect(entry.createdAt).toBeTruthy();
    });

    it('retrieves by ID after adding', () => {
      const entry = addKnowledge(makeEntry());
      const found = getKnowledge(entry.id);
      expect(found).not.toBeNull();
      expect(found!.title).toBe('高效信息流模式');
    });
  });

  describe('upsertKnowledge', () => {
    it('inserts new entry when ID does not exist', () => {
      const entry = upsertKnowledge('ok-custom', makeEntry());
      expect(entry.id).toBe('ok-custom');
      expect(entry.version).toBe(1);
      expect(entry.citationCount).toBe(0);
    });

    it('updates existing entry and increments version', () => {
      // Given: existing entry
      const first = upsertKnowledge('ok-custom', makeEntry());
      expect(first.version).toBe(1);

      // When: upsert with same ID but different data
      const updated = upsertKnowledge('ok-custom', makeEntry({ title: 'Updated Title', evidenceStrength: 0.9 }));
      expect(updated.id).toBe('ok-custom');
      expect(updated.version).toBe(2);
      expect(updated.title).toBe('Updated Title');
      expect(updated.evidenceStrength).toBe(0.9);
    });

    it('preserves citation count on update', () => {
      // Given: entry that has been cited
      upsertKnowledge('ok-custom', makeEntry());
      citeKnowledge('ok-custom');
      citeKnowledge('ok-custom');

      // When: updating
      const updated = upsertKnowledge('ok-custom', makeEntry());

      // Then: citations preserved, version bumped
      expect(updated.citationCount).toBe(2);
      expect(updated.version).toBe(2);
    });

    it('preserves original createdAt on update', () => {
      upsertKnowledge('ok-custom', makeEntry());
      const original = getKnowledge('ok-custom')!;

      const updated = upsertKnowledge('ok-custom', makeEntry({ title: 'Different' }));
      expect(updated.createdAt).toBe(original.createdAt);
    });
  });

  describe('getKnowledge', () => {
    it('returns null for unknown ID', () => {
      expect(getKnowledge('unknown')).toBeNull();
    });
  });

  describe('queryKnowledge', () => {
    it('filters by type', () => {
      addKnowledge(makeEntry({ type: 'pattern' }));
      addKnowledge(makeEntry({ type: 'antipattern', title: 'Bad Pattern' }));

      const results = queryKnowledge({ type: 'pattern' });
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('pattern');
    });

    it('filters by dimension', () => {
      addKnowledge(makeEntry({ dimensions: ['信息流'] }));
      addKnowledge(makeEntry({ dimensions: ['决策权'] }));

      const results = queryKnowledge({ dimensions: ['信息流'] });
      expect(results).toHaveLength(1);
      expect(results[0].dimensions).toContain('信息流');
    });

    it('matches when any of the requested dimensions overlap', () => {
      addKnowledge(makeEntry({ dimensions: ['信息流', '决策权'], title: 'Multi-dim' }));
      addKnowledge(makeEntry({ dimensions: ['信任与心理安全'], title: 'Trust only' }));

      const results = queryKnowledge({ dimensions: ['信息流'] });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Multi-dim');
    });

    it('filters by tags', () => {
      addKnowledge(makeEntry({ tags: ['沟通'] }));
      addKnowledge(makeEntry({ tags: ['报告'], title: 'Report' }));

      const results = queryKnowledge({ tags: ['沟通'] });
      expect(results).toHaveLength(1);
    });

    it('filters by applicableTo', () => {
      addKnowledge(makeEntry({ applicableTo: ['startup', 'tech'] }));
      addKnowledge(makeEntry({ applicableTo: ['enterprise'], title: 'Enterprise' }));

      const results = queryKnowledge({ applicableTo: 'enterprise' });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Enterprise');
    });

    it('filters by keyword in title', () => {
      addKnowledge(makeEntry({ title: '信息流优化', tags: [] }));
      addKnowledge(makeEntry({ title: '决策权分配', tags: [] }));

      const results = queryKnowledge({ keyword: '信息流' });
      expect(results).toHaveLength(1);
    });

    it('filters by keyword in description', () => {
      addKnowledge(makeEntry({ description: '定期1对1沟通', tags: [] }));
      addKnowledge(makeEntry({ description: '季度all-hands', title: 'B', tags: [] }));

      const results = queryKnowledge({ keyword: '沟通' });
      expect(results).toHaveLength(1);
    });

    it('filters by keyword in tags', () => {
      addKnowledge(makeEntry({ tags: ['engineering'], title: 'Eng pattern' }));
      addKnowledge(makeEntry({ tags: ['sales'], title: 'Sales tip' }));

      const results = queryKnowledge({ keyword: 'engine' });
      expect(results).toHaveLength(1);
    });

    it('filters by minimum evidence strength', () => {
      addKnowledge(makeEntry({ evidenceStrength: 0.9, title: 'Strong' }));
      addKnowledge(makeEntry({ evidenceStrength: 0.3, title: 'Weak' }));

      const results = queryKnowledge({ minEvidenceStrength: 0.5 });
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Strong');
    });

    it('sorts by citation count descending', () => {
      const a = addKnowledge(makeEntry({ title: 'A' }));
      const b = addKnowledge(makeEntry({ title: 'B' }));

      citeKnowledge(b.id);
      citeKnowledge(b.id);
      citeKnowledge(a.id);

      const results = queryKnowledge();
      // B (cited 2×) should come before A (cited 1×)
      expect(results[0].title).toBe('B');
      expect(results[1].title).toBe('A');
    });

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        addKnowledge(makeEntry({ title: `Entry ${i}` }));
      }

      expect(queryKnowledge({ limit: 2 })).toHaveLength(2);
    });
  });

  describe('citeKnowledge', () => {
    it('increments citation count', () => {
      const entry = addKnowledge(makeEntry());
      expect(citeKnowledge(entry.id)).toBe(true);
      expect(citeKnowledge(entry.id)).toBe(true);

      const updated = getKnowledge(entry.id);
      expect(updated!.citationCount).toBe(2);
    });

    it('returns false for unknown ID', () => {
      expect(citeKnowledge('unknown')).toBe(false);
    });
  });

  describe('deleteKnowledge', () => {
    it('removes entry and returns true', () => {
      const entry = addKnowledge(makeEntry());
      expect(deleteKnowledge(entry.id)).toBe(true);
      expect(getKnowledge(entry.id)).toBeNull();
    });

    it('returns false for unknown ID', () => {
      expect(deleteKnowledge('unknown')).toBe(false);
    });
  });

  describe('getKnowledgeStats', () => {
    it('returns correct totals and byType breakdown', () => {
      addKnowledge(makeEntry({ type: 'pattern' }));
      addKnowledge(makeEntry({ type: 'antipattern', title: 'Anti' }));
      addKnowledge(makeEntry({ type: 'pattern', title: 'Pattern 2' }));

      const stats = getKnowledgeStats();
      expect(stats.totalEntries).toBe(3);
      expect(stats.byType.pattern).toBe(2);
      expect(stats.byType.antipattern).toBe(1);
      expect(stats.byType.benchmark).toBe(0);
      expect(stats.byType.insight).toBe(0);
    });

    it('returns byDimension counts', () => {
      addKnowledge(makeEntry({ dimensions: ['信息流'] }));
      addKnowledge(makeEntry({ dimensions: ['信息流', '决策权'], title: 'B' }));

      const stats = getKnowledgeStats();
      expect(stats.byDimension['信息流']).toBe(2);
      expect(stats.byDimension['决策权']).toBe(1);
    });

    it('returns top cited entries (max 10)', () => {
      const a = addKnowledge(makeEntry({ title: 'A' }));
      const b = addKnowledge(makeEntry({ title: 'B' }));

      citeKnowledge(a.id);

      const stats = getKnowledgeStats();
      expect(stats.topCited[0].id).toBe(a.id);
    });
  });

  describe('extractFromDiagnosis', () => {
    it('extracts patterns from dimensions with score >= 0.7', () => {
      const entries = extractFromDiagnosis({
        teamId: 'team-1',
        dimensionScores: { '信息流': 0.9, '决策权': 0.4, '信任与心理安全': 0.8 },
        keyFindings: [],
        recommendations: [],
        teamContext: { size: 8, industry: 'SaaS', stage: 'startup', isTech: true },
      });

      const patterns = entries.filter(e => e.type === 'pattern');
      expect(patterns).toHaveLength(2);
      expect(patterns.some(p => p.dimensions.includes('信息流'))).toBe(true);
      expect(patterns.some(p => p.dimensions.includes('信任与心理安全'))).toBe(true);
      // 决策权 score=0.4 — not a pattern
      expect(patterns.some(p => p.dimensions.includes('决策权'))).toBe(false);
    });

    it('extracts antipatterns from dimensions with score <= 0.3', () => {
      const entries = extractFromDiagnosis({
        teamId: 'team-1',
        dimensionScores: { '信息流': 0.9, '决策权': 0.2, '信任与心理安全': 0.3 },
        keyFindings: [],
        recommendations: [],
        teamContext: { size: 8, industry: 'SaaS', stage: 'startup', isTech: true },
      });

      const antipatterns = entries.filter(e => e.type === 'antipattern');
      expect(antipatterns).toHaveLength(2);
      expect(antipatterns.some(p => p.dimensions.includes('决策权'))).toBe(true);
      expect(antipatterns.some(p => p.dimensions.includes('信任与心理安全'))).toBe(true);
    });

    it('always generates a benchmark entry', () => {
      const entries = extractFromDiagnosis({
        teamId: 'team-1',
        dimensionScores: {},
        keyFindings: [],
        recommendations: [],
        teamContext: { size: 5, industry: 'Finance', stage: 'enterprise', isTech: false },
      });

      const benchmarks = entries.filter(e => e.type === 'benchmark');
      expect(benchmarks).toHaveLength(1);
      expect(benchmarks[0].tags).toContain('Finance');
      expect(benchmarks[0].tags).toContain('enterprise');
    });

    it('extracts up to 3 key findings as insights', () => {
      const entries = extractFromDiagnosis({
        teamId: 'team-1',
        dimensionScores: {},
        keyFindings: [
          '沟通渠道碎片化严重',
          '技术决策权下放不足',
          '入职流程缺乏结构',
          '加班文化影响效率',
        ],
        recommendations: [],
        teamContext: { size: 12, industry: 'Tech', stage: 'sme', isTech: true },
      });

      const insights = entries.filter(e => e.type === 'insight');
      expect(insights).toHaveLength(3); // max 3
      expect(insights[0].title).toContain('沟通');
    });

    it('includes correct applicableTo based on team context', () => {
      const entries = extractFromDiagnosis({
        teamId: 'team-1',
        dimensionScores: { '信息流': 0.9 },
        keyFindings: [],
        recommendations: [],
        teamContext: { size: 8, industry: 'SaaS', stage: 'startup', isTech: true },
      });

      // Every entry should have applicableTo matching team context
      for (const entry of entries) {
        expect(entry.applicableTo).toContain('startup');
        expect(entry.applicableTo).toContain('tech');
      }
    });

    it('sets evidence strength from dimension score for patterns', () => {
      const entries = extractFromDiagnosis({
        teamId: 'team-1',
        dimensionScores: { '信息流': 0.85 },
        keyFindings: [],
        recommendations: [],
        teamContext: { size: 8, industry: 'SaaS', stage: 'startup', isTech: true },
      });

      const pattern = entries.find(e => e.type === 'pattern');
      expect(pattern!.evidenceStrength).toBe(0.85);
    });

    it('sets evidence strength from inverse score for antipatterns', () => {
      const entries = extractFromDiagnosis({
        teamId: 'team-1',
        dimensionScores: { '决策权': 0.2 },
        keyFindings: [],
        recommendations: [],
        teamContext: { size: 8, industry: 'SaaS', stage: 'startup', isTech: true },
      });

      const antipattern = entries.find(e => e.type === 'antipattern');
      expect(antipattern!.evidenceStrength).toBe(0.8); // 1 - 0.2
    });
  });
});
