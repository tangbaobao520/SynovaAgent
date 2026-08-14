# SynovaAgent ? D90 Overflow Dashboard + Investment Advisor Implementation v1.0

> 2026-07-16 | Auth Doc #15 Ch2+Ch3
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

- D88: CycleLoader + CycleRegistry DONE (cycles loaded, registered)
- D89: OverflowCompute + OverflowGraphBridge DONE (snapshots computed, stored)
- D05: Push notification pipeline DONE (reuse for alerts)
- Overflow dashboard: ZERO existence ? new build
- Investment advisor: ZERO existence ? new build

---

## What We Build

### 1. src/cycles/overflow-dashboard.ts ? Dynamic Dashboard Generator (New)

```
generateOverflowDashboard(enterpriseId, cycleRegistry, graphBridge): OverflowDashboard
```

- Each registered sub-cycle = one dashboard row
- 5 columns: cycle name / current overflow value / trend arrow / data maturity label / update cycle
- Sort: negative overflow first (attention-grabbing)
- Heatmap: sub-cycle x time axis matrix (monthly granularity, max 12 columns)
- Data maturity 3-level annotation: learning/active/mature
- Conduction timeline: each step annotated with estimatedLag

### 2. src/cycles/investment-advisor.ts ? Investment Recommendation Engine (New)

```
simulateInvestment(cycleId, amount, direction, graphBridge): InvestmentSimulationResult
```

- Conduction direction simulation (NOT precise prediction)
- Commitment list: "can do / cannot do" explicit annotation
- Execution constraint factor detection: talent_market/team_capacity/funding_availability
- Relative effect ranking: N sub-cycles sorted by marginal overflow reduction

### 3. src/routes/overflow.ts ? 3 API Endpoints (New)

```
GET  /api/overflow/dashboard/:enterpriseId
POST /api/overflow/simulate
GET  /api/overflow/snapshots/:cycleId
```

### 4. src/server.ts ? Mount overflow routes

---

## What We Don't Do

- Don't build frontend UI (backend API + data only)
- Don't do precise financial forecasting (commitment list explicitly forbids)
- Don't modify D05 push pipeline (reuse only)

---

## Architecture Layer

L3 (overflow-dashboard.ts + investment-advisor.ts) + L1 (routes/overflow.ts)

---

## Completion Standard

```
[ ] generateOverflowDashboard: dynamic generation, cycle count changes -> dashboard adapts
[ ] Heatmap: sub-cycle x time axis matrix (monthly, max 12 cols)
[ ] Data maturity annotation: 3 levels with display granularity
[ ] Conduction timeline: estimatedLag per step
[ ] simulateInvestment: conduction direction simulation (NOT precise)
[ ] Commitment list: "can do / cannot do" per output
[ ] Execution constraint factors: talent/team/funding
[ ] routes/overflow.ts: 3 endpoints
[ ] server.ts: mount overflow routes
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=10 tests: dashboard 5 + advisor 3 + routes 2
```

---

## Auth Doc References

- Auth Doc #15: Enterprise Cycle Overflow Navigation
  - Ch2: Dynamic overflow dashboard ? f(loadedCycles, computeOutputs, dataMaturity)
  - Ch3: Investment advisor ? commitment list + conduction simulation
  - Ch3 S5: Execution constraint factors
  - Ch6 S6.3: Reuse D05 push pipeline
