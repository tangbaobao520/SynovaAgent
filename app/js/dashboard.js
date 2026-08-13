/**
 * app/js/dashboard.js — Dashboard UI Logic (D97)
 *
 * Depends on: auth.js, api-client.js, shell.js
 *
 * Sections:
 *   A — Health Indicators from overflow dashboard API
 *   B — Enterprise Overview from workspace API
 *   C — Quick Actions (diagnosis trigger)
 */
let refreshTimer = null;

// ═══ Init ═══

document.addEventListener('DOMContentLoaded', () => {
  if (typeof isAuthenticated !== 'function' || !isAuthenticated()) {
    window.location.replace('/app/login.html');
    return;
  }
  loadDashboard();
  startAutoRefresh();
});

// ═══ Data Loading ═══

async function loadDashboard() {
  const user = typeof getUser === 'function' ? getUser() : null;
  const enterpriseId = user?.orgId || 'default';
  const deptId = user?.orgId || 'default';

  try {
    // Parallel fetch: overflow dashboard + workspace data
    const [overflowResp, workspaceResp] = await Promise.all([
      apiFetch('/api/overflow/dashboard/' + encodeURIComponent(enterpriseId), { method: 'GET' }),
      apiFetch('/api/workspace/' + encodeURIComponent(deptId), { method: 'GET' }),
    ]);

    let overflowData = null;
    let workspaceData = null;

    if (overflowResp.ok) {
      const json = await overflowResp.json();
      overflowData = json.data || json;
    }
    if (workspaceResp.ok) {
      const json = await workspaceResp.json();
      workspaceData = json.data || json;
    }

    renderHealthCards(overflowData);
    renderGoalsList(workspaceData?.activeGoals || []);
    renderAlertsList(workspaceData?.recentAlerts || []);
    updateRefreshTime();
  } catch (err) {
    console.error('Dashboard load failed:', err);
    // Show error states for all sections
    showError('health-cards', 'Health data temporarily unavailable');
    showError('goals-container', 'Goals temporarily unavailable');
    showError('alerts-container', 'Alerts temporarily unavailable');
  }
}

// ═══ Section A: Health Cards ═══

function renderHealthCards(overflowData) {
  const container = document.getElementById('health-cards');
  if (!container) return;

  if (!overflowData || !overflowData.rows || overflowData.rows.length === 0) {
    container.innerHTML = '<div class="card error-card"><p>Health data temporarily unavailable</p><button class="retry-btn" onclick="loadDashboard()">Retry</button></div>';
    return;
  }

  const rows = overflowData.rows;

  // Cash flow: find cash-cycle row
  const cash = rows.find(r => r.cycleId === 'cash-cycle' || r.cycleName?.includes('Cash') || r.cycleName?.includes('cash')) || rows[0];
  // Customer: find customer-cycle row
  const customer = rows.find(r => r.cycleId === 'customer-cycle' || r.cycleName?.includes('Customer') || r.cycleName?.includes('customer')) || rows[1];
  // Org health: aggregate talent + product
  const talent = rows.find(r => r.cycleId === 'talent-cycle' || r.cycleName?.includes('Talent'));
  const product = rows.find(r => r.cycleId === 'product-cycle' || r.cycleName?.includes('Product'));

  const orgRows = [talent, product].filter(Boolean);
  const worstTrend = orgRows.length > 0
    ? orgRows.map(r => r.trendDirection).sort((a, b) => trendRank(a) - trendRank(b))[0]
    : 'stable';

  container.innerHTML = `
    ${renderHealthCard('Cash Flow Health', cash, 'cash')}
    ${renderHealthCard('Customer Health', customer, 'customer')}
    ${renderHealthCard('Organizational Health', null, 'org', worstTrend)}
  `;
}

function trendRank(d) {
  return d === 'declining' ? 0 : d === 'stable' ? 1 : 2;
}

function renderHealthCard(title, row, type, forcedTrend) {
  if (!row && type !== 'org') {
    return `<div class="health-card border-yellow">
      <h3>${title}</h3>
      <div class="health-value">—</div>
      <div class="health-trend trend-stable">Data unavailable</div>
    </div>`;
  }

  let value, trend, warnings = [];

  if (type === 'org' && !row) {
    value = '—';
    trend = forcedTrend || 'stable';
  } else if (type === 'org' && row) {
    value = row.currentOverflow !== undefined ? formatOverflow(row.currentOverflow) : '—';
    trend = forcedTrend || row.trendDirection || 'stable';
  } else if (row) {
    value = row.currentOverflow !== undefined ? formatOverflow(row.currentOverflow) : '—';
    trend = row.trendDirection || 'stable';
    if (row.crossScaleWarnings) {
      warnings = Array.isArray(row.crossScaleWarnings) ? row.crossScaleWarnings : [row.crossScaleWarnings];
    }
  }

  const borderColor = trend === 'declining' ? 'red' : trend === 'stable' ? 'yellow' : 'green';
  const trendIcon = trend === 'rising' ? '↑' : trend === 'declining' ? '↓' : '→';
  const trendClass = 'trend-' + (trend === 'declining' ? 'down' : trend === 'rising' ? 'up' : 'stable');

  return `<div class="health-card border-${borderColor}">
    <h3>${title}</h3>
    <div class="health-value">${value}</div>
    <div class="health-trend ${trendClass}">
      <span>${trendIcon}</span>
      <span>${trend === 'rising' ? 'Improving' : trend === 'declining' ? 'Declining' : 'Stable'}</span>
    </div>
    ${warnings.map(w => `<div class="health-warning">⚠ ${typeof w === 'string' ? w : w.message || w.text || JSON.stringify(w)}</div>`).join('')}
  </div>`;
}

