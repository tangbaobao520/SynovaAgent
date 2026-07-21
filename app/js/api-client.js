/**
 * app/js/api-client.js — API Client (D96)
 *
 * Fetch wrapper with:
 * - Auto Authorization header from auth.js
 * - 401 → refreshToken() → retry original request once
 * - 401 after refresh → clear auth + redirect
 * - Network error → retry (3x, exponential backoff: 1s, 2s, 4s)
 * - Offline detection → show "No connection" banner
 * - All errors → toast notification (bottom-right)
 */

const API_CLIENT_CONFIG = {
  baseUrl: window.location.origin,
  maxRetries: 3,
  retryDelays: [1000, 2000, 4000],
};

/** Show a toast notification */
function showToast(message, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = 'toast toast-' + (type || 'error');
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => { if (toast.parentNode) toast.remove(); }, 5000);
}

/** Show/hide offline banner */
function updateOfflineBanner() {
  let banner = document.getElementById('offline-banner');
  if (!navigator.onLine) {
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'offline-banner';
      banner.className = 'offline-banner';
      banner.textContent = 'No internet connection';
      document.body.prepend(banner);
    }
  } else {
    if (banner) banner.remove();
  }
}

// Listen for online/offline events
window.addEventListener('offline', updateOfflineBanner);
window.addEventListener('online', updateOfflineBanner);

/** Core fetch wrapper with retry + auth */
async function apiFetch(path, options) {
  // Offline check
  if (!navigator.onLine) {
    updateOfflineBanner();
    throw new Error('No internet connection');
  }

  const url = API_CLIENT_CONFIG.baseUrl + path;
  const token = typeof getToken === 'function' ? getToken() : null;
  const headers = { ...(options.headers || {}) };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let lastError;
  const maxRetries = API_CLIENT_CONFIG.maxRetries;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, { ...options, headers });

      // 401 → try refresh → retry once
      if (resp.status === 401 && token) {
        if (typeof refreshToken === 'function') {
          const refreshed = await refreshToken();
          if (refreshed) {
            // Retry with new token
            const newToken = typeof getToken === 'function' ? getToken() : null;
            if (newToken) {
              headers['Authorization'] = 'Bearer ' + newToken;
              const retryResp = await fetch(url, { ...options, headers });
              if (retryResp.ok) return retryResp;
              if (retryResp.status === 401) {
                // Refresh worked but still 401 → session invalid
                if (typeof logout === 'function') logout();
                throw new Error('Session expired — please login again');
              }
              return retryResp;
            }
          }
        }
        // Refresh failed → clear auth
        if (typeof logout === 'function') logout();
        throw new Error('Session expired — please login again');
      }

      return resp;
    } catch (err) {
      lastError = err;
      if (err.message.includes('Session expired')) throw err;
      // Network error — retry with backoff
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, API_CLIENT_CONFIG.retryDelays[attempt] || 4000));
        continue;
      }
    }
  }

  showToast(lastError?.message || 'Request failed', 'error');
  throw lastError || new Error('Request failed after ' + maxRetries + ' retries');
}

const api = {
  get: (path) => apiFetch(path, { method: 'GET' }),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => apiFetch(path, { method: 'DELETE' }),
};
