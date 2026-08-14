# SynovaAgent -- D8e Conflict Arbitration Implementation v1.0

> 2026-07-22 | Auth Doc #4: Agent Engineering Benchmark -- Gap #5
> **D8d detects expert conflicts. D8e arbitrates them -- auto-scoring or GA escalation.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent expert conflict resolution. D8e arbitrates unresolved expert conflicts from D8d CrossValidationTrigger. When 3 experts fail to reach consensus, the ConflictArbitrator either auto-resolves (using data consistency + historical accuracy scoring) or escalates to GA for manual judgment.

### Q1: Research
- Industry: AWS Mechanical Turk consensus, Kaggle competition judging, Wikipedia dispute resolution
- Memory lessons: Iron Law 7 -- Done standard. Arbitration is DONE when the GA decision is logged AND the system records whether the arbitration was used to adjust future routing. Not when the button is clicked.

### Q2: Scope
- Minimal: ConflictArbitrator class (auto-score arbitration OR escalate to GA)
- NOT doing: automated precedent-based resolution (D8f), GA workbench UI (post-10/31)
- MVP: when CrossValidationResult.consensus is 'none' or 'partial', trigger arbitration

### Q3: Acceptance
- Entry: CrossValidationTrigger.aggregate() returns consensus='none' or 'partial'
- Interaction: ConflictArbitrator.arbitrate(conflicts) -> either auto-resolve or create GA escalation ticket
- Result: ArbitrationRecord written to audit-store, GA ticket created if escalated

### Q4: Contract and Test
- @input: Conflict[] + TieBreakerResult[] from D8d
- @output: ArbitrationResult { resolution, autoResolved, gaTicketId?, precedentRecorded }
- @degraded: all conflicts auto-resolved -> degraded:false; GA escalation needed -> degraded:true
- Tests: auto-resolve by scoring, escalate to GA, mixed (some auto + some escalate), empty conflicts, >=3 expect each

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
1. [WIRING] Who calls ConflictArbitrator.arbitrate()?
2. [EXCEPTION] catch + log.warn + degraded?
3. [TYPES] as any = 0?
4. [TESTS] expect()? Normal/degrade/boundary?
5. [DEAD CODE] None?
```

---

## Current State (2026-07-22, verified by grep)

- D8d: CrossValidationTrigger DONE (detectConflicts, triggerTieBreaker, aggregate)
- D8c: ExpertRouter DONE
- D92: MiddleEvolutionEngine DONE (processes AggregatedSignals)
- D41: Audit Hash Chain DONE (audit-store)
- ConflictArbitrator: ZERO existence
- GA escalation ticket system: ZERO existence
- Auth Doc #4 Gap #5: "Conflict Arbitration -- formal resolution of expert disagreements"

---

## What We Build

### 1. src/agent/conflict-arbitrator.ts -- ConflictArbitrator (New, ~200 lines)

```
class ConflictArbitrator {
  arbitrate(cvResult: CrossValidationResult): Promise<ArbitrationResult>
  autoResolve(conflict: Conflict, tieBreaker: TieBreakerResult): AutoResolution
  escalateToGA(unresolved: Conflict[]): GATicket
  recordPrecedent(resolution: AutoResolution | GATicket): void
}
```

Arbitration logic:
- For each conflict where hasConsensus=false:
  1. Score both experts on data consistency (from D92 scoring pattern) + historical accuracy
  2. Gap > 0.3: auto-resolve in favor of higher score
  3. Gap <= 0.3: escalate to GA with full context (both expert analyses + tie-breaker result)
- For each auto-resolution: record in audit-store as arbitration precedent
- For GA escalation: create GA ticket with all expert responses + evidence

### 2. Types

```
interface ArbitrationResult {
  conflictId: string
  resolution: 'auto' | 'ga_escalated'
  winner?: string               // expertType that won (auto only)
  gaTicketId?: string           // GA ticket reference (escalation only)
  reason: string
  precedentRecorded: boolean
  timestamp: string
}

interface AutoResolution {
  conflictId: string
  winner: string                // expert with higher score
  loser: string
  scoreWinner: number
  scoreLoser: number
  gap: number
}

interface GATicket {
  ticketId: string
  conflicts: Conflict[]
  tieBreakers: TieBreakerResult[]
  context: {
    enterpriseId: string
    diagnosisId: string
    allExpertResponses: ExpertResponse[]
  }
  status: 'pending' | 'resolved' | 'dismissed'
  createdAt: string
}
```

### 3. Wire into MainAgent (Modify src/agent/main-agent.ts)

After CrossValidationTrigger.aggregate():
```
if (cvResult.consensus === 'none' || cvResult.consensus === 'partial') {
  const arbitrator = new ConflictArbitrator(this.auditStore);
  const arbResult = await arbitrator.arbitrate(cvResult);
  // Log arbitration result
  this.writeAuditLog('loop-1', 'fast', arbResult);
}
```

### 4. tests/agent/conflict-arbitrator.test.ts (New, >=8 tests)

```
[ ] autoResolve: gap > 0.3 -> auto-resolve with winner
[ ] autoResolve: gap <= 0.3 -> escalate to GA
[ ] arbitrate: all conflicts auto-resolved -> degraded:false
[ ] arbitrate: some conflicts escalated -> degraded:true
[ ] arbitrate: empty conflicts -> empty result
[ ] escalateToGA: creates GA ticket with full context
[ ] recordPrecedent: writes to audit-store
[ ] GA ticket: includes all 3 expert responses + tie-breaker
```

---

## What We Don't Do

- Don't implement automated precedent-based resolution (D8f)
- Don't build GA workbench UI (post-10/31)
- Don't modify D8d CrossValidationTrigger

---

## Architecture Layer

L2 (src/agent/conflict-arbitrator.ts) -- orchestration quality layer

---

## Completion Standard

```
[ ] ConflictArbitrator: arbitrate + autoResolve + escalateToGA + recordPrecedent
[ ] Auto-resolution: data consistency scoring (reuse D92 pattern)
[ ] GA escalation: ticket with all expert responses + tie-breaker + evidence
[ ] Wiring: MainAgent.executeWithDecomposition calls arbitration after cross-validation
[ ] Audit: all arbitration decisions written to audit-store
[ ] Degrade: empty conflicts -> empty result
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=8 tests
```

---

## Auth Doc References

- Auth Doc #4: Agent Engineering Benchmark -- Gap #5: Conflict Arbitration
- D8d: CrossValidationTrigger (provides CrossValidationResult)
- D92: MiddleEvolutionEngine (scoring pattern reference)
