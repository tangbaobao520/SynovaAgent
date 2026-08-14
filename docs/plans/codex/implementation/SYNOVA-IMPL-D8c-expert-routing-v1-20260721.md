# SynovaAgent -- D8c Expert Routing Algorithm Implementation v1.0

> 2026-07-21 | Auth Doc #4: Agent Engineering Benchmark -- Gap #3
> **D8b decomposes diagnoses into sub-tasks. D8c routes each sub-task to the right expert.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent enterprise digital twin diagnosis. D8c adds expert routing: given a sub-task from TaskDecomposer, determine which of the 9 experts should handle it, dispatch the sub-task, and collect the expert's output.

### Q1: Research
- Industry: LangChain RouterChain, semantic router pattern, embedding-based routing. Not MVP -- we use rule-based routing first.
- Memory lessons: Iron Law 4 -- wiring. Every routed sub-task must have a caller that consumes the expert output. Iron Law 9 -- grep propagation. Adding a routing rule means checking all sub-task types.

### Q2: Scope
- Minimal: RuleRegistry class (expertType -> handler mapping) + dispatch(ExpertRequest) -> ExpertResponse
- NOT doing: embedding-based routing, load-balancing across experts, conflict arbitration (D8e)
- MVP: direct mapping from subTask.expertType to expert handler file in expert/{type}/

### Q3: Acceptance
- Entry: TaskDecomposer.executeSubTask(subTask) calls ExpertRouter.dispatch(subTask)
- Interaction: Expert request sent to correct expert handler -> expert returns analysis
- Result: ExpertResponse written to subTask result, aggregated by D8b

### Q4: Contract and Test
- @input: ExpertRequest { subTaskId, expertType, inputFindings[], context }
- @output: ExpertResponse { subTaskId, analysis, confidence, evidence[] }
- @degraded: expert handler fails -> return error response + log.warn, does NOT crash the pipeline
- Tests: route to finance, route to strategy, unknown expert -> degrade, expert timeout -> degrade, >=3 expect each

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates (8 groups, <10s) ===
G1: as any = 0 (Iron Law 38, 47 incidents)
G2: empty catch has log.warn (Iron Law 24+31)
G3: secrets scan
G4: every new src/ file paired with test file (Iron Law 0-2)
G5: every new export has caller in src/ or extensions/ (Iron Law 4+5)

=== Post-Code Agent Self-Check (5 questions) ===
1. [WIRING] New export: who calls it? (grep -rn "functionName" src/)
2. [EXCEPTION] Every catch: log.warn/error + degraded?
3. [TYPES] as any = 0?
4. [TESTS] Every test has expect()? Covers normal/degrade/boundary?
5. [DEAD CODE] Any unused old files? Any stale references?
```

---

## Current State (2026-07-21, verified by grep)

- D8a: MainAgent class DONE (executeLoop dispatches to selectHandler)
- D8b: TaskDecomposer DONE (subTask.expertType field populated)
- D58: PROMPT.md for all 9 experts DONE
- D70: IDENTITY.md analytical_lens for all 9 experts DONE
- Expert routing: ZERO -- currently hardcoded in TaskDecomposer.runHandlerForDimension()
- Expert request/response types: ZERO existence
- Auth Doc #4 Gap #3: "Expert Routing Algorithm -- route sub-tasks to appropriate experts"

---

## What We Build

### 1. src/agent/expert-router.ts -- ExpertRouter Class (New, ~180 lines)

```
class ExpertRouter {
  dispatch(request: ExpertRequest): Promise<ExpertResponse>
  loadExpertManifest(expertType: string): ExpertManifest
  selectExpert(expertType: string, inputFindings: SentinelFinding[]): string
}
```

Expert mapping (from expert directory + PROMPT.md + IDENTITY.md):
- finance -> expert/finance/ (PROMPT.md + IDENTITY.md)
- strategy -> expert/strategy/
- org -> expert/org/
- tech -> expert/tech/
- marketing -> expert/marketing/
- action -> expert/action/
- business_model -> expert/business_model/
- knowledge -> expert/knowledge/
- host -> expert/host/

Routing strategy (MVP):
- Load expert manifest.json from expert/{type}/ directory
- Verify expert has PROMPT.md and IDENTITY.md
- Read expert.analytical_lens to match finding dimensions
- Dispatch to expert handler (reuse D8a loop-handler pattern)

### 2. Expert request/response types

```
interface ExpertRequest {
  subTaskId: string
  expertType: string           // e.g. "finance", "strategy"
  inputFindings: SentinelFinding[]
  context: {                   // diagnosis context
    enterpriseId: string
    diagnosisId: string
    previousExpertOutputs?: ExpertResponse[]
  }
}

interface ExpertResponse {
  subTaskId: string
  expertType: string
  analysis: string             // expert's analysis output
  confidence: number           // 0-1
  evidence: string[]           // supporting evidence references
  edgeIds: string[]            // 42-edge IDs referenced
  degraded: boolean
  error?: string
  durationMs: number
}
```

### 3. Wire into TaskDecomposer (Modify src/agent/task-decomposer.ts)

Replace runHandlerForDimension() with ExpertRouter.dispatch():
```
private async runHandlerForDimension(dimension: string): Promise<{...}> {
  const router = new ExpertRouter();
  const response = await router.dispatch({
    subTaskId: subTask.id,
    expertType: DIMENSION_EXPERT_MAP[dimension] || 'org',
    inputFindings: subTask.inputFindings,
    context: { enterpriseId, diagnosisId }
  });
  return { success: !response.degraded, output: response.analysis, error: response.error };
}
```

### 4. tests/agent/expert-router.test.ts (New, >=9 tests)

```
[ ] dispatch: finance expert -> non-empty analysis returned
[ ] dispatch: strategy expert -> non-empty analysis returned
[ ] dispatch: unknown expertType -> degrade + error
[ ] dispatch: expert manifest missing -> degrade + log.warn
[ ] selectExpert: financial finding -> finance expert selected
[ ] selectExpert: talent finding -> org expert selected
[ ] loadExpertManifest: valid expert -> manifest loaded
[ ] loadExpertManifest: missing PROMPT.md -> degrade
[ ] ExpertResponse: all required fields present
```

---

## What We Don't Do

- Don't implement multi-expert cross-validation (D8d)
- Don't implement expert conflict arbitration (D8e)
- Don't modify PROMPT.md or IDENTITY.md files
- Don't create new expert types

---

## Architecture Layer

L2 (src/agent/expert-router.ts) -- orchestration layer

---

## Completion Standard

```
[ ] ExpertRouter class: dispatch + selectExpert + loadExpertManifest
[ ] ExpertRequest/ExpertResponse types: all required fields
[ ] 9-expert mapping: finance/strategy/org/tech/marketing/action/business_model/knowledge/host
[ ] Wire into TaskDecomposer: runHandlerForDimension uses ExpertRouter
[ ] Expert manifest loading: uses expert/{type}/manifest.json
[ ] Degrade: missing expert -> error response + log.warn
[ ] Zero as any (Iron Law 38)
[ ] Every new src/ file has paired test file (Iron Law 0-2)
[ ] Every new export has caller in src/ (Iron Law 4)
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=9 tests: dispatch (3) + selectExpert (2) + loadManifest (2) + response (2)
```

---

## Auth Doc References

- Auth Doc #4: Agent Engineering Benchmark -- Gap #3: Expert Routing Algorithm
- D8b: TaskDecomposer (provides subTask.expertType)
- D58: PROMPT.md templates (expert prompt references)
- D70: IDENTITY.md analytical_lens (expert capability mapping)
