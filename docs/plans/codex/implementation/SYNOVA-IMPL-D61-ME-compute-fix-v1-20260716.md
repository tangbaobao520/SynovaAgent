# SynovaAgent ? D61 ME Compute New (3 items) Implementation v1.0

> 2026-07-16 | Auth Doc #11 Managerial Economics Ch2 S2.4 (3 new computes ? v1 files do not exist in codebase)
> Standard: Anthropic Engineering ? Iron Law 0-2 ? 5-Layer Architecture
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

- D59: 7 compute enhancements DONE (economic_interpretation on existing)
- D60: 17 new ME computes DONE
- 3 computes listed in Auth Doc #11 S2.4 as "fix-existing" have NO v1 files in codebase
- Strategy: create as NEW computes with COMPUTE-{NAME}-v1 (no @deprecated needed, v1 never existed)
- Verified: grep confirms compute-price-elasticity.ts / compute-margin-trend.ts / compute-working-capital.ts absent from entire repo

---

## What We Build

| # | Compute | contractId | Auth Doc Concept | Key Fields |
|---|---------|-----------|-----------------|------------|
| 1 | computePriceElasticity | COMPUTE-PRICE-ELASTICITY-v1 | Price elasticity (Ch4) | elasticity / r_squared / residual_analysis / multicollinearity_warning / confidence_interval |
| 2 | computeMarginTrend | COMPUTE-MARGIN-TREND-v1 | Margin trend decomposition | decomposition (price-driven vs cost-driven) / breakeven_cross_ref / trend_direction |
| 3 | computeWorkingCapital | COMPUTE-WORKING-CAPITAL-v1 | Working capital (Ch14) | cash_conversion_cycle / liquidity_risk_tier / working_capital_ratio |

Each: new file, new contractId, full JSDoc, >=3 interpretation sub-fields, degrade path.

---

## What We Don't Do

- Don't touch D59/D60 computes (separate scope)
- Don't create sentinels (D62 handles that)

---

## Architecture Layer

L4 (packages/engine-core/src/compute/ or extensions/sentinels/shared/computes/)

---

## Completion Standard

```
[ ] 3 new compute files created in extensions/sentinels/shared/computes/
[ ] Each has JSDoc: @input/@output/@degraded contract
[ ] Each has contractId in COMPUTE-{NAME}-v1 format
[ ] Each has economic_interpretation >=3 sub-fields
[ ] computePriceElasticity: elasticity + r_squared + residual_analysis + multicollinearity_warning + confidence_interval
[ ] computeMarginTrend: decomposition + breakeven_cross_ref + trend_direction
[ ] computeWorkingCapital: cash_conversion_cycle + liquidity_risk_tier + working_capital_ratio
[ ] Registered in shared/computes/index.ts
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=9 tests (3 per compute: normal + degrade + boundary)
```

---

## Auth Doc References

- Auth Doc #11: Managerial Economics Ch2 S2.4 ? 3 compute contracts (price-elasticity/margin-trend/working-capital). Note: v1 files absent, creating as NEW.
