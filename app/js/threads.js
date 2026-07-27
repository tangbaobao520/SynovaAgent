/**
 * app/js/threads.js — 线程列表管理 (D251)
 *
 * 三面板布局: 左栏线程列表 + 主对话区 + 右子Agent面板
 * API: GET/POST /api/sessions, PATCH /api/sessions/:id/title
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var selectedThreadId = null;

  // ── Format date for display ──

  function formatDate(isoStr) {
    if (!isoStr) return '未知';
    var d = new Date(isoStr);
    var pad = function (n) { return n < 10 ? '0' + n : n; };
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
      + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ── Load thread list ──

  function loadThreads() {
    var container = $('thread-list');
    api.get('/api/sessions').then(function (r) { return r.json(); }).then(function (data) {
      if (!data.ok || !data.sessions) {
        container.innerHTML = '<p class="empty-state">无法加载会话列表。</p>'; return;
      }
      if (data.sessions.length === 0) {
        container.innerHTML = '<p class="empty-state" style="padding:16px;text-align:center">暂无会话，点击「+」新建</p>'; return;
      }
      container.innerHTML = data.sessions.map(function (s) {
        var displayName = s.title || '诊断 ' + formatDate(s.createdAt);
        var isActive = s.id === selectedThreadId ? ' thread-item-active' : '';
        return '<div class="thread-item' + isActive + '" data-id="' + escapeHtml(s.id) + '" onclick="window.selectThread(\'' + escapeHtml(s.id) + '\')" ondblclick="window.promptRename(\'' + escapeHtml(s.id) + '\')">'
          + '<span class="thread-name">' + escapeHtml(displayName) + '</span>'
          + '<span class="thread-date">' + formatDate(s.createdAt) + '</span>'
          + '</div>';
      }).join('');
    }).catch(function () {
      container.innerHTML = '<div class="error-message visible">加载失败。</div>';
    });
  }

  // ── Select a thread ──

  window.selectThread = function (id) {
    selectedThreadId = id;
    // Update active state
    var items = document.querySelectorAll('.thread-item');
    for (var i = 0; i < items.length; i++) {
      items[i].classList.remove('thread-item-active');
    }
    var el = document.querySelector('.thread-item[data-id="' + id + '"]');
    if (el) el.classList.add('thread-item-active');
    // Load into main area
    var main = $('main-content');
    main.innerHTML = '<div class="welcome-placeholder"><h2>会话 ' + escapeHtml(id.slice(0, 8)) + '...</h2><p>对话内容将在后续版本中加载。</p></div>';
  };

  // ── Rename a thread (double-click) ──

  window.promptRename = function (id) {
    var newTitle = prompt('请输入新的会话名称:');
    if (!newTitle || !newTitle.trim()) return;
    api.patch('/api/sessions/' + id + '/title', { title: newTitle.trim() }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok) {
        showToast('已重命名', 'success');
        loadThreads();
      } else {
        showToast(data.error || '重命名失败', 'error');
      }
    }).catch(function () { showToast('重命名失败', 'error'); });
  };

  // ── Create a new thread ──

  $('btn-new-thread').addEventListener('click', function () {
    api.post('/api/sessions', { orgId: 'default' }).then(function (r) { return r.json(); }).then(function (data) {
      if (data.ok && data.session) {
        showToast('已创建新会话', 'success');
        loadThreads();
        window.selectThread(data.session.id);
      } else {
        showToast(data.error || '创建失败', 'error');
      }
    }).catch(function () { showToast('创建失败', 'error'); });
  });

  // ── Init ──

  document.addEventListener('DOMContentLoaded', function () {
    loadThreads();
  });
})();
