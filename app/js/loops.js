/**
 * app/js/loops.js — 循环状态可视化逻辑 (D20 v2 — 修复版)
 *
 * 从 GET /api/loops/status 获取数据 → 渲染 6 张循环状态卡片
 * 使用 api-client.js 获取数据（带 JWT + 重试）
 * 客户端计算时间差（避免服务端 stale 数据）
 */

(function () {
  'use strict';

  let refreshTimer = null;

  function loadLoopStatus() {
    const container = document.getElementById('loops-container');
    const errorContainer = document.getElementById('error-container');

    api.get('/api/loops/status')
      .then(function (r) { return r.json(); })
      .then(function (data) {
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
      })
      .catch(function () {
        errorContainer.style.display = 'block';
        errorContainer.innerHTML = '<div class="error-message visible">⚠️ Monitoring paused — cannot connect to server<br><button onclick="loadLoopStatus()" class="btn-secondary" style="margin-top:8px;">Retry</button></div>';
        container.innerHTML = '';
      });
  }

  function computeTimeAgo(isoString) {
    if (!isoString) return null;
    const diff = Date.now() - new Date(isoString).getTime();
    if (diff < 0) return 'just now';
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + ' min ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + ' hr ago';
    return Math.floor(diff / 86400000) + ' days ago';
  }

  function renderLoopCard(loop) {
    const statusClass = 'status-' + (loop.status || 'pending');
    const statusLabels = { pending: 'Pending', running: 'Running', completed: 'Completed', failed: 'Failed' };
    const statusLabel = statusLabels[loop.status] || 'Pending';

    const lastExe = loop.lastExecution;
    let lastRunText = 'Not yet executed';
    if (lastExe) {
      const ago = computeTimeAgo(lastExe.startedAt);
      lastRunText = ago + ', took ' + (lastExe.durationMs / 1000).toFixed(1) + 's';
    }

    const triggerTypes = [...new Set((loop.scales || []).map(function (s) { return s.triggerType; }))].join('/');

    const scaleDots = (loop.scales || []).map(function (s) {
      const dotClass = 'dot-' + (s.status || 'pending');
      const typeIcons = { cron: '⏱', event: '⚡', hybrid: '🔄' };
      return '<span class="scale-dot"><span class="dot ' + dotClass + '"></span> '
        + (typeIcons[s.triggerType] || '') + ' ' + escapeHtml(s.name)
        + (s.nextAt ? '<br><small>next: ' + computeTimeAgo(s.nextAt) + '</small>' : '')
        + '</span>';
    }).join('');

    return '<div class="loop-card">'
      + '<div class="loop-card-header">'
        + '<span class="loop-card-title">' + escapeHtml(loop.loopName) + '</span>'
        + '<span class="loop-status-badge ' + statusClass + '">' + statusLabel + '</span>'
      + '</div>'
      + '<dl class="loop-meta">'
        + '<dt>Last Run</dt><dd>' + lastRunText + '</dd>'
        + '<dt>Executions</dt><dd>' + (loop.executionCount || 0) + '</dd>'
        + '<dt>Trigger</dt><dd>' + triggerTypes + '</dd>'
      + '</dl>'
      + '<div class="scale-indicators">' + scaleDots + '</div>'
    + '</div>';
  }

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
