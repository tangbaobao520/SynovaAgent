# SynovaAgent -- D8a L2 Upgrade to Main Agent Implementation v1.0

> 2026-07-20 | Auth Doc #4: Agent Engineering Benchmark -- Gap #1
> **This is the highest-priority pending task. All D8b-D8g and D9 depend on it.**
>
> ## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4 must be answered before any code)

### Q0: Project Identity
SynovaAgent -- enterprise digital twin diagnosis + continuous growth navigation system. D8a upgrades the L2 orchestration layer from passive diagnosis scheduler to a Main Agent decision center.

### Q1: Research
- Industry: Claude Code Plan/Act/Observe loop, Codex Agent Loop, Hermes TaskOrchestrator
- Memory lessons: 4 wiring failures (Iron Law 4+5) -- new exports must grep for callers. Silent degradation (Iron Law 11) -- every catch must have log.warn

### Q2: Scope
- Minimal: MainAgent class + registerLoop() + executeLoop() + bootstrap Phase 2f integration
- NOT doing: full 5-loop implementation (D9), expert routing algorithm (D8c), conflict arbitration (D8e)
- MVP skeleton: a MainAgent that registers loops, dispatches execution by trigger conditions, writes results to GraphStore

### Q3: Acceptance
- Entry: Bootstrap Phase 2f creates MainAgent instance, registers all 6 loops
- Interaction: MainAgent.executeLoop(loopId) is called -> executes loop handler -> returns result
- Result: LoopExecutionRecord written to audit-store, queryable

### Q4: Contract and Test
- @input: LoopTriggerConfig[] (D91)
- @output: LoopExecutionRecord { loopId, status, durationMs, output?, error? }
- @degraded: single loop failure does NOT crash MainAgent, catch + log.warn + degraded:true
- Tests: MainAgent.registerLoop (normal), executeLoop (normal), executeLoop (degrade-fail-no-crash), >=3 expect each
---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture
> **This doc is the sole execution basis for claude code. Every Loop Engineering V4.4.5 constraint is embedded below.**

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

These constraints are NOT optional. The Claude Code session MUST verify each one per commit.

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
L1: oxlint ? L2: tsc --incremental ? L3: vitest --changed ? L4: wiring audit
Max 5 loop retries. Failure after 5 -> stop, wait for human.
```

---

## Current State (2026-07-20, verified by grep)

- D91: LoopTriggerConfig + LoopScheduler DONE (6 loops x 3 scales)
- D92: MiddleEvolutionEngine DONE (Cycle 7)
- D93: FeedbackCollector DONE
- D94: CronScheduler hybrid trigger DONE
- D83: Bootstrap Phase 0-5 DONE (Phase 2e = LoopScheduler registration)
- MainAgent class: ZERO existence
- Loop execution tracking: ZERO existence
- Auth Doc #4 Gap #1: "L2 upgrade to Main Agent -- task decomposition + loop scheduling + lifecycle management"

---

## What We Build

### 1. src/agent/main-agent.ts -- MainAgent Class (New, ~200 lines)

```
class MainAgent {
  registerLoop(config: LoopTriggerConfig): void
  executeLoop(loopId: string): Promise<LoopExecutionRecord>
  executeLoopScale(loopId: string, scale: ScaleName): Promise<LoopExecutionRecord>
  listLoops(): RegisteredLoop[]
  getLoopStatus(loopId: string): LoopStatus | null
}
```

Core responsibilities:
- Register loops from LoopTriggerConfig (D91) -- mapping loopId -> handler
- Execute a loop by loopId and optionally by scale (fast/medium/slow)
- Track execution status (pending/running/completed/failed)
- Write LoopExecutionRecord to audit-store (D41)
- Single loop failure -> log.warn + degraded, does NOT crash MainAgent

### 2. src/agent/loop-handlers.ts -- Default Loop Handlers (New, ~100 lines)

```
defaultDiagnosisHandler(scale: ScaleName): Promise<LoopExecutionResult>
defaultNavigationHandler(scale: ScaleName): Promise<LoopExecutionResult>
defaultEvolutionHandler(scale: ScaleName): Promise<LoopExecutionResult>
defaultOverflowHandler(scale: ScaleName): Promise<LoopExecutionResult>
```

Each handler: log execution, call relevant subsystem, return result.
MVP: handlers are PLACEHOLDER -- they log + return success. Real logic wired in D9 (5 built-in loops).

### 3. Bootstrap Phase 2f -- MainAgent Wiring (Modify src/deploy/bootstrap.ts)

After Phase 2e (LoopScheduler registration), add:
```typescript
private async runPhase2f(subResults: PhaseResult[]): Promise<void> {
  const { MainAgent } = await import('../agent/main-agent');
  const { LOOP_TRIGGER_MATRIX } = await import('../loops/loop-trigger-config');
  const mainAgent = new MainAgent(this.ctx.get('auditStore'), this.ctx.get('scheduler'));

  for (const config of LOOP_TRIGGER_MATRIX) {
    mainAgent.registerLoop(config);
  }
  this.ctx.set('mainAgent', mainAgent);
}
```

### 4. tests/agent/main-agent.test.ts (New, >=9 tests)

```
[ ] registerLoop: 6 loops registered -> listLoops returns 6
[ ] executeLoop: successful execution -> returns completed status
[ ] executeLoop: handler fails -> degraded + log.warn + status=failed
[ ] executeLoop: multiple loops in parallel -> no interference
[ ] executeLoop: unknown loopId -> returns error
[ ] getLoopStatus: pending -> pending, running -> running, completed -> completed
[ ] executeLoopScale: specific scale -> correct ScaleName recorded
[ ] audit log: successful execution writes audit entry
[ ] audit log: failed execution writes audit entry with error
```

---

## What We Don't Do

- Don't implement real loop logic (D9: 5 Built-in Loops)
- Don't implement task decomposition (D8b)
- Don't implement expert routing (D8c)
- Don't modify D91 LoopScheduler (consume, don't modify)
- Don't modify D83 Bootstrap Phase 0-2e (add Phase 2f after 2e)

---

## Architecture Layer

L2 (src/agent/main-agent.ts + loop-handlers.ts) -- orchestration layer

---

## Completion Standard (verifiable by pre-commit + grep)

```
[ ] MainAgent class: registerLoop + executeLoop + executeLoopScale + listLoops + getLoopStatus
[ ] LoopExecutionRecord type: loopId/scale/status/durationMs/output/error/startedAt/completedAt
[ ] 6 loops registered in bootstrap Phase 2f from LOOP_TRIGGER_MATRIX
[ ] Default handlers: diagnosis/navigation/evolution/overflow (placeholder, log + return success)
[ ] Audit: each execution writes LoopExecutionRecord to audit-store
[ ] Degrade: handler failure -> log.warn + status=failed, does NOT crash MainAgent
[ ] Zero as any (Iron Law 38 -- pre-commit hard gate)
[ ] Every new src/ file has paired test file (Iron Law 0-2 -- pre-commit hard gate)
[ ] Every new export has caller in src/ or extensions/ (Iron Law 4 -- grep verified)
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=9 tests: register (1) + execute (3: success/fail/parallel) + scale (1) + status (2) + audit (2)
```

---

## Auth Doc References

- Auth Doc #4: Agent Engineering Benchmark -- Gap #1: L2 Upgrade to Main Agent
- D91: LoopTriggerConfig + LoopScheduler
- D83: Bootstrap Phase 0-5
- D41: Audit Hash Chain (audit-store)
