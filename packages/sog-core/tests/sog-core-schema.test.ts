/**
 * sog-core-schema.test.ts — SOG-Core Schema 测试 (Task 1, iron law 0-2 Step 2)
 */
import { describe, it, expect } from 'vitest';
import {
  SOGNodeType, SOGEdgeType, SOG_CORE_VERSION,
  NODE_VALIDATORS, EDGE_VALIDATORS,
  EDGE_ENDPOINT_MAP, validateEdgeEndpoints,
  SOGValidationError,
} from '../sog-core-schema';

// ═══ Enums ═══

describe('SOGNodeType', () => {
  it('has exactly 14 values', () => {
    expect(Object.values(SOGNodeType)).toHaveLength(14);
  });
  it('includes all required types', () => {
    expect(SOGNodeType.PERSON).toBe('Person');
    expect(SOGNodeType.LOCATION).toBe('Location');
    expect(SOGNodeType.GOAL).toBe('Goal');
    expect(SOGNodeType.CAPABILITY).toBe('Capability');
    expect(SOGNodeType.RISK).toBe('Risk');
    expect(SOGNodeType.COMPLIANCE).toBe('Compliance');
  });
});

describe('SOGEdgeType', () => {
  it('has exactly 10 values', () => {
    expect(Object.values(SOGEdgeType)).toHaveLength(10);
  });
  it('includes new types', () => {
    expect(SOGEdgeType.ALIGNS_WITH).toBe('ALIGNS_WITH');
    expect(SOGEdgeType.PROVIDES).toBe('PROVIDES');
  });
});

describe('SOG_CORE_VERSION', () => {
  it('is 1.0.0', () => { expect(SOG_CORE_VERSION).toBe('1.0.0'); });
});

// ═══ Node Validators — 合法 ═══

describe('NODE_VALIDATORS — valid', () => {
  const cases: Array<[SOGNodeType, Record<string, unknown>]> = [
    [SOGNodeType.PERSON,      { name: 'Alice' }],
    [SOGNodeType.TEAM,        { name: 'Engineering', teamType: 'permanent' }],
    [SOGNodeType.AGENT,       { name: 'Bot', agentType: 'internal' }],
    [SOGNodeType.TOOL,        { name: 'Slack', category: 'communication' }],
    [SOGNodeType.CLIENT,      { name: 'Acme', entityType: 'external' }],
    [SOGNodeType.PROCESS,     { name: 'Deploy', processType: 'deployment' }],
    [SOGNodeType.EVENT,       { eventType: 'deployment', timestamp: '2026-01-01T00:00:00Z' }],
    [SOGNodeType.DOCUMENT,    { name: 'PRD', docType: 'prd' }],
    [SOGNodeType.FINANCIAL,   { financialType: 'token_account' }],
    [SOGNodeType.LOCATION,    { locationType: 'office' }],
    [SOGNodeType.GOAL,        { goalType: 'okr', description: 'Grow 30%' }],
    [SOGNodeType.CAPABILITY,  { name: 'Go', category: 'technical' }],
    [SOGNodeType.RISK,        { riskType: 'financial', severity: 'high', status: 'active' }],
    [SOGNodeType.COMPLIANCE,  { name: 'SOC2', complianceType: 'standard', status: 'compliant' }],
  ];
  for (const [type, props] of cases) {
    it(`${type}: valid props pass`, () => {
      expect(NODE_VALIDATORS[type](props)).toBe(true);
    });
  }
});

// ═══ Node Validators — 非法 ═══

describe('NODE_VALIDATORS — invalid', () => {
  it('Person: missing name fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.PERSON]({})).toBe(false);
  });
  it('Team: missing teamType fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.TEAM]({ name: 'X' })).toBe(false);
  });
  it('Team: empty name fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.TEAM]({ name: '', teamType: 'permanent' })).toBe(false);
  });
  it('Agent: missing agentType fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.AGENT]({ name: 'X' })).toBe(false);
  });
  it('Event: missing timestamp fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.EVENT]({ eventType: 'deployment' })).toBe(false);
  });
  it('Goal: missing description fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.GOAL]({ goalType: 'okr' })).toBe(false);
  });
  it('Risk: missing status fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.RISK]({ riskType: 'x', severity: 'low' })).toBe(false);
  });
  it('Compliance: missing status fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.COMPLIANCE]({ name: 'X', complianceType: 'regulation' })).toBe(false);
  });
  it('Financial: missing financialType fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.FINANCIAL]({})).toBe(false);
  });
  it('Location: missing locationType fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.LOCATION]({})).toBe(false);
  });
  it('Capability: missing category fails', () => {
    expect(NODE_VALIDATORS[SOGNodeType.CAPABILITY]({ name: 'X' })).toBe(false);
  });
});

// ═══ Edge Validators — 合法 ═══

describe('EDGE_VALIDATORS — valid', () => {
  it('INTERACTS_WITH: valid with channel', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.INTERACTS_WITH]({ channel: 'direct_message' })).toBe(true);
  });
  it('BELONGS_TO: valid with no props (all optional)', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.BELONGS_TO]({})).toBe(true);
  });
  it('OWNS: valid with ownershipType', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.OWNS]({ ownershipType: 'manages' })).toBe(true);
  });
  it('CORRESPONDS_TO: valid with correspondenceType + confidence', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.CORRESPONDS_TO]({ correspondenceType: 'related', confidence: 0.9 })).toBe(true);
  });
  it('CONSUMES: valid with amount + period', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.CONSUMES]({ amount: 100, period: 'P1M' })).toBe(true);
  });
  it('ALIGNS_WITH: valid with alignmentStrength + alignmentType', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.ALIGNS_WITH]({ alignmentStrength: 0.8, alignmentType: 'direct' })).toBe(true);
  });
  it('PROVIDES: valid with no props (all optional)', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.PROVIDES]({})).toBe(true);
  });
});

