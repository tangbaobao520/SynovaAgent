# Simulation Engine — Interface Spec (iron law 0-2 Step 1)

## Signatures

```typescript
// Core: run simulation on a graph, return delta report
runSimulation(store: GraphStore, graph: string, scenario: SimulationScenario): SimulationResult | null

// Templates: pre-built scenarios for common what-if questions
newHireScenario(personName: string, teamId: string): SimulationScenario
restructureScenario(teamName: string, members: string[]): SimulationScenario
```

## Algorithm

1. **Snapshot baseline** → `createSnapshot(store, graph)`
2. **Measure baseline** → `degreeCentrality` for all Persons
3. **Clone mutations** → apply transforms to a SEPARATE store clone (not original)
4. **Measure simulated** → same metrics on mutated clone
5. **Diff** → centrality changes, community changes, path efficiency delta
6. **Alert** → `runMonitorTick` + `runDecisionEngine` on clone
7. **Return** → `SimulationResult` with all deltas; original store UNTOUCHED

## Key Design Decision: Clone, don't mutate-and-rollback

The current impl mutates the store then tries to compute path changes from the same
mutated graph (broken). Fix: create a SEPARATE in-memory store, clone all relevant
nodes/edges into it, apply transforms, run analysis — original untouched.

## Boundary Conditions

- Empty graph (0 Persons) → return `null` (nothing to simulate)
- Single Person → centralityChanges has 1 entry, pathChanges is empty
- No INTERACTS_WITH edges → community count = node count, 0 paths
- Invalid nodeId in remove_node transform → skip (log.warn), continue
- add_team transform → MUST capture created Team node ID for edge creation

## Performance

- O(N+E) clone + O(N*E) centrality + O(V+E) communities
- Target: < 500ms for 1000-node graph (in-memory SQLite)
