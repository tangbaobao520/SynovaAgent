# SynovaAgent -- D25 Contract Test Completion Implementation v1.0

> 2026-07-20 | Auth Doc #6: Test System Spec -- Chapter 2
> **Fills the gap: pre-D29 compute and sentinel modules lacking @contract coverage.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent test system completion. D25 scans all compute/sentinel modules for missing @contract coverage and fills the gaps.

### Q1: ??
- Best practice: @contract pattern -- JSDoc @input/@output/@degraded + 4 fixture sets (normal/boundary/error/temporal)
- Memory lessons: Iron Law 48 -- tests must not be empty shells. Every compute needs at least 3 paths. Empty tests -> commit blocked.

### Q2: ??
- Minimal: scan extensions/sentinels/ for all compute and sentinel, identify those without @contract coverage, fill gaps
- NOT doing: new golden cases (D51 already done), modifying existing compute logic

### Q3: ??
- Entry: script scripts/ci/check-contract-gaps.sh scans for gaps
- Interaction: each gap module -> add @contract JSDoc + test file
- ??: ?? compute/sentinel ? @contract + ?? 3 ? expect ??

### Q4: Contract and Test
- compute: @input/@output/@degraded JSDoc + 3 fixture sets + test file
- sentinel: manifest.json + aggregate.ts + integration test

---

## Execution Constraints (Loop Engineering V4.4.5 Mandatory)

```
=== Per-Commit ===
G1: as any = 0 (Iron Law 38)
G2: empty catch -> log.warn (Iron Law 24+31)
G4: new test files exist (Iron Law 0-2)
G6: compute functions have @contract + tests (Iron Law 47+48)

=== Post-Code Self-Check ===
1. [WIRING] New compute registered in index.ts?
2. [EXCEPTION] Every catch -> log.warn + degraded?
3. [TYPES] as any = 0?
4. [TESTS] Every test has expect()? Normal/degrade/boundary?
5. [DEAD CODE] None
```

---

## Current State

- D24: @contract completion (29/29 compute) DONE -- covered I2-3b/3c/3d computes
- D51: Golden Case F1 Gate DONE (5 cases)
- D99: E2E Full Pipeline Test DONE (8 stages)
- But: pre-D29 code (T1-T6, I2, D1-D28 era) may lack @contract coverage
- Scan target: all compute functions in extensions/sentinels/shared/computes/
- Scan target: all sentinels in extensions/sentinels/ (excluding _extinct/)

---

## What We Build

### Step 1: Gap Scan Script (scripts/ci/check-contract-gaps.sh)

```
For each compute file (*/compute*.ts not index.ts):
  [ ] Has JSDoc with @input/@output/@degraded?
  [ ] Has paired test file?
  [ ] Test has >=3 expect() assertions?

For each sentinel directory (*/manifest.json):
  [ ] Has aggregate.ts?
  [ ] Has integration test?
  [ ] Test covers aggregate() + check()?

Output: gap report -> docs/synova/test-gaps/D25-gap-report.md
```

### Step 2: Fill Gaps

For each compute without @contract:
- Add JSDoc: @input (param types), @output (return type + key fields), @degraded (when violated + returned structure)
- Add test file with >=3 tests: normal path + degraded path + boundary condition
- Register in index.ts if not already

For each sentinel without integration test:
- Add .integration.test.ts: aggregate() -> verify structure, check() -> verify findings[]
- Cover: normal data, missing data (degraded), boundary values

### Step 3: CI Integration

Add contract-gap-check to ci.yml (or pre-commit) as informational (warning, not hard-block for first run).

---

## What We Don't Do

- Don't modify compute function logic
- Don't create new golden cases
- Don't change existing test frameworks

---

## Completion Standard

```
[ ] check-contract-gaps.sh: scans all compute + sentinel, outputs gap list
[ ] D25-gap-report.md: gap report with module-by-module status
[ ] All compute: @contract JSDoc present + test file exists + >=3 expect
[ ] All sentinel: integration test exists + covers aggregate()+check()
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=10 new test files created (estimate -- depends on scan results)
```

---

## Auth Doc References

- Auth Doc #6: Test System Spec -- Chapter 2 (contract test specification)
- D24: @contract completion (reference pattern)
- Iron Law 47+48: contract priority + non-empty test shells
