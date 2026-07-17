/**
 * app/js/auth.js — Auth Module (D96)
 *
 * Token management with localStorage persistence.
 * JWT exp claim parsing for token expiry detection.
 *
 * Key: 'synova_auth' — JSON { token, userId, role, orgId, expiresAt }
 */
const AUTH_KEY = 'synova_auth';

/** Login: POST /api/auth/login → store token + redirect */
async function login(userId, role, orgId) {
  const resp = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: userId.trim(), role, orgId: orgId || 'default' }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ message: 'Login failed' }));
    throw new Error(err.message || `HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (!data.ok || !data.token) {
    throw new Error(data.message || 'Login failed — no token returned');
  }
  // Parse JWT payload for expiry
  const payload = parseJwtPayload(data.token);
  const authData = {
    token: data.token,
    userId: userId.trim(),
    role,
    orgId: orgId || 'default',
    expiresAt: payload?.exp || Math.floor(Date.now() / 1000) + 86400,
  };
  localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
  return authData;
}

/** Logout: clear localStorage → redirect to login */
function logout() {
  localStorage.removeItem(AUTH_KEY);
  window.location.href = '/app/login.html';
}

/** Get stored token */
function getToken() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data.token || null;
  } catch { return null; }
}

/** Get stored user info */
function getUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return { userId: data.userId, role: data.role, orgId: data.orgId };
  } catch { return null; }
}

/** Check if user is authenticated (token exists + not expired) */
function isAuthenticated() {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data.token) return false;
    return !isTokenExpired(data);
  } catch { return false; }
}

/** Refresh token: POST /api/auth/refresh → store new token */
async function refreshToken() {
  try {
    const token = getToken();
    if (!token) return false;
    const resp = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ token }),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    if (!data.ok || !data.token) return false;
    // Update stored token
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) {
      const authData = JSON.parse(raw);
      authData.token = data.token;
      const payload = parseJwtPayload(data.token);
      if (payload?.exp) authData.expiresAt = payload.exp;
      localStorage.setItem(AUTH_KEY, JSON.stringify(authData));
    }
    return true;
  } catch { return false; }
}

/** Check if stored token is expired (by JWT exp claim) */
function isTokenExpired(authData) {
  if (!authData) {
    try {
      const raw = localStorage.getItem(AUTH_KEY);
      if (!raw) return true;
      authData = JSON.parse(raw);
    } catch { return true; }
  }
  if (!authData.expiresAt) return true;
  // exp is in Unix seconds; current time in seconds
  return (Math.floor(Date.now() / 1000)) >= authData.expiresAt;
}

/** Parse JWT payload (base64 decode) */
function parseJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch { return null; }
}
