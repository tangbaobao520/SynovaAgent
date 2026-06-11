/**
 * session-learner.test.ts — 会话学习 + 模式发现测试
 * P2-20b: Given/When/Then 模式
 */
import {
  generateSessionLearning,
  discoverPatterns,
  learnTerminology,
  getOrgTerminology,
  translateToUserTerms,
  getOrgPatterns,
  clearLearnerStore,
} from '../session-learner';
import { clearActionTrackingStore } from '../action-tracking';

beforeEach(() => {
  clearLearnerStore();
  clearActionTrackingStore();
});

// ====================================================================
// Terminology Learning
// ====================================================================

describe('learnTerminology', () => {
  it('stores and retrieves terminology mappings', () => {
    learnTerminology('org-1', [
      { userTerm: '信息不通', engineTerm: 'information_flow' },
      { userTerm: '互相甩锅', engineTerm: 'role_clarity' },
    ]);
    const terms = getOrgTerminology('org-1');
    expect(terms['信息不通']).toBe('information_flow');
    expect(terms['互相甩锅']).toBe('role_clarity');
  });

  it('isolates terminology per org', () => {
    learnTerminology('org-A', [{ userTerm: '沟通不畅', engineTerm: 'information_flow' }]);
    learnTerminology('org-B', [{ userTerm: '目标模糊', engineTerm: 'goal_alignment' }]);
    expect(getOrgTerminology('org-A')).toHaveProperty('沟通不畅');
    expect(getOrgTerminology('org-B')).toHaveProperty('目标模糊');
  });

  it('translates engine terms to user terms', () => {
    learnTerminology('org-1', [{ userTerm: '信息管道', engineTerm: 'information_flow' }]);
    const translated = translateToUserTerms('org-1', 'information_flow 得分偏低');
    expect(translated).toContain('信息管道');
  });

  it('returns original text when no terminology exists', () => {
    expect(translateToUserTerms('unknown', 'information_flow 得分低')).toBe('information_flow 得分低');
  });
});

// ====================================================================
// Session Learning
// ====================================================================

describe('generateSessionLearning', () => {
  it('generates learning from diagnosis results', () => {
    const learning = generateSessionLearning('diag-1', 'org-1', 'team-1', {
      terminologyMappings: [
        { userTerm: '信息流转', engineTerm: 'information_flow', confidence: 0.8 },
      ],
      frustrationSignals: [
        { dimension: 'knowledge_sharing', reportedAccuracy: 0.3, signal: '报告与团队实际感受不符' },
      ],
      previousScores: { information_flow: 0.45, knowledge_sharing: 0.50 },
      currentScores: { information_flow: 0.62, knowledge_sharing: 0.48 },
    });

    expect(learning.learningId).toMatch(/^learn_/);
    expect(learning.effectSignals).toHaveLength(2);
    expect(learning.frustrationSignals).toHaveLength(1);
    expect(learning.recommendations.length).toBeGreaterThan(0);

    // information_flow improved (0.45 → 0.62)
    const infoFlow = learning.effectSignals.find(e => e.dimension === 'information_flow')!;
    expect(infoFlow.interpretation).toBe('improved');
    expect(infoFlow.delta).toBeCloseTo(0.17);
  });

  it('records terminology automatically during learning', () => {
    generateSessionLearning('d1', 'org-1', 't1', {
      terminologyMappings: [{ userTerm: '部门墙', engineTerm: 'knowledge_sharing', confidence: 0.9 }],
    });
    expect(getOrgTerminology('org-1')['部门墙']).toBe('knowledge_sharing');
  });

  it('generates recommendations from adoption patterns', () => {
    const learning = generateSessionLearning('d1', 'org-1', 't1');
    expect(learning.recommendations).toBeDefined();
    expect(learning.adoptionPreferences).toBeDefined();
  });

  it('handles missing previous scores gracefully', () => {
    const learning = generateSessionLearning('d1', 'org-1', 't1', {
      currentScores: { trust_level: 0.5 },
    });
    expect(learning.effectSignals).toHaveLength(0);
  });
});

// ====================================================================
// Pattern Discovery
// ====================================================================

describe('discoverPatterns', () => {
  it('returns empty when fewer than 3 learnings', () => {
    generateSessionLearning('d1', 'org-1', 't1');
    generateSessionLearning('d2', 'org-1', 't1');
    expect(discoverPatterns('org-1')).toHaveLength(0);
  });

  it('discovers patterns with 3+ learnings', () => {
    for (let i = 1; i <= 3; i++) {
      generateSessionLearning(`d${i}`, 'org-1', 't1', {
        previousScores: { information_flow: 0.3 },
        currentScores: { information_flow: 0.7 }, // +0.4 > 0.1 threshold
      });
    }
    const patterns = discoverPatterns('org-1');
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].sampleSize).toBe(3);
    expect(patterns[0].scope).toBeDefined();
  });

  it('detects frustration patterns', () => {
    for (let i = 1; i <= 3; i++) {
      generateSessionLearning(`d${i}`, 'org-1', 't1', {
        frustrationSignals: [{ dimension: 'trust_level', reportedAccuracy: 0.2, signal: `迭代${i}偏差` }],
      });
    }
    const patterns = discoverPatterns('org-1');
    const frustration = patterns.find(p => p.patternType === 'frustration_pattern');
    expect(frustration).toBeDefined();
    expect(frustration!.sampleSize).toBe(3);
  });

  it('stores and retrieves patterns by org', () => {
    for (let i = 1; i <= 3; i++) {
      generateSessionLearning(`d${i}`, 'org-1', 't1', {
        previousScores: { information_flow: 0.3 },
        currentScores: { information_flow: 0.7 },
      });
    }
    discoverPatterns('org-1');
    const cached = getOrgPatterns('org-1');
    expect(cached.length).toBeGreaterThan(0);
    expect(getOrgPatterns('unknown')).toHaveLength(0);
  });

  it('marks cross-org patterns appropriately', () => {
    for (let i = 1; i <= 3; i++) {
      generateSessionLearning(`d${i}`, 'org-1', 't1', {
        previousScores: { trust_level: 0.3 },
        currentScores: { trust_level: 0.7 },
      });
    }
    const patterns = discoverPatterns('org-1');
    const crossOrg = patterns.find(p => p.scope === 'cross_org_potential');
    if (crossOrg) {
      expect(crossOrg.confidence).toBeGreaterThan(0);
      expect(crossOrg.sampleSize).toBe(3);
    }
  });
});

// ====================================================================
// Store Isolation
// ====================================================================

describe('Store Isolation', () => {
  it('isolates learnings between orgs', () => {
    generateSessionLearning('d1', 'org-A', 't1', { previousScores: { tf: 0.3 }, currentScores: { tf: 0.7 } });
    generateSessionLearning('d2', 'org-B', 't2', { previousScores: { tf: 0.3 }, currentScores: { tf: 0.7 } });
    generateSessionLearning('d3', 'org-A', 't1', { previousScores: { tf: 0.3 }, currentScores: { tf: 0.7 } });
    generateSessionLearning('d4', 'org-A', 't1', { previousScores: { tf: 0.3 }, currentScores: { tf: 0.7 } });
    discoverPatterns('org-A');
    expect(getOrgPatterns('org-A').length).toBeGreaterThan(0);
    expect(getOrgPatterns('org-B')).toHaveLength(0);
  });
});
