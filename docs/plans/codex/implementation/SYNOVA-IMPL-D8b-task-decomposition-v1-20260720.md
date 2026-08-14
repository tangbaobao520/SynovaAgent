# SynovaAgent -- D8b Task Decomposition Protocol Implementation v1.0

> 2026-07-20 | Auth Doc #4: Agent Engineering Benchmark -- Gap #2
> **D8a delivered the MainAgent skeleton. D8b teaches it HOW to break complex diagnoses into sub-tasks.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent enterprise digital twin diagnosis. D8b adds task decomposition: the MainAgent breaks a complex diagnosis request into independently executable sub-tasks, routes each to the appropriate expert handler, and aggregates results.

### Q1: Research
- Industry: LangChain TaskGraph, AutoGPT task list, CrewAI hierarchical task delegation
- Memory lessons: Iron Law 4 -- wiring. Every decomposed sub-task must have a caller that consumes its result. Iron Law 9 -- grep propagation. Adding a sub-task type means checking all consumers.

### Q2: Scope
- Minimal: TaskDecomposer class with decompose(diagnosisScope) -> SubTask[] + executeSubTask(subTask) -> SubTaskResult
- NOT doing: expert routing algorithm (D8c), conflict arbitration (D8e), multi-expert merge strategy
- MVP: linear decomposition by sentinel dimension. One sentinel finding = one sub-task.

### Q3: Acceptance
- Entry: MainAgent.executeLoop calls TaskDecomposer.decompose(diagnosisScope)
- Interaction: Each sub-task dispatched to default handler (D8a loop-handlers), results collected
- Result: AggregatedResult written to GraphStore, individual sub-task status trackable

### Q4: Contract and Test
- @input: DiagnosisScope { enterpriseId, sentinelFindings[], triggeredBy }
- @output: DecompositionResult { subTasks: SubTask[], totalEstimatedMs: number }
- @degraded: empty findings -> return empty sub-tasks + degraded:true + log.warn
- Tests: decompose 1 finding, decompose 5 findings (parallel), decompose empty, execute sub-task success, execute sub-task fail, >=3 expect each

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

These constraints are NOT optional. Verify each one per commit.

```
=== Pre-Commit Hard Gates (8 groups, <10s) ===
G1: as any = 0 (Iron Law 38, 47 incidents)
G2: empty catch has log.warn (Iron Law 24+31)
G3: secrets scan
G4: every new src/ file paired with test file (Iron Law 0-2)
G5: every new export has caller in src/ or extensions/ (Iron Law 4+5)
G6: new compute functions have JSDoc contract + tests with expect (Iron Law 47+48)
G7: new sentinel aggregate.ts has integration test

=== Post-Code Agent Self-Check (5 questions) ===
1. [WIRING] New export: who calls it? (grep -rn "functionName" src/)
2. [EXCEPTION] Every catch: log.warn/error + degraded?
3. [TYPES] as any = 0?
4. [TESTS] Every test has expect()? Covers normal/degrade/boundary?
5. [DEAD CODE] Any unused old files? Any stale references?

=== verify-incremental.sh (L1->L4) ===
L1: oxlint -> L2: tsc --incremental -> L3: vitest --changed -> L4: wiring audit
Max 5 loop retries. Failure after 5 -> stop, wait for human.
```

---

## Current State (2026-07-20, verified by grep)

- D8a: MainAgent class DONE (registerLoop, executeLoop, executeLoopScale)
- D58: PROMPT.md templates for all 9 experts DONE
- D91: LoopTriggerConfig + 6 definitions DONE
- TaskDecomposer: ZERO existence
- Sub-task routing logic: ZERO existence
- Auth Doc #4 Gap #2: "Task Decomposition Protocol -- break diagnoses into sub-tasks"

---

## What We Build

### 1. src/agent/task-decomposer.ts -- TaskDecomposer Class (New, ~150 lines)

