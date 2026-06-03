/**
 * tests/l3/corroboration-wiring.test.ts — CorroborationEngine 接入 Phase 3
 *
 * 矛盾检测 → 根因分析 → 跨证据交叉验证
 * 铁律 0-2 Step 5-6
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EvidenceStore, CorroborationEngine } from '../../src/evidence/index';
import type { Evidence } from '../../src/evidence/types';

describe('CorroborationEngine → Phase 3 Wiring', () => {
  let db: Database.Database;
  let store: EvidenceStore;
  let engine: CorroborationEngine;

  function add(overrides: Partial<Evidence>) {
    store.add({
      id: `ev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,6)}`,
      source:'interviewee', sourceId:'org-1', content:'test', confidence:0.8,
      collectedAt:new Date().toISOString(), orgId:'org-1', ...overrides,
    });
  }

  beforeEach(() => { db = new Database(':memory:'); store = new EvidenceStore(db); engine = new CorroborationEngine(store); });

  it('Given contradictory evidence, When detectContradictions, Then returns signals for Phase 3 root cause analysis', () => {
    add({ id:'e1', type:'compensation', content:'工资很低', confidence:0.9 });
    add({ id:'e2', type:'compensation', content:'工资还行', confidence:0.3 });
    const contradictions = engine.detectContradictions({ orgId:'org-1' });
    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions[0].scoreDifference).toBeGreaterThan(0.3);
  });

  it('Given corroborated evidence, When corroborate called, Then adjustedConfidence reflects cross-validation', () => {
    add({ id:'target', type:'turnover', confidence:0.5 });
    add({ id:'s1', type:'turnover', confidence:0.7 });
    add({ id:'s2', type:'turnover', confidence:0.65 });
    const result = engine.corroborate('target', { type:'turnover' });
    expect(result).toBeDefined();
    expect(result!.corroboratingCount).toBeGreaterThan(0);
  });

  it('Given no contradictory evidence, When detectContradictions, Then returns empty', () => {
    add({ id:'e1', type:'morale', confidence:0.8 });
    add({ id:'e2', type:'morale', confidence:0.75 });
    expect(engine.detectContradictions({ orgId:'org-1' })).toHaveLength(0);
  });

  it('Given no evidence at all, When detectContradictions, Then returns empty gracefully', () => {
    expect(engine.detectContradictions({ orgId:'org-1' })).toHaveLength(0);
  });
});
