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

  // ── Panel 5: Role Templates ──

  function loadTemplates() {
    var container = $('role-templates');
    api.get('/api/enterprise/role-templates').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.data || data.data.length === 0) {
        container.innerHTML = '<p class="empty-state">No templates.</p>'; return;
      }
      container.innerHTML = data.data.map(function (t) {
        var builtinTag = t.isBuiltin ? ' <span class="badge badge-grey">builtin</span>' : '';
        var delBtn = t.isBuiltin ? '' : '<button class="btn-small btn-danger" onclick="window.deleteTemplate(\'' + escapeHtml(t.id) + '\')">Delete</button>';
        return '<div class="member-row"><span><strong>' + escapeHtml(t.name) + '</strong>' + builtinTag + '<br><small style="color:var(--text-secondary)">' + escapeHtml(t.description || '') + '</small></span>' + delBtn + '</div>';
      }).join('');
    }).catch(function () {
      container.innerHTML = '<div class="error-message visible">Unavailable.</div>';
    });
  }

  window.deleteTemplate = function (id) {
    if (!confirm('Delete this role template?')) return;
    api.del('/api/enterprise/role-templates/' + id).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Template deleted', 'success'); loadTemplates(); }
      else { showToast(data.message || 'Delete failed', 'error'); }
    }).catch(function () { showToast('Delete failed', 'error'); });
  };

  $('role-template-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('template-name').value;
    var perms = $('template-permissions').value;
    api.post('/api/enterprise/role-templates', { name: name, permissions: perms.split(',').map(function (p) { return p.trim(); }) }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Template created', 'success'); loadTemplates(); $('template-name').value = ''; $('template-permissions').value = ''; }
      else { showToast(data.message || 'Create failed', 'error'); }
    }).catch(function () { showToast('Create failed', 'error'); });
  });

  // ── Panel 6: Knowledge Approval ──

  function loadKnowledgePending() {
    var container = $('knowledge-pending');
    api.get('/api/admin/knowledge/pending').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.data || data.data.length === 0) {
        container.innerHTML = '<p class="empty-state">No pending knowledge.</p>'; return;
      }
      container.innerHTML = data.data.map(function (item) {
        var id = escapeHtml(item.id);
        return '<div class="member-row" style="flex-wrap:wrap"><span style="flex:1;min-width:120px">' + escapeHtml(item.text ? item.text.slice(0, 80) : (item.sourceId || id)) + '</span>'
          + '<span style="display:flex;gap:4px">'
          + '<button class="btn-small" style="border-color:#86efac;color:#16a34a" onclick="window.approveKnowledge(\'' + id + '\')">Approve</button>'
          + '<button class="btn-small btn-danger" onclick="window.showRejectForm(\'' + id + '\')">Reject</button>'
          + '</span>'
          + '<div id="reject-form-' + id + '" style="display:none;width:100%;margin-top:4px">'
          + '<input type="text" id="reject-reason-' + id + '" placeholder="Rejection reason" style="flex:1;padding:6px;border:1px solid var(--border);border-radius:4px;font-size:12px;margin-right:4px">'
          + '<button class="btn-small btn-danger" onclick="window.rejectKnowledge(\'' + id + '\')">Confirm Reject</button>'
          + '</div>'
          + '</div>';
      }).join('');
    }).catch(function () {
      container.innerHTML = '<div class="error-message visible">Unavailable.</div>';
    });
  }

  window.approveKnowledge = function (id) {
    api.post('/api/admin/knowledge/' + id + '/approve', {}).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Knowledge approved', 'success'); loadKnowledgePending(); }
      else { showToast('Approve failed', 'error'); }
    }).catch(function () { showToast('Approve failed', 'error'); });
  };

  window.showRejectForm = function (id) {
    var form = $('reject-form-' + id);
    if (form) form.style.display = 'block';
  };

  window.rejectKnowledge = function (id) {
    var reason = $('reject-reason-' + id);
    api.post('/api/admin/knowledge/' + id + '/reject', { reason: reason ? reason.value : 'No reason' }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Knowledge rejected', 'success'); loadKnowledgePending(); }
      else { showToast('Reject failed', 'error'); }
    }).catch(function () { showToast('Reject failed', 'error'); });
  };

  // ── Panel 7: Federated Knowledge ──

  function loadFederatedPending() {
    var container = $('fed-pending-list');
    api.get('/api/admin/knowledge/federated/pending').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.data || data.data.length === 0) {
        container.innerHTML = '<p class="empty-state">No federated pending items.</p>'; return;
      }
      container.innerHTML = data.data.map(function (item) {
        var id = escapeHtml(item.sourceChunkId);
        var st = item.status === 'pending_ga' ? 'Awaiting GA' : 'Pending Admin';
        var gaBtn = item.status === 'pending_admin' ? '<button class="btn-small" style="border-color:#86efac;color:#16a34a" onclick="window.approveFederated(\'' + id + '\')">GA Approve</button>' : '';
        return '<div class="member-row"><span>' + escapeHtml(item.anonymizedText ? item.anonymizedText.slice(0, 60) : id) + ' <span class="badge badge-orange">' + st + '</span></span>' + gaBtn + '</div>';
      }).join('');
    }).catch(function () {
      container.innerHTML = '<div class="error-message visible">Unavailable.</div>';
    });
  }

  function loadFederatedDegraded() {
    var container = $('fed-degraded-list');
    api.get('/api/admin/knowledge/federated/degraded').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.data || data.data.length === 0) {
        container.innerHTML = ''; return;
      }
      container.innerHTML = '<h3 style="font-size:13px;font-weight:600;margin-bottom:6px;color:#dc2626">Degraded Items</h3>'
        + data.data.map(function (item) {
          return '<div class="member-row" style="font-size:12px;color:var(--text-secondary)"><span>' + escapeHtml(item.anonymizedText ? item.anonymizedText.slice(0, 60) : item.sourceChunkId) + ' <span class="badge badge-grey">degraded</span></span></div>';
        }).join('');
    }).catch(function () { /* silent */ });
  }

  window.approveFederated = function (id) {
    api.post('/api/admin/knowledge/federated/' + id + '/approve', {}).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Federated approved', 'success'); loadFederatedPending(); loadFederatedDegraded(); }
      else { showToast('Approve failed', 'error'); }
    }).catch(function () { showToast('Approve failed', 'error'); });
  };

  $('btn-fed-mark-shareable').addEventListener('click', function () {
    var textEl = $('fed-knowledge-text');
    var text = textEl.value;
    if (!text) { showToast('Enter knowledge text', 'warning'); return; }
    var chunkId = 'ui-' + Date.now();
    api.post('/api/admin/knowledge/' + chunkId + '/mark-shareable', { text: text, orgId: 'default' }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) { showToast('Marked shareable', 'success'); textEl.value = ''; loadFederatedPending(); }
      else { showToast(data.message || 'Failed', 'error'); }
    }).catch(function () { showToast('Failed', 'error'); });
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
    loadTemplates();
    loadKnowledgePending();
    loadFederatedPending();
    loadFederatedDegraded();
  });
})();
