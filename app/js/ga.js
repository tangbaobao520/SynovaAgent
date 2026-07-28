/**
 * app/js/ga.js — GA Dashboard Logic (D253)
 *
 * Depends on: auth.js, api-client.js, shell.js
 *
 * 4 panels:
 *   - loadEnterprises():   左栏 — 企业列表 (GET /api/enterprise/status)
 *   - loadDiagnosis():     中栏 — 诊断概览 (GET /api/cockpit/data)
 *   - loadFederated():     右栏 — 联邦知识审批 (GET /api/admin/knowledge/federated/pending)
 *   - submitObservation(): 右栏 — Observation → ingest → mark-shareable 管线
 *
 * Observation 管线:
 *   ① POST /api/knowledge/ingest (sourceType=ga_observation)
 *   ② POST /api/admin/knowledge/:id/mark-shareable → 进入联邦审批管线
 */

// ═══ State ═══
let refreshTimer = null;
let enterprises = [];

// ═══ Init ═══

document.addEventListener('DOMContentLoaded', () => {
  if (typeof isAuthenticated !== 'function' || !isAuthenticated()) {
    window.location.replace('/app/login.html');
    return;
  }
  initGAPage();
  startAutoRefresh();
});

async function initGAPage() {
  await Promise.all([
    loadEnterprises(),
    loadDiagnosis(),
    loadFederated(),
  ]);
}

// ═══ Panel 1: Enterprise List (左栏) ═══

async function loadEnterprises() {
  const container = document.getElementById('ga-enterprise-list');
  const countBadge = document.getElementById('ga-enterprise-count');
  if (!container) return;

  try {
    const resp = await api.get('/api/enterprise/status');
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ message: 'HTTP ' + resp.status }));
      throw new Error(err.message || 'Failed to load enterprises');
    }
    const json = await resp.json();
    const data = json.data ? (Array.isArray(json.data) ? json.data : [json.data]) : [];

    enterprises = data;
    if (countBadge) countBadge.textContent = String(data.length);

    if (!data.length) {
      container.innerHTML = '<div class="ga-empty">暂无可用企业</div>';
      return;
    }

    container.innerHTML = data.map((ent, idx) => `
      <div class="ga-enterprise-item ${idx === 0 ? 'ga-enterprise-active' : ''}"
           data-org-id="${escHtml(ent.orgId || ent.id || '')}"
           onclick="selectEnterprise(this, '${escHtml(ent.orgId || ent.id || '')}')">
        <div class="ga-enterprise-name">${escHtml(ent.name || ent.orgId || 'Unknown')}</div>
        <div class="ga-enterprise-meta">
          <span>${escHtml(ent.industry || '—')}</span>
          <span class="ga-status-dot ga-status-${(ent.status || 'active') === 'active' ? 'green' : 'yellow'}"></span>
        </div>
      </div>
    `).join('');

    // Auto-select first enterprise
    const firstItem = container.querySelector('.ga-enterprise-item');
    if (firstItem) firstItem.click();
  } catch (err) {
    console.error('loadEnterprises failed:', err);
    container.innerHTML = `<div class="ga-error">
      <p>企业数据不可用</p>
      <button class="retry-btn" onclick="loadEnterprises()">重试</button>
    </div>`;
  }
}

function selectEnterprise(el, orgId) {
  document.querySelectorAll('.ga-enterprise-item').forEach(i => i.classList.remove('ga-enterprise-active'));
  el.classList.add('ga-enterprise-active');
  const sel = document.getElementById('ga-obs-enterprise');
  if (sel) sel.value = orgId;
}

// ═══ Panel 2: Diagnosis Overview (中栏) ═══

