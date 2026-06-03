import { createGraphStore } from '../graph-store';
import { createSnapshot, diffSnapshots, getNodeHistory, rollbackToSnapshot, clearVersioning } from '../ontology-versioning';

function setup() {
  const BetterSqlite3 = require('better-sqlite3');
  return createGraphStore('sqlite', new BetterSqlite3(':memory:'));
}

beforeEach(() => clearVersioning());

describe('createSnapshot', () => {
  it('captures graph state', () => {
    const store = setup(); const g = 'org';
    store.createNode('Person', { name: 'Alice' }, g);
    store.createNode('Team', { name: 'Engineering', teamType: 'permanent' }, g);
    const snap = createSnapshot(store, g);
    expect(snap.nodeCount).toBe(2);
    expect(snap.edgeCount).toBe(0);
  });
});

describe('diffSnapshots', () => {
  it('computes add/remove deltas', () => {
    const store = setup(); const g = 'org';
    const snap1 = createSnapshot(store, g);
    store.createNode('Person', { name: 'Bob' }, g);
    const snap2 = createSnapshot(store, g);
    const diff = diffSnapshots(snap1, snap2);
    expect(diff.addedNodes).toHaveLength(1);
    expect(diff.removedNodes).toHaveLength(0);
  });
});

describe('getNodeHistory', () => {
  it('tracks node props over time', () => {
    const store = setup(); const g = 'org';
    const id = store.createNode('Person', { name: 'Alice' }, g);
    store.updateNode(id, { name: 'Alice Updated' }, g);
    createSnapshot(store, g);
    const history = getNodeHistory(store, id, g);
    expect(history.length).toBeGreaterThanOrEqual(1);
  });
});

describe('rollbackToSnapshot', () => {
  it('restores previous state', () => {
    const store = setup(); const g = 'org-rollback';
    store.createNode('Person', { name: 'Alice' }, g);
    const snap = createSnapshot(store, g);
    store.createNode('Person', { name: 'Bob' }, g);
    expect(rollbackToSnapshot(store, snap.id, g)).toBe(true);
    // After rollback: Bob gone, Alice recreated with new ID (old ID hard-deleted)
    // Verify by query — 1 Person named Alice, 0 named Bob
    const persons = store.queryNodes('Person', undefined, g);
    expect(persons).toHaveLength(1);
    expect(persons[0].props.name).toBe('Alice');
  });

  it('returns false for unknown snapshot', () => {
    expect(rollbackToSnapshot(setup(), 'nonexistent', 'org')).toBe(false);
  });
});
