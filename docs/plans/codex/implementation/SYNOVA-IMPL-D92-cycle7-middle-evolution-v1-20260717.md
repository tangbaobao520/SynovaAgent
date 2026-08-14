# SynovaAgent -- D92 Cycle 7: Middle-driven Evolution Implementation v1.0

> 2026-07-17 | Auth Doc A1: LoopEng Amendment -- Correction 2 + Missing Pieces #3+#4
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

- D93: feedback-collector.ts DONE -- collects middle manager behavior data
- D63: 4 SKILL pull-mode DONE
- D91: Multi-scale trigger matrix (parallel execution)
- Cycle 3 (GA Evolution): NOT YET IMPLEMENTED in code -- only designed in auth docs
- Cycle 7: Middle-driven evolution -- entirely new, consumes D93 feedback data
- Amendment doc: middle-driven evolution alongside GA evolution, facts-layer only

---

## What We Build

### 1. src/loops/middle-evolution-engine.ts -- Middle Evolution Engine (New)

```
processFeedbackSignals(signals: AggregatedSignal[]): EvolutionAction[]
```

Five evolution signal types (from amendment doc):
| Middle Behavior | Evolution Signal | Aggregation | Auto Action |
|---------|---------|---------|------------|
| Flag alert as "false alarm" | Threshold may be too high | Same sentinel x same category >= 3 | Sentinel warning threshold auto +5% |
| Adjust Goal target during execution | Initial estimate inaccurate | Same sub-cycle x same Goal type >= 3 | Goal initial targetValue formula weight tweak |
| Reject Proposal path | Path not applicable | Same path rejected >= 3 (cross-enterprise) | Path ranking downgrade in default recommendation |
| Goal closed but diagnosis metric unchanged | Root cause may be wrong | Same expert x same breakpoint >= 3 | Expert reasoning chain template confidence downgrade |
| Cross-department contradiction (finance vs marketing) | Needs arbitration | Auto-trigger | Data consistency + historical accuracy scoring |

### 2. Contradiction Arbitration

When two middle managers give opposite feedback on same diagnosis:
- **Factual dispute**: System can arbitrate (data consistency scoring)
- **Causal dispute**: System cannot arbitrate -> pending_causal_validation
- **Mixed**: Arbitrate factual part, mark causal part pending

Scoring: dataConsistency(weight 0.6) + historicalAccuracy(weight 0.4)
- Gap > 0.3: adopt higher score
- Gap <= 0.3: pending_cross_validation (wait 3 months or GA manual)

### 3. GA Absence Protection v2

Time x activity-rate threshold (not fixed 60 days):
```
autoUpgradeThreshold = 60 * (1 - middleActivityRate)
```
When GA absence days > threshold -> upgrade from "proposal mode" to "auto-execute + notify GA"
- GA absent 60d + activity 80% -> threshold = 12d -> upgrade at 12d
- GA absent 60d + activity <30% -> threshold = 42d -> stay conservative

---

## What We Don't Do

- Don't modify Cycle 3 GA Evolution (separate scope)
- Don't modify sentinel aggregate.ts
- Don't touch D91 trigger matrix (only consume its config)

---

## Architecture Layer

L2 (src/loops/middle-evolution-engine.ts) + L3 (consumes D93 + D63)

---

## Completion Standard

```
[ ] middle-evolution-engine.ts: processFeedbackSignals -> EvolutionAction[]
[ ] 5 evolution signal types implemented (threshold/midify/path/rootCause/contradiction)
[ ] Contradiction arbitration: factual vs causal classification + scoring
[ ] GA absence protection: time x activity-rate formula
[ ] Facts-layer only (no standard-layer modification)
[ ] Degrade: feedbackCollector unavailable -> log.warn + return empty
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=10 tests: 5 signal types + 2 arbitration + 2 GA absence + 1 degrade
```

---

## Auth Doc References

- Auth Doc A1: LoopEng Amendment -- Correction 2: Cycle 7 Middle-driven Evolution
- Auth Doc A1: Missing Piece #3: GA absence 60-day -> time x activity-rate
- Auth Doc A1: Missing Piece #4: Arbitration factual vs causal classification
