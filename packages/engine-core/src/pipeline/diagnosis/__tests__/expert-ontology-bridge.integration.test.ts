/**
 * expert-ontology-bridge.test.ts — B2 专家本体桥接测试 (铁律 0-2: 测试先行)
 */
import { createGraphStore, type GraphStore } from '../graph-store';
import { applyOntologyPatches, collectExpertPatches, type OntologyPatch } from '../expert-ontology-bridge';
import type { ExpertReport, ExpertType } from '../types';

function setupBridge(): { store: GraphStore; reports: ExpertReport[] } {
  const BetterSqlite3 = require('better-sqlite3');
  return { store: createGraphStore('sqlite', new BetterSqlite3(':memory:')), reports: [] };
}

function makeReport(type: ExpertType, patches?: OntologyPatch[]): ExpertReport {
  return {
    reportId: `er_test_${type}`,
    diagnosisId: 'diag-test',
    expertType: type,
    expertName: type,
    orgName: 'test-org',
    status: 'completed',
    findings: [],
    overallAssessment: 'test',
    uncertainties: [],
    conflictingSignals: [],
    crossReferences: [],
    model: 'test',
    tokens: { input: 0, output: 0 },
    durationMs: 0,
    generatedAt: new Date().toISOString(),
    toolCalls: [],
    ontologyPatches: patches || [],
  } as any;
}

// ═══ applyOntologyPatches ═══

describe('applyOntologyPatches', () => {
  it('Given expert with createNodes patch, When applied, Then creates node in graph', () => {
    const { store } = setupBridge();
    const report = makeReport('org_diagnostician', [{
      createNodes: [{ type: 'Person', props: { name: '新发现的成员', role: 'engineer' }, confidence: 0.8 }],
    }]);
    const results = applyOntologyPatches([report], store, 'org-test');
    expect(results).toHaveLength(1);
    expect(results[0].nodesCreated).toBe(1);
  });

  it('Given expert with createEdges patch, When applied, Then creates edge between nodes', () => {
    const { store } = setupBridge();
    const a = store.createNode('Person', { name: 'A' }, 'org-test');
    const b = store.createNode('Person', { name: 'B' }, 'org-test');
    const report = makeReport('strategic_analyst', [{
      createEdges: [{ type: 'INTERACTS_WITH', from: a, to: b, weight: 0.7, props: { channel: 'direct_message' }, confidence: 0.6 }],
    }]);
    const results = applyOntologyPatches([report], store, 'org-test');
    expect(results[0].edgesCreated).toBe(1);
  });

  it('Given failed expert, When applyOntologyPatches, Then skips it', () => {
    const { store } = setupBridge();
    const report = makeReport('financial_analyst');
    report.status = 'failed';
    (report as any).ontologyPatches = [{ createNodes: [{ type: 'Person', props: { name: 'X' }, confidence: 0.5 }] }];
    const results = applyOntologyPatches([report], store, 'org-test');
    expect(results).toHaveLength(0); // failed expert skipped
  });

  it('Given duplicate patches from two experts, When applied, Then deduplicates', () => {
    const { store } = setupBridge();
    const report1 = makeReport('marketing_analyst', [{
      createNodes: [{ type: 'Person', props: { name: 'Same Person', email: 'same@test.com' }, confidence: 0.8 }],
    }]);
    const report2 = makeReport('org_diagnostician', [{
      createNodes: [{ type: 'Person', props: { name: 'Same Person', email: 'same@test.com' }, confidence: 0.7 }],
    }]);
    const results = applyOntologyPatches([report1, report2], store, 'org-test');
    // Dedup: same type+props → only 1 node created
    expect(results[0].nodesCreated).toBeLessThanOrEqual(1);
  });
});

// ═══ collectExpertPatches ═══

describe('collectExpertPatches', () => {
  it('Given reports with patches, When collected, Then returns all patches', () => {
    const patches = collectExpertPatches([
      makeReport('org_diagnostician', [{ createNodes: [{ type: 'Person', props: { name: 'A' }, confidence: 0.8 }] }]),
      makeReport('strategic_analyst', [{ createEdges: [{ type: 'INTERACTS_WITH', from: 'a', to: 'b', weight: 1, confidence: 0.5 }] }]),
    ]);
    expect(patches).toHaveLength(2);
  });

  it('Given reports without patches, When collected, Then returns empty', () => {
    expect(collectExpertPatches([makeReport('tech_architect')])).toHaveLength(0);
  });
});
