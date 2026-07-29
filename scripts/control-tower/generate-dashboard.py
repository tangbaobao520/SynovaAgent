#!/usr/bin/env python3
"""
generate-dashboard.py — 创始人全局仪表盘 (D220)

权威文档 #17 第七章 Ch7.
双模式: 静态 HTML 生成 + --serve HTTP 服务实时刷新。
互补 D213 control-tower.html（快速健康检查 vs 深度项目视图）。

用法:
  python generate-dashboard.py                    # 生成静态 HTML
  python generate-dashboard.py --serve            # 本地 HTTP 服务 :8899
  python generate-dashboard.py --output out.html  # 指定输出路径
  python generate-dashboard.py --help

契约:
  @input  — .codex/signals/ + DASHBOARD.md + docs/plans/ + .codex/task-briefs/
  @output — 自包含 HTML 文件 或 HTTP 服务
  @degraded — 信号缺失 -> 诚实标注"信号文件不存在"
"""
import argparse
import datetime
import http.server
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Dict, Optional, Any

PROJECT_ROOT = Path(__file__).parent.parent.parent

# D261: views module imports (fallback)
_HAS_VIEWS = False
try:
    from views.pm_dashboard import render_pm
    from views.completion import render_completion
    _HAS_VIEWS = True
except ImportError:
    pass


# ═══════════════════════════════════════════════════════════════════════════════
#  数据采集
# ═══════════════════════════════════════════════════════════════════════════════

def scan_auth_docs() -> List[Dict[str, str]]:
    """扫描 15 份权威文档完成状态"""
    docs_dir = PROJECT_ROOT / "docs/synova/research"
    docs = []
    if docs_dir.exists():
        for item in sorted(docs_dir.iterdir()):
            if not item.is_dir():
                continue
            name = item.stem
            md_files = [p for p in item.rglob("*.md")]
            has_content = len(md_files) > 0
            docs.append({"name": name, "exists": True, "has_content": has_content})
    return docs


