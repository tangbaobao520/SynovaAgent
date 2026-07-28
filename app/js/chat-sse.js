/**
 * app/js/chat-sse.js — D252 SSE 流式消费 + 金字塔渲染
 *
 * 使用 fetch + ReadableStream 手动解析 SSE data: lines。
 * diagnosis.ts 是 POST 端点，EventSource (GET only) 不可用。
 *
 * 金字塔三层:
 *   GT  — phase_start → 大标题
 *   KJ  — interim_finding / community_reports / formatForSSE → 判断卡片
 *   E   — entity_resolution → 折叠
 *  底部 — complete → 操作按钮
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var outputEl = $('pyramid-output');
  var statusEl = $('diagnosis-status');
  var statusText = $('status-text');
  var progressEl = $('phase-progress');
  var btnStart = $('btn-start');

  // Phase labels for progress
  var PHASE_LABELS = ['', 'Organizational Interview', 'Data Collection', 'Hypothesis Generation', 'Root Cause Analysis', 'Report Generation', 'Delivery'];

  // ── SSE Consumer ──

  function startDiagnosis() {
    var teamId = $('team-id').value.trim() || 'org-1';
    var concern = $('concern-input').value.trim() || '';

    btnStart.disabled = true;
    btnStart.textContent = 'Diagnosing...';
    outputEl.innerHTML = '';
    statusEl.style.display = 'block';
    statusText.textContent = 'Starting diagnosis...';
    updatePhaseProgress(0);

    var body = { teamId: teamId };
    if (concern) body.concern = concern;

    fetch('/api/diagnosis/consult', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (response) {
      if (!response.ok) {
        showError('Server returned ' + response.status);
        resetButton();
        return;
      }
      var reader = response.body.getReader();
      var decoder = new TextDecoder();
      var buffer = '';

      function pump() {
        reader.read().then(function (result) {
          if (result.done) {
            statusText.textContent = 'Diagnosis complete.';
            resetButton();
            return;
          }
          buffer += decoder.decode(result.value, { stream: true });
          var lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Keep incomplete line in buffer

          for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();

            // SSE "data: {json}" format
            if (line.startsWith('data: ')) {
              try {
                var event = JSON.parse(line.slice(6));
                handleEvent(event);
              } catch (e) {
                console.warn('[SSE] parse error:', e.message, line.slice(0, 80));
              }
            }
          }

          pump();
        }).catch(function (err) {
          showError('Stream error: ' + err.message);
          resetButton();
        });
      }

      pump();
    }).catch(function (err) {
      showError('Connection failed: ' + err.message);
      resetButton();
    });
  }

  // ── Event Handler ──

  function handleEvent(event) {
    switch (event.type) {

      case 'phase_start':
        renderPhaseStart(event);
        break;

      case 'interim_finding':
        renderInterimFinding(event);
        break;

      case 'community_reports':
        renderCommunityReports(event);
        break;

      case 'entity_resolution':
        renderEntityResolution(event);
        break;

      case 'complete':
        renderComplete(event);
        break;

      case 'error':
        showError(event.message || 'Unknown error');
        break;

      default:
        // Dynamic phase events: event.type is the phase label
        if (event.type && event.label) {
          renderPhaseStart(event);
        }
        break;
    }
  }

  // ── Pyramid Rendering ──

  function renderPhaseStart(event) {
    var phase = event.phase || 0;
    var label = event.label || 'Phase ' + phase;
    var message = event.message || '';

    statusText.textContent = label + ' — ' + (message || 'In progress...');
    updatePhaseProgress(phase);

    var html = '<div class="gt-section">';
    html += '<h2 class="gt">' + escapeHtml(label) + '</h2>';
    if (message) html += '<p class="gt-desc">' + escapeHtml(message) + '</p>';
    html += '</div>';

    appendToOutput(html);
  }

  function renderInterimFinding(event) {
    var label = event.label || 'Finding';
    var message = event.message || '';
    var findings = event.findings || [];

    var html = '<div class="kj-section">';
    html += '<div class="kj">';
    html += '<h3>' + escapeHtml(label) + '</h3>';
    html += '<p>' + escapeHtml(message.slice(0, 200)) + '</p>';
    if (findings.length > 0) {
      html += '<ul class="kj-findings">';
      for (var i = 0; i < Math.min(findings.length, 5); i++) {
        var f = findings[i];
        html += '<li><span class="badge badge-phase">' + escapeHtml(f.moduleId || '?') + '</span> '
          + escapeHtml(f.summary || '').slice(0, 120) + '</li>';
      }
      if (findings.length > 5) html += '<li class="kj-more">+ ' + (findings.length - 5) + ' more</li>';
      html += '</ul>';
    }
    html += '</div></div>';

    appendToOutput(html);
  }

  function renderCommunityReports(event) {
    var message = event.message || 'Community reports generated.';
    var findings = event.findings || [];

    var html = '<div class="kj-section">';
    html += '<div class="kj kj-community">';
    html += '<h3>Community Reports</h3>';
    html += '<p>' + escapeHtml(message) + '</p>';
    if (findings.length > 0) {
      html += '<ul class="kj-findings">';
      for (var i = 0; i < findings.length; i++) {
        var f = findings[i];
        html += '<li><strong>' + escapeHtml(f.moduleId || 'community') + '</strong>: '
          + escapeHtml(f.summary || '').slice(0, 150) + '</li>';
      }
      html += '</ul>';
    }
    html += '</div></div>';

    appendToOutput(html);
  }

  function renderEntityResolution(event) {
    var message = event.message || 'Entity resolution completed.';
    var findings = event.findings || [];

    var html = '<div class="evidence-section">';
    html += '<details class="evidence-details">';
    html += '<summary>Entity Resolution — ' + escapeHtml(message) + '</summary>';
    if (findings.length > 0) {
      html += '<ul class="evidence-list">';
      for (var i = 0; i < findings.length; i++) {
        var f = findings[i];
        html += '<li>' + escapeHtml(f.moduleId || '') + ': ' + escapeHtml(f.summary || '').slice(0, 100) + '</li>';
      }
      html += '</ul>';
    }
    html += '</details></div>';

    appendToOutput(html);
  }

  function renderComplete(event) {
    var buttons = '<div class="complete-section">';
    buttons += '<p class="complete-message">Diagnosis complete.</p>';
    buttons += '<div class="complete-actions">';
    buttons += '<a href="/cockpit" class="btn-primary" style="display:inline-block;padding:8px 20px;border-radius:6px;text-decoration:none">View Dashboard</a>';
    buttons += '<button class="btn-secondary" onclick="window.location.reload()">New Diagnosis</button>';
    buttons += '</div></div>';

    appendToOutput(buttons);
    statusText.textContent = 'Complete.';
  }

  // ── Helpers ──

  function updatePhaseProgress(phase) {
    var html = '';
    for (var i = 1; i <= 6; i++) {
      var cls = i <= phase ? 'done' : (i === phase + 1 ? 'active' : '');
      html += '<div class="phase-dot ' + cls + '"></div>';
      if (i < 6) html += '<div class="phase-line ' + (i < phase ? 'done' : '') + '"></div>';
    }
    progressEl.innerHTML = html;
  }

  function appendToOutput(html) {
    outputEl.insertAdjacentHTML('beforeend', html);
    outputEl.scrollTop = outputEl.scrollHeight;
  }

  function showError(msg) {
    outputEl.innerHTML += '<div class="error-message visible">' + escapeHtml(msg) + '</div>';
    statusText.textContent = 'Error occurred.';
    resetButton();
  }

  function resetButton() {
    btnStart.disabled = false;
    btnStart.textContent = 'Start Diagnosis';
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Bind Events ──

  document.addEventListener('DOMContentLoaded', function () {
    btnStart.addEventListener('click', startDiagnosis);
    // Allow Enter key in input fields
    $('team-id').addEventListener('keydown', function (e) { if (e.key === 'Enter') startDiagnosis(); });
    $('concern-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') startDiagnosis(); });
  });
})();
