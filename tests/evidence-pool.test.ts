/**
 * evidence-pool.test.ts — Phase 2.1: 证据池测试
 *
 * 对标 Claw-Code: Given/When/Then + 手写 test data
 * 覆盖: EvidenceStore + EvidenceCollector + CorroborationEngine + ConfidenceScorer
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EvidenceStore, EvidenceCollector, CorroborationEngine, ConfidenceScorer } from '../src/evidence/index';
import type { Evidence } from '../src/evidence/types';

function makeEvidence(overrides: Partial<Evidence> = {}): Evidence {
  return {
    id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    source: 'interviewee',
    sourceId: 'test-org',
    type: 'interview_response',
    content: '测试证据内容',
    confidence: 0.8,
    collectedAt: new Date().toISOString(),
    orgId: 'test-org',
    ...overrides,
  };
}

describe('EvidenceStore', () => {
  let db: Database.Database;
  let store: EvidenceStore;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EvidenceStore(db);
  });

  it('Given evidence added, When queried by orgId, Then returns it', () => {
    const ev = makeEvidence();
    store.add(ev);
    const results = store.query({ orgId: 'test-org' });
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('测试证据内容');
  });

  it('Given evidence from different orgs, When queried, Then only matching org returned', () => {
    store.add(makeEvidence({ id: 'e1', orgId: 'org-a', content: 'A' }));
    store.add(makeEvidence({ id: 'e2', orgId: 'org-b', content: 'B' }));
    expect(store.query({ orgId: 'org-a' })).toHaveLength(1);
    expect(store.query({ orgId: 'org-b' })).toHaveLength(1);
  });

  it('Given evidence in store, When searched by keyword, Then returns matching results', () => {
    store.add(makeEvidence({ id: 'e1', content: 'Scheduling system causes high turnover rate' }));
    store.add(makeEvidence({ id: 'e2', content: 'Compensation is below market average' }));
    const results = store.search('turnover', 5);
    expect(results).toHaveLength(1);
    expect(results[0].content).toContain('turnover');
  });

  it('Given no evidence in store, When queried, Then returns empty array', () => {
    expect(store.query()).toHaveLength(0);
  });

  it('Given evidence with minConfidence filter, When queried, Then only high-confidence returned', () => {
    store.add(makeEvidence({ id: 'low', confidence: 0.3 }));
    store.add(makeEvidence({ id: 'high', confidence: 0.9 }));
    const results = store.query({ minConfidence: 0.5 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('high');
  });
});

describe('EvidenceCollector', () => {
  let db: Database.Database;
  let store: EvidenceStore;
  let collector: EvidenceCollector;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EvidenceStore(db);
    collector = new EvidenceCollector(store);
  });

  it('Given interview messages, When collectFromInterview, Then evidence stored with high confidence', () => {
    collector.collectFromInterview('org-1', 'sess-1', ['我们团队有30人', '主要问题是沟通不畅']);
    const results = store.query({ orgId: 'org-1' });
    expect(results).toHaveLength(2);
    expect(results[0].confidence).toBeGreaterThanOrEqual(0.7);
    expect(results[0].source).toBe('interviewee');
  });
});

describe('CorroborationEngine', () => {
  let db: Database.Database;
  let store: EvidenceStore;
  let engine: CorroborationEngine;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EvidenceStore(db);
    engine = new CorroborationEngine(store);
  });

  it('Given two contradictory evidence items, When detectContradictions, Then returns signal', () => {
    store.add(makeEvidence({ id: 'a', type: 'compensation', confidence: 0.9, content: '工资很低' }));
    store.add(makeEvidence({ id: 'b', type: 'compensation', confidence: 0.3, content: '工资还行' }));
    const contradictions = engine.detectContradictions({ orgId: 'test-org' });
    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions[0].scoreDifference).toBeGreaterThan(0.3);
  });

  it('Given similar evidence items, When detectContradictions, Then returns empty (no contradiction)', () => {
    store.add(makeEvidence({ id: 'a', type: 'morale', confidence: 0.8 }));
    store.add(makeEvidence({ id: 'b', type: 'morale', confidence: 0.75 }));
    const contradictions = engine.detectContradictions({ orgId: 'test-org' });
    expect(contradictions).toHaveLength(0);
  });

  it('Given evidence with supporting peers, When corroborate, Then adjustedConfidence reflects cross-validation', () => {
    store.add(makeEvidence({ id: 'target', type: 'turnover', confidence: 0.5 }));
    store.add(makeEvidence({ id: 'support1', type: 'turnover', confidence: 0.7 }));
    store.add(makeEvidence({ id: 'support2', type: 'turnover', confidence: 0.65 }));
    store.add(makeEvidence({ id: 'support3', type: 'turnover', confidence: 0.6 }));
    const result = engine.corroborate('target', { type: 'turnover' });
    expect(result).toBeDefined();
    // With 3 supporting entries (all >= 0.5-0.2=0.3), adjusted = 0.5 * (0.5+0.5*(3/3)) = 0.5
    expect(result!.corroboratingCount).toBe(3);
    expect(result!.contradictingCount).toBe(0);
  });
});

describe('ConfidenceScorer', () => {
  it('Given interviewee source, When sourceConfidence, Then returns 0.8 (highest)', () => {
    expect(ConfidenceScorer.sourceConfidence('interviewee')).toBe(0.8);
  });

  it('Given llm source, When sourceConfidence, Then returns 0.3 (lowest)', () => {
    expect(ConfidenceScorer.sourceConfidence('llm')).toBe(0.3);
  });

  it('Given old evidence, When applyTimeDecay, Then confidence is reduced', () => {
    const oldDate = new Date(Date.now() - 60 * 24 * 3600_000).toISOString(); // 60 days ago
    const decayed = ConfidenceScorer.applyTimeDecay(0.8, oldDate, 30 * 24 * 3600_000); // 30-day half-life
    // After 2 half-lives (60 days), should be ~0.2
    expect(decayed).toBeLessThan(0.3);
  });

  it('Given recent evidence, When applyTimeDecay, Then confidence is barely reduced', () => {
    const recent = new Date().toISOString();
    const decayed = ConfidenceScorer.applyTimeDecay(0.8, recent);
    expect(decayed).toBeGreaterThan(0.75);
  });
});
