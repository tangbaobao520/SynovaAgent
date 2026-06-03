/**
 * graph-monitor.test.ts — B3 实时异常检测测试 (铁律 0-2: 测试先行)
 */
import { createGraphStore, type GraphStore } from '../graph-store';
import { monitorEdgeWeight, detectCentralityShift, runMonitorTick } from '../graph-monitor';
import { degreeCentrality } from '../graph-query';

function setup(): { store: GraphStore; ids: Record<string,string> } {
  const BetterSqlite3 = require('better-sqlite3');
  const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
  const g = 'org-test';
  const a = store.createNode('Person', { name: 'Alice' }, g);
  const b = store.createNode('Person', { name: 'Bob' }, g);
  const c = store.createNode('Person', { name: 'Carol' }, g);
  const team = store.createNode('Team', { name: 'Engineering', teamType: 'permanent' }, g);
  store.createEdge('INTERACTS_WITH', a, b, 0.9, { channel: 'direct_message' }, g);
  store.createEdge('INTERACTS_WITH', b, c, 0.15, { channel: 'direct_message' }, g); // weak edge
  store.createEdge('BELONGS_TO', a, team, 0.8, {}, g);
  return { store, ids: { a, b, c } };
}

describe('monitorEdgeWeight', () => {
  it('Given weak edges, When threshold=0.2, Then returns alerts for edges below threshold', () => {
    const { store } = setup();
    const alerts = monitorEdgeWeight(store, 'INTERACTS_WITH', 0.2, 'org-test');
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].severity).toBeDefined();
  });

  it('Given all strong edges, When threshold=0.05, Then returns empty', () => {
    const BetterSqlite3 = require('better-sqlite3');
    const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
    const a = store.createNode('Person', { name: 'A' }, 'g');
    const b = store.createNode('Person', { name: 'B' }, 'g');
    store.createEdge('INTERACTS_WITH', a, b, 0.95, { channel: 'direct_message' }, 'g');
    const alerts = monitorEdgeWeight(store, 'INTERACTS_WITH', 0.1, 'g');
    expect(alerts).toHaveLength(0);
  });
});

describe('detectCentralityShift', () => {
  it('Given nodes with different centrality, When shift threshold exceeded, Then returns alert', () => {
    const { store, ids } = setup();
    const alerts = detectCentralityShift(store, 0.3, 'org-test');
    expect(Array.isArray(alerts)).toBe(true);
  });

  it('Given empty graph, When called, Then returns empty', () => {
    const BetterSqlite3 = require('better-sqlite3');
    const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
    expect(detectCentralityShift(store, 0.3, 'empty')).toHaveLength(0);
  });
});

describe('runMonitorTick', () => {
  it('Given graph, When runMonitorTick called, Then returns combined alerts', () => {
    const { store } = setup();
    const alerts = runMonitorTick(store, 'org-test', { edgeTypes: ['INTERACTS_WITH'], weightThreshold: 0.2, centralityShiftThreshold: 0.3 });
    expect(Array.isArray(alerts)).toBe(true);
    expect(alerts.length).toBeGreaterThanOrEqual(1);
  });

  it('Given empty graph, When runMonitorTick called, Then returns empty', () => {
    const BetterSqlite3 = require('better-sqlite3');
    const store = createGraphStore('sqlite', new BetterSqlite3(':memory:'));
    const alerts = runMonitorTick(store, 'empty', { edgeTypes: ['INTERACTS_WITH'], weightThreshold: 0.2, centralityShiftThreshold: 0.3 });
    expect(alerts).toHaveLength(0);
  });
});
