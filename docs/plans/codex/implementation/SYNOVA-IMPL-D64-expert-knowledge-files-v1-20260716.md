# SynovaAgent -- D64 4 Expert Knowledge Files Implementation v1.0

> 2026-07-16 | Auth Doc #11 Managerial Economics Ch4 S4.3
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

- D58: 9 expert PROMPT.md files DONE
- D70: IDENTITY.md analytical_lens fields DONE
- D63: 4 SKILL pull-mode (parallel execution)
- Expert knowledge files (TOOLS.md/KNOWLEDGE.md): NOT YET EXIST outside prompt-assembler scope
- Auth Doc #11 S4.3: 4 knowledge files to append/inject to existing expert files

---

## What We Build

### 4 Expert Knowledge File Injections

| # | File | Expert | Content | Priority |
|---|------|--------|---------|----------|
| 1 | marketing/TOOLS.md (append) | marketing | Demand forecasting framework (Ch4): qualitative vs quantitative selection matrix. Time series decomposition as computeDemandForecast prerequisite | P1 |
| 2 | strategy/KNOWLEDGE.md (new) | strategy | Market structure 4 quadrants (perfect/monopoly/oligopoly/monopolistic) + HHI thresholds + pricing power indicators | P1 |
| 3 | finance/KNOWLEDGE.md (new) | finance | Capital budgeting decision tree (NPV>0 + IRR>WACC + payback < threshold) + working capital optimization principles | P1 |
| 4 | org/KNOWLEDGE.md (new) | org | Agency cost theory primer: monitoring/bonding/residual loss + governance mechanism comparison | P1 |

### File format

Each file: Markdown with ## sections. Loaded by expert-file-loader.ts (existing D70 mechanism).
- TOOLS.md: append to existing file
- KNOWLEDGE.md: new file in expert/{name}/ directory

---

## What We Don't Do

- Don't modify prompt-assembler.ts (D54)
- Don't modify expert-file-loader.ts (D70) -- reuse existing loading mechanism
- Don't touch D63 SKILL pull-mode

---

## Architecture Layer

L3 (expert/{name}/KNOWLEDGE.md + TOOLS.md) -- file-driven knowledge injection

---

## Completion Standard

```
[ ] marketing/TOOLS.md: demand forecasting framework appended
[ ] strategy/KNOWLEDGE.md: market structure 4 quadrants + HHI thresholds + pricing power
[ ] finance/KNOWLEDGE.md: capital budgeting decision tree + working capital principles
[ ] org/KNOWLEDGE.md: agency cost primer + governance comparison
[ ] Each file has >=3 ## sections with actionable content (not just definitions)
[ ] Existing TOOLS.md not overwritten (append only)
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] >=4 tests: 1 per file (existence + valid Markdown + >=3 sections)
```

---

## Auth Doc References

- Auth Doc #11: Managerial Economics Ch4 S4.3 -- 4 expert knowledge file injections
