/**
 * evidence-manager.test.ts — 证据池管理器测试
 */

import { EvidenceManager } from '../evidence-manager';
import { DiagnosisEvidence } from '../types';

const ev = (overrides: Partial<DiagnosisEvidence> = {}): DiagnosisEvidence => ({
  id: `ev-${Math.random().toString(36).slice(2, 8)}`,
  source: 'module',
  content: 'test evidence',
  confidence: 0.8,
  timestamp: new Date().toISOString(),
  phase: 1,
  dimension: 'knowledge_sharing',
  isPrivate: false,
  ...overrides,
});

describe('EvidenceManager', () => {
  let manager: EvidenceManager;

  beforeEach(() => {
    manager = new EvidenceManager();
  });

  it('adds and retrieves evidence by id', () => {
    // Given: a piece of evidence
    const evidence = ev({ id: 'ev-001', content: 'unique content' });
    manager.add(evidence);

    // When: getting by id
    const retrieved = manager.getById('ev-001');

    // Then: same evidence returned
    expect(retrieved).not.toBeNull();
    expect(retrieved!.content).toBe('unique content');
  });

  it('deduplicates evidence with identical source + dimension + moduleId', () => {
    // Given: two evidence items with same dedup key
    const e1 = ev({ id: 'ev-001', source: 'module', dimension: 'knowledge_sharing', moduleId: 'mod-1', confidence: 0.6 });
    const e2 = ev({ id: 'ev-002', source: 'module', dimension: 'knowledge_sharing', moduleId: 'mod-1', confidence: 0.9 });

    // When: adding both
    manager.add(e1).add(e2);

    // Then: only one kept (the higher-confidence one)
    expect(manager.count).toBe(1);
    const kept = manager.getById('ev-001');
    expect(kept).not.toBeNull();
    expect(kept!.confidence).toBe(0.9);
  });

  it('keeps distinct evidence with different dimensions', () => {
    // Given: two evidence with different dimensions
    manager.add(ev({ dimension: 'knowledge_sharing', moduleId: 'mod-1' }));
    manager.add(ev({ dimension: 'decision_making', moduleId: 'mod-1' }));

    // Then: both kept
    expect(manager.count).toBe(2);
  });

  it('detects contradiction: module vs interviewee with large confidence gap', () => {
    // Given: module evidence (high confidence) and interviewee evidence (low confidence) on same dimension
    manager.add(ev({ id: 'ev-mod', source: 'module', dimension: 'trust_level', confidence: 0.9, moduleId: 'trust-analyzer' }));
    manager.add(ev({ id: 'ev-int', source: 'interviewee', dimension: 'trust_level', confidence: 0.3, roleId: 'CEO' }));

    // When: detecting contradictions
    const contradictions = manager.detectContradictions();

    // Then: contradiction found
    expect(contradictions.length).toBeGreaterThan(0);
    const c = contradictions[0];
    expect(c.severity).toBeGreaterThan(0.3);
    expect(c.dimension).toBe('trust_level');
  });

  it('detects contradiction: role-to-role cognitive gap', () => {
    // Given: CEO and IC have very different views
    manager.add(ev({ id: 'ev-ceo', source: 'interviewee', dimension: 'knowledge_sharing', confidence: 0.85, roleId: 'CEO' }));
    manager.add(ev({ id: 'ev-ic', source: 'interviewee', dimension: 'knowledge_sharing', confidence: 0.3, roleId: 'IC' }));

    // When: detecting
    const contradictions = manager.detectContradictions();

    // Then: role contradiction found
    const roleContradiction = contradictions.find(c => c.description.includes('CEO') && c.description.includes('IC'));
    expect(roleContradiction).toBeDefined();
  });

  it('marks evidence private with reason', () => {
    // Given: evidence in the pool
    manager.add(ev({ id: 'ev-001', isPrivate: false }));

    // When: marking private
    const result = manager.markPrivate('ev-001', '包含个人身份信息');

    // Then: marked successfully
    expect(result).toBe(true);
    const retrieved = manager.getById('ev-001');
    expect(retrieved!.isPrivate).toBe(true);
    expect(retrieved!.privateReason).toContain('个人身份信息');
  });

  it('returns false when marking non-existent evidence', () => {
    // Given: no evidence with this id
    // When: trying to mark
    const result = manager.markPrivate('nonexistent', 'reason');

    // Then: returns false
    expect(result).toBe(false);
  });

  it('traces source of evidence', () => {
    // Given: evidence from a specific module in Phase 1
    manager.add(ev({ id: 'ev-001', phase: 1, moduleId: 'knowledge-flow', source: 'module' }));

    // When: tracing
    const trace = manager.traceSource('ev-001');

    // Then: trace returns correct info
    expect(trace).not.toBeNull();
    expect(trace!.phase).toBe(1);
    expect(trace!.moduleId).toBe('knowledge-flow');
  });

  it('expires evidence older than maxAgeMs', () => {
    // Given: old evidence (2 days ago) and new evidence (now) in different dimensions to avoid dedup
    const oldTs = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    manager.add(ev({ id: 'ev-old', timestamp: oldTs, moduleId: 'old-mod', dimension: 'old_dim' }));
    manager.add(ev({ id: 'ev-new', timestamp: new Date().toISOString(), moduleId: 'new-mod', dimension: 'new_dim' }));

    // When: expiring evidence older than 1 day
    const removed = manager.expireByAge(24 * 60 * 60 * 1000);

    // Then: old evidence removed, new evidence kept
    expect(removed).toBe(1);
    expect(manager.getById('ev-old')).toBeNull();
    expect(manager.getById('ev-new')).not.toBeNull();
  });

  it('countByDimension returns correct distribution', () => {
    // Given: evidence across multiple dimensions
    manager.add(ev({ dimension: 'knowledge_sharing' }));
    manager.add(ev({ dimension: 'knowledge_sharing', moduleId: 'mod-2' }));
    manager.add(ev({ dimension: 'decision_making' }));

    // When: counting by dimension
    const counts = manager.countByDimension();

    // Then: correct counts
    expect(counts.knowledge_sharing).toBe(2);
    expect(counts.decision_making).toBe(1);
  });

  it('query filters by dimension', () => {
    // Given: mixed evidence
    manager.add(ev({ dimension: 'knowledge_sharing' }));
    manager.add(ev({ dimension: 'decision_making' }));
    manager.add(ev({ dimension: 'knowledge_sharing', moduleId: 'mod-2' }));

    // When: querying by dimension
    const results = manager.query({ dimension: 'knowledge_sharing' });

    // Then: only matching evidence
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.dimension).toBe('knowledge_sharing');
    }
  });

  it('query filters by minimum confidence', () => {
    // Given: evidence with varying confidence (different moduleId to avoid dedup)
    manager.add(ev({ id: 'ev-lo', confidence: 0.3, moduleId: 'mod-lo' }));
    manager.add(ev({ id: 'ev-hi', confidence: 0.9, moduleId: 'mod-hi' }));

    // When: querying with minConfidence = 0.5
    const results = manager.query({ minConfidence: 0.5 });

    // Then: only high-confidence evidence returned
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('ev-hi');
  });

  it('clear removes all evidence', () => {
    // Given: populated manager
    manager.add(ev()).add(ev());

    // When: clearing
    manager.clear();

    // Then: empty
    expect(manager.count).toBe(0);
  });
});
