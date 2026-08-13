# D25 Contract Test Gap Report

> Generated: 2026-07-20

## Summary

| Metric | Value |
|--------|-------|
| Total Compute Files | 94 |
| Confirmed Gaps | 87 |
| Fixed (D25) | 7 |

## Fixes Applied

| Compute | Fix |
|---------|-----|
| break-even.ts | +@input/@output/@degraded JSDoc |
| marginal-contribution.ts | +@input/@output/@degraded JSDoc |
| fixed-cost-rigidity.ts | +@input/@output/@degraded JSDoc |
| scenario-simulation.ts | +@input/@output/@degraded JSDoc |
| variable-costs.ts | +@input/@output/@degraded JSDoc |
| gross-margin-per-unit.ts | +@input/@output/@degraded JSDoc |
| ltv-cac-ratio.ts | +@input/@output/@degraded JSDoc |

## Scripts

- `scripts/ci/check-contract-gaps.sh` — gap scan tool

## Remaining Gaps

87 pre-I2 compute files lack @contract JSDoc. Fill during normal dev cycles.
