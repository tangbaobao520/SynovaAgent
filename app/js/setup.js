/**
 * app/js/setup.js -- D283 customer self-installation guide
 * 4-step wizard: Welcome -> Configure -> Test Connection -> Done
 */
(function () {
  'use strict';
  var STEPS = [
    { id: 'welcome',  title: 'Welcome' },
    { id: 'configure', title: 'Configure' },
    { id: 'test',     title: 'Test' },
    { id: 'done',     title: 'Done' },
  ];
  var STEP_KEY = 'synova_setup_step';
  function getStep() {
    try { return parseInt(localStorage.getItem(STEP_KEY), 10) || 1; } catch (e) { return 1; }
  }
  function setStep(n) {
    try { localStorage.setItem(STEP_KEY, String(n)); } catch (e) {}
  }
  function clearStep() {
    try { localStorage.removeItem(STEP_KEY); } catch (e) {}
  }
  function qsi(id) { return document.getElementById(id); }

  function renderProgress(current) {
    var bar = qsi('setup-progress');
    if (!bar) return;
    bar.innerHTML = STEPS.map(function (s, i) {
      var idx = i + 1;
      var cls = idx < current ? 'done' : (idx === current ? 'active' : '');
      var mark = idx < current ? '&#10003;' : idx;
      return '<div class="sp-step ' + cls + '"><span class="sp-num">' + mark + '</span>' + s.title + '</div>';
    }).join('');
  }

  function renderStep(step) {
    var container = qsi('setup-content');
    if (!container) return;
    renderProgress(step);
    switch (step) {
      case 1: renderWelcome(container); break;
      case 2: renderConfigure(container); break;
      case 3: renderTest(container); break;
      case 4: renderDone(container); break;
    }
  }

  function renderWelcome(container) {
    container.innerHTML = '<h1>Welcome to Synova</h1>'
      + '<p>Synova helps you monitor your organization&#39;s health, track goals, and make data-driven decisions.<br>This quick setup will get you connected in under 5 minutes.</p>'
      + '<div style="margin:24px 0;text-align:left">'
      + '<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:14px"><strong>Step 1:</strong> Configure your server connection</div>'
      + '<div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:14px"><strong>Step 2:</strong> Test the connection</div>'
      + '<div style="padding:10px 0;font-size:14px"><strong>Step 3:</strong> Launch the dashboard</div>'
      + '</div>'
      + '<button class="btn-primary" onclick="window.setupGo(2)">Get Started</button>';
  }

  function renderConfigure(container) {
    var savedUrl = localStorage.getItem('synova_server_url') || 'http://localhost:18790';
    container.innerHTML = '<h1>Configure Server</h1>'
      + '<p>Enter the address where your Synova server is running.</p>'
      + '<div class="sf-group"><label>Server URL</label>'
      + '<input type="url" id="sf-server-url" value="' + savedUrl + '" placeholder="http://localhost:18790">'
      + '<div class="sf-hint">Default: http://localhost:18790 (local installation)</div></div>'
      + '<div class="setup-actions">'
      + '<button class="btn-secondary" onclick="window.setupGo(1)">Back</button>'
      + '<button class="btn-primary" onclick="window.setupGo(3)">Continue</button>'
      + '</div>';
  }

  function renderTest(container) {
    var urlInput = qsi('sf-server-url');
    var url = (urlInput && urlInput.value) || localStorage.getItem('synova_server_url') || 'http://localhost:18790';
    localStorage.setItem('synova_server_url', url);
    container.innerHTML = '<h1>Test Connection</h1>'
      + '<p>Testing connection to <strong>' + url + '</strong>...</p>'
      + '<div id="conn-status" class="conn-status wait">Connecting...</div>'
      + '<div class="setup-actions">'
      + '<button class="btn-secondary" onclick="window.setupGo(2)">Back</button>'
      + '<button class="btn-primary" id="btn-retry" style="display:none">Retry</button>'
      + '</div>';
    var statusEl = qsi('conn-status');
    var retryBtn = qsi('btn-retry');
    function testConn() {
      statusEl.className = 'conn-status wait';
      statusEl.textContent = 'Connecting...';
      retryBtn.style.display = 'none';
      fetch(url + '/api/healthz', { timeout: 5000 })
        .then(function (r) {
          if (r.ok) {
            statusEl.className = 'conn-status ok';
            statusEl.innerHTML = '&#10003; Connected! Server is running.';
            setTimeout(function () { window.setupGo(4); }, 1500);
          } else {
            statusEl.className = 'conn-status err';
            statusEl.innerHTML = 'Server returned status ' + r.status + '. Check your URL.';
            retryBtn.style.display = 'inline-block';
          }
        })
        .catch(function (err) {
          statusEl.className = 'conn-status err';
          statusEl.innerHTML = 'Could not reach the server. Make sure <code>' + url + '</code> is running.<br><small>' + err.message + '</small>';
          retryBtn.style.display = 'inline-block';
        });
    }
    retryBtn.addEventListener('click', testConn);
    testConn();
  }

  function renderDone(container) {
    var url = localStorage.getItem('synova_server_url') || 'http://localhost:18790';
    container.innerHTML = '<div class="success-icon">&#10003;</div>'
      + '<h1>Setup Complete!</h1>'
      + '<p>Your Synova server is configured and ready.</p>'
      + '<div style="padding:12px;background:var(--bg);border-radius:8px;font-size:13px;margin-bottom:16px">'
      + 'Server: <code>' + url + '</code></div>'
      + '<div class="setup-actions">'
      + '<a href="/app/login.html" class="btn-primary" style="text-decoration:none;padding:12px 32px;border-radius:8px;display:inline-block">Launch Synova</a>'
      + '</div>';
    clearStep();
  }

  window.setupGo = function (step) {
    setStep(step);
    renderStep(step);
  };

  document.addEventListener('DOMContentLoaded', function () {
    renderStep(getStep());
  });
})();
