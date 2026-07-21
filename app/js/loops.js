/**
 * app/js/loops.js — 循环状态可视化逻辑 (D20)
 *
 * 获取 GET /api/loops/status 数据 → 渲染 6 张循环状态卡片
 * 自动刷新 30s + 手动刷新按钮
 */

let refreshTimer = null;

/** 加载循环状态数据 */
function loadLoopStatus() {
  const container = document.getElementById('loops-container');
  const errorContainer = document.getElementById('error-container');

  fetch('/api/loops/status')
    .then(r => r.json())
    .then(data => {
      errorContainer.style.display = 'none';

      if (!data.ok || !data.loops) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#888;">无法获取循环状态</div>';
        return;
      }

      if (data.loops.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:#888;">暂无可用的循环</div>';
        return;
      }

      container.innerHTML = data.loops.map(renderLoopCard).join('');
    })
    .catch(() => {
      errorContainer.style.display = 'block';
      errorContainer.innerHTML = '<div class="error-banner">⚠️ 监控暂停 — 无法连接到服务器' +
        '<br><button onclick="loadLoopStatus()" style="padding:6px 14px;background:#c62828;color:#fff;border:none;border-radius:4px;cursor:pointer;margin-top:8px;">重试</button></div>';
      container.innerHTML = '';
    });
}

/** 渲染单张循环卡片 */
function renderLoopCard(loop) {
  const statusClass = 'status-' + (loop.status || 'pending');
  const statusLabel = { pending: '待命', running: '运行中', completed: '已完成', failed: '失败' }[loop.status] || '待命';

  const lastExe = loop.lastExecution;
  let lastRunText = '尚未执行';
  if (lastExe) {
    const ago = lastExe.lastRunAgoSeconds;
    if (ago < 60) lastRunText = '刚刚';
    else if (ago < 3600) lastRunText = Math.floor(ago / 60) + ' 分钟前';
    else if (ago < 86400) lastRunText = Math.floor(ago / 3600) + ' 小时前';
    else lastRunText = Math.floor(ago / 86400) + ' 天前';
    lastRunText += '，耗时 ' + (lastExe.durationMs / 1000).toFixed(1) + 's';
  }

  const scaleDots = (loop.scales || []).map(s => {
    const dotClass = 'dot-' + (s.status || 'pending');
    const typeLabels = { cron: '⏱', event: '⚡', hybrid: '🔄' };
    return '<span class="scale-dot"><span class="dot ' + dotClass + '"></span> ' +
      (typeLabels[s.triggerType] || '') + ' ' + s.name + '</span>';
  }).join('');

  const triggerTypes = [...new Set((loop.scales || []).map(s => s.triggerType))].join('/');

  return '<div class="loop-card">' +
    '<div class="loop-card-header">' +
      '<span class="loop-card-title">' + escapeHtml(loop.loopName) + '</span>' +
      '<span class="status-badge ' + statusClass + '">' + statusLabel + '</span>' +
    '</div>' +
    '<dl class="loop-meta">' +
      '<dt>上次执行</dt><dd>' + lastRunText + '</dd>' +
      '<dt>执行次数</dt><dd>' + (loop.executionCount || 0) + '</dd>' +
      '<dt>触发方式</dt><dd>' + triggerTypes + '</dd>' +
    '</dl>' +
    '<div class="scale-indicators">' + scaleDots + '</div>' +
  '</div>';
}

/** 自动刷新 */
function startAutoRefresh(intervalMs) {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(loadLoopStatus, intervalMs);
  const statusEl = document.getElementById('refresh-status');
  if (statusEl) statusEl.textContent = '每 ' + (intervalMs / 1000) + 's 自动刷新';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
