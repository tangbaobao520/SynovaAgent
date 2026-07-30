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
        var display = escapeHtml(m.phone || m.wechatId || m.email);
        return '<div class="member-row"><span>' + display + ' <span class="badge badge-' + (m.role === 'admin' ? 'orange' : 'green') + '">' + escapeHtml(m.role) + '</span></span>'
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

  // ═══ D246: Onboarding Wizard ═══

  var ONBOARDING_STEPS = [
    { id: 'register', title: 'Register', label: 'Create your enterprise account' },
    { id: 'invite', title: 'Invite', label: 'Invite team members' },
    { id: 'import', title: 'Import', label: 'Import business data' },
    { id: 'diagnose', title: 'Diagnose', label: 'Run first diagnosis' },
    { id: 'view', title: 'View', label: 'View your dashboard' },
  ];

  var ONBOARDING_KEY = 'synova_onboarding';

  function getOnboardingState() {
    try { return JSON.parse(localStorage.getItem(ONBOARDING_KEY)) || {}; } catch (e) { return {}; }
  }

  function setOnboardingState(stepId) {
    var state = getOnboardingState();
    state[stepId] = 'done';
    state._lastStep = stepId;
    try { localStorage.setItem(ONBOARDING_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
    renderOnboarding();
  }

  function getOnboardingStep() {
    var state = getOnboardingState();
    if (state.view === 'done') return -1; // all done
    for (var i = 0; i < ONBOARDING_STEPS.length; i++) {
      if (state[ONBOARDING_STEPS[i].id] !== 'done') return i;
    }
    return -1;
  }

  function showOnboarding() {
    var wiz = $('onboarding-wizard');
    if (wiz) wiz.style.display = 'block';
  }

  function renderOnboarding() {
    var container = $('onboarding-steps');
    var content = $('onboarding-content');
    var progress = $('onboarding-progress');
    if (!container) return;

    var stepIdx = getOnboardingStep();
    var state = getOnboardingState();
    var doneCount = Object.keys(state).filter(function (k) { return state[k] === 'done' && k !== '_lastStep'; }).length;

    if (stepIdx === -1) {
      container.innerHTML = '<div style="display:flex;align-items:center;gap:8px;font-size:13px;color:#16a34a"><span>All steps complete!</span> <a href="/cockpit" style="color:var(--primary)">Go to Dashboard</a></div>';
      content.innerHTML = '';
      if (progress) progress.textContent = '(5/5)';
      return;
    }

    if (progress) progress.textContent = '(' + doneCount + '/5)';

    // Progress bar
    container.innerHTML = '<div class="ob-step-bar">' + ONBOARDING_STEPS.map(function (s, i) {
      var cls = i < stepIdx ? 'done' : (i === stepIdx ? 'active' : '');
      var mark = i < stepIdx ? '&#10003;' : (i + 1);
      return '<div class="ob-step ' + cls + '"><span class="num">' + mark + '</span>' + escapeHtml(s.title) + '</div>';
    }).join('') + '</div>';

    // Render the active step's content
    var step = ONBOARDING_STEPS[stepIdx];
    content.innerHTML = getStepHTML(stepIdx, step);
    bindStepEvents(stepIdx, step);
  }

  function getStepHTML(idx, step) {
    switch (step.id) {
      case 'register':
        return '<h3 style="margin-bottom:12px;font-size:15px">Create Your Enterprise</h3>'
          + '<div class="ob-field"><label>Organization Name</label><input type="text" id="ob-org-name" placeholder="e.g. Acme Corp" value="My Enterprise"></div>'
          + '<div class="ob-field"><label>Email / Phone / WeChat ID</label><input type="text" id="ob-email" value="admin@enterprise.com"></div>'
          + '<div class="ob-field"><label>Password</label><input type="password" id="ob-password" value="admin123!"></div>'
          + '<div id="ob-register-result"></div>'
          + '<div class="ob-actions"><button id="ob-btn-register" class="btn-primary">Register</button></div>';

      case 'invite':
        return '<h3 style="margin-bottom:12px;font-size:15px">Invite Team Members</h3>'
          + '<div class="ob-field"><label>Email</label><input type="email" id="ob-invite-email" placeholder="colleague@company.com"></div>'
          + '<div class="ob-field"><label>Role</label><select id="ob-invite-role"><option value="staff">Staff</option><option value="manager">Manager</option></select></div>'
          + '<div id="ob-invite-result"></div>'
          + '<div class="ob-actions"><button id="ob-btn-invite" class="btn-primary">Invite &amp; Continue</button>'
          + '<button id="ob-btn-skip-invite" class="btn-skip">Skip</button></div>';

      case 'import':
        return '<h3 style="margin-bottom:12px;font-size:15px">Import Business Data</h3>'
          + '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Upload your CSV data to populate the knowledge graph.</p>'
          + '<div id="ob-import-zone" class="drop-zone" style="padding:24px"><p>Drop CSV file here or click to browse</p></div>'
          + '<div id="ob-import-result"></div>'
          + '<div class="ob-actions"><button id="ob-btn-skip-import" class="btn-skip">Skip (continue later)</button></div>';

      case 'diagnose':
        return '<h3 style="margin-bottom:12px;font-size:15px">Run First Diagnosis</h3>'
          + '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Trigger a full enterprise diagnosis. This may take a few minutes.</p>'
          + '<div id="ob-diagnose-status"></div>'
          + '<div class="ob-actions"><button id="ob-btn-diagnose" class="btn-primary">Start Diagnosis</button></div>';

      case 'view':
        return '<h3 style="margin-bottom:12px;font-size:15px">Explore Your Dashboard</h3>'
          + '<p style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Your control tower dashboard is ready. Monitor signals, review gates, and track growth.</p>'
          + '<div class="ob-actions"><a href="/cockpit" class="btn-primary" style="display:inline-block;padding:8px 20px;border-radius:6px;text-decoration:none">Open Dashboard</a>'
          + '<button id="ob-btn-finish" class="btn-primary" style="background:#16a34a">Finish</button></div>';

      default:
        return '';
    }
  }

  function bindStepEvents(idx, step) {
    switch (step.id) {
      case 'register':
        var btn = $('ob-btn-register');
        if (btn) btn.addEventListener('click', function () {
          var org = $('ob-org-name').value;
          var input = $('ob-email').value;
          var pass = $('ob-password').value;
          var result = $('ob-register-result');
          // Smart detect: email, phone, or wechatId
          var registerBody = { password: pass, orgName: org };
          if (input.indexOf('@') > 0) registerBody.email = input;
          else if (/^1[3-9]\d{9}$/.test(input)) registerBody.phone = input;
          else registerBody.wechatId = input;
          btn.disabled = true; btn.textContent = 'Registering...';
          api.post('/api/enterprise/register', registerBody).then(function (r) { return r.json(); }).then(function (data) {
            if (data.ok) {
              result.innerHTML = '<div class="ob-success">Enterprise created successfully!</div>';
              setOnboardingState('register');
              showToast('Enterprise registered', 'success');
            } else {
              result.innerHTML = '<div class="error-message visible">' + escapeHtml(data.message || 'Registration failed') + '</div>';
              btn.disabled = false; btn.textContent = 'Register';
            }
          }).catch(function () {
            result.innerHTML = '<div class="error-message visible">Registration failed. Is the server running?</div>';
            btn.disabled = false; btn.textContent = 'Register';
          });
        });
        break;

      case 'invite':
        var btnInv = $('ob-btn-invite');
        if (btnInv) btnInv.addEventListener('click', function () {
          var email = $('ob-invite-email').value;
          var role = $('ob-invite-role').value;
          if (!email) { showToast('Enter an email', 'warning'); return; }
          var result = $('ob-invite-result');
          btnInv.disabled = true; btnInv.textContent = 'Inviting...';
          api.post('/api/enterprise/invite', { email: email, role: role }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.ok) {
              result.innerHTML = '<div class="ob-success">Invited ' + escapeHtml(email) + '!</div>';
              setOnboardingState('invite');
              showToast('Invitation sent', 'success');
            } else {
              result.innerHTML = '<div class="error-message visible">' + escapeHtml(data.message || 'Invite failed') + '</div>';
              btnInv.disabled = false; btnInv.textContent = 'Invite & Continue';
            }
          }).catch(function () {
            result.innerHTML = '<div class="error-message visible">Invite failed.</div>';
            btnInv.disabled = false; btnInv.textContent = 'Invite & Continue';
          });
        });
        var btnSkip = $('ob-btn-skip-invite');
        if (btnSkip) btnSkip.addEventListener('click', function () { setOnboardingState('invite'); });
        break;

      case 'import':
        // Import via skip for now (CSV upload is a separate page)
        var btnSkipImp = $('ob-btn-skip-import');
        if (btnSkipImp) btnSkipImp.addEventListener('click', function () {
          setOnboardingState('import');
          showToast('Data import skipped', 'info');
        });
        // Dropzone: link to import.html
        var zone = $('ob-import-zone');
        if (zone) zone.addEventListener('click', function () {
          window.location.href = '/app/import.html';
        });
        break;

      case 'diagnose':
        var btnDiag = $('ob-btn-diagnose');
        if (btnDiag) btnDiag.addEventListener('click', function () {
          var status = $('ob-diagnose-status');
          btnDiag.disabled = true; btnDiag.textContent = 'Running...';
          status.innerHTML = '<p style="font-size:13px;color:var(--primary)">Diagnosis triggered. This runs on cron schedule.</p>';
          api.post('/api/loops/1/execute', {}).then(function (r) { return r.json(); }).then(function (data) {
            status.innerHTML = '<div class="ob-success">Diagnosis ' + (data.ok ? 'triggered' : 'requested') + '!</div>';
            setOnboardingState('diagnose');
          }).catch(function () {
            status.innerHTML = '<div class="ob-success">Diagnosis request sent (async).</div>';
            setOnboardingState('diagnose');
          });
        });
        break;

      case 'view':
        var btnFinish = $('ob-btn-finish');
        if (btnFinish) btnFinish.addEventListener('click', function () {
          setOnboardingState('view');
          renderOnboarding();
        });
        break;
    }
  }

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
    // D246: Show onboarding if no enterprise registered yet
    api.get('/api/enterprise/status').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.data) {
        showOnboarding();
        renderOnboarding();
      }
    }).catch(function () {
      // Server not reachable — show onboarding as entry point
      showOnboarding();
      renderOnboarding();
    });
  });
})();