```
class TaskDecomposer {
  decompose(scope: DiagnosisScope): DecompositionResult
  executeSubTask(st: SubTask): Promise<SubTaskResult>
  aggregate(subResults: SubTaskResult[]): AggregatedResult
}

interface SubTask {
  id: string
  dimension: string          // e.g. "financial", "talent", "market"
  priority: 0 | 1 | 2       // 0=critical, 1=high, 2=medium
  expertType: string          // target expert: "finance", "strategy", etc.
  inputFindings: SentinelFinding[]
  status: 'pending' | 'running' | 'completed' | 'failed'
  dependsOn?: string[]        // sub-task IDs that must complete first
}

interface SubTaskResult {
  subTaskId: string
  status: 'completed' | 'failed'
  output?: string
  error?: string
  durationMs: number
  confidence: number          // 0-1 from expert analysis
}
```

Decomposition strategy (MVP): one sentinel finding = one sub-task.
- Sentinels mapped to expert via sentinel dimension (financial -> finance, talent/org -> org, market -> marketing, tech -> tech)

### 2. Wire into MainAgent (Modify src/agent/main-agent.ts)

Add TaskDecomposer as dependency injection:
```
constructor(auditStore?, taskDecomposer?: TaskDecomposer)
```

Add executeLoop decomposition path:
```
if (loopId === 'loop-1') {  // diagnosis loop
  const scope = buildDiagnosisScope(enterpriseId);
  const { subTasks } = this.taskDecomposer.decompose(scope);
  const results = await Promise.allSettled(
    subTasks.map(st => this.taskDecomposer.executeSubTask(st))
  );
  return this.taskDecomposer.aggregate(results);
}
```

### 3. tests/agent/task-decomposer.test.ts (New, >=9 tests)

```
[ ] decompose: 1 sentinel finding -> 1 sub-task with correct expert mapping
[ ] decompose: 5 findings -> 5 sub-tasks, all have unique IDs
[ ] decompose: empty findings -> empty sub-tasks + degraded:true
[ ] executeSubTask: success -> status=completed, output present
[ ] executeSubTask: handler fails -> status=failed, error present
[ ] aggregate: all success -> aggregated status=completed
[ ] aggregate: 1 failure + 4 successes -> degraded:true, partial results
[ ] expert mapping: financial sentinel -> finance expert
[ ] expert mapping: talent sentinel -> org expert
```

---

## What We Don't Do

- Don't implement expert routing algorithm (D8c)
- Don't implement multi-expert cross-validation merge (D8d)
- Don't modify PROMPT.md templates (D58)
- Don't create new sentinels

---

## Architecture Layer

L2 (src/agent/task-decomposer.ts) -- orchestration layer

---

## Completion Standard (verifiable by pre-commit + grep)

```
[ ] TaskDecomposer class: decompose + executeSubTask + aggregate
[ ] SubTask type: id/dimension/priority/expertType/inputFindings/status/dependsOn
[ ] Decomposition: one sentinel finding -> one sub-task (MVP linear mapping)
[ ] Expert mapping: sentinel dimension -> expert type (financial->finance, etc.)
[ ] Wire into MainAgent: constructor accepts TaskDecomposer, executeLoop uses it
[ ] Aggregate: collects sub-task results, returns aggregated status + degraded flag
[ ] Degrade: empty findings -> empty sub-tasks + log.warn
[ ] Zero as any (Iron Law 38 -- pre-commit hard gate)
[ ] Every new src/ file has paired test file (Iron Law 0-2)
[ ] Every new export has caller in src/ (Iron Law 4 -- grep verified)
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=9 tests: decompose (3) + execute (2) + aggregate (2) + mapping (2)
```

---

## Auth Doc References

- Auth Doc #4: Agent Engineering Benchmark -- Gap #2: Task Decomposition Protocol
- D8a: MainAgent class (extends with TaskDecomposer)
- D58: PROMPT.md expert templates (expert type mapping)
