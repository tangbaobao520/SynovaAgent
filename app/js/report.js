/**
 * app/js/report.js — Diagnosis Report Loader (D98 v1.1)
 *
 * URL parameter ?id={consultationId} loads a specific report.
 * SSE streaming for in-progress diagnoses, auto-reconnect.
 * Fallback: no ?id — fetch sentinel reports list.
 * Uses D96 shared shell + api-client.js.
 */

(function () {
  'use strict';

  const STATUS_POLL_INTERVAL = 3000;
  const SSE_RECONNECT_DELAY = 5000;
  let eventSource = null;
  let pollTimer = null;
  let currentConsultationId = null;

  // ── DOM refs ──
  const $ = (id) => document.getElementById(id);
  const ceoContent = $('ceo-content');
  const ceoMetrics = $('ceo-metrics');
  const phaseSteps = $('phase-steps');
  const phaseBarFill = $('phase-bar-fill');
  const phaseDescription = $('phase-description');
  const findingsContainer = $('findings-container');
  const evidenceContainer = $('evidence-container');
  const rootCauseContainer = $('root-cause-container');
  const recommendationsContainer = $('recommendations-container');
  const statusBadge = $('status-badge');
  const reportIdDisplay = $('report-id-display');
  const reportDate = $('report-date');
  const reportTrigger = $('report-trigger');

  // ── Initialization ──

  function init() {
    const params = new URLSearchParams(window.location.search);
    const consultationId = params.get('id');

    if (consultationId) {
      currentConsultationId = consultationId;
      loadReport(consultationId);
    } else {
      showReportList();
    }
  }

  // ── Phase Progress ──

  function updatePhase(phase, progress) {
    const steps = phaseSteps.querySelectorAll('.phase-step');
    steps.forEach((step, i) => {
      step.classList.toggle('active', i === phase);
      step.classList.toggle('completed', i < phase);
    });
    const pct = Math.min(100, Math.max(0, progress || 0));
    phaseBarFill.style.width = pct + '%';

    const labels = ['Scoping', 'Interview Analysis', 'Evidence Collection', 'Expert Analysis', 'Cross-Validation', 'Report Generation'];
    phaseDescription.textContent = labels[phase] || 'Processing...';
  }

  // ── Status Badge ──

  function setStatus(status, label) {
    statusBadge.className = 'status-badge status-' + status;
    statusBadge.textContent = label || status;
  }

  // ── Render Skeleton ──

  function showSkeleton(container) {
    container.innerHTML = '<div class="skeleton-pulse" style="height:60px;"></div>';
  }

  // ── Load Report (with ID) ──

  async function loadReport(consultationId) {
    reportIdDisplay.textContent = 'ID: ' + consultationId;
    setStatus('loading', 'Loading...');

    try {
      const resp = await api.get('/api/diagnosis/consult/' + consultationId + '/status');
      const data = await resp.json();

      reportDate.textContent = 'Date: ' + (data.createdAt ? new Date(data.createdAt).toLocaleDateString() : '—');
      reportTrigger.textContent = 'Trigger: ' + (data.triggerType || 'manual');

      if (data.status === 'complete' || data.status === 'completed') {
        setStatus('complete', 'Complete');
        renderCompleteReport(data);
      } else if (data.status === 'failed') {
        setStatus('failed', 'Failed');
        ceoContent.innerHTML = '<div class="error-message visible">Diagnosis failed. Please try again.</div>';
      } else {
        setStatus('progress', 'In Progress');
        updatePhase(data.phase || 0, data.progress || 0);
        startSSE(consultationId);
        startPolling(consultationId);
      }
    } catch (err) {
      if (err.message.includes('404') || err.message.includes('Not Found')) {
        setStatus('failed', 'Not Found');
        ceoContent.innerHTML = '<div class="error-message visible">Report not found. The consultation ID may be invalid.</div>';
      } else {
        setStatus('failed', 'Error');
        ceoContent.innerHTML = '<div class="error-message visible">Connection lost. <a href="#" onclick="location.reload()">Retry</a></div>';
      }
    }
  }

  // ── SSE Streaming ──

  function startSSE(consultationId) {
    if (eventSource) eventSource.close();

    try {
      eventSource = new EventSource('/api/diagnosis/consult/' + consultationId + '/status');

      eventSource.onmessage = function (e) {
        try {
          const data = JSON.parse(e.data);
          handleSSEMessage(data);
        } catch (err) {
          // ignore parse errors
        }
      };

      eventSource.addEventListener('phase', function (e) {
        try {
          const data = JSON.parse(e.data);
          updatePhase(data.phase, data.progress);
          if (data.description) {
            phaseDescription.textContent = data.description;
          }
        } catch (err) { /* ignore */ }
      });

      eventSource.addEventListener('error', function () {
        eventSource.close();
        phaseDescription.textContent = 'Connection lost. Retrying...';
        setTimeout(function () {
          if (currentConsultationId) startSSE(currentConsultationId);
        }, SSE_RECONNECT_DELAY);
      });

      eventSource.addEventListener('complete', function (e) {
        try {
          const data = JSON.parse(e.data);
          stopStreaming();
          setStatus('complete', 'Complete');
          renderCompleteReport(data);
        } catch (err) { /* ignore */ }
      });
    } catch (err) {
      // SSE not supported, fall back to polling
    }
  }

  function handleSSEMessage(data) {
    if (data.phase !== undefined) {
      updatePhase(data.phase, data.progress);
    }
    if (data.status === 'complete' || data.status === 'completed') {
      stopStreaming();
      setStatus('complete', 'Complete');
      renderCompleteReport(data);
    }
    if (data.status === 'failed') {
      stopStreaming();
      setStatus('failed', 'Failed');
    }
    // Partial findings during streaming
    if (data.partialFindings && data.partialFindings.length > 0) {
      renderFindings(data.partialFindings);
    }
  }

  // ── Polling Fallback ──

  function startPolling(consultationId) {
    pollTimer = setInterval(async function () {
      try {
        const resp = await api.get('/api/diagnosis/consult/' + consultationId + '/status');
        const data = await resp.json();
        if (data.phase !== undefined) updatePhase(data.phase, data.progress);
        if (data.status === 'complete' || data.status === 'completed') {
          stopStreaming();
          setStatus('complete', 'Complete');
          renderCompleteReport(data);
        }
        if (data.status === 'failed') {
          stopStreaming();
          setStatus('failed', 'Failed');
        }
      } catch (err) { /* keep polling */ }
    }, STATUS_POLL_INTERVAL);
  }

  function stopStreaming() {
    if (eventSource) { eventSource.close(); eventSource = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Render Complete Report ──

  function renderCompleteReport(data) {
    // CEO Summary
    const summary = data.ceoSummary || data.summary || 'Diagnosis complete.';
    ceoContent.innerHTML = '<p class="ceo-text">' + escapeHtml(summary) + '</p>';

    // Metrics
    const rootCause = data.rootCause || data.rootCauses?.[0];
    const confidence = data.confidence || data.overallConfidence || 0;
    const actionCount = data.actionRecommendations ? data.actionRecommendations.length : (data.recommendations ? data.recommendations.length : 0);
    ceoMetrics.innerHTML = ''
      + '<div class="metric-card"><span class="metric-label">Root Cause</span><span class="metric-value">' + escapeHtml(rootCause?.edgeId || rootCause?.description || '—') + '</span></div>'
      + '<div class="metric-card"><span class="metric-label">Confidence</span><span class="metric-value">' + Math.round(confidence * 100) + '%</span></div>'
      + '<div class="metric-card"><span class="metric-label">Recommendations</span><span class="metric-value">' + actionCount + '</span></div>';

    // Phase 5 (complete)
    updatePhase(5, 100);

    // Findings
    if (data.keyFindings) renderFindings(data.keyFindings);
    else if (data.findings) renderFindings(data.findings);

    // Evidence Chain
    if (data.evidenceChain) renderEvidenceChain(data.evidenceChain);

    // Root Cause Tree
    if (data.rootCauseTree) renderRootCauseTree(data.rootCauseTree);

    // Recommendations
    if (data.actionRecommendations) renderRecommendations(data.actionRecommendations);
    else if (data.recommendations) renderRecommendations(data.recommendations);
  }

  // ── Render Findings ──

  function renderFindings(findings) {
    if (!findings || findings.length === 0) {
      findingsContainer.innerHTML = '<p class="empty-state">No findings recorded.</p>';
      return;
    }
    findingsContainer.innerHTML = findings.map(function (f) {
      var severity = f.severity || 'info';
      var badge = { critical: 'red', high: 'orange', warning: 'yellow', info: 'green', emergency: 'red' }[severity] || 'gray';
      return '<div class="finding-card">'
        + '<div class="finding-header">'
        + '<span class="priority-badge badge-' + badge + '">' + severity + '</span>'
        + '<strong>' + escapeHtml(f.title || 'Finding') + '</strong>'
        + '</div>'
        + '<p class="finding-desc">' + escapeHtml(f.description || '') + '</p>'
        + (f.evidence && f.evidence.length > 0 ? '<div class="evidence-refs"><small>Evidence: ' + f.evidence.join(', ') + '</small></div>' : '')
        + '</div>';
    }).join('');
  }

  // ── Render Evidence Chain ──

  function renderEvidenceChain(chain) {
    if (!chain || chain.length === 0) {
      evidenceContainer.innerHTML = '<p class="empty-state">No evidence chain available.</p>';
      return;
    }
    evidenceContainer.innerHTML = chain.map(function (e) {
      return '<div class="evidence-item">'
        + '<span class="evidence-source">' + escapeHtml(e.source || e.sourceId || '—') + '</span>'
        + '<span class="evidence-confidence">' + Math.round((e.confidence || 0) * 100) + '%</span>'
        + '<p class="evidence-content">' + escapeHtml(e.content || e.description || '') + '</p>'
        + '</div>';
    }).join('');
  }

  // ── Render Root Cause Tree ──

  function renderRootCauseTree(tree) {
    if (!tree || tree.length === 0) {
      rootCauseContainer.innerHTML = '<p class="empty-state">No root cause analysis available.</p>';
      return;
    }
    rootCauseContainer.innerHTML = '<ul class="root-cause-tree">'
      + tree.map(function (node) {
        return '<li class="rc-node">'
          + '<span class="rc-edge">' + escapeHtml(node.edgeId || node.id || '') + '</span>'
          + '<span class="rc-label">' + escapeHtml(node.label || node.description || '') + '</span>'
          + (node.children && node.children.length > 0 ? '<ul>' + node.children.map(function (c) {
            return '<li class="rc-node rc-child"><span class="rc-edge">' + escapeHtml(c.edgeId || '') + '</span><span class="rc-label">' + escapeHtml(c.label || c.description || '') + '</span></li>';
          }).join('') + '</ul>' : '')
          + '</li>';
      }).join('') + '</ul>';
  }

  // ── Render Recommendations ──

  function renderRecommendations(actions) {
    if (!actions || actions.length === 0) {
      recommendationsContainer.innerHTML = '<p class="empty-state">No recommendations available.</p>';
      return;
    }
    recommendationsContainer.innerHTML = '<table class="rec-table"><thead><tr><th>Priority</th><th>Action</th><th>Impact</th><th>Timeline</th></tr></thead><tbody>'
      + actions.map(function (a) {
        var priority = a.priority || 'medium';
        var badgeColor = { P0: 'red', P1: 'orange', P2: 'yellow', P3: 'green', high: 'red', medium: 'yellow', low: 'green' }[priority] || 'gray';
        return '<tr>'
          + '<td><span class="priority-badge badge-' + badgeColor + '">' + escapeHtml(priority) + '</span></td>'
          + '<td>' + escapeHtml(a.action || a.title || a.description || '') + '</td>'
          + '<td>' + escapeHtml(a.impact || a.expectedImpact || '—') + '</td>'
          + '<td>' + escapeHtml(a.timeline || a.deadline || '—') + '</td>'
          + '</tr>';
      }).join('') + '</tbody></table>';
  }

  // ── Fallback: Report List (no ?id) ──

  async function showReportList() {
    setStatus('info', 'Select Report');
    ceoContent.innerHTML = '<p class="ceo-text">Select a report to view.</p>';
    ceoMetrics.innerHTML = '';

    try {
      const resp = await api.get('/api/sentinel/reports');
      const data = await resp.json();
      var reports = data.reports || data || [];

      if (reports.length === 0) {
        findingsContainer.innerHTML = '<p class="empty-state">No reports available. Run a diagnosis first.</p><a href="/app/dashboard.html" class="btn-primary" style="width:auto;padding:10px 24px;margin-top:16px;">Go to Dashboard</a>';
        return;
      }

      findingsContainer.innerHTML = '<h3>Available Reports</h3><div class="report-list">'
        + reports.map(function (r) {
          var reportId = r.id || r.reportId || r.consultationId || '';
          return '<a href="/app/report.html?id=' + reportId + '" class="report-list-item">'
            + '<strong>' + escapeHtml(r.title || r.name || 'Report ' + reportId) + '</strong>'
            + '<span class="report-date">' + (r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '') + '</span>'
            + '</a>';
        }).join('') + '</div>';

      evidenceContainer.innerHTML = '';
      rootCauseContainer.innerHTML = '';
      recommendationsContainer.innerHTML = '';
    } catch (err) {
      findingsContainer.innerHTML = '<p class="empty-state">Unable to load reports. <a href="#" onclick="location.reload()">Retry</a></p>';
    }
  }

  // ── Utilities ──

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Start ──

  document.addEventListener('DOMContentLoaded', init);
})();
