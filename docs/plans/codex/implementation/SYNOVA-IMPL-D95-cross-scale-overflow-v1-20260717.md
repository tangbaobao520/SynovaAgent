# SynovaAgent -- D95 Cross-scale Overflow Validation Implementation v1.0

> 2026-07-17 | Auth Doc A1: LoopEng Amendment -- Correction 3
> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture
> **This doc is the sole execution basis for claude code.**

---

## Execution Constraints

```
1. Wiring Check: New export called? (grep)
2. Exception Handling: catch + log + degraded? (Iron Law 24+31)
3. Type Safety: as any = 0? (Iron Law 38)
4. Test Coverage: expect()? Normal/degrade/boundary? (Iron Law 48)
5. Dead Code: none?
```

---

## Current State

- D88+D89: CycleLoader + OverflowGraphBridge DONE (snapshots stored)
- D90: Overflow dashboard + advisor DONE
- CycleRegistry: all sub-cycles registered with dataMaturity
- Amendment Correction 3: cross-scale validation prevents false optimism from short-term signals
- Fast overflow (weekly cash) should cross-check against slow overflow (quarterly brand)

---

## What We Build

### 1. src/cycles/cross-scale-validator.ts -- Cross-scale Validator (New)

```
validateOverflowSignals(cycleId: string, graphBridge: GraphBridge): CrossScaleResult
```

Two validation rules from amendment:
- **Fast improvement + slow deterioration**: "Cash flow improved this week, but talent pool is accelerating drain. If talent loss doesn't slow next month, cash improvement may be unsustainable."
- **Slow improvement + fast deterioration**: "Brand awareness rose this quarter, but cash flow worsened in same period. Brand rise may be from short-term ad spending, not genuine brand asset accumulation."

### 2. Injection into overflow dashboard (Modify)

In overflow-dashboard.ts (D90), call validateOverflowSignals() and inject cross-scale warnings into dashboard rows.

### 3. Validation Matrix

| Fast Signal | Slow Signal | Verdict |
|------------|------------|--------|
| Cash + | Talent - | Cash improvement may be unsustainable (check talent trend) |
| Cash + | Brand stable/+ | Likely genuine |
| Customer + | Cash - | Customer growth may be discount-driven |
| Brand + | Cash - | Brand spend may be unsustainable |

---

## What We Don't Do

- Don't modify overflow-compute.ts (D89)
- Don't create new sentinels
- Don't change how overflow snapshots are stored

---

## Architecture Layer

L3 (src/cycles/cross-scale-validator.ts) + integration into D90 overflow-dashboard.ts

---

## Completion Standard

```
[ ] cross-scale-validator.ts: validateOverflowSignals -> CrossScaleResult
[ ] 2 validation rules: fast-improvement-slow-deterioration + slow-improvement-fast-deterioration
[ ] 4-cell validation matrix (cash/talent x brand/customer)
[ ] Integration: overflow-dashboard.ts rows augmented with crossScaleWarning field
[ ] Degrade: GraphBridge unavailable -> log.warn + return empty warnings
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=6 tests: 2 rule tests + 2 matrix tests + 1 dashboard integration + 1 degrade
```

---

## Auth Doc References

- Auth Doc A1: LoopEng Amendment -- Correction 3: Cross-scale overflow validation
- Auth Doc #15: Cycle Overflow Navigation -- D88/D89/D90
