# SynovaAgent -- D8d Cross-Validation Trigger Implementation v1.0

> 2026-07-21 | Auth Doc #4: Agent Engineering Benchmark -- Gap #4
> **D8c routes sub-tasks to experts. D8d triggers cross-validation when multiple experts disagree.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent diagnosis quality assurance. D8d adds cross-validation: when two experts produce conflicting analyses on the same edge or finding, trigger a third expert for tie-breaking validation.

### Q1: Research
- Industry: ensemble methods (random forest voting), PagerDuty escalation rules, medical diagnosis second-opinion protocols
- Memory lessons: Iron Law 7 -- Done standard. Cross-validation is done when the tie-breaker report is generated AND all three expert opinions are logged. Not when the button is clicked.

### Q2: Scope
- Minimal: CrossValidationTrigger class (detectConflicts among ExpertResponse[]) -> triggerTieBreaker() -> aggregate
- NOT doing: full conflict arbitration (D8e), automated merge of expert opinions (D8f)
- MVP: two experts disagree on same edge ID -> auto-trigger third expert

### Q3: Acceptance
- Entry: ExpertRouter completes all sub-tasks -> CrossValidationTrigger.detectConflicts(responses)
- Interaction: Conflict detected -> third expert assigned -> tie-breaker analysis generated
- Result: All three expert opinions + tie-breaker logged to audit-store

### Q4: Contract and Test
- @input: ExpertResponse[] from ExpertRouter
- @output: CrossValidationResult { conflicts[], tieBreakers[], consensus }
- @degraded: no conflicts -> return empty result + degraded:false
- Tests: 2 experts agree on edge -> no conflict, 2 experts disagree -> conflict detected, tie-breaker generated, edge threshold (disagree on >=2 edges -> trigger), >=3 expect each

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates ===
G1: as any = 0
G2: empty catch has log.warn
G4: new src/ files -> paired tests
G5: new exports -> callers

=== Post-Code Agent Self-Check ===
1. [WIRING] detectConflicts called from where?
2. [EXCEPTION] catch + log.warn + degraded?
3. [TYPES] as any = 0?
4. [TESTS] expect()? normal/degrade/boundary?
5. [DEAD CODE] None?
```

---

## Current State (2026-07-21, verified by grep)

- D8c: ExpertRouter (in progress -- parallel execution)
- D8b: TaskDecomposer (aggregates sub-task results) DONE
- D58: PROMPT.md for all 9 experts DONE
- Cross-validation logic: ZERO existence
- Auth Doc #4 Gap #4: "Cross-Validation Trigger -- detect expert disagreements"

---

## What We Build

### 1. src/agent/cross-validator.ts -- CrossValidationTrigger (New, ~150 lines)

```
class CrossValidationTrigger {
  detectConflicts(responses: ExpertResponse[]): Conflict[]
  triggerTieBreaker(conflict: Conflict): Promise<ExpertResponse>
  aggregate(responses: ExpertResponse[], tieBreakers: ExpertResponse[]): CrossValidationResult
}
```

Conflict detection rules (MVP):
- Two experts disagree on the same 42-edge ID (one says E-23 is root cause, other says E-05)
- Two experts classify the same finding with opposite severity (critical vs warning)
- Two experts produce opposite directional analysis (improving vs declining)

Tie-breaker strategy:
- Select a third expert NOT among the conflicting pair
- Route the same findings to the tie-breaker
- Compare all three outputs
- Majority wins (2 out of 3 agree) -> log consensus
- All three disagree -> log unresolved + escalate to GA (future D8e)

### 2. Wire into MainAgent (Modify src/agent/main-agent.ts)

After TaskDecomposer.aggregate():
```
const validator = new CrossValidationTrigger();
const cvResult = validator.detectConflicts(aggregated.results);
if (cvResult.conflicts.length > 0) {
  const tieBreakers = await Promise.all(
    cvResult.conflicts.map(c => validator.triggerTieBreaker(c))
  );
  const final = validator.aggregate(aggregated.results, tieBreakers);
}
```

### 3. tests/agent/cross-validator.test.ts (New, >=8 tests)

```
[ ] detectConflicts: 2 experts agree on E-23 -> no conflict
[ ] detectConflicts: 2 experts disagree on root cause -> 1 conflict
[ ] detectConflicts: 5 experts, 2 pairs disagree -> 2 conflicts
[ ] detectConflicts: empty responses -> empty conflicts
[ ] triggerTieBreaker: valid conflict -> tie-breaker response
[ ] triggerTieBreaker: tie-breaker fails -> degrade + error
[ ] aggregate: majority agreement -> consensus
[ ] aggregate: all three disagree -> unresolved + escalate
```

---

## What We Don't Do

- Don't implement full conflict arbitration with GA escalation (D8e)
- Don't implement automated expert opinion merging (D8f)
- Don't modify PROMPT.md templates

---

## Architecture Layer

L2 (src/agent/cross-validator.ts) -- orchestration quality layer

---

## Completion Standard

```
[ ] CrossValidationTrigger: detectConflicts + triggerTieBreaker + aggregate
[ ] Conflict detection: disagree on edge ID, opposite severity, opposite direction
[ ] Tie-breaker: third expert from non-conflicting expert pool
[ ] Wiring: MainAgent.executeLoop calls cross-validation after aggregation
[ ] Degrade: no conflicts -> empty result
[ ] Audit: all expert opinions + tie-breaker logged
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=8 tests
```

---

## Auth Doc References

- Auth Doc #4: Agent Engineering Benchmark -- Gap #4: Cross-Validation Trigger
- D8b: TaskDecomposer (aggregated sub-task results)
- D8c: ExpertRouter (expert responses)