// ═══ Edge Validators — 非法 ═══

describe('EDGE_VALIDATORS — invalid', () => {
  it('INTERACTS_WITH: missing channel fails', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.INTERACTS_WITH]({})).toBe(false);
  });
  it('OWNS: missing ownershipType fails', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.OWNS]({})).toBe(false);
  });
  it('AFFECTS: missing direction fails', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.AFFECTS]({})).toBe(false);
  });
  it('CORRESPONDS_TO: missing confidence fails', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.CORRESPONDS_TO]({ correspondenceType: 'related' })).toBe(false);
  });
  it('CONSUMES: missing amount fails', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.CONSUMES]({ period: 'P1M' })).toBe(false);
  });
  it('ALIGNS_WITH: missing alignmentStrength fails', () => {
    expect(EDGE_VALIDATORS[SOGEdgeType.ALIGNS_WITH]({ alignmentType: 'direct' })).toBe(false);
  });
});

// ═══ EDGE_ENDPOINT_MAP — 正例 ═══

describe('EDGE_ENDPOINT_MAP — valid combinations', () => {
  const valid: Array<[SOGEdgeType, SOGNodeType, SOGNodeType]> = [
    [SOGEdgeType.INTERACTS_WITH,  SOGNodeType.PERSON, SOGNodeType.AGENT],
    [SOGEdgeType.BELONGS_TO,      SOGNodeType.PERSON, SOGNodeType.TEAM],
    [SOGEdgeType.OWNS,            SOGNodeType.AGENT,  SOGNodeType.PROCESS],  // Agent→Process
    [SOGEdgeType.OWNS,            SOGNodeType.PERSON, SOGNodeType.DOCUMENT], // Person→Document
    [SOGEdgeType.TRIGGERS,        SOGNodeType.EVENT,  SOGNodeType.PROCESS],
    [SOGEdgeType.AFFECTS,         SOGNodeType.PROCESS,SOGNodeType.RISK],
    [SOGEdgeType.DEPENDS_ON,      SOGNodeType.TOOL,   SOGNodeType.AGENT],
    [SOGEdgeType.CORRESPONDS_TO,  SOGNodeType.EVENT,  SOGNodeType.GOAL],
    [SOGEdgeType.CONSUMES,        SOGNodeType.AGENT,  SOGNodeType.FINANCIAL],
    [SOGEdgeType.ALIGNS_WITH,     SOGNodeType.GOAL,   SOGNodeType.TEAM],
    [SOGEdgeType.ALIGNS_WITH,     SOGNodeType.TEAM,   SOGNodeType.GOAL],     // 反向
    [SOGEdgeType.PROVIDES,        SOGNodeType.PERSON, SOGNodeType.CAPABILITY],
  ];
  for (const [edge, from, to] of valid) {
    it(`${edge}: ${from} → ${to} is valid`, () => {
      expect(validateEdgeEndpoints(edge, from, to)).toBe(true);
    });
  }
});

// ═══ EDGE_ENDPOINT_MAP — 反例 ═══

describe('EDGE_ENDPOINT_MAP — invalid combinations', () => {
  const invalid: Array<[SOGEdgeType, SOGNodeType, SOGNodeType]> = [
    [SOGEdgeType.INTERACTS_WITH,  SOGNodeType.TEAM,   SOGNodeType.PERSON],   // Team not allowed
    [SOGEdgeType.BELONGS_TO,      SOGNodeType.EVENT,  SOGNodeType.TEAM],     // Event can't belong
    [SOGEdgeType.OWNS,            SOGNodeType.EVENT,  SOGNodeType.PROCESS],  // Event can't own
    [SOGEdgeType.TRIGGERS,        SOGNodeType.PERSON, SOGNodeType.EVENT],    // Person can't trigger
    [SOGEdgeType.AFFECTS,         SOGNodeType.AGENT,  SOGNodeType.FINANCIAL],// Agent can't affect
    [SOGEdgeType.DEPENDS_ON,      SOGNodeType.PERSON, SOGNodeType.TOOL],     // Person can't depend
    [SOGEdgeType.CORRESPONDS_TO,  SOGNodeType.PERSON, SOGNodeType.EVENT],    // Person can't correspond
    [SOGEdgeType.CONSUMES,        SOGNodeType.TEAM,   SOGNodeType.FINANCIAL],// Team can't consume
    [SOGEdgeType.PROVIDES,        SOGNodeType.EVENT,  SOGNodeType.CAPABILITY],// Event can't provide
    [SOGEdgeType.BELONGS_TO,      SOGNodeType.PERSON, SOGNodeType.PERSON],   // Self-belong
  ];
  for (const [edge, from, to] of invalid) {
    it(`${edge}: ${from} → ${to} is INVALID`, () => {
      expect(validateEdgeEndpoints(edge, from, to)).toBe(false);
    });
  }
});

// ═══ EDGE_ENDPOINT_MAP — coverage ═══

describe('EDGE_ENDPOINT_MAP — complete coverage', () => {
  it('all 10 edge types are defined in the map', () => {
    for (const edge of Object.values(SOGEdgeType)) {
      expect(EDGE_ENDPOINT_MAP[edge]).toBeDefined();
    }
  });
});

// ═══ SOGValidationError ═══

describe('SOGValidationError', () => {
  it('has correct code, details, timestamp', () => {
    const err = new SOGValidationError('missing name');
    expect(err.code).toBe('SOG_VALIDATION_ERROR');
    expect(err.details).toBe('missing name');
    expect(err.timestamp).toBeTruthy();
    expect(err).toBeInstanceOf(Error);
  });
});
