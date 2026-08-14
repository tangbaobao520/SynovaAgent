# SynovaAgent -- D96 Login + Auth UI + Shared Shell Implementation v1.1

> 2026-07-17 | Client Delivery Track | Iron Law 0-2 | 5-Layer Architecture
> **v1.1 FIX: added shared nav shell, token expiry, offline detection, already-logged-in guard**
> **This doc is the sole execution basis for claude code.**

---

## Execution Constraints

```
1. Wiring Check: New export called? (grep)
2. Exception Handling: catch + log + degraded? (Iron Law 24+31)
3. Type Safety: as any = 0? (Iron Law 38)
4. Test Coverage: expect()? (Iron Law 48 -- manual testing for frontend)
5. Dead Code: none?
```

---

## Current State

- Auth: POST /api/auth/login with {userId, role, orgId} returns {token} -- EXISTS
- Auth: POST /api/auth/refresh -- EXISTS
- Auth: jwtAuthMiddleware applied to all routes in server.ts -- EXISTS
- Static file serving: ZERO -- server.ts has NO express.static() call
- Frontend directory /app: DOES NOT EXIST
- Login UI: ZERO
- All 65+ completed D-series tasks are backend-only
- Client deadline: 10/31/2026

---

## What We Build

### 1. /app directory -- Frontend static root (New)

```
app/
  index.html           -- auto-redirect (logged in -> dashboard, not -> login)
  login.html           -- login page
  css/
    app.css            -- shared styles (Synova brand colors + nav shell)
  js/
    auth.js            -- token management + expiry handling
    api-client.js      -- fetch wrapper with auto-auth + 401->refresh->retry
    shell.js           -- shared nav bar (renders on all pages)
  favicon.ico          -- Synova icon
```

### 2. app/js/shell.js -- Shared Navigation Shell (NEW in v1.1)

Renders common header on every page:
- Synova logo/name (left)
- Nav links: Dashboard | Reports (center)
- User info: name + role + Logout button (right)
- Auto-injected into `<header id="synova-shell">` element
- Usage: every page includes `<header id="synova-shell"></header>` + `<script src="js/shell.js"></script>`

### 3. app/login.html -- Login Page

- Username input + password field (present but not validated in demo)
- Role selector: admin / manager / liaison / staff / ga
- Org ID field (default: "default")
- POST to /api/auth/login
- On success: store token + userId + role + orgId in localStorage under key 'synova_auth'
- Redirect to /app/dashboard.html
- **Already-logged-in guard**: if isAuthenticated(), auto-redirect to /app/dashboard.html
- Error states: network error (show "Server unreachable"), invalid response (show "Login failed"), 401/403 (show "Invalid credentials")
- Loading state: disable submit button, show spinner

### 4. app/js/auth.js -- Auth Module

```
login(userId, role, orgId): Promise<{token, userId, role, orgId}>
logout(): void (clear localStorage, redirect to /app/login.html)
getToken(): string | null
getUser(): { userId, role, orgId } | null
isAuthenticated(): boolean
refreshToken(): Promise<boolean> (POST /api/auth/refresh, returns false if refresh fails)
isTokenExpired(): boolean (check exp claim in JWT payload)
```

Token stored in localStorage with key 'synova_auth' as JSON: {token, userId, role, orgId, expiresAt}.
Token expiry checked via JWT exp claim (base64 decode payload).

### 5. app/js/api-client.js -- API Client

```
api.get(path): Promise<Response>
api.post(path, body): Promise<Response>
api.put(path, body): Promise<Response>
```

Wraps fetch() with:
- Base URL from window.location.origin
- Auto Authorization: Bearer <token> header from auth.js
- **401 -> try refreshToken() -> retry original request once (v1.1)**
- 401 after refresh -> clear auth + redirect to login
- Network error -> retry (3x with exponential backoff: 1s, 2s, 4s)
- Offline detection: if navigator.onLine is false, show "No connection" banner
- All errors: show toast notification in bottom-right corner

### 6. Server static serving (Modify src/server.ts)

```javascript
app.use('/app', express.static(path.join(__dirname, '../app')));
app.get('/login', (_, res) => res.redirect('/app/login.html'));
```

---

## What We Don't Do

- Don't build a React/Vue SPA (vanilla JS for speed)
- Don't integrate OAuth/OIDC (demo auth sufficient for 10/31)
- Don't build dashboard.html (D97 handles that)
- Don't build report viewer (D98 handles that)

---

## Architecture Layer

L1 (app/ -- frontend) + L1 (src/server.ts static serving -- backend)

---

## Completion Standard

```
[ ] /app directory created with css/js subdirectories
[ ] shell.js: shared nav bar rendering (logo + nav links + user info + logout)
[ ] login.html: form with userId/role/orgId + already-logged-in guard + error states
[ ] auth.js: login/logout/getToken/getUser/isAuthenticated/refreshToken/isTokenExpired
[ ] api-client.js: get/post/put with auto-auth + 401->refresh->retry + offline detection
[ ] Token + user info stored in localStorage as JSON under 'synova_auth'
[ ] Token expiry detected via JWT exp claim
[ ] server.ts: express.static('/app', ...) + GET /login redirect
[ ] Manual test: /login -> enter creds -> redirect to /app/dashboard.html
[ ] Manual test: close tab, reopen /app/dashboard.html -> still authenticated (no login)
[ ] Manual test: expire token -> API call -> auto-refresh -> retry -> success
[ ] Zero as any (app/js files are .js, not .ts)
[ ] tsc --noEmit zero new errors (server.ts change only)
```

---

## Auth Doc References

- Existing auth routes: src/routes/auth.ts -- POST /api/auth/login, POST /api/auth/refresh
- Auth middleware: src/middleware/auth.ts + rbac.ts
