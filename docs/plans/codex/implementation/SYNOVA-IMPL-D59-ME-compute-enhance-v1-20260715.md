# SynovaAgent ? D59 ME Compute Enhance (7 items) Implementation v1.0

> 2026-07-15 | Auth Doc #11 Managerial Economics Ch2 S2.2
> Standard: Anthropic Engineering ? Iron Law 0-2 (spec->test->impl->wire) ? 5-Layer Architecture
> **This doc is the sole execution basis for claude code.**

---

## Execution Constraints (5 Questions Per Commit)

```
1. Wiring Check: Who calls the new export? (grep for callers)
2. Exception Handling: Every catch has log + degraded? (Iron Law 24+31)
3. Type Safety: as any = 0? (Iron Law 38)
4. Test Coverage: Tests have expect() assertions? Normal/degrade/boundary? (Iron Law 48)
5. Dead Code: Any dead code? Old files deleted? Old functions still referenced?
```

---

## Current State (2026-07-15 Audit)

- D82: 7 missing computes (E-11/E-12/E-21/E-22/E-40/E-41/E-42) DONE
- 7 existing computes among 42 edges lack ME semantic interpretation
- Auth Doc #11 S2.2: Complete contracts for 7 enhancements defined

---

## What We Build

Append `economic_interpretation` output field to 7 existing compute functions.
Do NOT change contractId. Do NOT change core logic. Pure append.

| # | Compute | contractId | Edges | New Fields |
|---|---------|-----------|-------|-------------|
| 1 | computeBreakEven | COMPUTE-BREAK-EVEN-v1 | E-13/E-23/E-30 | bep_classification / safety_margin / fixed_cost_structure / action_implication |
| 2 | computeDOL | COMPUTE-DOL-v1 | E-13/E-23 | dol_classification / direction_amplification / risk_level |
| 3 | computeNPV | COMPUTE-NPV-v1 | E-34 | npv_interpretation / discount_sensitivity |
| 4 | computeMarginalCost | COMPUTE-MARGINAL-COST-v1 | E-23 | scale_economy_diagnosis / optimal_volume_estimate |
| 5 | computeHHI | COMPUTE-HHI-v1 | E-33 | market_concentration_classification / merger_implication |
| 6 | computeLearningCurve | COMPUTE-LEARNING-CURVE-v1 | E-09 | learning_rate_interpretation / cost_reduction_forecast |
| 7 | computeAgencyCost | COMPUTE-AGENCY-COST-v1 | E-07/E-15 | agency_cost_breakdown / governance_recommendation |

---

## What We Don't Do

- Don't modify existing compute core calculation logic
- Don't modify contractId
- Don't delete old interfaces
- Don't touch D60 (17 new computes)

---

## Architecture Layer

L4 (Ontology Compute Layer: `packages/engine-core/src/compute/`)

---

## Completion Standard

```
[ ] 7 computes each append economic_interpretation field
[ ] Each economic_interpretation has >=3 sub-fields
[ ] No contractId modification
[ ] No core logic modification
[ ] All appended fields have JSDoc
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=14 tests (2 per compute: normal path confirms interpretation + degrade path confirms interpretation not lost)
```

---

## Auth Doc References

- Auth Doc #11: Managerial Economics Ch2 S2.2 ? 7 enhance-existing compute complete contracts
