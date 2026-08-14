# SynovaAgent -- D206 Dev Doc Gatekeeper Implementation v1.0

> 2026-07-22 | Auth Doc #17: Founder Control Tower -- Extension
> **D201 guards code commits. D206 guards dev doc handoff. Before a dev doc reaches Claude Code, it must pass five mechanical validation checks.**
> **This doc is the sole execution basis for claude code.**

---

## Authority Doc Verification (Iron Law 0-3)

- [x] Test-Path confirmed: 17 authority doc directories exist at docs/synova/research/*/
- [x] Get-Content read: Ch3 (Contract Archiver) S1 -- contract extraction from agent output; D206 applies same principle to dev docs
- [x] Select-String verified: AGENTS.md Iron Law 0-5 items #1-#7 (all dev doc quality errors), SYNOVA-AUDIT-SPEC-20260722.md (5-point audit framework)
- [x] Authority doc citation: Ch3 S1.1 -- "Agent output must be mechanically verifiable before downstream agent consumes it." D206 extends this pattern to dev doc handoff.

---

## Problem Statement

D201 (synova-commit) prevents Claude Code from committing bad code. D202 (External Auditor) detects bugs post-commit. But neither validates the DEV DOC that Claude Code consumes. Historically:

- D26: Edge IDs E-11/E-19/E-30 all wrong in dev doc (3/5 labels incorrect)
- D108: UI tabs specified as "GA Access" but authority doc says "Permissions" + "Deployment"
- D20: Q4 claims 1 test, Test Requirements says 4 fixture sets -- internal contradiction
- knowledge-curator.ts: referenced in multiple dev docs but file does not exist
- 90% of dev docs: no Test Requirements section, no Wiring Verification section

**None of these errors were caught before Claude Code started implementing.** The dev doc is the sole execution basis for Claude Code -- garbage in, garbage out.

D206 addresses this by mechanically validating every dev doc before distribution.

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent dev doc quality gate. D206 builds a pre-distribution validator that scans every dev doc for five categories of errors: fake Edge IDs, non-existent file paths, missing test specifications, missing wiring requirements, and missing authority doc citations. D206 runs BEFORE the dev doc is handed to a Claude Code session.

### Q1: Research
- Known error #5 (Edge ID label errors -- D26: 3/5 wrong)
- Known error #22 (non-existent file paths -- knowledge-curator.ts)
- Known error #2 (missing test specification -- 90% of dev docs)
- Known error #3 (missing wiring requirements -- 90% of dev docs)
- Existing pattern: D201 (gatekeeper) validates code before commit. D206 applies same pattern to dev docs before distribution.

### Q2: Scope
- Minimal: dev-doc-gatekeeper.sh that accepts a dev doc path, runs 5 validation checks, outputs PASS/FAIL per check
- NOT doing: semantic validation (can't check if author understood the doc correctly), auto-fix (only detection)

### Q3: Acceptance
- Entry: Codex Agent (me) prepares to distribute dev doc to Claude Code. Runs dev-doc-gatekeeper.sh {doc-path}
- Interaction: Script scans doc, runs 5 checks, outputs pass/fail per check
- Result: If any FAIL: doc distribution blocked. All PASS: doc can be distributed.

### Q4: Contract and Test
- @input: path to dev doc Markdown file
- @output: PASS/FAIL for each of 5 checks + overall pass/fail
- @degraded: edge ID check (grep fails) -> warn, do not block
- Tests: fake edge ID -> FAIL, missing file path -> FAIL, no Test Requirements -> FAIL, clean doc -> PASS all

---

## Current State (2026-07-22, verified by grep)

- Dev doc directory: docs/plans/codex/implementation/ contains 80+ dev docs
- AGENTS.md Iron Law 0-5: items #1-#7 cover all dev doc quality errors
- SYNOVA-AUDIT-SPEC-20260722.md: 5-point audit framework exists
- Dev doc gatekeeper: ZERO existence
- No pre-distribution validation of any kind exists

---

## What We Build

### 1. scripts/control-tower/dev-doc-gatekeeper.sh (~200 lines)

```
Usage: dev-doc-gatekeeper.sh {path-to-dev-doc.md}
Exit: 0 = ALL PASS (can distribute), 1 = FAIL (cannot distribute), 2 = DEGRADED (warn but allow)
```

**5 mandatory checks:**

| # | Check Name | What It Validates | Failure Severity | Error Pattern Ref |
|:--:|------|------|:--:|------|
| C1 | **Edge ID existence** | Every E-XX pattern in the doc is grep'd in extensions/sentinels/shared/computes/ and scripts/workflow/system-registry.json | FAIL (block) | #5 |
| C2 | **File path existence** | Every `src/...` `extensions/...` `packages/...` `app/...` path in the doc is Test-Path checked | FAIL (block) | #22 |
| C3 | **Test Requirements section** | Doc contains a "Test Requirements" or "Test Specification" header AND mentions L1/L2a/L2b/L2c | FAIL (block) | #2 |
| C4 | **Wiring Verification section** | Doc contains a "Wiring Verification" or "Iron Law 4" section with at least one specific caller file path (contains "/" or ".ts") | FAIL (block) | #3 |
| C5 | **Authority Doc Verification section** | Doc contains "Authority Doc Verification" or "Auth Doc:" section with at least one file path reference | FAIL (block) | #1 |

**Edge ID extraction method:**
```
grep -oP 'E-\d{2}' {doc-path} | sort -u | while read edge_id; do
  found=$(grep -rl "$edge_id" extensions/sentinels/ --include="*.ts" --include="*.json" 2>/dev/null | head -1)
  if [ -z "$found" ]; then
    echo "FAIL: Edge ID $edge_id not found in codebase"
  fi
done
```

### 2. Degrade modes

- Edge ID check: if grep itself fails (no grep available) -> DEGRADE, warn, do not block
- File path check: if Test-Path equivalent fails -> individual FAIL reported, overall may still pass if only optional refs
- All other checks: if checker script itself crashes -> DEGRADE (do NOT block doc distribution)

### 3. Integration into Codex Agent workflow

Before I say "dev docs ready for distribution":
```
bash scripts/control-tower/dev-doc-gatekeeper.sh docs/plans/codex/implementation/SYNOVA-IMPL-DXXX-task-name-v1-date.md
```

If exit != 0: I must fix the dev doc before distributing.

---

## What We Don't Do

- Don't validate semantic correctness (can't check "did author understand the doc")
- Don't auto-fix issues (only detect and report)
- Don't validate non-dev-doc markdown (only docs/plans/codex/implementation/ files)

---

## Test Requirements (per Auth Doc #6 Test System Spec)

### L1: Unit Contract Tests
- C1 edge ID extraction: @input (markdown with E-11, E-99) / @output (E-11=PASS, E-99=FAIL) / @degraded (grep unavailable -> DEGRADE)
- C2 file path check: @input (markdown with src/agent/main-agent.ts, src/nonexistent/foo.ts) / @output (main-agent.ts=PASS, nonexistent=FAIL)
- C3 test requirements check: @input (markdown with/without "Test Requirements" + "L1") / @output (has=pass, missing=fail)
- C4 wiring check: @input (markdown with/without "Wiring Verification" + file path) / @output (has=pass, missing=fail)
- C5 auth doc check: @input (markdown with/without "Authority Doc Verification" + path) / @output (has=pass, missing=fail)
- 4 fixture sets per check: normal (pass), boundary (partial match), error (missing), temporal (same content = same result)

### L2a: Wiring Verification
- dev-doc-gatekeeper.sh must be callable from shell (bash -n syntax check)
- Can be called programmatically from Codex Agent workflow

---

## Wiring Verification (Iron Law 4)

| Export | Caller | Verification |
|------|------|------|
| dev-doc-gatekeeper.sh | Codex Agent (me) before dev doc distribution | Manual: I must invoke it before saying "ready for distribution" |
| dev-doc-gatekeeper.sh | (future) D200 context-injector post-processing pipeline | Future integration point |

---

## Architecture Layer

Tooling layer (scripts/control-tower/) -- dev doc quality gate infrastructure

---

## Completion Standard

```
[ ] dev-doc-gatekeeper.sh: 5 mandatory checks (C1-C5)
[ ] C1: Edge ID existence verified against codebase grep
[ ] C2: File path existence verified with Test-Path
[ ] C3: Test Requirements section with L1/L2a/L2b/L2c reference detected
[ ] C4: Wiring Verification section with specific caller file paths detected
[ ] C5: Authority Doc Verification section with file path reference detected
[ ] Degrade: individual grep/Test-Path failures do NOT block (warn + continue)
[ ] Degrade: gatekeeper script itself crashes -> DEGRADE, do NOT block doc distribution
[ ] Exit code 0 = all pass, exit code 1 = one or more FAIL (block distribution)
[ ] bash -n syntax check passes
[ ] Zero as any (bash script -- no TypeScript)
[ ] >=8 tests: C1 (2) + C2 (2) + C3 (1) + C4 (1) + C5 (1) + degrade (1)
```

---

## Auth Doc References

- Auth Doc #17: Founder Control Tower -- Ch3 (Contract Archiver) S1.1 -- mechanical contract validation pattern, applied here to dev docs
- AGENTS.md Iron Law 0-5: items #1 (no authority doc reading), #2 (no test spec), #3 (no wiring), #5 (wrong edge IDs), #22 (non-existent files)
- D201: Gatekeeper (synova-commit) -- code commit gate. D206 mirrors this pattern for dev doc distribution
