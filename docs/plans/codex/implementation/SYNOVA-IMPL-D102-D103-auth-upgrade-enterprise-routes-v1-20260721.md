# SynovaAgent -- D102 Auth Upgrade + D103 Enterprise Routes Implementation v1.0

> 2026-07-21 | Auth Doc #16: Enterprise Multi-User + ima Integration -- Ch5 S5.1 + S5.2
> **D102 upgrades demo auth to production bcrypt. D103 adds 18 enterprise management endpoints.**
> **This doc is the sole execution basis for claude code.**

---

## Loop Engineering V4.4.5 -- MANDATORY TASK-START (Q1-Q4)

### Q0: Project Identity
SynovaAgent multi-tenant deployment. D102 upgrades the demo-mode login (no password check) to production bcrypt authentication with password verification. D103 adds enterprise registration, invitation, member management, ima binding, and GA temporary access endpoints.

### Q1: Research
- Industry: Auth0 multi-tenant patterns, Slack enterprise registration flow, GitHub organization invites
- Memory lessons: Iron Law 9 -- grep propagation. Changing auth payload format means checking ALL routes that use extractAuthFromRequest. The auth doc says JWT payload format is UNCHANGED (sub, role, orgId) -- verify this.

### Q2: Scope
- D102: bcrypt password verification in login + new register endpoint with invitation token
- D103: enterprise routes (register/invite/members/ima-bind/GA-temp-access) -- 18 endpoints
- NOT doing: OAuth/OIDC integration, SSO, payment/plan management

### Q3: Acceptance (D102)
- Entry: POST /api/auth/login with { email, password } (was { userId, role })
- Interaction: bcrypt.compare() against GraphStore User node passwordHash
- Result: JWT token returned (same format), or 401 with AUTH_FAILED

### Q4: Contract and Test (D103)
- 18 endpoints across 5 groups: enterprise (2), invitations (4), members (4), ima (4), GA-access (4)
- @input: GraphStore User nodes, invitation tokens, ima API keys
- @output: JSON responses with { ok, data?, error? } format
- @degraded: GraphStore unavailable -> all endpoints return 503 + degraded:true
- Tests: >=12 tests for enterprise routes (2 per endpoint group + degrade)

---

> Standard: Anthropic Engineering | Iron Law 0-2 | 5-Layer Architecture

---

## Loop Engineering V4.4.5 -- MANDATORY EXECUTION CONSTRAINTS

```
=== Pre-Commit Hard Gates ===
G1: as any = 0
G2: empty catch has log.warn
G4: every new src/ file paired with test file
G5: every new export has caller in src/ (route registration in server.ts)

=== Post-Code Agent Self-Check ===
1. [WIRING] New route registered in server.ts?
2. [EXCEPTION] Every handler catch: log + res.status(500) + degraded?
3. [TYPES] as any = 0?
4. [TESTS] expect()? Normal/degrade/boundary per endpoint?
5. [DEAD CODE] Old login handler removed or @deprecated?
```

---

## Current State (2026-07-21, verified by grep)

- src/routes/auth.ts: demo login (no password check, accepts userId+role directly)
- src/routes/enterprise.ts: DOES NOT EXIST -- entire new file
- src/middleware/auth.ts: JWT sign/verify/revoke functions exist
- src/middleware/rbac.ts: canAccessWorkspace/canModifyWorkspace exist
- GraphStore: createNode/queryNodes exist (no queryNodeByEmail yet -- D106 adds User node)
- bcrypt: NOT INSTALLED (needs npm install bcrypt)
- Auth Doc #16 S5.1: precise auth.ts modification spec (lines 32-95)
- Auth Doc #16 S5.2: 18-enterprise endpoint spec with function signatures

---

## What We Build -- D102

### 1. Upgrade POST /api/auth/login (Modify src/routes/auth.ts)

Replace demo login (lines 32-95 approx) with:
- Accept { email, password } instead of { userId, role }
- Query GraphStore for User node by email
- bcrypt.compare(password, userNode.passwordHash)
- Check user status (active/disabled)
- JWT payload: { sub: userId, role, orgId } -- UNCHANGED format
- Error codes: VALIDATION_ERROR, AUTH_FAILED, ACCOUNT_DISABLED

