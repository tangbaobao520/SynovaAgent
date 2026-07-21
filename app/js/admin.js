/**
 * app/js/admin.js — Admin Workbench Logic (D108)
 *
 * 5-tab admin UI consuming D103 enterprise routes.
 * Uses D96 shared shell + api-client.js.
 */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ── Tab Navigation ──

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
        document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
        btn.classList.add('active');
        var tabId = btn.getAttribute('data-tab');
        var tab = document.getElementById('tab-' + tabId);
        if (tab) tab.classList.add('active');
        // Load data on tab switch
        if (tabId === 'enterprise') loadEnterpriseStatus();
        if (tabId === 'members') loadMembers();
        if (tabId === 'invitations') loadInvitations();
        if (tabId === 'ima') loadImaStatus();
        if (tabId === 'ga-access') loadGaTokens();
      });
    });
  }

  // ── Enterprise Tab ──

  async function loadEnterpriseStatus() {
    var container = $('enterprise-status');
    try {
      var resp = await api.get('/api/enterprise/status');
      var data = await resp.json();
      if (data.ok && data.data) {
        container.innerHTML = '<div class="enterprise-info"><p><strong>Org ID: </strong>' + escapeHtml(data.data.orgId) + '</p><p><strong>Name: </strong>' + escapeHtml(data.data.name || '—') + '</p><p><strong>Status: </strong><span class="badge badge-green">' + escapeHtml(data.data.status) + '</span></p><p><strong>Created: </strong>' + (data.data.createdAt ? new Date(data.data.createdAt).toLocaleDateString() : '—') + '</p></div>';
      } else {
        container.innerHTML = '<p class="empty-state">No enterprise data. Register below.</p>';
      }
    } catch (err) {
      container.innerHTML = '<div class="error-message visible">Service unavailable. <a href="#" onclick="location.reload()">Retry</a></div>';
    }
  }

  $('enterprise-register-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var orgName = $('reg-org-name').value;
    var email = $('reg-email').value;
    var password = $('reg-password').value;
    try {
      var resp = await api.post('/api/enterprise/register', { email: email, password: password, orgName: orgName });
      var data = await resp.json();
      if (data.ok) {
        showToast('Enterprise registered successfully', 'success');
        loadEnterpriseStatus();
      } else {
        showToast(data.message || 'Registration failed', 'error');
      }
    } catch (err) {
      showToast('Registration failed: ' + (err.message || 'unknown'), 'error');
    }
  });

  // ── Members Tab ──

  async function loadMembers() {
    var container = $('members-list');
    try {
      var resp = await api.get('/api/enterprise/members');
      var data = await resp.json();
      if (!data.ok || !data.data || data.data.length === 0) {
        container.innerHTML = '<p class="empty-state">No members found.</p>';
        return;
      }
      container.innerHTML = '<table class="admin-table"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>'
        + data.data.map(function (m) {
          return '<tr><td>' + escapeHtml(m.email) + '</td><td>' + escapeHtml(m.role) + '</td><td><span class="badge badge-' + (m.status === 'active' ? 'green' : 'grey') + '">' + m.status + '</span></td>'
            + '<td><select onchange="window.changeMemberRole(\'' + m.userId + '\', this.value)"><option value="staff"' + (m.role === 'staff' ? ' selected' : '') + '>Staff</option><option value="manager"' + (m.role === 'manager' ? ' selected' : '') + '>Manager</option><option value="liaison"' + (m.role === 'liaison' ? ' selected' : '') + '>Liaison</option></select>'
            + (m.status === 'active' ? ' <button class="btn-small btn-danger" onclick="window.removeMember(\'' + m.userId + '\')">Remove</button>' : '')
            + '</td></tr>';
        }).join('') + '</tbody></table>';
    } catch (err) {
      container.innerHTML = '<div class="error-message visible">Service unavailable. <a href="#" onclick="location.reload()">Retry</a></div>';
    }
  }

  window.changeMemberRole = async function (userId, role) {
    try {
      var resp = await api.put('/api/enterprise/members/' + userId, { role: role });
      var data = await resp.json();
      showToast(data.ok ? 'Role updated' : 'Update failed', data.ok ? 'success' : 'error');
    } catch (err) { showToast('Update failed: ' + (err.message || 'unknown'), 'error'); }
  };

  window.removeMember = async function (userId) {
    if (!confirm('Remove this member?')) return;
    try {
      var resp = await api.del('/api/enterprise/members/' + userId);
      var data = await resp.json();
      if (data.ok) { showToast('Member removed', 'success'); loadMembers(); }
      else { showToast(data.message || 'Remove failed', 'error'); }
    } catch (err) { showToast('Remove failed: ' + (err.message || 'unknown'), 'error'); }
  };

  // Invite form in Members tab
  $('invite-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var email = $('invite-email').value;
    var role = $('invite-role').value;
    try {
      var resp = await api.post('/api/enterprise/invite', { email: email, role: role });
      var data = await resp.json();
      if (data.ok) {
        showToast('Invitation sent to ' + email, 'success');
        loadInvitations();
      } else { showToast(data.message || 'Invite failed', 'error'); }
    } catch (err) { showToast('Invite failed', 'error'); }
  });

  // ── Invitations Tab ──

  async function loadInvitations() {
    var container = $('invitations-list');
    try {
      var resp = await api.get('/api/enterprise/invitations');
      var data = await resp.json();
      if (!data.ok || !data.data || data.data.length === 0) {
        container.innerHTML = '<p class="empty-state">No pending invitations.</p>';
        return;
      }
      container.innerHTML = '<table class="admin-table"><thead><tr><th>Email</th><th>Role</th><th>Status</th><th>Expires</th><th>Action</th></tr></thead><tbody>'
        + data.data.map(function (inv) {
          return '<tr><td>' + escapeHtml(inv.email) + '</td><td>' + escapeHtml(inv.role) + '</td><td>' + escapeHtml(inv.status) + '</td><td>' + (inv.expiresAt ? new Date(inv.expiresAt).toLocaleDateString() : '—') + '</td>'
            + '<td>' + (inv.status === 'pending' ? '<button class="btn-small btn-danger" onclick="window.revokeInvitation(\'' + inv.token + '\')">Revoke</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    } catch (err) {
      container.innerHTML = '<div class="error-message visible">Service unavailable. <a href="#" onclick="location.reload()">Retry</a></div>';
    }
  }

  window.revokeInvitation = async function (token) {
    try {
      var resp = await api.del('/api/enterprise/invitations/' + token);
      var data = await resp.json();
      if (data.ok) { showToast('Invitation revoked', 'success'); loadInvitations(); }
      else { showToast(data.message || 'Revoke failed', 'error'); }
    } catch (err) { showToast('Revoke failed', 'error'); }
  };

  // ── ima Tab ──

  async function loadImaStatus() {
    var container = $('ima-status');
    try {
      var resp = await api.get('/api/enterprise/ima/status');
      var data = await resp.json();
      if (data.ok && data.data) {
        container.innerHTML = '<p><strong>Status: </strong><span class="badge badge-' + (data.data.status === 'active' ? 'green' : 'grey') + '">' + escapeHtml(data.data.status) + '</span></p>'
          + (data.data.lastSyncAt ? '<p><strong>Last Sync: </strong>' + new Date(data.data.lastSyncAt).toLocaleString() + '</p>' : '')
          + (data.data.status === 'not_bound' ? '<p class="text-secondary">ima integration is not configured yet.</p>' : '');
      } else {
        container.innerHTML = '<p class="empty-state">ima status unavailable.</p>';
      }
    } catch (err) {
      container.innerHTML = '<div class="error-message visible">Service unavailable.</div>';
    }
  }

  $('ima-bind-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var apiKey = $('ima-api-key').value;
    try {
      var resp = await api.post('/api/enterprise/ima/bind', { apiKey: apiKey });
      var data = await resp.json();
      if (data.ok) { showToast('ima bound successfully', 'success'); loadImaStatus(); }
      else { showToast(data.message || 'Bind failed', 'error'); }
    } catch (err) { showToast('Bind failed', 'error'); }
  });

  // ── GA Access Tab ──

  async function loadGaTokens() {
    // GA tokens list requires a type parameter; simplified listing via enterprise status
    var container = $('ga-tokens-list');
    container.innerHTML = '<p class="text-secondary">Click "Generate New Token" to create a GA temporary access link. The token will be valid for 7 days.</p>';
  }

  $('btn-generate-ga').addEventListener('click', async function () {
    try {
      var resp = await api.post('/api/enterprise/ga-access/generate', {});
      var data = await resp.json();
      if (data.ok && data.data) {
        showToast('GA token generated: ' + data.data.token, 'success');
        var container = $('ga-tokens-list');
        container.innerHTML = '<div class="token-display"><strong>Token: </strong><code>' + escapeHtml(data.data.token) + '</code><br><strong>Expires: </strong>' + new Date(data.data.expiresAt).toLocaleString() + '<br><button class="btn-small" onclick="navigator.clipboard.writeText(\'' + data.data.token + '\');showToast(\'Copied\',\'success\')">Copy</button></div>';
      } else { showToast(data.message || 'Generation failed', 'error'); }
    } catch (err) { showToast('Generation failed', 'error'); }
  });

  // ── Utilities ──

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──

  document.addEventListener('DOMContentLoaded', function () {
    initTabs();
    loadEnterpriseStatus();
  });

})();