def derive_rdc_pipeline() -> List[Dict[str, str]]:
    """从 task briefs + dev docs + git log 推导 R/D/C 流水线"""
    briefs_dir = PROJECT_ROOT / ".claude/task-briefs"
    dev_docs_dir = PROJECT_ROOT / "docs/plans/codex/implementation"
    items = []

    # 读取 git log 获取最近提交
    git_log = ""
    try:
        r = subprocess.run(["git", "log", "--oneline", "-30"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=PROJECT_ROOT, timeout=10)
        git_log = r.stdout
    except:  # noqa
        git_log = ""

    if dev_docs_dir.exists():
        for f in sorted(dev_docs_dir.iterdir()):
            if f.suffix == ".md":
                name = f.stem
                has_brief = False
                if briefs_dir.exists():
                    has_brief = False
                d_task = re.findall(r"D\d+", name)
                for _b in briefs_dir.iterdir():
                    b_task = re.findall(r"D\d+", str(_b))
                    if d_task and b_task and d_task[-1] == b_task[-1]:
                        has_brief = True
                        break
                
                d_match = re.findall(r"D\d+", name)
                d_id = d_match[-1] if d_match else ""
                committed = d_id in (git_log or "") if d_id else False
                items.append({"name": name, "has_dev_doc": True, "has_brief": has_brief, "committed": committed})
    return items


def read_component_signals() -> Dict[str, Any]:
    """读取 6 组件信号"""
    signals = {}
    signals_dir = PROJECT_ROOT / ".codex/signals"
    components = [
        "context-injector", "gatekeeper", "external-auditor",
        "contract-archiver", "write-lock", "env-validator",
    ]
    # 优先从 signals 目录读（D214 格式），降级读原始路径
    for comp in components:
        signal = {"component": comp, "status": "unknown", "reason": "Signal file not found", "p0": 0, "p1": 0, "p2": 0}
        # 尝试 JSON 格式
        json_path = signals_dir / f"{comp}.json"
        if json_path.exists():
            try:
                d = json.loads(json_path.read_text(encoding="utf-8"))
                signal.update({"status": d.get("status", "unknown"), "reason": d.get("reason", ""),
                               "p0": d.get("p0_count", 0), "p1": d.get("p1_count", 0), "p2": d.get("p2_count", 0)})
                signals[comp] = signal
                continue
            except:  # noqa
                pass
        # 降级: gatekeeper 管道格式
        if comp == "gatekeeper":
            pipe_path = PROJECT_ROOT / ".codex/settings/gatekeeper/.dashboard-signal"
            if pipe_path.exists():
                try:
                    text = pipe_path.read_text(encoding="utf-8").strip()
                    parts = text.split("|")
                    if len(parts) >= 3:
                        signal["status"] = parts[0].lower() if parts[0].lower() in ("green", "yellow", "red") else "unknown"
                        signal["reason"] = parts[3] if len(parts) > 3 else text
                except:  # noqa
                    pass
        signals[comp] = signal
    return signals


def read_audit_summary() -> Dict[str, Any]:
    """读取审计结果"""
    audit_path = PROJECT_ROOT / ".codex/audit/audit-result.json"
    if audit_path.exists():
        try:
            return json.loads(audit_path.read_text(encoding="utf-8"))
        except:  # noqa
            pass
    return {"findings": [], "summary": "No audit data"}


def read_gate_status() -> Dict[str, Any]:
    gate_path = PROJECT_ROOT / ".codex/signals/gate-status.json"
    if gate_path.exists():
        try:
            return json.loads(gate_path.read_text(encoding="utf-8"))
        except:
            pass
    return {"gates": [], "summary": {"passed": 0, "partial": 0, "failed": 0}}


def read_env_status() -> Dict[str, Any]:
    """读取环境状态"""
    env_path = PROJECT_ROOT / ".codex/env-snapshot.json"
    if env_path.exists():
        try:
            return json.loads(env_path.read_text(encoding="utf-8"))
        except:  # noqa
            pass
    return {"status": "unknown"}


def count_active_tasks(rdc_pipeline: list) -> int:
    """活跃任务 = RDC 三阶段未全部完成的任务 (Fix 3)"""
    return sum(1 for item in rdc_pipeline if not item.get("committed"))


# ═══════════════════════════════════════════════════════════════════════════════
#  数据聚合
# ═══════════════════════════════════════════════════════════════════════════════

def collect_dashboard_data() -> Dict[str, Any]:
    """聚合所有仪表盘数据"""
    return {
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "authDocs": scan_auth_docs(),
        "rdcPipeline": derive_rdc_pipeline(),
        "signals": read_component_signals(),
        "audit": read_audit_summary(),
        "gates": read_gate_status(),
        "env": read_env_status(),
        "signalCount": 6,
        "activeTasks": count_active_tasks(derive_rdc_pipeline()),
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  渲染 HTML
# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════════
#  JS 模板 — 使用普通字符串（非 f-string），避免 {} 转义问题
# ═══════════════════════════════════════════════════════════════════════════════

_RENDER_JS_TPL = """<script>
window.__DASHBOARD_DATA__ = __DATA_JSON__;

document.addEventListener('DOMContentLoaded', function() {
  var cards = document.querySelectorAll('.signal-card');
  cards.forEach(function(card) {
    /* --- Gatekeeper 点击 (L1-L11 展开) --- */
    if (card.textContent.indexOf('gatekeeper') !== -1) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', function() {
        var panel = document.getElementById('gk-detail');
        if (!panel) {
          panel = document.createElement('div');
          panel.id = 'gk-detail';
          var items = (window.__DASHBOARD_DATA__.gatekeeperChecks || []).map(function(c) {
            var st = (c.status||'').toUpperCase();
            var label = st === 'PASS' ? 'PASS' : (st === 'WARN' ? 'WARN('+(c.count||0)+')' : 'FAIL('+(c.count||0)+')');
            var color = st === 'PASS' ? '#22c55e' : (st === 'WARN' ? '#f59e0b' : '#ef4444');
            return [c.name || '', label, color];
          });
          if (items.length === 0) { items = [['网守尚未执行', '通过 git synova-commit 触发', '#6b7280']]; }
          var rows = '';
          items.forEach(function(item) {
            rows += '<tr><td style=padding:2px 4px>' + item[0] + '</td><td style=text-align:right;color:' + (item[2]||'#6b7280') + ';padding:2px 4px>' + item[1] + '</td></tr>';
          });
          items.forEach(function(item) {
            rows += '<tr><td style=padding:2px 4px>' + item[0] + '</td><td style=text-align:right;color:#22c55e;padding:2px 4px>' + item[1] + '</td></tr>';
          });
          panel.innerHTML = '<table style=width:100%;font-size:11px>' + rows + '</table>';
          card.appendChild(panel);
        } else {
          panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
      });
    }
    /* --- 严重信号点击 --- */
    var stEl = card.querySelector('.signal-status');
    if (stEl && stEl.textContent.indexOf('严重') !== -1) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', function(e) {
        e.stopPropagation();
        var detail = card.querySelector('.sig-detail');
        if (!detail) {
          detail = document.createElement('div');
          detail.className = 'sig-detail';
          detail.style.cssText = 'margin-top:6px;padding:6px;background:#0f172a;border-radius:4px;font-size:11px;color:#94a3b8';
          var reasonEl = card.querySelector('.signal-reason');
          var text = reasonEl ? reasonEl.textContent : 'N/A';
          detail.innerHTML = '<b>详情:</b> ' + text + '<br><b>建议:</b> 立即查看.';
          card.appendChild(detail);
        } else {
          detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
        }
      });
    }
  });
});

/* --- 自动刷新（每 5 分钟局部更新） --- */
(function() {
  function refreshDashboard() {
    fetch('/api/cockpit/data').then(function(r) { return r.json(); }).then(function(d) {
      window.__DASHBOARD_DATA__ = d;
      var sb = document.querySelector('.status-bar');
      if (sb) {
        var n = d.signals ? Object.keys(d.signals).length : 0;
        var ts = d.timestamp ? d.timestamp.slice(0, 19).replace('T', ' ') : '';
        sb.innerHTML = '<span style=color:#22c55e>\\u25cf 信号: ' + n + '/6</span>' +
          '<span>快照: ' + ts + '</span>';
      }
      var docs = d.authDocs || [];
      var bar = document.querySelector('.card:first-child .card-bar');
      if (bar) {
        bar.style.width = (docs.length ? Math.round(docs.filter(function(x){return x.exists}).length/docs.length*100) : 0) + '%';
      }
    }).catch(function(e) {
      console.warn('刷新失败', e);
    });
  }
  setInterval(refreshDashboard, 300000);
})();
</script>"""


def render_html(data: Dict[str, Any]) -> str:
    """渲染自包含 HTML 仪表盘"""
    # 安全转义
    def esc(s):
        if not s:
            return ""
        return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    signals = data.get("signals", {})

    # 信号卡片 HTML
    # D261: inject views
    _pm_html = ""
    _completion_html = ""
    if _HAS_VIEWS:
        try:
            _pm_html = render_pm(data)
            _completion_html = render_completion(data)
        except Exception:
            pass

    signal_cards = ""
    status_icons = {"green": "&#9679;", "yellow": "&#9679;", "red": "&#9679;", "unknown": "&#9678;"}
    status_colors = {"green": "#22c55e", "yellow": "#f59e0b", "red": "#ef4444", "unknown": "#6b7280"}
    status_labels = {"green": "正常", "yellow": "警告", "red": "严重", "unknown": "未知"}

    for comp in ["context-injector", "gatekeeper", "external-auditor", "contract-archiver", "write-lock", "env-validator"]:
        sig = signals.get(comp, {"status": "unknown", "reason": "Signal file not found"})
        st = sig.get("status", "unknown")




        st_icon = "●"  # always available
        cnt_icon = "○"  # default: not available
        tr_icon = "○"   # default: not available
        cnt_color = "#6b7280"
        cnt_tier = "数据积累中"
        if st != "unknown" and not (sig.get("p0") or sig.get("p1") or sig.get("p2")):
            cnt_icon = "●"
            cnt_color = "#f59e0b"
            cnt_tier = "依赖升级"
        if sig.get("p0") or sig.get("p1") or sig.get("p2"):
            cnt_icon = "●"  # counts available
            cnt_color = "#22c55e"
            cnt_tier = "计数可用"
        color = status_colors.get(st, "#6b7280")
        icon = status_icons.get(st, "&#9678;")
        label = status_labels.get(st, "Unknown")
        reason = esc(sig.get("reason", ""))
        signal_cards += f"""
        <div class="signal-card" style="border-left:3px solid {color}">
            <div class="signal-header">
                <span class="signal-name">{esc(comp)}</span>
                <span class="signal-status" style="color:{color}">{icon} {label}</span>
            </div>
            <div class="signal-reason">{reason}</div>
            <div class="signal-tier" style="font-size:10px;color:#64748b;margin-top:4px"><span style="color:#22c55e">{st_icon} 🟢 当前可实现</span><span style="color:{cnt_color};margin-left:8px">{cnt_icon} {cnt_tier}</span><span style="color:#9ca3af;margin-left:8px">{tr_icon} ⚪ 数据积累中</span></div>
        </div>"""

    # 文档状态
    doc_count = len(data.get("authDocs", []))
    doc_exists = sum(1 for d in data.get("authDocs", []) if d.get("exists"))

    # RDC 流水线
    rdc_rows = ""
    rdc_total = 0
    rdc_r = rdc_d = rdc_c = 0
    for item in data.get("rdcPipeline", []):
        rdc_total += 1
        r = "&#9679;" if item.get("has_brief") else "&#9678;"
        d = "&#9679;" if item.get("has_dev_doc") else "&#9678;"
        c = "&#9679;" if item.get("committed") else "&#9678;"
        if item.get("has_brief"):
            rdc_r += 1
        if item.get("has_dev_doc"):
            rdc_d += 1
        if item.get("committed"):
            rdc_c += 1
        rdc_rows += f"""
        <div class="rdc-row">
            <span class="rdc-name">{esc(item['name'][:60])}</span>
            <span style="color:#22c55e">{r}</span>
            <span style="color:{'#22c55e' if item.get('has_dev_doc') else '#f59e0b'}">{d}</span>
            <span style="color:{'#22c55e' if item.get('committed') else '#ef4444'}">{c}</span>
        </div>"""

    # 审计统计 (Fix 4)
    audit_findings = data.get("audit", {}).get("findings", [])
    audit_p0 = sum(1 for f in audit_findings if f.get("severity") == "high") if isinstance(audit_findings, list) else 0
    audit_p1 = sum(1 for f in audit_findings if f.get("severity") == "medium") if isinstance(audit_findings, list) else 0

    # P0/P1 阻断
    blocks = []
    for comp, sig in signals.items():
        st = sig.get("status", "unknown")
        if st == "red":
            blocks.append({"severity": "P0", "component": comp, "reason": sig.get("reason", "Critical")})
        elif st in ("yellow", "unknown"):
            blocks.append({"severity": "P1", "component": comp, "reason": sig.get("reason", "Warning")})
    block_rows = ""
    for b in blocks[:10]:
        block_rows += f"<div class='block-row'><span class='sev-{b['severity']}'>{b['severity']}</span><span>{esc(b['component'])}</span><span>{esc(b['reason'])}</span></div>\n"

    # 最近完成
    recent = ""
    try:
        r = subprocess.run(["git", "log", "--oneline", "-5"],
                           capture_output=True, text=True, encoding="utf-8", errors="replace", cwd=PROJECT_ROOT, timeout=5)
        for line in r.stdout.strip().split("\n"):
            if line:
                recent += f"<div class='recent-item'>{esc(line[:80])}</div>\n"
    except:  # noqa
        recent = "<div class='recent-item'>No git log</div>"

    gd = data.get("gates", {})
    gp = gd.get("summary", {}).get("passed", 0)
    gpa = gd.get("summary", {}).get("partial", 0)
    gf = gd.get("summary", {}).get("failed", 0)
    gts = gd.get("gates", [])
    gr = ""
    for g in gts[:17]:
        gs = g.get("status", "unknown")
        gc = {"pass": "#22c55e", "partial": "#f59e0b", "failed": "#ef4444"}.get(gs, "#6b7280")
        gl = {"pass": "通过", "partial": "部分通过", "failed": "未通过"}.get(gs, "Unknown")
        gr += "<div style='display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid #334155'><span style='color:" + gc + "'>\u25cf</span><span style='min-width:60px;font-weight:600'>" + g.get("dimension","") + "</span><span style='flex:1'>" + g.get("name","") + "</span><span style='color:" + gc + "'>" + gl + "</span></div>\n"
    if not gr:
        gr = "无门禁数据"
    gsect = "<div class='card card-full'><h2>17 产品门禁 \u2014 <span style='color:#22c55e'>" + str(gp) + "</span> 通过 / <span style='color:#f59e0b'>" + str(gpa) + "</span> 部分通过 / <span style='color:#ef4444'>" + str(gf) + "</span> 未通过</h2><div class='gate-grid'>" + gr + "</div></div>" if gts else ""

    ts = data.get("timestamp", "")
    signal_count = sum(1 for v in signals.values() if v.get("status") != "unknown")

    # build JS — NOT in f-string so real { } work
    import json as _j
    _dj = _j.dumps(data, default=str, ensure_ascii=False)
    script = _RENDER_JS_TPL.replace('__DATA_JSON__', _dj)

    return f"""<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Synova — 创始人驾驶舱</title>
<style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:#0f172a; color:#e2e8f0; padding:20px; }}
h1 {{ font-size:22px; margin-bottom:16px; }}
h2 {{ font-size:15px; margin:20px 0 10px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }}
.grid {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:20px; }}
.card {{ background:#1e293b; border-radius:8px; padding:14px; }}
.card-full {{ grid-column:1/-1; }}
.signal-card {{ background:#1e293b; border-radius:6px; padding:10px 12px; margin-bottom:6px; }}
.signal-header {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }}
.signal-name {{ font-size:13px; font-weight:600; }}
.signal-status {{ font-size:12px; font-weight:600; }}
.signal-reason {{ font-size:11px; color:#94a3b8; }}
.rdc-row {{ display:flex; align-items:center; gap:10px; padding:5px 0; font-size:12px; border-bottom:1px solid #334155; }}
.rdc-row:last-child {{ border-bottom:none; }}
.rdc-name {{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.rdc-header {{ font-weight:600; color:#94a3b8; margin-bottom:4px; display:flex; gap:10px; }}
.rdc-header span {{ width:20px; text-align:center; }}
.block-row {{ display:flex; gap:10px; font-size:12px; padding:4px 0; }}
.sev-P0 {{ color:#ef4444; font-weight:700; }}
.sev-P1 {{ color:#f59e0b; font-weight:700; }}
.recent-item {{ font-size:12px; padding:3px 0; color:#94a3b8; }}
.status-bar {{ display:flex; gap:20px; align-items:center; font-size:12px; color:#94a3b8; padding:10px 0; border-top:1px solid #334155; margin-top:16px; }}
.status-bar .ok {{ color:#22c55e; }}
.status-bar .warn {{ color:#f59e0b; }}
.gate-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-top:8px; }}
.gate-item {{ display:flex; align-items:center; gap:6px; padding:4px 8px; border-radius:4px; font-size:11px; background:#0f172a; }}
.gate-item .name {{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }}
.gate-pass {{ color:#22c55e; }} .gate-partial {{ color:#f59e0b; }} .gate-fail {{ color:#ef4444; }}
.gate-dim {{ font-size:10px; color:#64748b; min-width:36px; }}
@@media (max-width:640px) {{ .grid {{ grid-template-columns:1fr; }} }}
</style>
</head><body>
<h1>&#9672; 创始人驾驶舱 <span style="font-size:12px;color:#64748b;font-weight:400">D220</span></h1>

<div class="grid">
    <div class="card">
        <h2>权威文档 ({doc_exists}/{doc_count})</h2>
        <div style="height:6px;background:#334155;border-radius:3px;overflow:hidden">
            <div class="card-bar" style="height:100%;width:{doc_count>0 and doc_exists/doc_count*100 or 0}%;background:#22c55e;border-radius:3px"></div>
        </div>
    </div>
    <div class="card">
        <h2>流水线 R/{rdc_r}/D/{rdc_d}/C/{rdc_c}</h2>
        <div style="display:flex;gap:4px;height:6px">
            <div style="flex:{rdc_r};background:#22c55e;border-radius:3px 0 0 3px"></div>
            <div style="flex:{rdc_d};background:#f59e0b"></div>
            <div style="flex:{rdc_c};background:#3b82f6;border-radius:0 3px 3px 0"></div>
        </div>
    </div>
</div>

<div class="grid">
    <div class="card card-full">
        <h2>6 组件信号</h2>
        {signal_cards}
    </div>
</div>

<!-- D261: PM 仪表盘 + 完成度视图 -->
{_pm_html}
{_completion_html}

<div class="grid">
    <div class="card">
        <h2>活跃任务</h2>
        <div style="font-size:24px;font-weight:700;color:#f59e0b;margin-top:4px">{data.get('activeTasks', 0)}</div>
        <div style="font-size:11px;color:#64748b">RDC 未提交任务</div>
    </div>
    <div class="card">
        <h2>审计状态</h2>
        <div style="font-size:12px;color:#94a3b8;padding:4px 0">
            <span style="color:#ef4444;font-weight:600">P0: {audit_p0}</span>
            <span style="margin:0 12px;color:#f59e0b;font-weight:600">P1: {audit_p1}</span>
            <span style="color:#64748b">趋势: 数据积累中 (需要 10+ 次审计)</span>
        </div>
    </div>
</div>

{gsect}

<div class="grid">
    <div class="card card-full">
        <h2>R/D/C 流水线 <span style="font-weight:400;color:#64748b;font-size:11px">&#9679;=完成 &#9678;=待办</span></span></h2>
        <div class="rdc-header"><span class="rdc-name">Task</span><span style="width:20px;text-align:center">R</span><span style="width:20px;text-align:center">D</span><span style="width:20px;text-align:center">C</span></div>
        {rdc_rows}
    </div>
</div>

<div class="grid">
    <div class="card">
        <h2>活跃阻断 ({len(blocks)})</h2>
        {block_rows or '<div style="font-size:12px;color:#22c55e">无活跃阻断</div>'}
    </div>
    <div class="card">
        <h2>最近提交</h2>
        {recent}
    </div>
</div>

<div class="status-bar">
    <span style="color:{'#22c55e' if signal_count >= 6 else '#f59e0b'}">&#9679; 控制塔仪表盘: {'[OK] 正常' if signal_count >= 6 else '[WARN] 降级'} — 最近快照 {ts[:19].replace('T',' ') if ts else 'N/A'}，{signal_count}/6 信号有效</span>
</div>
<div class="card card-full" style="margin-top:16px">
    <h2>Agent 可靠性趋势 <span style="color:#64748b;font-size:11px">Phase 2</span></h2>
    <div style="color:#9ca3af;font-size:12px;padding:8px 0">数据积累中 — 需要 10 次以上审计记录后激活 (Phase 2)</div>
</div>
{script}
</body></html>"""


# ═══════════════════════════════════════════════════════════════════════════════
#  CLI + 双模式
# ═══════════════════════════════════════════════════════════════════════════════

def generate_static(output_path: str = ""):
    """静态模式：生成 HTML 文件"""
    data = collect_dashboard_data()
    html = render_html(data)

    if not output_path:
        ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        output_path = str(PROJECT_ROOT / f"app/synova-founder-dashboard-{ts}.html")

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"[dashboard] HTML generated: {output_path} ({len(html)} bytes)")
    return output_path


def serve(port: int = 8899):
    """服务模式：本地 HTTP + 5 分钟 JS 轮询"""
    data = collect_dashboard_data()
    html = render_html(data)

    class DashboardHandler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/api/cockpit/data":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(collect_dashboard_data(), default=str).encode())
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                # 注入 JS 自# render_html() 已包含 JS 刷新脚本，直接输出
                self.wfile.write(html.encode())
    print(f"[dashboard] Serving on http://localhost:{port}")
    http_server = http.server.HTTPServer(("0.0.0.0", port), DashboardHandler)
    try:
        http_server.serve_forever()
    except KeyboardInterrupt:
        print("\n[dashboard] Server stopped")
        http_server.server_close()


# ═══ CLI ═══

def main():
    parser = argparse.ArgumentParser(description="Founder Cockpit (D220) — 创始人全局仪表盘")
    parser.add_argument("--serve", action="store_true", help="启动本地 HTTP 服务 :8899")
    parser.add_argument("--port", type=int, default=8899, help="服务端口 (默认 8899)")
    parser.add_argument("--output", default="", help="静态 HTML 输出路径")
    args = parser.parse_args()

    if args.serve:
        serve(args.port)
    else:
        generate_static(args.output)


if __name__ == "__main__":
    main()

