# SynovaAgent -- D91 Multi-scale Trigger Matrix Implementation v1.0

> 2026-07-17 | Auth Doc A1: LoopEng Amendment -- Correction 1
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

- src/cron/scheduler.ts: CronScheduler exists, supports cron-only trigger
- D88+D89: CycleLoader + OverflowGraphBridge DONE (overflow monitoring)
- D90: Overflow dashboard + advisor DONE
- D93: feedback-collector (middle manager behavior pipeline) DONE
- Amendment doc: 5 loops -> multi-scale trigger matrix (fast/medium/slow x each loop)
- Trigger types: cron, event (sentinel P0 alert), hybrid (cron+event)
- CronScheduler currently only supports cron TEXT field -- Missing Piece #5 (D94)

---

## What We Build

### 1. src/loops/loop-trigger-config.ts -- Loop Trigger Configuration (New)

Define the multi-scale trigger matrix as a typed configuration:

```
interface LoopTriggerConfig {
  loopId: string;
  loopName: string;
  scales: TriggerScale[];
}

interface TriggerScale {
  name: 'fast' | 'medium' | 'slow';
  period: string;           // cron expression for minimum cadence
  triggerType: 'cron' | 'event' | 'hybrid';
  eventSource?: string;     // event type if event-driven (e.g., 'sentinel:P0')
  coverage: string;         // what sentinels/edges are covered
  condition: string;        // trigger condition description
}
```

6 loop configurations:
- Loop 1: Enterprise Diagnosis (fast=weekly P0, medium=monthly P1, slow=quarterly full)
- Loop 2: Department Navigation (fast=event-driven, medium=weekly, slow=monthly)
- Loop 3: GA Evolution (fast=monthly, medium=quarterly, slow=semi-annual)
- Loop 4: System Self-Check (unchanged -- pure ops)
- Loop 5: Knowledge Accumulation (fast=post-diagnosis, medium=monthly, slow=quarterly)
- Loop 6: Overflow Monitor (fast=weekly cash, medium=monthly customer, slow=quarterly brand)

### 2. src/loops/loop-scheduler.ts -- Multi-scale Scheduler (New)

Consume LoopTriggerConfig[] and CronScheduler:
- registerLoop(config): register a loop with its scales
- onEvent(eventType, payload): event-driven trigger entry point
- getNextTrigger(loopId, scale): when will this scale next fire?

### 3. Wire into Bootstrap (Phase 2e)

Register loops during Phase 2e startup (D83/D88).

---

## What We Don't Do

- Don't modify CronScheduler core (D94 handles hybrid trigger extension)
- Don't implement the evolution logic (D92 handles Cycle 7)
- Don't create new sentinels

---

## Architecture Layer

L2 (src/loops/) -- config-driven trigger registration

---

## Completion Standard

```
[ ] loop-trigger-config.ts: 6 loop configs x 3 scales each
[ ] loop-scheduler.ts: registerLoop / onEvent / getNextTrigger
[ ] Each trigger scale: period + triggerType + eventSource + coverage + condition
[ ] Event-driven triggers: sentinel P0 alert -> Loop 1 fast diagnosis
[ ] Hybrid triggers: cron as max-interval safety net + event as acceleration
[ ] Degrade: CronScheduler unavailable -> log.warn + degrade
[ ] Zero as any
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=10 tests: 3 config validation + 3 registration + 2 event trigger + 2 degrade
```

---

## Auth Doc References

- Auth Doc A1: LoopEng Amendment -- Correction 1: Multi-scale trigger matrix
