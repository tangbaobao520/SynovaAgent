/**
 * app/js/admin.js — Admin Workbench UI (D108 v2)
 *
 * 4-panel admin UI consuming D103 enterprise routes.
 * Uses D96 shared shell + api-client.js.
 */

(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // ── Panel 1: Enterprise Status ──

  function loadEnterpriseStatus() {
    var container = $('enterprise-status');
    api.get('/api/enterprise/status').then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok && data.data) {
        container.innerHTML = '<p><strong>Org:</strong> ' + escapeHtml(data.data.name || '—') + ' (' + escapeHtml(data.data.orgId) + ')</p>'
          + '<p><strong>Status:</strong> <span class="badge badge-green">' + escapeHtml(data.data.status) + '</span></p>'
          + '<p><strong>Since:</strong> ' + (data.data.createdAt ? new Date(data.data.createdAt).toLocaleDateString() : '—') + '</p>';
      } else {
        container.innerHTML = '<p class="empty-state">Not registered.</p>';
      }
    }).catch(function () {
      container.innerHTML = '<div class="error-message visible">Unavailable. <a href="#" onclick="location.reload()">Retry</a></div>';
    });
  }

  // ── Panel 2: Members ──

  function loadMembers() {
    var container = $('members-panel');
    api.get('/api/enterprise/members').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.data || data.data.length === 0) {
        container.innerHTML = '<p class="empty-state">No members.</p>'; return;
      }
      container.innerHTML = data.data.map(function (m) {
        return '<div class="member-row"><span>' + escapeHtml(m.email) + ' <span class="badge badge-' + (m.role === 'admin' ? 'orange' : 'green') + '">' + escapeHtml(m.role) + '</span></span>'
          + (m.status === 'active' ? '<button class="btn-small btn-danger" onclick="window.removeMember(\'' + m.userId + '\')">Remove</button>' : '<span class="badge badge-grey">inactive</span>')
          + '</div>';
      }).join('');
    }).catch(function () {
      container.innerHTML = '<div class="error-message visible">Unavailable.</div>';
    });
  }

  window.removeMember = function (userId) {
    if (!confirm('Remove this member?')) return;
    api.del('/api/enterprise/members/' + userId).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Member removed', 'success'); loadMembers(); }
      else { showToast('Remove failed', 'error'); }
    }).catch(function () { showToast('Remove failed', 'error'); });
  };

  $('invite-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = $('invite-email').value;
    var role = $('invite-role').value;
    api.post('/api/enterprise/invite', { email: email, role: role }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Invited ' + email, 'success'); loadMembers(); }
      else { showToast(data.message || 'Invite failed', 'error'); }
    }).catch(function () { showToast('Invite failed', 'error'); });
  });

  // ── Panel 3: IMA ──

  function loadImaStatus() {
    var container = $('ima-panel');
    api.get('/api/enterprise/ima/status').then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok && data.data) {
        container.innerHTML = '<p>Status: <span class="badge badge-' + (data.data.status === 'active' ? 'green' : 'grey') + '">' + escapeHtml(data.data.status) + '</span>'
          + (data.data.lastSyncAt ? ' | Last sync: ' + new Date(data.data.lastSyncAt).toLocaleString() : '') + '</p>';
      } else {
        container.innerHTML = '<p class="empty-state">Not configured.</p>';
      }
    }).catch(function () {
      container.innerHTML = '<div class="error-message visible">Unavailable.</div>';
    });
  }

  $('ima-bind-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var key = $('ima-api-key').value;
    api.post('/api/enterprise/ima/bind', { apiKey: key }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('IMA bound', 'success'); loadImaStatus(); }
      else { showToast('Bind failed', 'error'); }
    }).catch(function () { showToast('Bind failed', 'error'); });
  });

  // ── Panel 4: GA Access ──

  $('btn-generate-ga').addEventListener('click', function () {
    api.post('/api/enterprise/ga-access/generate', {}).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok && data.data) {
        showToast('Token: ' + data.data.token, 'success');
        $('ga-panel').innerHTML = '<div class="token-display"><code>' + escapeHtml(data.data.token) + '</code> <button class="btn-small" onclick="navigator.clipboard.writeText(\'' + data.data.token + '\');showToast(\'Copied\',\'success\')">Copy</button><br><small>Expires: ' + new Date(data.data.expiresAt).toLocaleString() + '</small></div>';
      } else { showToast('Generation failed', 'error'); }
    }).catch(function () { showToast('Generation failed', 'error'); });
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
    loadEnterpriseStatus();
    loadMembers();
    loadImaStatus();
  });
})();
