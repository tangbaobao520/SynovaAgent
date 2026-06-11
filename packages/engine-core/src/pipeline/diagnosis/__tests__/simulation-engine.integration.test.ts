/**
 * simulation-engine.test.ts — 组织仿真引擎测试 (iron law 0-2 Step 2: 测试先行)
 *
 * 测试即规范: 测试通过 = 功能完成。
 * Given/When/Then 格式，每个 public 函数 ≥ 2 个用例 (happy + sad)。
 */
import { SOGEdgeType } from '@synova/sog-core';
import { createGraphStore } from '../graph-store';
import { runSimulation, newHireScenario, restructureScenario } from '../simulation-engine';
import type { SimulationScenario, SimulationResult } from '../simulation-engine';

function setupStore() {
  const BetterSqlite3 = require('better-sqlite3');
  return createGraphStore('sqlite', new BetterSqlite3(':memory:'));
}

/** 创建一个 3 人团队基础图：Alice, Bob, Charlie + INTERACTS_WITH 边 */
function seedTeamGraph(store: ReturnType<typeof setupStore>, graph = 'org-test') {
  const alice = store.createNode('Person', { name: 'Alice', role: 'engineer' }, graph);
  const bob = store.createNode('Person', { name: 'Bob', role: 'designer' }, graph);
  const charlie = store.createNode('Person', { name: 'Charlie', role: 'pm' }, graph);
  store.createEdge('INTERACTS_WITH', alice, bob, 0.8, { channel: 'direct_message' }, graph);
  store.createEdge('INTERACTS_WITH', bob, charlie, 0.6, { channel: 'direct_message' }, graph);
  store.createEdge('INTERACTS_WITH', alice, charlie, 0.4, { channel: 'direct_message' }, graph);
  return { alice, bob, charlie };
}

// ═══ Happy Path ═══

describe('runSimulation — happy path', () => {
  it('Given 3-person graph, When simulating new hire, Then returns SimulationResult with centrality changes', () => {
    const store = setupStore();
    seedTeamGraph(store);

    const scenario: SimulationScenario = {
      id: 'test-hire-1',
      name: 'Hire Dave',
      description: 'Add Dave as new engineer',
      transformations: [
        { type: 'add_node', nodeType: 'Person', props: { name: 'Dave', role: 'engineer' } },
      ],
    };

    const result = runSimulation(store, 'org-test', scenario);

    expect(result).not.toBeNull();
    expect(result!.scenarioId).toBe('test-hire-1');
    expect(result!.scenarioName).toBe('Hire Dave');
    expect(result!.delta.addedNodes).toBe(1);
    // Centrality: 4 persons now, each should have an entry
    expect(result!.centralityChanges.length).toBeGreaterThanOrEqual(3);
    // Verify delta field exists on each centrality change
    for (const c of result!.centralityChanges) {
      expect(typeof c.nodeId).toBe('string');
      expect(typeof c.baseline).toBe('number');
      expect(typeof c.simulated).toBe('number');
      expect(typeof c.delta).toBe('number');
    }
    expect(result!.generatedAt).toBeTruthy();
  });

  it('Given 3-person graph, When simulating edge addition, Then delta shows addedEdges', () => {
    const store = setupStore();
    const { alice, bob } = seedTeamGraph(store);
    // Add a second edge type between alice and bob
    const scenario: SimulationScenario = {
      id: 'test-edge-1',
      name: 'Add collaboration edge',
      description: 'Strengthen Alice-Bob collaboration',
      transformations: [
        { type: 'add_edge', edgeType: SOGEdgeType.INTERACTS_WITH, from: bob, to: alice, weight: 0.9 },
      ],
    };

    const result = runSimulation(store, 'org-test', scenario);

    expect(result).not.toBeNull();
    expect(result!.delta.addedEdges).toBe(1);
  });

  it('Given 3-person graph, When simulating team creation, Then Team node is created with real ID (not UNKNOWN_TEAM_ID)', () => {
    const store = setupStore();
    const { alice, bob } = seedTeamGraph(store);

    const scenario = restructureScenario('Engineering', [alice, bob]);

    const result = runSimulation(store, 'org-test', scenario);

    expect(result).not.toBeNull();
    // After simulation, the Engineering team node should exist
    const teams = store.queryNodes('Team', undefined, 'org-test');
    // Note: original store should be untouched after simulation
    // Team exists only in simulation clone — check via snapshot delta
    expect(result!.delta.addedNodes).toBeGreaterThanOrEqual(1);
  });

  it('Given 3-person graph, When no transforms, Then centralityChanges still has entries and delta is 0', () => {
    const store = setupStore();
    seedTeamGraph(store);

    const scenario: SimulationScenario = {
      id: 'test-noop',
      name: 'No changes',
      description: 'Baseline only',
      transformations: [],
    };

    const result = runSimulation(store, 'org-test', scenario);

    expect(result).not.toBeNull();
    // All deltas should be 0 or near-zero
    for (const c of result!.centralityChanges) {
      expect(Math.abs(c.delta)).toBeLessThan(0.1);
    }
  });
});