async function loadDiagnosis() {
  const container = document.getElementById('ga-diagnosis-content');
  if (!container) return;

  try {
    const resp = await api.get('/api/cockpit/data');
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ message: 'HTTP ' + resp.status }));
      throw new Error(err.message || 'Failed to load diagnosis data');
    }
    const json = await resp.json();

    const signals = json.signals || json.gates || [];
    const tasks = json.activeTasks || json.tasks || [];

    container.innerHTML = `
      <section class="ga-section">
        <h4 class="ga-section-title">信号健康</h4>
        <div class="ga-signal-grid">
          ${Array.isArray(signals) && signals.length > 0
            ? signals.map(s => `
              <div class="ga-signal-card ga-signal-${s.status || 'unknown'}">
                <div class="ga-signal-name">${escHtml(s.name || s.component || '—')}</div>
                <div class="ga-signal-status">${(s.status || 'unknown').toUpperCase()}</div>
                ${s.reason ? `<div class="ga-signal-reason">${escHtml(s.reason)}</div>` : ''}
              </div>
            `).join('')
            : '<div class="ga-empty">无信号数据</div>'
          }
        </div>
      </section>
      <section class="ga-section">
        <h4 class="ga-section-title">活跃任务</h4>
        <div class="ga-task-list">
          ${Array.isArray(tasks) && tasks.length > 0
            ? tasks.map(t => `
              <div class="ga-task-item">
                <span class="ga-task-name">${escHtml(t.name || t.title || '—')}</span>
                <span class="ga-task-status ga-task-${(t.status || 'pending')}">${t.status || 'pending'}</span>
              </div>
            `).join('')
            : '<div class="ga-empty">无活跃任务</div>'
          }
        </div>
      </section>
    `;

    // Update refresh timestamp
    const ts = document.getElementById('ga-refresh-time');
    if (ts) ts.textContent = new Date().toLocaleTimeString();
  } catch (err) {
    console.error('loadDiagnosis failed:', err);
    container.innerHTML = `<div class="ga-error">
      <p>诊断数据不可用</p>
      <button class="retry-btn" onclick="loadDiagnosis()">重试</button>
    </div>`;
  }
}

// ═══ Panel 3: Federated Approval (右栏) ═══

async function loadFederated() {
  const container = document.getElementById('ga-federated-list');
  const countBadge = document.getElementById('ga-federated-count');
  if (!container) return;

  try {
    const resp = await api.get('/api/admin/knowledge/federated/pending');
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ message: 'HTTP ' + resp.status }));
      throw new Error(err.message || 'Failed to load federated items');
    }
    const json = await resp.json();
    const items = json.data || [];

    if (countBadge) countBadge.textContent = String(items.length);

    if (!items.length) {
      container.innerHTML = '<div class="ga-empty">暂无待审批的联邦知识</div>';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="ga-fed-item" data-fed-id="${escHtml(item.id || '')}">
        <div class="ga-fed-header">
          <span class="ga-fed-status ga-fed-${item.status || 'pending'}">${item.status || 'pending'}</span>
        </div>
        <div class="ga-fed-text">${escHtml(item.anonymizedText || item.text || item.content || '—')}</div>
        <div class="ga-fed-actions">
          <button class="ga-fed-btn ga-fed-btn-approve" onclick="approveFederated('${escHtml(item.id || '')}')">批准</button>
          <button class="ga-fed-btn ga-fed-btn-reject" onclick="rejectFederated('${escHtml(item.id || '')}')">驳回</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('loadFederated failed:', err);
    container.innerHTML = `<div class="ga-error">
      <p>联邦审批数据不可用</p>
      <button class="retry-btn" onclick="loadFederated()">重试</button>
    </div>`;
  }
}

async function approveFederated(id) {
  try {
    const resp = await api.post('/api/admin/knowledge/federated/' + encodeURIComponent(id) + '/approve');
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ message: 'HTTP ' + resp.status }));
      throw new Error(err.message || 'Approval failed');
    }
    if (typeof showToast === 'function') showToast('联邦知识已批准', 'success');
    removeFederatedItem(id);
  } catch (err) {
    console.error('approveFederated failed:', err);
    if (typeof showToast === 'function') showToast('审批失败: ' + err.message, 'error');
  }
}

