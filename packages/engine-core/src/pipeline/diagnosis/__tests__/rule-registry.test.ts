/**
 * rule-registry.test.ts — 规则注册中心测试 (Phase 2.1, iron law 0-2 Step 2)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { RuleRegistry, type DiagnosticRule, type RuleEvolutionMeta, snapshotRule } from '../rule-registry';

function setup() {
  const BetterSqlite3 = require('better-sqlite3');
  return new RuleRegistry(new BetterSqlite3(':memory:'));
}

function makeAlert(type: string, severity: string, edgeType?: string) {
  return { id: 'a1', type, severity, edgeType, threshold: 0, message: '', timestamp: '' } as any;
}

// ═══ Registration + Listing ═══

describe('RuleRegistry — registration', () => {
  let registry: RuleRegistry;
  beforeEach(() => { registry = setup(); });

  it('Given empty registry, When listed, Then returns empty', () => {
    expect(registry.listRules()).toHaveLength(0);
  });

  it('Given registered rule, When listed, Then appears with all fields', () => {
    registry.register(makeRule('r1', 'expert_template'));
    const rules = registry.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('r1');
    expect(rules[0].source).toBe('expert_template');
    expect(rules[0].status).toBe('active');
  });

  it('Given multiple rules, When filtered by source, Then returns matching only', () => {
    registry.register(makeRule('r1', 'expert_template'));
    registry.register(makeRule('r2', 'engine_calibrated'));
    expect(registry.listRules({ source: 'expert_template' })).toHaveLength(1);
    expect(registry.listRules({ source: 'engine_calibrated' })).toHaveLength(1);
  });

  it('Given rule, When disabled and enabled, Then status changes', () => {
    registry.register(makeRule('r1'));
    registry.disableRule('r1');
    expect(registry.listRules()[0].status).toBe('disabled');
    registry.enableRule('r1');
    expect(registry.listRules()[0].status).toBe('active');
  });

  it('Given rule, When confidence updated, Then reflects new value', () => {
    registry.register(makeRule('r1'));
    registry.updateConfidence('r1', 0.85);
    expect(registry.listRules()[0].confidence).toBe(0.85);
  });
});

// ═══ getTriggeredRules ═══

describe('RuleRegistry — getTriggeredRules', () => {
  let registry: RuleRegistry;
  beforeEach(() => {
    registry = setup();
    registry.register({ ...makeRule('r-exact'), triggerOn: 'edge_weight_low', minSeverity: 'medium' });
    registry.register({ ...makeRule('r-wildcard'), triggerOn: '*', minSeverity: 'low' });
    registry.register({ ...makeRule('r-high'), triggerOn: 'centrality_shift', minSeverity: 'high' });
  });

  it('Given exact type match, When triggered, Then returns matching rule', () => {
    const result = registry.getTriggeredRules(makeAlert('edge_weight_low', 'medium'));
    expect(result.some(r => r.id === 'r-exact')).toBe(true);
  });

  it('Given wildcard triggerOn, When any alert, Then returns wildcard rule', () => {
    const result = registry.getTriggeredRules(makeAlert('unknown_type', 'low'));
    expect(result.some(r => r.id === 'r-wildcard')).toBe(true);
  });

  it('Given low severity alert, When high minSeverity rule exists, Then rule NOT returned', () => {
    const result = registry.getTriggeredRules(makeAlert('centrality_shift', 'low'));
    expect(result.some(r => r.id === 'r-high')).toBe(false);
  });

  it('Given high severity alert, When high minSeverity rule exists, Then rule IS returned', () => {
    const result = registry.getTriggeredRules(makeAlert('centrality_shift', 'critical'));
    expect(result.some(r => r.id === 'r-high')).toBe(true);
  });

  it('Given no matching rules, When triggered, Then returns empty array (no throw)', () => {
    const r2 = setup();
    r2.register({ ...makeRule('r-only'), triggerOn: 'centrality_shift', minSeverity: 'high' });
    const result = r2.getTriggeredRules(makeAlert('edge_weight_low', 'low'));
    expect(result).toHaveLength(0);
  });
});

// ═══ Evolution Meta + Version History ═══

describe('RuleRegistry — evolution meta', () => {
  let registry: RuleRegistry;
  beforeEach(() => { registry = setup(); });

  it('Given rule with evolutionMeta, When snapshot, Then previousVersions excluded', () => {
    const rule: DiagnosticRule = {
      ...makeRule('r1'),
      evolutionMeta: { previousVersions: ['v1', 'v2', 'v3'], calibrationOrgCount: 5, calibratedAt: '2026-01-01' },
    };
    const json = snapshotRule(rule);
    const parsed = JSON.parse(json);
    expect(parsed.evolutionMeta.previousVersions).toBeUndefined();
    expect(parsed.evolutionMeta.calibrationOrgCount).toBe(5);
  });

  it('Given 4th version created, When saved, Then only 3 previousVersions kept + overflow to rule_versions table', () => {
    registry.register(makeRule('r1'));
    registry.incrementVersion('r1'); // v2
    registry.incrementVersion('r1'); // v3
    registry.incrementVersion('r1'); // v4
    const rule = registry.listRules()[0];
    expect(rule.version).toBe(4);
    expect(rule.evolutionMeta?.previousVersions?.length).toBeLessThanOrEqual(3);
    // Check history table
    const history = registry.getVersionHistory('r1');
    expect(history.length).toBeGreaterThanOrEqual(2); // v1+v2 stored
  });

  it('Given rule persisted, When reloaded from DB, Then rule intact', () => {
    registry.register(makeRule('r1', 'expert_template'));
    const db = (registry as any).db;
    const registry2 = new RuleRegistry(db);
    const rules = registry2.listRules();
    expect(rules).toHaveLength(1);
    expect(rules[0].id).toBe('r1');
  });
});

// ═══ Helpers ═══

let _id = 0;
function makeRule(id: string, source: DiagnosticRule['source'] = 'expert_template'): DiagnosticRule {
  return {
    id, name: `Rule ${id}`, source,
    status: 'active', confidence: 0.8, version: 1,
    triggerOn: 'edge_weight_low',
    minSeverity: 'medium',
    action: { title: 'Test', description: '', priority: 'medium', assigneeRole: 'TL', estimatedHours: 1 },
    cooldownMs: 86400000,
  };
}
