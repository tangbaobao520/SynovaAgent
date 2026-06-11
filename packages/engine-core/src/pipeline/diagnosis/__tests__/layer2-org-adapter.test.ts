/**
 * layer2-org-adapter.test.ts — 组织自适应测试 (Phase 2.2, iron law 0-2 Step 2)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { OrgAdapter } from '../layer2-org-adapter';
import { FeedbackStore } from '../feedback-persistence';
import type { DiagnosticRule } from '../rule-registry';

function setupDb() {
  const BetterSqlite3 = require('better-sqlite3');
  return new BetterSqlite3(':memory:');
}

function makeRule(overrides = {}): DiagnosticRule {
  return {
    id: 'r1', name: 'Test', source: 'expert_template', status: 'active',
    confidence: 0.8, version: 1, triggerOn: 'edge_weight_low', minSeverity: 'medium',
    action: { title: 'Test', description: '', priority: 'medium', assigneeRole: 'TL', estimatedHours: 1 },
    cooldownMs: 86400000,
    ...overrides,
  };
}

// ═══ IQR Threshold Calibration ═══

describe('OrgAdapter — IQR thresholds', () => {
  it('Given >=10 data points, When calibrated, Then returns IQR-based threshold', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    const values = [0.5, 0.6, 0.7, 0.7, 0.8, 0.8, 0.8, 0.9, 0.9, 1.5]; // 10 points, extreme 1.5
    const result = adapter['calibrateThreshold'](values, 0.5);
    // median ≈ 0.8, Q1 ≈ 0.7, Q3 ≈ 0.9, IQR ≈ 0.2
    // threshold = 0.8 - 1.5×0.2 = 0.5
    expect(result).toBeGreaterThan(0.4);
    expect(result).toBeLessThan(0.7);
  });

  it('Given <10 data points, When calibrated, Then returns global default', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    const result = adapter['calibrateThreshold']([0.5, 0.6, 0.7], 0.4);
    expect(result).toBe(0.4); // global default
  });

  it('Given data with extreme outliers, When using IQR, Then threshold robust vs mean-based', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    const values = [0.5, 0.6, 0.7, 0.7, 0.8, 0.8, 0.8, 0.9, 0.9, 9.9]; // extreme 9.9
    const iqrResult = adapter['calibrateThreshold'](values, 0.5);
    // mean-based would be pulled to ~2.1, IQR should stay reasonable
    expect(iqrResult).toBeLessThan(1.0);
  });
});

// ═══ Counterfactual Confidence ═══

describe('OrgAdapter — counterfactual confidence', () => {
  it('Given high adoption + high improvement, When adjusted, Then confidence rises', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    const rule = makeRule({ confidence: 0.7 });
    const result = adapter['adjustConfidence'](rule, 0.8, 0.75);
    // 0.7 + (0.8-0.5)*0.1 + (0.75-0.5)*0.1 = 0.7 + 0.03 + 0.025 = 0.755
    expect(result).toBeGreaterThan(0.7);
  });

  it('Given low adoption + low improvement, When adjusted, Then confidence drops', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    const rule = makeRule({ confidence: 0.7 });
    const result = adapter['adjustConfidence'](rule, 0.3, 0.2);
    // 0.7 + (0.3-0.5)*0.1 + (0.2-0.5)*0.1 = 0.7 - 0.02 - 0.03 = 0.65
    expect(result).toBeLessThan(0.7);
  });

  it('Given rule not executed + metric worsened, When checked, Then records but no confidence change', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    const rule = makeRule({ confidence: 0.7 });
    // isWorsened = true, wasExecuted = false
    const result = adapter['checkCounterfactual'](rule, false, true);
    expect(result.confidenceAdjusted).toBe(0); // no change
    expect(result.recorded).toBe(true); // recorded for analysis
  });

  it('Given rule not executed + metric unchanged, When checked, Then confidence drops 0.02', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    const rule = makeRule({ confidence: 0.7 });
    const result = adapter['checkCounterfactual'](rule, false, false);
    expect(result.confidenceAdjusted).toBe(-0.02);
  });
});

// ═══ Terminology ═══

describe('OrgAdapter — terminology', () => {
  it('Given terminology with context fields, When saved and restored, Then all fields preserved', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    adapter.updateTerminology([
      { userTerm: '协同效率', engineTerm: 'collaboration_efficiency', contextType: 'diagnosis', contextId: 'diag-1' },
    ]);
    const terms = adapter['loadTerminology']();
    expect(terms).toHaveLength(1);
    expect(terms[0].contextType).toBe('diagnosis');
    expect(terms[0].contextId).toBe('diag-1');
  });

  it('Given terminology without context fields, When saved, Then optional fields are null', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    adapter.updateTerminology([{ userTerm: '协同', engineTerm: 'collab' }]);
    const terms = adapter['loadTerminology']();
    expect(terms[0].contextType).toBeUndefined();
    expect(terms[0].contextId).toBeUndefined();
  });
});

// ═══ getRuntimeConfig Loading Order ═══

describe('OrgAdapter — getRuntimeConfig loading order', () => {
  it('Given org override, When getRuntimeConfig, Then override wins over default', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    // Simulate persisting an override
    adapter['saveOrgConfig']({ thresholds: { 'dim_a': 0.75 } });
    const config = adapter.getRuntimeConfig();
    expect(config.thresholds['dim_a']).toBe(0.75);
  });

  it('Given no org override, When getRuntimeConfig, Then uses posture-weights default', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-2', db);
    const config = adapter.getRuntimeConfig();
    // Returns default from posture-weights
    expect(config.thresholds).toBeDefined();
    expect(typeof config.thresholds['collaboration']).toBe('number');
  });

  it('Given org overrides one key, When getRuntimeConfig, Then other keys use default', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    adapter['saveOrgConfig']({ thresholds: { 'dim_a': 0.75 } });
    const config = adapter.getRuntimeConfig();
    expect(config.thresholds['dim_a']).toBe(0.75); // overridden
    expect(typeof config.thresholds['collaboration']).toBe('number'); // default
  });
});

// ═══ Deterioration Detection ═══

describe('OrgAdapter — deterioration detection', () => {
  it('Given score 0.90 vs baseline 1.00, When checked, Then deteriorated (10% > 5%)', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    expect(adapter['isDeteriorated'](0.90, 1.00)).toBe(true);
  });

  it('Given score 0.97 vs baseline 1.00, When checked, Then NOT deteriorated (3% < 5%)', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    expect(adapter['isDeteriorated'](0.97, 1.00)).toBe(false);
  });

  it('Given score below IQR lower bound, When checked, Then deteriorated', () => {
    const db = setupDb();
    const adapter = new OrgAdapter('team-1', db);
    // Q1=0.7, IQR=0.2, lower = 0.7-1.5*0.2 = 0.4, score=0.3 < 0.4
    expect(adapter['isDeterioratedByIQR'](0.3, 0.7, 0.2)).toBe(true);
  });
});