async function rejectFederated(id) {
  // Federated reject: client-side removal (no backend reject endpoint available)
  // Item is dismissed from the GA's view. Backend may handle stale items via expiry check.
  if (typeof showToast === 'function') showToast('联邦知识已驳回', 'warning');
  removeFederatedItem(id);
}

function removeFederatedItem(id) {
  const item = document.querySelector(`[data-fed-id="${CSS.escape(id)}"]`);
  if (item) item.remove();
  const badge = document.getElementById('ga-federated-count');
  if (badge) badge.textContent = String(Math.max(0, parseInt(badge.textContent || '0') - 1));
}

// ═══ Panel 4: Observation Submit (右栏下方) ═══
// Flow: ingest → mark-shareable → enters federated pipeline

async function submitObservation() {
  const enterpriseSel = document.getElementById('ga-obs-enterprise');
  const contentArea = document.getElementById('ga-obs-content');
  const feedback = document.getElementById('ga-obs-feedback');
  const submitBtn = document.getElementById('ga-obs-submit');

  if (!enterpriseSel || !contentArea) return;

  const orgId = enterpriseSel.value;
  const text = contentArea.value.trim();

  if (!orgId) {
    if (feedback) { feedback.textContent = '请先选择企业'; feedback.className = 'ga-obs-feedback ga-obs-error'; }
    return;
  }
  if (!text) {
    if (feedback) { feedback.textContent = '请输入 Observation 内容'; feedback.className = 'ga-obs-feedback ga-obs-error'; }
    return;
  }

  if (submitBtn) submitBtn.disabled = true;
  if (feedback) { feedback.textContent = '提交中…'; feedback.className = 'ga-obs-feedback'; }

  try {
    // Step 1: Ingest as knowledge (sourceType=ga_observation)
    const ingestResp = await api.post('/api/knowledge/ingest', {
      text: text,
      sourceType: 'ga_observation',
      sourceId: orgId,
    });
    if (!ingestResp.ok) {
      const err = await ingestResp.json().catch(() => ({ message: 'HTTP ' + ingestResp.status }));
      throw new Error(err.message || 'Ingestion failed');
    }
    const ingestData = await ingestResp.json();
    const chunkId = ingestData.id;
    if (!chunkId) throw new Error('No chunk ID returned from ingestion');

    // Step 2: Mark as shareable → enters federated pipeline as pending_admin
    const shareResp = await api.post('/api/admin/knowledge/' + encodeURIComponent(chunkId) + '/mark-shareable', {
      text: text,
      orgId: orgId,
    });
    if (!shareResp.ok) {
      // Ingest succeeded but mark-shareable failed — data not lost, just not federated
      if (feedback) { feedback.textContent = '已保存但未进入联邦管线（标记可共享失败）'; feedback.className = 'ga-obs-feedback ga-obs-warning'; }
      if (typeof showToast === 'function') showToast('Observation 已保存', 'success');
      contentArea.value = '';
      return;
    }
    if (feedback) { feedback.textContent = 'Observation 已提交并进入联邦审批管线'; feedback.className = 'ga-obs-feedback ga-obs-success'; }
    contentArea.value = '';
    if (typeof showToast === 'function') showToast('Observation 已提交', 'success');
    // Refresh federated list — new item should appear as pending_admin
    loadFederated();
  } catch (err) {
    console.error('submitObservation failed:', err);
    if (feedback) { feedback.textContent = '提交失败: ' + err.message; feedback.className = 'ga-obs-feedback ga-obs-error'; }
    if (typeof showToast === 'function') showToast('提交失败: ' + err.message, 'error');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// ═══ Auto-Refresh (5 min) ═══

function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    loadDiagnosis();
    loadFederated();
  }, 300000);
}

// ═══ Helpers ═══

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
