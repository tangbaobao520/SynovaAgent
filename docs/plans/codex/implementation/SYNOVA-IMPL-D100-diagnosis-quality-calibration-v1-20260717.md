# SynovaAgent -- D100 Diagnosis Quality Calibration Implementation v1.0

> 2026-07-17 | Pre-Launch Verification Track | Iron Law 0-2 | 5-Layer Architecture
> **The F1 score says the system is right. This task determines if it is useful.**
> **This doc is the sole execution basis for claude code.**

---

## Problem Statement

D51 Golden Case F1 Gate validates that the system identifies the correct root cause with 100% accuracy on frozen static data. But F1=1.0 does NOT mean the report is useful to a CEO.

A correct report that says "Root cause: E-05 CAPITAL_ACQUISITION (confidence 0.85)" is technically right but commercially useless. The CEO needs: "Your cash flow problem is driven by a capital acquisition bottleneck. Three specific actions can reduce this by 30% within 90 days."

This task calibrates the gap between "technically correct" and "commercially useful."

---

## What We Build

### Part A: Automated Quality Checks (scripts/ci/diagnosis-quality-check.sh)

Run all 5 golden cases through full diagnosis, then verify structural quality:

```
1. CEO summary: >= 100 chars, contains no placeholder text (no "{{" or "TODO")
2. Key findings: each finding has severity + description + evidence count >= 1
3. Action recommendations: each has timeline + expectedImpact (not "???")
4. Cross-expert coherence: no two experts contradict on same edge
5. Tone check: no list-formatted text in report body (D57 enforceReport verified)
6. Cross-scale warnings: fast/slow overflow signals validated (D95 verified)
7. Goal generation: proposal paths all have distinct strategies (not identical text)
```

Output: pass/fail per golden case with specific line references for fixes.

### Part B: Manual Readability Review (docs/synova/calibration/D100-calibration-report.md)

Human review of all 5 reports. For each report, answer:

```
1. Does the CEO summary make sense to a non-technical reader? (Y/N)
2. Are the 3 key findings ordered by business impact? (Y/N)
3. Do the action recommendations have concrete, measurable steps? (Y/N)
4. Is there any sentence that sounds like a template fill-in-the-blank? (List them)
5. Does the cross-expert validation add insight or just repeat? (Insight/Repeat)
```

### Part C: Calibration Actions

Based on Parts A and B, produce specific fixes:

| Finding | Fix Target | Action |
|---------|-----------|--------|
| Placeholder text in report | PROMPT.md M3 section | Remove "???" defaults, add domain-specific text |
| Contradictory expert opinions | Expert weight config | Adjust confidence weight for conflicting expert |
| Generic action recommendations | D61 computePriceElasticity etc. | Enrich economic_interpretation fields |
| Report reads as template | PROMPT.md M1 role definition | Add domain context + enterprise name in template |
| Tone too technical | D57 tone-enforcer threshold | Lower tolerance for jargon in CEO summary |

Each fix is a specific file edit with before/after diff. No redesign, no new modules -- only parameter tuning.

---

## What We Don't Do

- Don't redesign the diagnosis pipeline
- Don't add new PROMPT.md modules (M1-M6 structure unchanged)
- Don't create new compute functions
- Don't change the golden case expected outputs

---

## Completion Standard

```
[ ] Part A: diagnosis-quality-check.sh script runs on all 5 golden cases
[ ] Part A: 7 structural checks pass with zero failures OR documented exceptions
[ ] Part B: calibration report with 5 x 5 human review answers
[ ] Part B: each report issue has specific file:line reference
[ ] Part C: calibration fix list with specific file edits (before/after)
[ ] Part C: all fixes applied and verified (re-run Part A)
[ ] PROMPT.md changes: zero placeholder text in CEO summary output
[ ] D57 tone-enforcer: zero list-formatted text in report body
[ ] Zero as any (any TypeScript changes)
[ ] tsc --noEmit zero new errors
[ ] vitest run golden-case-checker -- all 5 still pass (regression check)
```

---

## Auth Doc References

- D51: Golden Case F1 Gate (golden-case-checker.ts)
- D57: Tone Enforcer (tone-enforcer.ts)
- D58: PROMPT.md templates (expert/*/PROMPT.md)
- D95: Cross-scale Validation (cross-scale-validator.ts)
