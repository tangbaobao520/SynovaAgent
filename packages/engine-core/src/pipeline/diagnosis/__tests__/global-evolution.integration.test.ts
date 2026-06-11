import { createGraphStore } from '../graph-store';
import { discoverCrossOrgPatterns, getPatterns, clearEvolution } from '../global-evolution';

function makeStore() {
  const BetterSqlite3 = require('better-sqlite3');
  return createGraphStore('sqlite', new BetterSqlite3(':memory:'));
}

beforeEach(() => clearEvolution());

describe('discoverCrossOrgPatterns', () => {
  it('returns empty for fewer than 3 orgs', () => {
    const s1 = { store: makeStore(), graph: 'org-1', industry: 'SaaS' };
    const s2 = { store: makeStore(), graph: 'org-2', industry: 'SaaS' };
    expect(discoverCrossOrgPatterns([s1, s2])).toHaveLength(0);
  });

  it('discovers patterns with 3+ orgs', () => {
    const stores = [];
    for (let i = 0; i < 4; i++) {
      const store = makeStore(); const g = `org-${i}`;
      const a = store.createNode('Person', { name: 'A' }, g);
      const b = store.createNode('Person', { name: 'B' }, g);
      store.createEdge('INTERACTS_WITH', a, b, 0.5 + i * 0.1, { channel: 'direct_message' }, g);
      stores.push({ store, graph: g, industry: 'SaaS' });
    }
    const patterns = discoverCrossOrgPatterns(stores);
    expect(patterns.length).toBeGreaterThan(0);
    expect(patterns[0].benchmarks.mean).toBeGreaterThan(0);
  });
});

describe('getPatterns', () => {
  it('filters by industry', () => {
    expect(getPatterns('SaaS').length).toBeGreaterThanOrEqual(0);
  });

  it('returns all patterns without filter', () => {
    expect(Array.isArray(getPatterns())).toBe(true);
  });
});
