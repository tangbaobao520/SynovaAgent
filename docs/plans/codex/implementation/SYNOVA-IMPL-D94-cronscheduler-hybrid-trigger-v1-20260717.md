# SynovaAgent -- D94 CronScheduler Hybrid Trigger Implementation v1.0

> 2026-07-17 | Auth Doc A1: LoopEng Amendment -- Missing Piece #5
> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture
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

- src/cron/scheduler.ts: CronScheduler exists, cron-only (cron TEXT field)
- No trigger_type field in cron_jobs table
- No event listening mechanism
- Amendment Missing Piece #5: "CronScheduler doesn't support hybrid (cron+event) triggers"
- D91: Multi-scale trigger matrix needs hybrid triggers (cron as safety net + event as accelerator)

---

## What We Build

### 1. Extend CronScheduler (Modify src/cron/scheduler.ts)

Add to CronJob interface:
```
triggerType: 'cron' | 'event' | 'hybrid'
eventTypes?: string[]  // event types to listen for (hybrid/event only)
```

Add to CronScheduler:
```
registerEventTrigger(jobId: string, eventType: string): void
onEvent(eventType: string, payload?: unknown): Promise<void>
resetEventTimer(jobId: string): void  // reset cron cooldown after event fires
```

### 2. SQLite DDL Extension

ALTER TABLE cron_jobs ADD COLUMN trigger_type TEXT DEFAULT 'cron'
ALTER TABLE cron_jobs ADD COLUMN event_types TEXT DEFAULT '[]'
ADD COLUMN last_event_at TEXT

### 3. Hybrid Logic

When triggerType='hybrid':
- Cron expression = max interval safety net (e.g., monthly minimum)
- Event listener = acceleration trigger (e.g., sentinel P0 alert)
- Either fires -> job executes
- After execution -> reset both timers

---

## What We Don't Do

- Don't remove existing cron-only behavior (backward compatible)
- Don't modify existing job registration interface
- Don't create new cron jobs (D91 handles that)

---

## Architecture Layer

L5 (src/cron/scheduler.ts -- storage layer scheduling)

---

## Completion Standard

```
[ ] CronJob.triggerType: 'cron' | 'event' | 'hybrid' field
[ ] CronScheduler.registerEventTrigger(jobId, eventType)
[ ] CronScheduler.onEvent(eventType, payload) -- trigger matching jobs
[ ] SQLite: ALTER TABLE ADD COLUMN trigger_type + event_types
[ ] Hybrid: cron is safety net, event is accelerator, both reset after fire
[ ] Backward compatible: existing cron-only jobs unaffected
[ ] Degrade: event listener failure -> log.warn, cron safety net still runs
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=8 tests: 3 cron-only (unchanged) + 2 event trigger + 2 hybrid + 1 degrade
```

---

## Auth Doc References

- Auth Doc A1: LoopEng Amendment -- Missing Piece #5: CronScheduler hybrid trigger
