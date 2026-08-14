# SynovaAgent -- D98 Report Viewer UI Implementation v1.1

> 2026-07-17 | Client Delivery Track | Iron Law 0-2 | 5-Layer Architecture
> **v1.1 FIX: report ID from URL param; EventSource SSE streaming; in-progress vs completed states; navigation back; removed raw JSON toggle**
> **This doc is the sole execution basis for claude code. Depends on D96 (login + shell).**

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
- D97: Dashboard UI (parallel execution) -- triggers diagnosis from "Generate" button
- Diagnosis API: POST /api/diagnosis/consult -- returns {consultationId}, starts 6-phase SSE stream
- Diagnosis API: GET /api/diagnosis/consult/:id/status -- returns {phase, progress, events[]}
- Sentinel API: GET /api/sentinel/reports -- list of sentinel-generated reports
- Report HTML: ZERO

---

## What We Build

### 1. app/report.html -- Growth Diagnosis Panoramic Report Page

Uses D96 shared shell (<header id="synova-shell"> + shell.js).

**Report ID source**: URL parameter `?id={consultationId}`.
Example: D97 "Generate" button redirects to `/app/report.html?id=consult_abc123`.

**Section A: Report Header**
- Report ID + consultation date
- Diagnosis trigger type (manual/scheduled/event-driven)
- Current phase display (Phase 0-5 with progress bar)
- Status badge: "In Progress" (animated pulse) / "Complete" (green) / "Failed" (red)

**Section B: CEO One-Page Summary (top)**
- Populated from final StructuredDiagnosisReport.ceoSummary
- **While diagnosis in progress**: shows "Diagnosing..." with current phase description
- 3 key metrics: root cause edge ID + confidence score + recommended action count
- Visual: 6-phase progress bar (Phase 0 through Phase 5)

**Section C: Detailed Findings (middle, expandable)**
- Key findings from report.keyFindings
- Evidence chain: report.evidenceChain (each with source + confidence)
- Root cause tree: report.rootCauseTree (indented list with edge/node labels)
- Action recommendations: report.actionRecommendations table
- Priority badges: highest (red) / high (orange) / medium (yellow) / low (green)

**Section D: Report Actions (bottom)**
- "Export PDF" button -> window.print() with print stylesheet
- "Back to Dashboard" link -> /app/dashboard.html
- "New Diagnosis" button -> back to dashboard "Generate" flow

### 2. app/js/report.js -- Report Loading Logic

```
loadReport(): void                           -- check URL ?id=, load report
connectSSE(consultationId): EventSource      -- SSE stream for in-progress diagnoses
renderPhaseProgress(phase, progress): void   -- update phase bar
renderCEOsummary(data): void                 -- from final report
renderFindings(findings): void               -- expandable cards
renderRecommendations(actions): void         -- table with badges
handleReportComplete(data): void             -- final state: close SSE, render full report
```

**SSE streaming flow (v1.1):**
1. Page loads, checks URL ?id=
2. GET /api/diagnosis/consult/:id/status -> if status != 'complete', start EventSource
3. EventSource connects to same endpoint: onmessage -> update phase bar + partial findings
4. On status='complete' -> close EventSource, render full report
5. On error -> show "Connection lost. Retrying..." + reconnect after 5s

**Fallback: no ?id parameter**
- Fetch GET /api/sentinel/reports
- Show list of available reports
- Click to load: /app/report.html?id={reportId}

---

## What We Don't Do

- Don't build PDF export engine (window.print() sufficient for MVP)
- Don't build email sharing (post-10/31)
- Don't build report comparison (post-10/31)
- Don't modify any backend API
- **Don't expose raw JSON** (removed -- security risk)

---

## Architecture Layer

L1 (app/ -- frontend), consumes L1 backend APIs

---

## Completion Standard

```
[ ] report.html: uses D96 shared shell (<header id="synova-shell">)
[ ] Report ID: from URL parameter ?id={consultationId}
[ ] SSE streaming: EventSource for in-progress diagnoses with auto-reconnect
[ ] Phase progress bar: 6 phases with current phase highlight + animated pulse
[ ] CEO summary: rendered from StructuredDiagnosisReport.ceoSummary (or "In Progress")
[ ] Findings: expandable cards with evidence chain + sources
[ ] Root cause tree: indented visual list with edge/node labels
[ ] Action recommendations: table with priority color badges
[ ] In-progress state: "Diagnosing..." + progress bar + auto-update via SSE
[ ] Completed state: full report rendered + "Export PDF" + "Back to Dashboard"
[ ] Fallback: no ?id -> list available reports from GET /api/sentinel/reports
[ ] Error handling: 404 -> "Report not found", network error -> "Connection lost" + retry
[ ] Manual test: D97 "Generate" -> redirected here with ?id= -> SSE updates -> final report
[ ] Manual test: /app/report.html (no id) -> report list -> click -> loads report
```

---

## Auth Doc References

- Diagnosis API: src/routes/diagnosis.ts -- POST /api/diagnosis/consult, GET /api/diagnosis/consult/:id/status
- Sentinel API: GET /api/sentinel/reports
- D58: PROMPT.md -- report generation templates
