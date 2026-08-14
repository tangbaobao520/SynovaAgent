# SynovaAgent ? D60 ME Compute New (17 items) Implementation v1.0

> 2026-07-15 | Auth Doc #11 Managerial Economics Ch2 S2.3
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

- D82: 7 missing computes DONE
- D59: 7 compute enhancements (parallel execution)
- 17 edges among 42 have parameters but no compute consuming them
- Auth Doc #11 S2.3: Complete contracts for 17 new computes defined
- D60 must not duplicate D82 computes (E-11/E-12/E-21/E-22/E-40/E-41/E-42 already created)

---

## What We Build

Create 17 new compute functions. Each has contractId, JSDoc input/output/degrade contract, 4 fixture sets.

| # | Compute | contractId | ME Concept | Data Source |
|---|---------|-----------|------------|-------------|
| 1 | computeTwoPartTariff | COMPUTE-TWO-PART-TARIFF-v1 | Two-part pricing (Thomas Ch10) | PricingModel(T8) |
| 2 | computePriceDiscrimination | COMPUTE-PRICE-DISCRIMINATION-v1 | Price discrimination levels | GA customer segments |
| 3 | computeBundlingOptimal | COMPUTE-BUNDLING-OPTIMAL-v1 | Bundling strategy (Ch10) | Product catalog |
| 4 | computePeakLoadPricing | COMPUTE-PEAK-LOAD-PRICING-v1 | Peak-load pricing (Ch10) | Usage time-series |
| 5 | computeMarketStructureDiagnosis | COMPUTE-MARKET-STRUCTURE-v1 | Market structure (Ch7) | HHI + concentration |
| 6 | computeSurvivalMargin | COMPUTE-SURVIVAL-MARGIN-v1 | Survival margin (Ch8) | Cost + revenue |
| 7 | computeDemandForecast | COMPUTE-DEMAND-FORECAST-v1 | Demand forecasting (Ch4) | Historical sales |
| 8 | computeLernerIndex | COMPUTE-LERNER-INDEX-v1 | Market power (Ch7) | P + MC |
| 9 | computeSynergy | COMPUTE-SYNERGY-v1 | M&A synergy (Ch15) | Pre/post merger data |
| 10 | computeDisposalValue | COMPUTE-DISPOSAL-VALUE-v1 | Asset disposal (Ch15) | Asset records |
| 11 | computeIRR | COMPUTE-IRR-v1 | IRR (Ch14) | Cash flow projections |
| 12 | computeOptimalPrice | COMPUTE-OPTIMAL-PRICE-v1 | Optimal pricing (Ch10) | Demand curve |
| 13 | computeConfidenceInterval | COMPUTE-CONFIDENCE-INTERVAL-v1 | Statistical inference | Any metric |
| 14 | computeStatisticalSignificance | COMPUTE-STAT-SIGNIFICANCE-v1 | Hypothesis testing | Sample data |
| 15 | computeTimeSeriesDecomposition | COMPUTE-TIME-SERIES-DECOMP-v1 | Time series (Ch4) | Historical series |
| 16 | computeCrossPriceElasticity | COMPUTE-CROSS-PRICE-ELASTICITY-v1 | Cross-price elasticity (Ch4) | Multi-product prices |
| 17 | computeScaleEconomy | COMPUTE-SCALE-ECONOMY-v1 | Economies of scale (Ch6) | Cost + volume |

---

## What We Don't Do

- Don't duplicate D82 computes
- Don't modify existing computes (D59 handles that)
- Don't create sentinels (D62 handles that)

---

## Architecture Layer

L4 (Ontology Compute Layer: `packages/engine-core/src/compute/`)

---

## Completion Standard

```
[ ] 17 new compute files created
[ ] Each has JSDoc: @input / @output / @degraded contract
[ ] Each has >=4 fixture sets (normal/edge/error/temporal)
[ ] Each has contractId in COMPUTE-{NAME}-v1 format
[ ] Data sources declared (A-grade: existing metric / T8: needs entity / GA: needs config)
[ ] Degrade path: data missing -> degraded:true + log.warn
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=34 tests (2 per compute minimum, covering normal + degrade)
```

---

## Auth Doc References

- Auth Doc #11: Managerial Economics Ch2 S2.3 ? 17 new-fill compute complete contracts
- Auth Doc #1: 42-Edge Causal System ? edge-to-compute mapping
