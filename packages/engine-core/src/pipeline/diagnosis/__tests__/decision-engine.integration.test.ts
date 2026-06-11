import { createGraphStore } from '../graph-store';
import { runDecisionEngine, getDecisionActions, resolveAction, dismissAction, clearDecisionEngine } from '../decision-engine';

function setup() {
  const BetterSqlite3 = require('better-sqlite3');
  return createGraphStore('sqlite', new BetterSqlite3(':memory:'));
}

beforeEach(() => clearDecisionEngine());

describe('runDecisionEngine', () => {
  it('detects edge_weight_low and creates actions', () => {
    const store = setup(); const g = 'org';
    const a = store.createNode('Person', { name: 'A' }, g);
    const b = store.createNode('Person', { name: 'B' }, g);
    store.createEdge('INTERACTS_WITH', a, b, 0.1, { channel: 'direct_message' }, g); // weak edge
    const actions = runDecisionEngine(store, g);
    expect(actions.length).toBeGreaterThanOrEqual(1);
    expect(actions[0].priority).toBeDefined();
  });

  it('returns empty when no anomalies', () => {
    const store = setup(); const g = 'org';
    const actions = runDecisionEngine(store, g);
    expect(actions).toHaveLength(0);
  });
});

describe('action lifecycle', () => {
  it('resolves and dismisses actions', () => {
    const store = setup(); const g = 'org';
    const a = store.createNode('Person', { name: 'A' }, g);
    const b = store.createNode('Person', { name: 'B' }, g);
    store.createEdge('INTERACTS_WITH', a, b, 0.1, { channel: 'direct_message' }, g);
    const actions = runDecisionEngine(store, g);
    expect(actions.length).toBeGreaterThan(0);
    expect(resolveAction(actions[0].id)).toBe(true);
    expect(getDecisionActions('resolved')).toHaveLength(1);
    expect(dismissAction(actions[0].id)).toBe(true);
    expect(getDecisionActions('dismissed')).toHaveLength(1);
  });

  it('getDecisionActions filters by status', () => {
    const open = getDecisionActions('open');
    expect(Array.isArray(open)).toBe(true);
  });
});
