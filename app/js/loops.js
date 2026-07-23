/**
 * app/js/loops.js — Loop 状态展示页 (D20 v2)
 *
 * 显示 6 循环状态卡片 + 执行历史时间线 + 手动触发
 * 使用 api-client.js (D96) 获取数据
 */

(function () {
  'use strict';

  var refreshTimer = null;

  // ── 加载循环状态 ──

  function loadLoopStatus() {
    var container = document.getElementById('loops-container');
    var errorContainer = document.getElementById('error-container');

    api.get('/api/loops/status').then(function (r) { return r.json(); }).then(function (data) {
      errorContainer.style.display = 'none';
      if (!data.ok || !data.loops) {
        container.innerHTML = '<div class="empty-state">Unable to load loop status.</div>';
        return;
      }
      if (data.loops.length === 0) {
        container.innerHTML = '<div class="empty-state">No loops registered.</div>';
        return;
      }
      container.innerHTML = data.loops.map(renderLoopCard).join('');
      loadHistory(data.loops);
    }).catch(function () {
      errorContainer.style.display = 'block';
      errorContainer.innerHTML = '<div class="error-message visible">⚠ Service unavailable — <button onclick="loadLoopStatus()" class="btn-secondary" style="margin-top:8px;">Retry</button></div>';
      container.innerHTML = '';
    });
  }

  // ── 渲染单张循环卡片 ──

  function renderLoopCard(loop) {
    var statusClass = 'status-' + (loop.status || 'pending');
    var statusLabels = { pending: 'Pending', running: 'Running', completed: 'Completed', failed: 'Failed' };
    var statusLabel = statusLabels[loop.status] || 'Pending';

    var lastExe = loop.lastExecution;
    var lastRunText = 'Not yet executed';
    if (lastExe) {
      var ago = computeTimeAgo(lastExe.startedAt);
      lastRunText = ago + ', took ' + (lastExe.durationMs / 1000).toFixed(1) + 's';
    }

    var triggerTypes = [...new Set((loop.scales || []).map(function (s) { return s.triggerType; }))].join('/');

    var scaleDots = (loop.scales || []).map(function (s) {
      var typeIcons = { cron: '⏱', event: '⚡', hybrid: '🔄' };
      return '<span class="scale-dot"><span class="dot dot-pending"></span> ' + (typeIcons[s.triggerType] || '') + ' ' + escapeHtml(s.name)
        + (s.nextAt ? '<br><small>next: ' + computeTimeAgo(s.nextAt) + '</small>' : '') + '</span>';
    }).join('');

    return '<div class="loop-card" id="loop-card-' + loop.loopId + '">'
      + '<div class="loop-card-header">'
        + '<span class="loop-card-title">' + escapeHtml(loop.loopName) + '</span>'
        + '<span class="loop-status-badge ' + statusClass + '" id="badge-' + loop.loopId + '">' + statusLabel + '</span>'
      + '</div>'
      + '<dl class="loop-meta">'
        + '<dt>Last Run</dt><dd id="lastrun-' + loop.loopId + '">' + lastRunText + '</dd>'
        + '<dt>Executions</dt><dd>' + (loop.executionCount || 0) + '</dd>'
        + '<dt>Trigger</dt><dd>' + triggerTypes + '</dd>'
      + '</dl>'
      + '<div class="scale-indicators">' + scaleDots + '</div>'
      + '<button class="btn-execute" onclick="window.executeLoop(\'' + loop.loopId + '\')" id="exec-btn-' + loop.loopId + '">Execute</button>'
    + '</div>';
  }

  // ── 手动触发循环 ──

  window.executeLoop = function (loopId) {
    var badge = document.getElementById('badge-' + loopId);
    var btn = document.getElementById('exec-btn-' + loopId);
    if (badge) { badge.textContent = 'Running'; badge.className = 'loop-status-badge status-running'; }
    if (btn) btn.disabled = true;

    api.post('/api/loops/' + loopId + '/execute', {}).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) {
        if (badge) { badge.textContent = 'Completed'; badge.className = 'loop-status-badge status-completed'; }
      } else {
        if (badge) { badge.textContent = 'Failed'; badge.className = 'loop-status-badge status-failed'; }
      }
      if (btn) btn.disabled = false;
      setTimeout(loadLoopStatus, 1000);
    }).catch(function () {
      if (badge) { badge.textContent = 'Failed'; badge.className = 'loop-status-badge status-failed'; }
      if (btn) btn.disabled = false;
    });
  };

  // ── 时间计算（客户端） ──

  function computeTimeAgo(isoString) {
    if (!isoString) return null;
    var diff = Date.now() - new Date(isoString).getTime();
    if (diff < 0) return 'just now';
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' hr ago';
    return Math.floor(diff / 86400000) + ' days ago';
  }

  // ── 执行历史时间线 ──

  function loadHistory(loops) {
    var container = document.getElementById('history-list');
    var allEntries = [];

    // 从每个循环收集历史
    var pending = loops.length;
    if (pending === 0) { container.innerHTML = '<div class="empty-state">No execution history.</div>'; return; }

    loops.forEach(function (loop) {
      api.get('/api/loops/' + loop.loopId + '/history').then(function (r) { return r.json(); }).then(function (data) {
        if (data.history) {
          data.history.forEach(function (h) {
            allEntries.push({ loopId: loop.loopId, loopName: loop.loopName, execution: h });
          });
        }
        pending--;
        if (pending === 0) renderHistory(allEntries);
      }).catch(function () {
        pending--;
        if (pending === 0) renderHistory(allEntries);
      });
    });
  }

  function renderHistory(entries) {
    var container = document.getElementById('history-list');
    if (entries.length === 0) {
      container.innerHTML = '<div class="empty-state">No execution history yet.</div>';
      return;
    }
    entries.sort(function (a, b) { return new Date(b.execution.startedAt) - new Date(a.execution.startedAt); });
    var top10 = entries.slice(0, 10);

    container.innerHTML = top10.map(function (e) {
      var statusClass = 'hist-status-' + (e.execution.status || 'pending');
      var statusLabels = { pending: 'Pending', running: 'Running', completed: 'Completed', failed: 'Failed' };
      return '<div class="history-entry">'
        + '<div class="history-timeline-dot ' + statusClass + '"></div>'
        + '<div class="history-content">'
          + '<div class="history-header"><strong>' + escapeHtml(e.loopName) + '</strong> <span class="history-status ' + statusClass + '">' + (statusLabels[e.execution.status] || 'Pending') + '</span></div>'
          + '<div class="history-meta">' + computeTimeAgo(e.execution.startedAt) + ' | took ' + (e.execution.durationMs / 1000).toFixed(1) + 's</div>'
        + '</div>'
      + '</div>';
    }).join('');
  }

  // ── 自动刷新 ──

  function startAutoRefresh(intervalMs) {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(loadLoopStatus, intervalMs);
    var el = document.getElementById('refresh-status');
    if (el) el.textContent = 'Auto-refresh every ' + (intervalMs / 1000) + 's';
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Init ──
  document.addEventListener('DOMContentLoaded', function () {
    loadLoopStatus();
    startAutoRefresh(30000);
  });
})();