function formatOverflow(val) {
  if (val === undefined || val === null) return '—';
  if (typeof val === 'number') return val.toFixed(1) + '%';
  return String(val);
}

// ═══ Section B: Goals ═══

function renderGoalsList(goals) {
  const container = document.getElementById('goals-container');
  if (!container) return;

  if (!goals || goals.length === 0) {
    container.innerHTML = '<div class="error-card"><p>No active goals</p></div>';
    return;
  }

  // Sort by priority: P0 > P1 > P2
  const priorityOrder = { P0: 0, P1: 1, P2: 2 };
  const sorted = [...goals].sort((a, b) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));

  container.innerHTML = sorted.map((g, i) => `
    <div class="goal-item" onclick="toggleGoalDetail(${i})">
      <div class="goal-header">
        <span class="goal-title">${escHtml(g.title || 'Untitled')}</span>
        <span class="priority-badge priority-${g.priority || 'P2'}">${g.priority || 'P2'}</span>
      </div>
      <div class="goal-meta">
        <span>Deadline: ${g.deadline ? new Date(g.deadline).toLocaleDateString() : '—'}</span>
        <span>${g.owner ? escHtml(g.owner) : ''}</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width:${Math.min(g.progressPercent || 0, 100)}%"></div>
      </div>
      <div id="goal-detail-${i}" class="goal-detail">
        Status: ${g.deviationStatus || 'unknown'} | Progress: ${g.progressPercent || 0}%
      </div>
    </div>
  `).join('');
}

function toggleGoalDetail(index) {
  const el = document.getElementById('goal-detail-' + index);
  if (el) el.classList.toggle('expanded');
}

// ═══ Section B: Alerts ═══

function renderAlertsList(alerts) {
  const container = document.getElementById('alerts-container');
  if (!container) return;

  if (!alerts || alerts.length === 0) {
    container.innerHTML = '<div class="error-card"><p>No recent alerts</p></div>';
    return;
  }

  container.innerHTML = alerts.map(a => `
    <div class="alert-item" data-alert-id="${escHtml(a.alertId)}">
      <span class="severity-badge severity-${a.severity || 'info'}">${a.severity || 'info'}</span>
      <div class="alert-body">
        <div class="alert-message">${escHtml(a.message || a.title || '')}</div>
        <div class="alert-time">${a.timestamp ? new Date(a.timestamp).toLocaleString() : ''}</div>
      </div>
      <button class="alert-dismiss" onclick="dismissAlert('${escHtml(a.alertId)}')" title="Dismiss">×</button>
    </div>
  `).join('');
}

async function dismissAlert(alertId) {
  try {
    const resp = await apiFetch('/api/workspace/alerts/' + encodeURIComponent(alertId) + '/dismiss', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (resp.ok) {
      const el = document.querySelector(`[data-alert-id="${escHtml(alertId)}"]`);
      if (el) el.remove();
      if (typeof showToast === 'function') showToast('Alert dismissed', 'success');
    }
  } catch (err) {
    console.error('Dismiss alert failed:', err);
    if (typeof showToast === 'function') showToast('Failed to dismiss alert', 'error');
  }
}

// ═══ Section C: Diagnosis Trigger ═══

async function triggerDiagnosis() {
  const btn = document.getElementById('btn-diagnosis');
  if (!btn) return;
  btn.disabled = true;
  btn.textContent = 'Starting diagnosis...';

  try {
    const user = typeof getUser === 'function' ? getUser() : null;
    const resp = await apiFetch('/api/diagnosis/consult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enterpriseId: user?.orgId || 'default',
        module: 'community',
      }),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.message || 'HTTP ' + resp.status);
    }

    const data = await resp.json();
    const consultationId = data.consultationId || data.id;

    if (consultationId) {
      window.location.href = '/app/report.html?id=' + encodeURIComponent(consultationId);
    } else {
      throw new Error('No consultation ID returned');
    }
  } catch (err) {
    console.error('Diagnosis trigger failed:', err);
    if (typeof showToast === 'function') showToast('Failed to start diagnosis: ' + err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Generate Diagnosis Report';
  }
}

// ═══ Auto-Refresh ═══

function startAutoRefresh(intervalMs) {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadDashboard();
  }, intervalMs || 300000); // 5 min default
}

function updateRefreshTime() {
  const el = document.getElementById('last-refresh');
  if (el) el.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
}

// ═══ Helpers ═══

function showError(containerId, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="error-card"><p>${escHtml(message)}</p><button class="retry-btn" onclick="loadDashboard()">Retry</button></div>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
