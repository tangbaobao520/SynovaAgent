# SynovaAgent -- D93 Middle Manager Data Pipeline Implementation v1.0

> 2026-07-16 | Auth Doc A1: Loop Engineering Amendment -- Missing Piece #1 (P0)
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

- D74: Workspace data aggregation (workspace-builder.ts + next-action-engine.ts + dnd-engine.ts) DONE
- D76: Knowledge feedback (knowledge-feedback.ts) DONE -- handles Goal closure -> PKB
- **feedback-collector.ts: DOES NOT EXIST** -- this is the P0 gap
- workspace-data.ts (routes): handles department workspace API -- NO write to feedback collector
- Amendment doc finding: "Middle manager behavior data not piped to feedback-collector. workspace-data.ts has no write call to feedback-collector.ts."

---

## What We Build

### 1. src/growth/feedback-collector.ts -- Middle Feedback Collector (New)

```
collectFeedback(input: MiddleFeedbackInput): FeedbackRecord
queryFeedback(filters: FeedbackQuery): FeedbackRecord[]
getAggregatedSignals(threshold?: number): AggregatedSignal[]
```

Input sources:
- Middle manager marks sentinel alert as "false alarm" -> decision:'reject'
- Middle manager adjusts Goal target value during execution -> decision:'modify'
- Middle manager rejects a Proposal path -> decision:'reject_path'
- Middle manager closes Goal with "completed but ineffective" -> decision:'ineffective'

### 2. Wire into workspace-data.ts (Modify)

Add write calls in workspace-data.ts route handlers:
- PUT /api/workspace/:id/finding/:findingId/dismiss -> collectFeedback({decision:'reject'})
- PUT /api/workspace/:id/goal/:goalId/target -> collectFeedback({decision:'modify'})
- POST /api/workspace/:id/proposal/:proposalId/reject -> collectFeedback({decision:'reject_path'})

### 3. Persistent storage (SQLite)

feedback_log table: id / enterprise_id / actor_id / decision_type / target_type / target_id / reason / evidence_refs / created_at

---

## What We Don't Do

- Don't implement the full Cycle 7 evolution logic (D92 handles that)
- Don't modify knowledge-feedback.ts (D76 -- separate purpose: Goal -> PKB)
- Don't create new routes (inject into existing workspace-data.ts)

---

## Architecture Layer

L2 (src/growth/feedback-collector.ts) -> L5 (SQLite feedback_log table) + L1 (workspace-data.ts wiring)

---

## Completion Standard

```
[ ] feedback-collector.ts: collectFeedback + queryFeedback + getAggregatedSignals
[ ] FeedbackRecord type: decision_type / target_type / target_id / reason / evidence_refs
[ ] SQLite DDL: CREATE TABLE IF NOT EXISTS feedback_log with all columns
[ ] workspace-data.ts: 3 injection points wired (dismiss finding / adjust goal / reject proposal)
[ ] Aggregation: same sentinel x same category >=3 -> AggregatedSignal with count + latest timestamp
[ ] Degrade: SQLite write failure -> log.warn + return false (don't block user operation)
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=9 tests: 3 collect + 2 query + 2 aggregate + 2 wiring (normal + degrade)
```

---

## Auth Doc References

- Auth Doc A1: LoopEng Amendment -- Missing Piece #1: Middle manager behavior data pipeline
- Auth Doc #13: Growth Navigation -- D74 Workspace data aggregation
