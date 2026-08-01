/**
 * routes/ga-evolution.ts — GA 增长顾问进化引擎管理面板 (L1)
 *
 * 提供 Web 界面管理 L0 进化引擎提案。
 * 所有数据通过 fetch() 调用已有 API 端点获取。
 * 零外部依赖。匹配 GET /chat 的内嵌 HTML 模式。
 *
 * 端点: GET /ga/evolution → HTML 页面
 *
 * 铁律 39: L1 通过 API 调用 L0，不直接 import L0。
 */

import { Router, type Request, type Response } from 'express';
import { createLogger } from '@synova/logger';

const log = createLogger('routes/ga-evolution');
const router = Router();

router.get('/ga/evolution', (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Synova · 进化引擎 · GA 管理</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🔍</text></svg>">
<style>
:root{
  --bg:#0f0f14;--panel:#1a1a24;--border:#2a2a3a;--text:#e0e0e0;--dim:#888;
  --accent:#6c5ce7;--accent2:#a29bfe;--red:#e74c3c;--green:#2ecc71;
  --orange:#f39c12;--cyan:#4ecdc4;--input:#12121a
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
a{color:var(--accent2);text-decoration:none}
/* ── Header ── */
header{background:var(--panel);border-bottom:1px solid var(--border);padding:12px 24px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;position:sticky;top:0;z-index:10}
header h1{font-size:16px;font-weight:600;display:flex;align-items:center;gap:8px}
header .sub{font-size:11px;color:var(--dim);margin-left:8px}
.btn{background:var(--accent);color:#fff;border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px;font-weight:500}
.btn:hover{opacity:.85}
.btn-sm{padding:4px 10px;font-size:11px}
.btn-green{background:var(--green)}
.btn-red{background:var(--red)}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}
.btn:disabled{opacity:.4;cursor:not-allowed}
/* ── Metrics ── */
.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding:20px 24px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px}
.card .num{font-size:28px;font-weight:700;margin:4px 0}
.card .label{font-size:11px;color:var(--dim)}
.card .num.green{color:var(--green)}
.card .num.orange{color:var(--orange)}
.card .num.red{color:var(--red)}
.card .num.cyan{color:var(--cyan)}
/* ── Section ── */
.section{padding:0 24px 20px}
.section h2{font-size:14px;font-weight:600;margin-bottom:10px;display:flex;align-items:center;gap:8px}
.section h2 .count{background:var(--accent);color:#fff;font-size:11px;padding:1px 8px;border-radius:10px}
/* ── Proposals ── */
.proposal{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:8px}
.proposal .head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.proposal .title{font-size:13px;font-weight:600}
.proposal .meta{font-size:11px;color:var(--dim);margin-top:4px;display:flex;gap:12px;flex-wrap:wrap}
.proposal .actions{display:flex;gap:6px;margin-top:10px;flex-shrink:0}
.proposal .evidence{font-size:11px;color:var(--dim);background:var(--input);border-radius:4px;padding:8px;margin-top:8px;line-height:1.5}
.tag{display:inline-block;font-size:10px;padding:1px 6px;border-radius:3px;font-weight:600}
.tag.pending{background:#2a1a0a;color:var(--orange)}
.tag.approved{background:#0a2a0a;color:var(--green)}
.tag.rejected{background:#2a0a0a;color:var(--red)}
.tag.applied{background:#0a1a2a;color:var(--cyan)}
/* ── Table ── */
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{text-align:left;padding:8px 12px;border-bottom:1px solid var(--border)}
th{color:var(--dim);font-weight:500;font-size:11px}
tr:hover td{background:rgba(108,92,231,.05)}
/* ── Aggregate Panel ── */
.agg-panel{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.agg-panel select{background:var(--input);color:var(--text);border:1px solid var(--border);border-radius:4px;padding:6px 10px;font-size:12px}
.agg-panel .result{font-size:12px;color:var(--dim);margin-left:8px}
/* ── Log ── */
.log-list{background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:8px;max-height:200px;overflow-y:auto;font-size:11px}
.log-entry{padding:4px 8px;border-bottom:1px solid var(--border);display:flex;gap:8px;align-items:flex-start}
.log-entry:last-child{border-bottom:none}
.log-entry .time{color:var(--dim);white-space:nowrap;font-family:monospace;font-size:10px}
.log-entry .msg{color:var(--text)}
.log-entry .type{font-size:10px;padding:0 5px;border-radius:3px;font-weight:600}
/* ── Admin Nav ── */
.admin-nav{display:flex;gap:4px;align-items:center}
.admin-nav a{font-size:12px;padding:4px 10px;border-radius:4px;color:var(--dim)}
.admin-nav a:hover{background:var(--border);color:var(--text)}
.admin-nav a.active{background:var(--accent);color:#fff}
/* ── Status ── */
.status-dot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:4px}
.status-dot.on{background:var(--green)}
.status-dot.off{background:var(--red)}
/* ── Utility ── */
.flex{display:flex;align-items:center;gap:8px}
.mt-8{margin-top:8px}
.mb-8{margin-bottom:8px}
.text-dim{color:var(--dim)}
.text-sm{font-size:11px}
/* ── Toast ── */
#toast{position:fixed;bottom:20px;right:20px;background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:10px 16px;font-size:12px;z-index:100;opacity:0;transition:opacity .3s;pointer-events:none}
#toast.show{opacity:1}
</style>
</head>
<body>

<header>
  <div class="flex">
    <h1>🔬 Synova <span class="sub">进化引擎 · GA 管理</span></h1>
    <span id="status-indicator"><span class="status-dot" id="status-dot"></span><span id="status-text" class="text-sm text-dim">连接中...</span></span>
  </div>
  <div class="admin-nav">
    <a href="/ga/evolution" class="active">进化</a>
    <a href="/chat">诊断</a>
    <a href="javascript:location.reload()">⟳</a>
  </div>
</header>

<div class="metrics" id="metrics">
  <div class="card"><div class="label">纠错处理</div><div class="num cyan" id="m-corrections">—</div></div>
  <div class="card"><div class="label">阈值调整</div><div class="num cyan" id="m-thresholds">—</div></div>
  <div class="card"><div class="label">待审批提案</div><div class="num orange" id="m-pending">—</div></div>
  <div class="card"><div class="label">错误数</div><div class="num red" id="m-errors">—</div></div>
</div>

<div class="section">
  <h2 id="pending-title">⏳ 待审批提案 <span class="count" id="pending-count">0</span></h2>
  <div id="pending-list"><p class="text-dim text-sm">加载中...</p></div>
</div>

<div class="section">
  <h2>📋 手动聚合</h2>
  <div class="agg-panel">
    <span class="text-sm">触发行业阈值重新聚合：</span>
    <select id="industry-select">
      <option value="general-enterprise">通用企业</option>
      <option value="saas-tech" selected>SaaS 科技</option>
      <option value="manufacturing">制造业</option>
      <option value="financial-services">金融服务</option>
    </select>
    <button class="btn" onclick="triggerAggregation()" id="agg-btn">开始聚合</button>
    <span id="agg-result" class="result"></span>
  </div>
</div>

<div class="section">
  <h2>📜 全部提案</h2>
  <div id="all-proposals"><p class="text-dim text-sm">加载中...</p></div>
</div>

<div class="section">
  <h2>🕐 最近操作</h2>
  <div class="log-list" id="log-list"><p class="text-dim text-sm">加载中...</p></div>
</div>

<div id="toast"></div>

<script>
const API = {
  proposals: '/api/evolution/proposals',
  status: '/api/evolution/status',
  approve: (id) => '/api/evolution/proposals/' + id + '/approve',
  reject: (id) => '/api/evolution/proposals/' + id + '/reject',
  aggregate: (ind) => '/api/evolution/aggregate/' + ind,
};

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  return r.json();
}

function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = type === 'error' ? 'var(--red)' : 'var(--green)';
  t.style.borderColor = type === 'error' ? 'var(--red)' : 'var(--green)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

function statusTag(s) {
  const map = { pending:'待审批', approved:'已审批', rejected:'已拒绝', applied:'已应用' };
  return '<span class="tag ' + s + '">' + (map[s] || s) + '</span>';
}

const LAYER_NAMES = {
  'F1_KZ':'KZ指数','F2_runway':'现金流跑道','F3_revenue_quality':'收入质量','F4_profit_quality':'利润质量','F5_cash_conversion':'现金转换',
  'O1_info_distortion':'信息失真','O2_explore_exploit':'探索-利用','O3_talent_density':'人才密度','T1_software_health':'软件健康','T2_connector_coverage':'连接器覆盖率',
};

function sentinelName(sid) { return LAYER_NAMES[sid] || sid; }

// ═══ 加载指标 ═══
async function loadMetrics() {
  try {
    const data = await fetchJSON(API.status);
    const c = data.counters || {};
    document.getElementById('m-corrections').textContent = c.correctionsProcessed || 0;
    document.getElementById('m-thresholds').textContent = c.thresholdsAdjusted || 0;
    document.getElementById('m-errors').textContent = c.errors || 0;

    const dot = document.getElementById('status-dot');
    dot.className = 'status-dot ' + (data.degraded ? 'off' : 'on');
    document.getElementById('status-text').textContent = data.degraded ? '降级' : '运行中';
  } catch(e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, "GA 演化接口请求");
    document.getElementById('status-text').textContent = '离线';
    document.getElementById('status-dot').className = 'status-dot off';
  }
}

// ═══ 加载提案 ═══
async function loadProposals() {
  try {
    const all = await fetchJSON(API.proposals);
    const pending = all.proposals ? all.proposals.filter(p => p.status === 'pending') : [];

    document.getElementById('pending-count').textContent = pending.length;
    document.getElementById('m-pending').textContent = pending.length;

    renderPending(pending);
    renderAll(all.proposals || []);
  } catch(e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, "GA 演化接口请求");
    document.getElementById('pending-list').innerHTML = '<p class="text-dim text-sm">加载失败</p>';
  }
}

function renderPending(proposals) {
  const el = document.getElementById('pending-list');
  if (proposals.length === 0) {
    el.innerHTML = '<p class="text-dim text-sm">✅ 无待审批提案</p>';
    return;
  }
  el.innerHTML = proposals.map(p => renderProposalCard(p, true)).join('');
}

function renderProposalCard(p, showActions) {
  const changes = (p.changes || []).map(c =>
    '<div class="text-sm">' + sentinelName(c.sentinelId) + ' (' + c.sentinelId + '): ' +
    '<span style="color:var(--red)">' + c.from?.critical + '</span> → ' +
    '<span style="color:var(--green)">' + c.to?.critical + '</span></div>'
  ).join('');

  return '<div class="proposal" id="prop-' + p.id + '">' +
    '<div class="head">' +
      '<div>' +
        '<div class="title">' + esc(p.title) + '</div>' +
        '<div class="meta">' +
          statusTag(p.status) +
          '<span>' + esc(p.industry || '—') + '</span>' +
          '<span>' + (p.changes?.length || 0) + ' 个变更</span>' +
          '<span>' + (p.impactEstimate?.sentinelIds?.length || 0) + ' 个哨兵</span>' +
          '<span>' + (p.risk || '—') + ' 风险</span>' +
          '<span>' + (p.createdAt || '').slice(0,10) + '</span>' +
        '</div>' +
      '</div>' +
      (showActions ? '<div class="actions">' +
        '<button class="btn btn-green btn-sm" onclick="approve(\'' + p.id + '\')">✅ 批准</button>' +
        '<button class="btn btn-red btn-sm" onclick="rejectProp(\'' + p.id + '\')">❌ 拒绝</button>' +
      '</div>' : '') +
    '</div>' +
    (p.evidence ? '<div class="evidence">' + esc(p.evidence) + '</div>' : '') +
    (changes ? '<div class="mt-8">' + changes + '</div>' : '') +
  '</div>';
}

function renderAll(proposals) {
  const el = document.getElementById('all-proposals');
  if (proposals.length === 0) {
    el.innerHTML = '<p class="text-dim text-sm">无提案</p>';
    return;
  }
  el.innerHTML = proposals.slice(0, 20).map(p =>
    '<div class="proposal">' +
      '<div class="head">' +
        '<div>' +
          '<div class="title">' + esc(p.title) + ' ' + statusTag(p.status) + '</div>' +
          '<div class="meta">' +
            '<span>' + esc(p.industry || '—') + '</span>' +
            '<span>' + (p.changes?.length || 0) + ' 个变更</span>' +
            '<span>' + (p.createdAt || '').slice(0,10) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  ).join('');
  if (proposals.length > 20) el.innerHTML += '<p class="text-dim text-sm mt-8">仅显示最近 20 条</p>';
}

// ═══ 操作 ═══
async function approve(id) {
  try {
    const r = await fetchJSON(API.approve(id), { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    if (r.ok) { showToast('✅ 提案已批准'); loadProposals(); loadMetrics(); }
    else showToast('❌ ' + (r.error || '审批失败'), 'error');
  } catch(e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, "GA 演化接口请求");
    showToast('❌ 网络错误', 'error');
  }
}

async function rejectProp(id) {
  try {
    const r = await fetchJSON(API.reject(id), { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    if (r.ok) { showToast('提案已拒绝'); loadProposals(); loadMetrics(); }
    else showToast('❌ ' + (r.error || '拒绝失败'), 'error');
  } catch(e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, "GA 演化接口请求");
    showToast('❌ 网络错误', 'error');
  }
}

async function triggerAggregation() {
  const ind = document.getElementById('industry-select').value;
  const btn = document.getElementById('agg-btn');
  const result = document.getElementById('agg-result');
  btn.disabled = true;
  result.textContent = '聚合中...';
  try {
    const r = await fetchJSON(API.aggregate(ind), { method:'POST' });
    if (r.ok) {
      if (r.proposal) {
        result.innerHTML = '✅ 完成 — 已生成 <a href="javascript:loadProposals()">新提案</a>';
        loadProposals();
      } else {
        result.textContent = '✅ 完成 — 无阈值偏离';
      }
    } else {
      result.textContent = '❌ ' + (r.error || '聚合失败');
    }
  } catch(e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, "GA 演化接口请求");
    result.textContent = '❌ 网络错误';
  }
  btn.disabled = false;
}

// ═══ 操作日志 ═══
async function loadLog() {
  try {
    const data = await fetchJSON(API.status);
    const logs = data.recentLogs || [];
    const el = document.getElementById('log-list');
    if (logs.length === 0) {
      el.innerHTML = '<p class="text-dim text-sm">暂无操作记录</p>';
      return;
    }
    const TYPE_LABEL = {
      correction:'纠错', threshold_adjust:'阈值调整', proposal_create:'提案创建',
      proposal_approve:'审批通过', proposal_reject:'拒绝', error:'错误',
      cooling_skip:'冷却跳过', bound_protect:'边界保护'
    };
    el.innerHTML = logs.slice(0, 30).map(l =>
      '<div class="log-entry">' +
        '<span class="type" style="background:' + (l.type === 'error' ? 'var(--red)' : 'var(--accent)') + ';color:#fff">' +
          (TYPE_LABEL[l.type] || l.type) +
        '</span>' +
        '<span class="time">' + (l.timestamp || '').slice(11,19) + '</span>' +
        '<span class="msg">' + esc(l.detail) + '</span>' +
      '</div>'
    ).join('');
  } catch(e) {
    log.warn({ err: e instanceof Error ? e.message : String(e) }, "GA 演化接口请求");
    document.getElementById('log-list').innerHTML = '<p class="text-dim text-sm">获取日志失败</p>';
  }
}

// ═══ 定时刷新 ═══
loadMetrics();
loadProposals();
loadLog();
setInterval(loadMetrics, 30000);
setInterval(loadLog, 30000);
</script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

export default router;
