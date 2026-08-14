# SynovaAgent ? D62 ME Sentinels (9 items) Implementation v1.0

> 2026-07-16 | Auth Doc #11 Managerial Economics Ch3
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

- D59+D60: 24 ME computes DONE
- Sentinel infrastructure: sentinel-loader.ts + manifest.json pattern DONE
- Auth Doc #11 Ch3: 7 enhance-existing + 2 new ME sentinels defined
- Existing sentinels (real names): unit-economics, capital-health, margin-health, competitive-position, knowledge-accessibility, incentive-alignment

---

## What We Build

### Group A: 7 Enhanced Existing Sentinels (post-processors)

Do NOT modify aggregate.ts. Append post-processors field to manifest.json pointing to D59/D60 economic_interpretation.

| Sentinel (real) | Concept Name | post-processor compute | Trigger | Injected Content |
|----------|------|----------------------|---------|-----------------|
| unit-economics | breakeven | computeBreakEven | BEP done | Classification + safety margin + cost structure |
| capital-health | operating-leverage | computeDOL | DOL > 2.0 | Leverage class + direction amplification + risk |
| capital-health | npv-negative | computeNPV | NPV < 0 | NPV interpretation + sensitivity |
| margin-health | margin-trend | computeMarginalCost | MC > MR | Marginal profit + optimal volume |
| competitive-position | hhi-concentration | computeHHI | HHI > 2500 | Market structure + pricing power |
| knowledge-accessibility | learning-curve | computeLearningRate | learning_rate deviates >50% | Learning comparison + scale economy |
| incentive-alignment | agency-cost | computeAgencyCost | agency_cost triggers critical | Agent-principal classification |

### Group B: 2 New ME Sentinels

| # | Sentinel | Consumes | Severity Thresholds |
|---|----------|----------|---------------------|
| 1 | sentinel-pricing-strategy | margin-health + competitive-position findings | warning: uniform pricing with >15% profit gain from discrimination; critical: price < MC |
| 2 | sentinel-forecast-accuracy | DemandForecast output | warning: MAPE > 20% or samples < 15; critical: time series < 4 months |

Each new sentinel: manifest.json + aggregate.ts + test file.

---

## What We Don't Do

- Don't modify existing aggregate.ts of 7 enhanced sentinels (only add post-processors field to manifest.json)
- Don't create new sentinel loader (reuse existing infrastructure)
- Don't touch D59/D60/D61 computes

---

## Architecture Layer

L3 (extensions/sentinels/[name]/manifest.json) ? modify manifest.json only

---

## Completion Standard

```
[ ] 7 existing sentinel manifest.json updated with post-processors field
[ ] 2 new sentinels: manifest.json + aggregate.ts + test
[ ] Each manifest.json has: name/version/type/displayName/edges/computes/post-processors
[ ] post-processors format: { compute: "contractId", trigger: "condition", inject: "field" }
[ ] aggregate.ts for new sentinels: aggregate() + check() functions
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=18 tests: 2 per sentinel (normal + degraded) + 4 integration
```

---

## Auth Doc References

- Auth Doc #11: Managerial Economics Ch3 ? 9 ME Sentinel Specifications
- Auth Doc #3: Sentinel-Compute-Ontology Spec ? sentinel manifest schema