### 2. Add POST /api/auth/register (New, src/routes/auth.ts)

- Accept { email, password, invitationToken }
- Verify invitationToken against invitationStore
- bcrypt.hash(password) -> passwordHash
- Create User node in GraphStore
- Return JWT token (auto-login after registration)

### 3. Install bcrypt dependency

```
npm install bcrypt
npm install --save-dev @types/bcrypt
```

## What We Build -- D103

### 1. src/routes/enterprise.ts -- Enterprise Routes (New, 18 endpoints)

| Group | Endpoints | Count |
|------|------|:--:|
| Enterprise | POST /api/enterprise/register (admin+org+User), GET /api/enterprise/status | 2 |
| Invitations | POST /invite, GET /invitations, DELETE /invitations/:id, GET /invitation/:token, POST /invitation/accept | 5 |
| Members | GET /members, GET /members/:id, PUT /members/:id, DELETE /members/:id | 4 |
| ima Binding | POST /ima/bind, GET /ima/status, POST /ima/sync/trigger, GET /ima/sync/status | 4 |
| GA Access | POST /ga-access/generate, GET /ga-access/validate, GET /ga-access/data/:type, DELETE /ga-access/:token | 4 |

Total: 19 endpoints (5 invitation, 4 members, 4 ima, 4 GA, 2 enterprise)

### 2. Register routes in server.ts

```
import enterpriseRoutes from './routes/enterprise';
app.use(enterpriseRoutes);
```

### 3. tests/routes/enterprise.test.ts (New, >=12 tests)

```
[ ] register: valid data -> enterprise created + admin user + token
[ ] register: missing fields -> 400
[ ] invite: admin can invite member
[ ] invite: non-admin -> 403
[ ] accept invitation: valid token -> user created + token
[ ] accept invitation: expired token -> 400
[ ] list members: returns member array
[ ] update member: admin can change role
[ ] remove member: soft-delete (status=inactive)
[ ] bind ima: valid API key -> stored encrypted
[ ] bind ima: invalid API key -> 400
[ ] ga-access generate: valid -> token returned
```

---

## What We Don't Do

- Don't implement OAuth/OIDC/SSO
- Don't implement email sending for invitations (use token-based links for MVP)
- Don't implement payment/plan/tier management
- Don't implement the actual ima sync cron job (D110)

---

## Architecture Layer

L1 (src/routes/auth.ts + enterprise.ts) + L4 (GraphStore User nodes)

---

## Completion Standard

```
[ ] D102: login with bcrypt password verification
[ ] D102: register with invitation token
[ ] D102: JWT payload format UNCHANGED (sub/role/orgId)
[ ] D102: bcrypt installed + @types/bcrypt
[ ] D103: enterprise routes -- 19 endpoints in 5 groups
[ ] D103: server.ts -- enterpriseRoutes registered
[ ] D103: GraphStore dependent methods -- queryNodeByEmail/createUserNode
[ ] D103: invitation tokens -- generate/validate/expire
[ ] D103: ima binding -- encrypt API key before storage
[ ] Degrade: GraphStore unavailable -> all endpoints return 503
[ ] Degrade: bcrypt failure -> 500 + log.error
[ ] Zero as any (Iron Law 38)
[ ] Every new src/ file has paired test file (Iron Law 0-2)
[ ] tsc --noEmit zero new errors
[ ] vitest run --changed zero new failures
[ ] >=12 tests: enterprise+login (2) + invitations (2) + members (2) + ima (1) + ga (1) + degrade (2) + auth (2)
```

---

## Auth Doc References

- Auth Doc #16: Enterprise Multi-User + ima Integration -- Ch5 S5.1 (auth upgrade) + S5.2 (enterprise routes)
- D106: GraphStore User Node (dependency -- User node type needed for auth)
- Existing: src/routes/auth.ts, src/middleware/auth.ts, src/middleware/rbac.ts