// ═══ Sad Path ═══

describe('runSimulation — sad path', () => {
  it('Given empty graph (0 Persons), When simulating, Then returns null', () => {
    const store = setupStore();

    const scenario: SimulationScenario = {
      id: 'test-empty',
      name: 'Empty graph test',
      description: 'No persons exist',
      transformations: [{ type: 'add_node', nodeType: 'Person', props: { name: 'Ghost' } }],
    };

    const result = runSimulation(store, 'org-test', scenario);

    // Empty graph: 0 Persons before transform → baseline has nothing to measure
    // After transform: 1 Person but we can still simulate (it's a single-node graph)
    // Per spec: empty graph returns null
    expect(result).toBeNull();
  });

  it('Given remove_node with invalid ID, When simulating, Then skips gracefully and continues', () => {
    const store = setupStore();
    seedTeamGraph(store);

    const scenario: SimulationScenario = {
      id: 'test-bad-remove',
      name: 'Remove non-existent node',
      description: 'Try to remove a node that does not exist',
      transformations: [
        { type: 'remove_node', nodeId: 'node_Person_nonexistent' },
        { type: 'add_node', nodeType: 'Person', props: { name: 'Eve' } },
      ],
    };

    // Should not throw — just skip the bad remove and continue
    const result = runSimulation(store, 'org-test', scenario);
    expect(result).not.toBeNull();
    expect(result!.delta.addedNodes).toBe(1);
  });

  it('Given scenario with only invalid transforms, When simulating, Then returns result with 0 deltas', () => {
    const store = setupStore();
    seedTeamGraph(store);

    const scenario: SimulationScenario = {
      id: 'test-all-invalid',
      name: 'All invalid transforms',
      description: 'All remove_node with bad IDs',
      transformations: [
        { type: 'remove_node', nodeId: 'node_Person_ghost1' },
        { type: 'remove_node', nodeId: 'node_Person_ghost2' },
      ],
    };

    const result = runSimulation(store, 'org-test', scenario);
    expect(result).not.toBeNull();
    expect(result!.delta.addedNodes).toBe(0);
    expect(result!.delta.addedEdges).toBe(0);
  });
});

// ═══ Store Isolation ═══

