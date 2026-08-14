# SynovaAgent -- D20 Loop Interaction Display Implementation v1.0

> 2026-07-22 | Auth Doc #5: Agent Proactive Interaction -- Module 4
> **D91 defines the 6 loops. D8a executes them. D20 SHOWS them -- real-time loop status dashboard.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent loop visualization. D20 builds a loop interaction display page showing all 6 loops (diagnosis, navigation, evolution, self-check, knowledge, overflow) with their current status, last execution time, next trigger time, and a visual timeline of recent activity.

### Q1: Research
- Industry: AWS Step Functions execution history, Airflow DAG visualization, GitHub Actions workflow runs
- Memory lessons: Iron Law 5 -- backend information must be user-visible. The loop running in the background is invisible to the user. D20 makes it visible.

### Q2: Scope
- Minimal: app/loops.html with 6 loop cards, each showing status/lastRun/nextRun/triggerType/scale
- NOT doing: real-time WebSocket updates (polling sufficient), loop interaction controls (D21), loop log drill-down
- MVP: Read from D91 LoopTriggerConfig + D8a MainAgent + API endpoint (new: GET /api/loops/status)

### Q3: Acceptance
- Entry: User navigates to /app/loops.html (link in shell.js nav)
- Interaction: Auto-refresh every 30 seconds, manual refresh button
- Result: All 6 loops visible with current status, user knows WHAT the system is doing right now

### Q4: Contract and Test
- @input: D91 LOOP_TRIGGER_MATRIX (static config) + D8a MainAgent.getLoopStatus() (runtime)
- @output: Rendered HTML with loop status cards + timeline
- @degraded: API unreachable -> show "Monitoring paused" + manual refresh button
- Tests: new GET /api/loops/status endpoint (1 test) + manual UI verification

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates ===
G1: as any = 0
G2: empty catch has log.warn
G4: new src/ file -> paired test (GET /api/loops/status route)
G5: new export -> caller (server.ts route registration)
```

---

## Current State (2026-07-22, verified by grep)

- D91: LOOP_TRIGGER_MATRIX with 6 loops x 3 scales DONE
- D8a: MainAgent class DONE (getLoopStatus, listLoops, executeLoop)
- D94: CronScheduler hybrid trigger DONE
- D95: Cross-scale overflow validation DONE
- Note: Auth Doc #5 Module 4 defines 5 loops. D91 LOOP_TRIGGER_MATRIX has 6 (LoopEng amendment added overflow monitor). D20 displays ALL registered loops at runtime (currently 6).
- GET /api/loops/status: ZERO existence (new endpoint needed)
- Loop visualization UI: ZERO existence
- Auth Doc #5 Module 4: "Loop Interaction Display -- visualize loop execution"

---

## What We Build

### 1. GET /api/loops/status -- New API Endpoint (src/routes/loops.ts or extend existing)

```
GET /api/loops/status
Response: {
  ok: true,
  loops: [{
    loopId: string, loopName: string,
    status: 'pending'|'running'|'completed'|'failed',
    lastExecution: { startedAt, completedAt, durationMs, status },
    nextTrigger: { scale, triggerType, nextAt },
    scales: [{ name, triggerType, period, status }]
  }]
}
```

### 2. app/loops.html -- Loop Visualization Page

6 loop cards arranged in a grid (2 rows x 3 columns):

Each card shows:
- Loop icon + name (Enterprise Diagnosis, Department Navigation, etc.)
- Current status badge (green=completed, yellow=running, grey=pending, red=failed)
- Last execution time + duration ("Ran 5 min ago, took 12s")
- Next trigger time ("Next: Mon 9:00 AM" or "Waiting for P0 event")
- Trigger type (cron/event/hybrid)
- 3 scale indicators (fast/medium/slow) with mini status dots
- Click card -> expand to show timeline of last 5 executions

### 3. app/js/loops.js -- Loop Logic

```
loadLoopStatus(): void
renderLoopCard(loop): string
startAutoRefresh(intervalMs = 30000): void
```

- Fetch GET /api/loops/status
- Render 6 cards in grid
- Auto-refresh every 30 seconds
- Manual refresh button

### 4. Extend D96 shell.js nav

Add "Loops" link to shared navigation.

---

## What We Don't Do

- Don't build real-time WebSocket updates (polling sufficient for MVP)
- Don't build loop interaction controls (D21: start/stop/pause loops)
- Don't build loop execution log drill-down with detailed timing
- Don't build loop configuration editor (post-10/31)



## Test Requirements (per Auth Doc #6 Test System Spec)

### L1: Unit Contract Tests
- GET /api/loops/status endpoint: @input (none) / @output ({ loops: LoopStatus[] }) / @degraded (MainAgent unavailable -> { ok: false, loops: [], degraded: true })
- 4 fixture sets: normal (6 loops returned) / boundary (no loops registered) / error (MainAgent unavailable) / temporal (loop status transitions)

### L2a: Wiring Test
- routes/loops.ts MUST be imported by server.ts (app.use)
- GET /api/loops/status handler MUST call MainAgent via ctx or import
- Wiring verification: grep 'loopsRoutes\|/api/loops' src/server.ts -> 1 caller confirmed
- pre-push gate: wiring mismatch -> BLOCKED (Auth Doc #6 L2a)

### L2c: Loop Infrastructure Test
- All 6 loops from D91 LOOP_TRIGGER_MATRIX returned in response
- Loop status transitions verified: pending -> running -> completed/failed

---

## Architecture Layer

L1 (routes/loops.ts + app/loops.html + app/js/loops.js)

---

## Completion Standard

```
[ ] GET /api/loops/status endpoint: returns all 6 loops with status + lastExecution + nextTrigger
[ ] app/loops.html: 6 loop cards grid layout (2x3 or responsive single column)
[ ] Each card: status badge + last execution + next trigger + trigger type + scale dots
[ ] app/js/loops.js: fetch + render + auto-refresh 30s + manual refresh
[ ] Shell.js: "Loops" nav link added
[ ] Error state: API unreachable -> "Monitoring paused" + retry button
[ ] Manual test: navigate /app/loops.html -> all 6 loops visible with status
```

---

## Auth Doc References

- Auth Doc #5: Agent Proactive Interaction -- Module 4 (5 loops: diagnosis/navigation/evolution/self-check/knowledge)
- Auth Doc A1: LoopEng Amendment -- Loop 6: Overflow Monitor (added to D91 LOOP_TRIGGER_MATRIX)
  D20 reads D91 at runtime, displaying all 6 registered loops
- D91: LoopTriggerConfig (static loop definitions)
- D8a: MainAgent (loop execution status)
- D94: CronScheduler (hybrid trigger timing)
