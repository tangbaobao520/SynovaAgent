# SynovaAgent -- D97 Dashboard UI Implementation v1.1

> 2026-07-17 | Client Delivery Track | Iron Law 0-2 | 5-Layer Architecture
> **v1.1 FIX: health card data source corrected (overflow API, not healthz); enterpriseId from auth; deptId strategy; diagnosis trigger wiring; nav shell from D96**
> **This doc is the sole execution basis for claude code. Depends on D96 (login + static serving + shared shell).**

---

## Execution Constraints

```
1. Wiring Check: All API endpoints called exist? (grep)
2. Exception Handling: catch + user-visible error? (Iron Law 24+31)
3. Type Safety: as any = 0? (Iron Law 38)
4. Test Coverage: expect()? (Iron Law 48 -- manual testing for frontend)
5. Dead Code: none?
```

---

## Current State

- D96: Login UI + static serving + shared shell (parallel execution)
- D74: Workspace data API -- GET /api/workspace/:deptId DONE
- D90: Overflow dashboard API -- GET /api/overflow/dashboard/:enterpriseId DONE (returns DashboardRow[] with trendDirection, currentOverflow, maturity)
- D49: System health API -- GET /api/healthz DONE (returns system-level: service/DB/memory/disk -- NOT business health)
- D95: Cross-scale validation -- crossScaleWarnings in overflow dashboard DONE
- Dashboard HTML: ZERO

---

## What We Build

### 1. app/dashboard.html -- Dashboard Page

Uses D96 shared shell (<header id="synova-shell"> + shell.js).

**Section A: Health Indicators (top row, 3 cards)**

Data from GET /api/overflow/dashboard/:enterpriseId (enterpriseId = auth.getUser().orgId):
- Cash Flow Health: cash-cycle row -> currentOverflow value + trendDirection + crossScaleWarnings
- Customer Health: customer-cycle row -> currentOverflow value + trendDirection
- Organizational Health: aggregate talent-cycle + product-cycle -> worst trendDirection wins
- Each card: metric name, value, trend arrow (?/?/?), border color (green/yellow/red)
- Loading: skeleton pulse animation while fetching

**Section B: Enterprise Overview (middle, 2-column)**

Data from GET /api/workspace/:deptId (deptId = auth.getUser().orgId, fallback "default"):
- Left: Active Goals list (sorted P0 > P1 > P2, clickable to expand detail)
- Right: Recent Alerts (severity badges: critical/warning/info, dismissable)
- Each goal: title + progress bar + deadline + assignedTo
- Each alert: sentinel name + severity + detectedAt + dismiss button

**Section C: Quick Actions (bottom row)**

- "Generate Diagnosis Report" button:
  1. POST /api/diagnosis/consult with {enterpriseId: orgId, module: "community"}
  2. Response: {consultationId: string}
  3. Redirect to /app/report.html?id={consultationId}
- "View Latest Report" link -> /app/report.html (no ?id, loads latest)
- "Department Workspace" dropdown -> navigates to /app/workspace.html?dept={deptId} (post-10/31)

### 2. app/js/dashboard.js -- Dashboard Logic

```
loadDashboard(): void                     -- fetch all APIs in parallel
renderHealthCards(overflowData): void     -- from overflow dashboard API NOT healthz
renderGoalsList(goals): void              -- from workspace API
renderAlertsList(alerts): void            -- from workspace API
dismissAlert(alertId): void               -- PUT /api/workspace/alerts/:id/dismiss
triggerDiagnosis(): void                  -- POST /api/diagnosis/consult -> redirect
autoRefresh(intervalMs = 300000): void    -- 5-min auto-refresh
```

- Fetch overflow + workspace data on load (Promise.all for parallel)
- Auto-refresh every 5 minutes (clearInterval + setInterval)
- API errors: show "Data temporarily unavailable" card with retry button
- Loading: skeleton placeholders matching card layout

---

## What We Don't Do

- Don't build report viewer (D98)
- Don't build department drill-down (post-10/31)
- Don't build real-time WebSocket updates (polling sufficient)
- Don't modify any backend API

---

## Architecture Layer

L1 (app/ -- frontend), consumes L1 backend APIs

---

## Completion Standard

```
[ ] dashboard.html: uses D96 shared shell (<header id="synova-shell">)
[ ] Health cards: 3 indicators from /api/overflow/dashboard/:enterpriseId (NOT healthz)
[ ] Enterprise ID: from auth.getUser().orgId, falls back to "default"
[ ] Dept ID: same as enterpriseId for aggregated view
[ ] Health cards: trend arrows + cross-scale warnings from D95
[ ] Goals list: sorted by priority, expandable
[ ] Alerts list: severity badges, dismissable via PUT endpoint
[ ] "Generate Diagnosis Report": POST /api/diagnosis/consult -> redirect to /app/report.html?id={consultationId}
[ ] Auto-refresh: 5-minute interval with clearInterval + setInterval
[ ] Error handling: API failures show "Unavailable" + retry button, not blank
[ ] Loading states: skeleton placeholders during fetch
[ ] Responsive: desktop 3-column cards, mobile stacked
[ ] Manual test: login -> dashboard loads with data from real APIs
[ ] Manual test: click "Generate" -> new diagnosis starts -> redirected to report page with ID
```

---

## Auth Doc References

- D74: Workspace data API (workspace-data.ts)
- D90: Overflow dashboard API (overflow.ts + overflow-dashboard.ts)
- D95: Cross-scale validation warnings in overflow dashboard
- Diagnosis API: POST /api/diagnosis/consult