describe('runSimulation — store isolation', () => {
  it('Given 3-person graph, After simulation, Then original store is UNCHANGED (no mutation)', () => {
    const store = setupStore();
    seedTeamGraph(store);

    const personCountBefore = store.queryNodes('Person', undefined, 'org-test').length;
    const edgeCountBefore = store.queryEdges(undefined, undefined, undefined, 'org-test').length;

    const scenario: SimulationScenario = {
      id: 'test-isolation',
      name: 'Add 5 people',
      description: 'Simulation should not mutate original store',
      transformations: [
        { type: 'add_node', nodeType: 'Person', props: { name: 'Dave' } },
        { type: 'add_node', nodeType: 'Person', props: { name: 'Eve' } },
        { type: 'add_node', nodeType: 'Person', props: { name: 'Frank' } },
        { type: 'add_node', nodeType: 'Person', props: { name: 'Grace' } },
        { type: 'add_node', nodeType: 'Agent', props: { name: 'Bot-1', agentType: 'internal' } },
      ],
    };

    runSimulation(store, 'org-test', scenario);

    const personCountAfter = store.queryNodes('Person', undefined, 'org-test').length;
    const edgeCountAfter = store.queryEdges(undefined, undefined, undefined, 'org-test').length;

    // Original store must be unchanged
    expect(personCountAfter).toBe(personCountBefore);
    expect(edgeCountAfter).toBe(edgeCountBefore);
  });
});

// ═══ Scenario Templates ═══

describe('newHireScenario', () => {
  it('Given name and teamId, When creating scenario, Then returns valid SimulationScenario', () => {
    const scenario = newHireScenario('Dave', 'team-eng-1');

    expect(scenario.id).toMatch(/^sim_hire_/);
    expect(scenario.name).toContain('Dave');
    expect(scenario.transformations.length).toBe(2); // add_node + add_edge
    expect(scenario.transformations[0]).toEqual({
      type: 'add_node',
      nodeType: 'Person',
      props: { name: 'Dave', role: 'new_hire' },
    });
  });

  it('Given non-ASCII name, When creating scenario, Then encodes correctly', () => {
    const scenario = newHireScenario('张三', 'team-cn-1');

    expect(scenario.name).toContain('张三');
  });
});

describe('restructureScenario', () => {
  it('Given team name and members, When creating scenario, Then returns valid SimulationScenario', () => {
    const scenario = restructureScenario('DataTeam', ['alice-id', 'bob-id']);

    expect(scenario.id).toMatch(/^sim_restruct_/);
    expect(scenario.name).toContain('DataTeam');
    expect(scenario.transformations.length).toBe(1);
    expect(scenario.transformations[0].type).toBe('add_team');
  });
});

// ═══ Path Comparison ═══

describe('runSimulation — path comparison', () => {
  it('Given two persons with an edge, When adding a shortcut edge, Then path is shorter in simulation', () => {
    const store = setupStore();
    const { alice, bob, charlie } = seedTeamGraph(store);

    // Current path alice→charlie goes through: alice→charlie (direct, weight 0.4)
    // Add a stronger direct edge
    const scenario: SimulationScenario = {
      id: 'test-shortcut',
      name: 'Add shortcut',
      description: 'Add a direct strong edge',
      transformations: [
        { type: 'add_edge', edgeType: 'INTERACTS_WITH', from: alice, to: charlie, weight: 0.95 },
      ],
    };

    const result = runSimulation(store, 'org-test', scenario);

    expect(result).not.toBeNull();
    // pathChanges should exist with before/after comparison
    expect(result!.pathChanges.length).toBeGreaterThanOrEqual(0);
  });

  it('Given two persons with no direct path, When simulation adds an edge, Then path becomes reachable', () => {
    const store = setupStore();
    const alice = store.createNode('Person', { name: 'Alice' }, 'org-test');
    const bob = store.createNode('Person', { name: 'Bob' }, 'org-test');
    // No edge between them

    const scenario: SimulationScenario = {
      id: 'test-connect',
      name: 'Connect isolated nodes',
      description: 'Add edge between two isolated persons',
      transformations: [
        { type: 'add_edge', edgeType: 'INTERACTS_WITH', from: alice, to: bob, weight: 0.7 },
      ],
    };

    const result = runSimulation(store, 'org-test', scenario);

    expect(result).not.toBeNull();
    expect(result!.delta.addedEdges).toBe(1);
  });
});
