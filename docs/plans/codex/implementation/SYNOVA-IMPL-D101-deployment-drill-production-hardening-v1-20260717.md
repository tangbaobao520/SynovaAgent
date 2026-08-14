# SynovaAgent -- D101 Deployment Drill + Production Hardening Implementation v1.0

> 2026-07-17 | Pre-Launch Verification Track | Iron Law 0-2 | 5-Layer Architecture
> **The system has 85 computes, 50 sentinels, 9 experts -- and has never been started from scratch on a clean machine.**
> **This doc is the sole execution basis for claude code.**

---

## Problem Statement

Every component passes unit tests. Zero components have been verified on a clean checkout. The Bootstrap Phase 0-5 startup has only been tested in unit tests with mocked dependencies. D52 has two P0 fixes on disk but never committed. The frontend has never been opened against a running backend.

This task simulates the client IT team deploying the system for the first time.

---

## What We Build

### Step 1: Commit D52 P0 Fixes

Two files exist on disk, never committed:
- src/deploy/watchdog-entry.ts (2583 bytes -- watchdog sidecar entry point)
- src/routes/self-ops.ts (2232 bytes -- 3 self-ops API endpoints)
- src/server.ts -- already has selfOpsRoutes import + mount (previous edit)

Commit these with a single commit: `fix(D52): watchdog entry + self-ops wiring`

### Step 2: Bootstrap Verification (scripts/deploy/verify-bootstrap.sh)

Script that runs Bootstrap on a clean checkout and verifies all phases:

```
1. Clean checkout: git stash + npm ci (fresh node_modules)
2. Start server: node --import tsx/esm src/index.ts (or npm run dev)
3. Monitor startup log for:
   Phase 0: Config/DB/Audit initialized -- verify within 5s
   Phase 1: Schema migration complete -- verify no errors
   Phase 2a-2d: Core engines loaded -- verify DAG order
   Phase 3: Compute + Sentinel + Extension -- verify sentinel count >= 40
   Phase 4: Vault + PII + Experts + Policy -- verify all 9 experts loaded
   Phase 5: Cron + MCP + Container -- verify scheduler started
4. Wait for app.listen() -- verify 'Server started on port XXXX'
5. Overall: all phases complete within 30 seconds
```

### Step 3: API Smoke Test (scripts/deploy/smoke-test.sh)

Curl-based smoke test against all API endpoints. Not testing business logic -- just verifying:

```
[ ] GET /api/healthz -- returns { status: "healthy" }
[ ] POST /api/auth/login -- returns { ok: true, token: "..." }
[ ] GET /api/workspace/default -- returns { ok: true, data: {...} } (with auth header)
[ ] GET /api/overflow/dashboard/default -- returns { ok: true, data: {...} }
[ ] GET /api/sentinel/reports -- returns JSON array (may be empty, but valid)
[ ] GET /api/diagnosis/consult/status -- returns 200 (may be 404, but not 500)
[ ] GET /app/login.html -- returns HTML (200, Content-Type: text/html)
[ ] GET /app/dashboard.html -- returns HTML (200)
[ ] GET /app/report.html -- returns HTML (200)
[ ] POST /api/diagnosis/consult -- returns { consultationId: "..." } (timeout 30s)
[ ] ... (full list of 45 route mounts from server.ts)
```

Pass criteria: zero 500 errors, zero connection refused, zero timeout on health endpoints.

### Step 4: Frontend-Backend Integration Verification

Manual verification checklist (documented in deployment report):
1. Open browser -> /login -> enter demo credentials -> redirect to dashboard
2. Dashboard loads: 3 health cards visible + goals list + alerts list
3. Click "Generate Diagnosis Report" -> button disables -> redirects to /app/report.html?id=xxx
4. Report page: shows "In Progress" pulse -> transitions to "Complete" -> CEO summary visible
5. Click "Back to Dashboard" -> returns to dashboard
6. Click "Export PDF" on report page -> browser print dialog opens

### Step 5: CronScheduler Hybrid Trigger Verification

```
1. Register a test hybrid job: cron="*/5 * * * *" + eventType="test:event"
2. Wait for cron to fire (within 5 minutes) -- verify job runs
3. Emit test event: emitEvent("test:event") -- verify job runs immediately
4. Verify: after event fires, cron timer resets (next cron time pushed forward)
5. Verify: cron-only job is NOT affected by event emission
```

### Step 6: Deployment Checklist Output

Write docs/synova/deployment/D101-deployment-checklist.md:
- System requirements (Node 22+, SQLite, 4GB RAM, 10GB disk)
- Environment variables (all required + optional)
- Startup command + expected log output
- Health check endpoint + expected response
- First login instructions (demo credentials)
- Troubleshooting: common errors + solutions
- Backup/restore instructions (D50)

---

## What We Don't Do

- Don't modify any business logic (pure verification + D52 fix commit)
- Don't optimize performance (MVP verification)
- Don't add new features
- Don't modify golden datasets

---

## Completion Standard

```
[ ] D52 P0 fixes committed (watchdog-entry.ts + self-ops.ts + server.ts)
[ ] verify-bootstrap.sh: all 5 phases pass within 30s on clean checkout
[ ] smoke-test.sh: 45+ endpoints, zero 500 errors, zero connection refused
[ ] Frontend verification: login -> dashboard -> diagnosis -> report -> back -> export (6 steps)
[ ] CronScheduler hybrid: cron fires + event fires + timer resets
[ ] Deployment checklist: system requirements + env vars + startup + first-login + troubleshooting
[ ] Zero as any (in any committed TypeScript changes)
[ ] tsc --noEmit zero new errors
[ ] All existing tests still pass (regression check)
```

---

## Auth Doc References

- D52: Scaled Ops (watchdog + self-ops P0 fixes)
- D83: Bootstrap startup sequence
- D49: System health (healthz)
- D94: CronScheduler hybrid trigger
- Auth Doc #9: Deployment Operations Spec
