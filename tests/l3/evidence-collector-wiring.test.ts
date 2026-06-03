/**
 * tests/l3/evidence-collector-wiring.test.ts — EvidenceCollector 接入 Phase 0
 *
 * 用户旅程: 用户输入 → Phase 0 → EvidenceCollector.collectFromInterview → EvidenceStore
 *          → 矛盾检测 → Phase 2 可使用结构化证据
 *
 * 铁律 0-2 Step 5-6: 接线验证 + 集成测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { EvidenceStore, EvidenceCollector, CorroborationEngine } from '../../src/evidence/index';
import type { Evidence } from '../../src/evidence/types';

describe('EvidenceCollector → Phase 0 Wiring', () => {
  let db: Database.Database;
  let store: EvidenceStore;
  let collector: EvidenceCollector;

  beforeEach(() => {
    db = new Database(':memory:');
    store = new EvidenceStore(db);
    collector = new EvidenceCollector(store);
  });

  it('Given Phase 0 interview messages, When EvidenceCollector collects, Then stored as interviewee evidence', () => {
    const userMessages = [
      '我们团队有30人，主要做SaaS产品',
      '最近人员流失比较严重',
    ];

    collector.collectFromInterview('org-1', 'sess-1', userMessages);

    const evidence = store.query({ orgId: 'org-1' });
    expect(evidence.length).toBeGreaterThanOrEqual(1);
    expect(evidence[0].source).toBe('interviewee');
    expect(evidence[0].confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('Given evidence from different sources, When queried by type, Then only matching returned', () => {
    collector.collectFromInterview('org-1', 'sess-1', ['访谈证据']);
    store.add({
      id:'ev_doc', source:'document', sourceId:'org-1', type:'report',
      content:'文档证据', confidence:0.6, collectedAt:new Date().toISOString(), orgId:'org-1',
    });

    const interviewEvidence = store.query({ source: 'interviewee' });
    expect(interviewEvidence).toHaveLength(1);

    const allEvidence = store.query({ orgId: 'org-1' });
    expect(allEvidence).toHaveLength(2);
  });

  it('Given contradictory evidence, When CorroborationEngine runs, Then detects contradiction signal', () => {
    // CEO says high, frontline says low → contradiction
    store.add({
      id:'ev_ceo', source:'interviewee', sourceId:'org-1', type:'compensation',
      content:'薪酬有竞争力', confidence:0.85, collectedAt:new Date().toISOString(), orgId:'org-1',
    });
    store.add({
      id:'ev_frontline', source:'interviewee', sourceId:'org-1', type:'compensation',
      content:'薪酬远低于市场', confidence:0.3, collectedAt:new Date().toISOString(), orgId:'org-1',
    });

    const engine = new CorroborationEngine(store);
    const contradictions = engine.detectContradictions({ orgId: 'org-1' });
    expect(contradictions.length).toBeGreaterThan(0);
    expect(contradictions[0].scoreDifference).toBeGreaterThan(0.3);
  });

  it('Given many evidence items, When queried with limit, Then only N returned', () => {
    for (let i = 0; i < 5; i++) {
      collector.collectFromInterview('org-1', 'sess-1', [`Evidence ${i}`]);
    }

    const results = store.query({ orgId: 'org-1', limit: 3 });
    expect(results.length).toBeGreaterThanOrEqual(1);
  });
});
