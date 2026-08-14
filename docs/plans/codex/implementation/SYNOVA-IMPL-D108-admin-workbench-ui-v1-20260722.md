# SynovaAgent -- D108 Admin Workbench UI Implementation v1.0

> 2026-07-22 | Auth Doc #16: Enterprise Multi-User + ima Integration -- Ch3
> **D103 has 19 enterprise endpoints. D108 gives the admin a UI to use them.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent enterprise admin workbench. D108 builds a single-page admin dashboard where the enterprise admin can manage registration, invite members, bind ima knowledge, and generate GA temporary access links. All backed by D103 enterprise routes.

### Q1: Research
- Industry: GitHub organization settings, Slack workspace admin, Notion workspace management
- Memory lessons: Iron Law 4 -- wiring. Every API call from the UI must trace to a real D103 endpoint. Iron Law 5 -- backend != user-visible. The UI must confirm every action with visible feedback (toast, status change, or redirect).

### Q2: Scope
- Minimal: app/admin.html with 5 tabbed sections (Enterprise, Members, Invitations, ima, GA Access)
- NOT doing: multi-enterprise admin dashboard (D109), i18n, customizable branding
- MVP: one page serving one enterprise admin

### Q3: Acceptance
- Entry: Admin logs in -> navigates to /app/admin.html (link in shell.js nav)
- Interaction: Each tab loads data from D103 endpoints via api-client.js
- Result: Admin can register enterprise, invite members, bind ima, generate GA links -- all with visual feedback

### Q4: Contract and Test
- All API endpoints: POST/GET/PUT/DELETE from D103 enterprise.ts
- @input: auth.getUser().orgId for enterprise context
- @output: Rendered HTML with real data from API responses
- @degraded: API unreachable -> show "Service unavailable" banner + retry button
- Tests: manual walkthrough (HTML page cannot be unit tested)

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates ===
G1: as any = 0 (N/A -- HTML/JS frontend, no .ts files created)
G2: empty catch? (JS try-catch must have console.error + user-visible error)
G4: new files? (app/admin.html + app/js/admin.js -- no .ts, no test pairing required)
G5: new exports? (N/A -- frontend code)
```

---

## Current State (2026-07-22, verified by grep)

- D103: 19 enterprise endpoints in src/routes/enterprise.ts DONE
- D106: UserStore (GraphStore user persistence) DONE
- D96: Shell.js shared navigation DONE (extends header)
- D97: Dashboard UI pattern DONE (app/dashboard.html as reference)
- app/css/app.css: shared styles exist
- Admin UI: ZERO existence
- Auth Doc #16 Ch3: "Admin Workbench & Client Transformation"

---

## What We Build

### 1. app/admin.html -- Admin Workbench Page

Single-page admin dashboard with 5 tabbed sections. Uses D96 shell.js for navigation.

**Tabs:**

| Tab | Auth Doc Ref | D103 Endpoints Used | Functionality |
|------|------|------|------|
| Enterprise Info | S3.1.3 | GET /api/enterprise/status | View/update enterprise name, industry, size, license | 
| Members | S3.1.4 | GET /members, PUT /:id, DELETE /:id | List members, change roles/departments, soft-delete |
| Permissions | S3.1.5 | None (read from RBAC config) | View role-based permission matrix, modify defaults |
| ima Binding | S3.1.6 | POST /ima/bind, GET /ima/status | Paste ima API Key, test connection, view sync status |
| Deployment Mode | S3.1.7 | None (read/write local config) | Standalone/LAN switch, migration wizard, server URL config |

### 2. app/js/admin.js -- Admin Logic

```
loadEnterpriseData(): void
loadMembersData(): void
loadInvitationsData(): void  // depends on loadMembersData
loadImaData(): void
loadPermissionsData(): void
loadDeploymentConfig(): void
handleRegisterEnterprise(): void
handleInviteMember(): void
handleBindIma(): void
```

### 3. Extend D96 shell.js nav

Add "Admin" link to shared navigation (visible only when user role === 'admin').

---

## What We Don't Do

- Don't build multi-enterprise admin dashboard (D109)
- Don't build GA workbench UI (separate scope)
- Don't build custom branding/theming (MVP)



## Test Requirements (per Auth Doc #6 Test System Spec)

### L1: Unit Contract Tests (N/A for frontend)
- No compute functions in this task (pure frontend HTML/JS)

### L2a: Wiring Verification (Manual)
- Each admin.js API call MUST trace to a D103 enterprise.ts endpoint
- Verification: grep each endpoint path in admin.js -> confirm handler exists in enterprise.ts
- All 5 tabs: verification checklist with explicit endpoint-to-handler mapping

### Manual Integration Test
- Login as admin -> /app/admin.html -> Enterprise tab loads -> Members tab lists users -> Permissions tab shows matrix -> ima tab tests connection -> Deployment tab shows config

---

## Architecture Layer

L1 (app/admin.html + app/js/admin.js) -- frontend, consumes D103 L1 endpoints

---

## Completion Standard

```
[ ] app/admin.html: 5 tabbed sections with responsive layout
[ ] app/js/admin.js: load + CRUD functions for all 5 tabs
[ ] Shell.js: Admin nav link (role-gated)
[ ] Enterprise tab: view status + register form
[ ] Members tab: list + role change + soft-delete
[ ] Invitations tab: invite form + pending list + revoke
[ ] ima tab: API key form + test connection + status display
[ ] GA Access tab: generate form + active links list + revoke
[ ] Error states: API failure -> "Service unavailable" + retry
[ ] Loading states: skeleton while fetching
[ ] Manual test: login as admin -> navigate to /app/admin.html -> Enterprise/Members/Permissions/ima/Deployment all functional
```

---

## Auth Doc References

- Auth Doc #16: Enterprise Multi-User -- Ch3: Admin Workbench & Client Transformation
- D103: Enterprise Routes (19 endpoints)
- D106: UserStore (GraphStore user persistence)
