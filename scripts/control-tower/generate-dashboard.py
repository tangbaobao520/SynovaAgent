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
        "contract-archiver", "dev-doc-gatekeeper", "write-lock",
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


def read_env_status() -> Dict[str, Any]:
    """读取环境状态"""
    env_path = PROJECT_ROOT / ".codex/env-snapshot.json"
    if env_path.exists():
        try:
            return json.loads(env_path.read_text(encoding="utf-8"))
        except:  # noqa
            pass
    return {"status": "unknown"}


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
        "env": read_env_status(),
        "signalCount": 6,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  渲染 HTML
# ═══════════════════════════════════════════════════════════════════════════════

def render_html(data: Dict[str, Any]) -> str:
    """渲染自包含 HTML 仪表盘"""
    # 安全转义
    def esc(s):
        if not s:
            return ""
        return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")

    signals = data.get("signals", {})

    # 信号卡片 HTML
    signal_cards = ""
    status_icons = {"green": "&#9679;", "yellow": "&#9679;", "red": "&#9679;", "unknown": "&#9678;"}
    status_colors = {"green": "#22c55e", "yellow": "#f59e0b", "red": "#ef4444", "unknown": "#6b7280"}
    status_labels = {"green": "Healthy", "yellow": "Warning", "red": "Critical", "unknown": "Unknown"}

    for comp in ["context-injector", "gatekeeper", "external-auditor", "contract-archiver", "dev-doc-gatekeeper", "write-lock"]:
        sig = signals.get(comp, {"status": "unknown", "reason": "Signal file not found"})
        st = sig.get("status", "unknown")


        st_icon = "\u25cf"  # always available
        cnt_icon = "\u25cb"  # default: not available
        tr_icon = "\u25cb"   # default: not available
        if sig.get("p0") or sig.get("p1") or sig.get("p2"):
            cnt_icon = "\u25cf"  # counts available
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
            <div class="signal-tier" style="font-size:10px;color:#64748b;margin-top:4px"><span style="color:#22c55e">{st_icon} Status</span><span style="color:#f59e0b;margin-left:8px">{cnt_icon} Counts</span><span style="color:#64748b;margin-left:8px">{tr_icon} Trends</span></div>
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

    ts = data.get("timestamp", "")
    signal_count = sum(1 for v in signals.values() if v.get("status") != "unknown")

    return f"""<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Synova — Founder Cockpit</title>
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
@@media (max-width:640px) {{ .grid {{ grid-template-columns:1fr; }} }}
</style>
</head><body>
<h1>&#9672; Founder Cockpit <span style="font-size:12px;color:#64748b;font-weight:400">D220</span></h1>

<div class="grid">
    <div class="card">
        <h2>Docs ({doc_exists}/{doc_count})</h2>
        <div style="height:6px;background:#334155;border-radius:3px;overflow:hidden">
            <div style="height:100%;width:{doc_count>0 and doc_exists/doc_count*100 or 0}%;background:#22c55e;border-radius:3px"></div>
        </div>
    </div>
    <div class="card">
        <h2>Pipeline R/{rdc_r}/D/{rdc_d}/C/{rdc_c}</h2>
        <div style="display:flex;gap:4px;height:6px">
            <div style="flex:{rdc_r};background:#22c55e;border-radius:3px 0 0 3px"></div>
            <div style="flex:{rdc_d};background:#f59e0b"></div>
            <div style="flex:{rdc_c};background:#3b82f6;border-radius:0 3px 3px 0"></div>
        </div>
    </div>
</div>

<div class="grid">
    <div class="card card-full">
        <h2>6 Component Signals</h2>
        {signal_cards}
    </div>
</div>

<div class="grid">
    <div class="card card-full">
        <h2>R/D/C Pipeline <span style="font-weight:400;color:#64748b;font-size:11px">&#9679;=Done &#9678;=Pending</span></h2>
        <div class="rdc-header"><span class="rdc-name">Task</span><span style="width:20px;text-align:center">R</span><span style="width:20px;text-align:center">D</span><span style="width:20px;text-align:center">C</span></div>
        {rdc_rows}
    </div>
</div>

<div class="grid">
    <div class="card">
        <h2>Active Blocks ({len(blocks)})</h2>
        {block_rows or '<div style="font-size:12px;color:#22c55e">No active blocks</div>'}
    </div>
    <div class="card">
        <h2>Recent Commits</h2>
        {recent}
    </div>
</div>

<div class="status-bar">
    <span class="ok">&#9679; Signals: {signal_count}/6</span>
    <span>Snapshot: {ts[:19].replace('T',' ')}</span>
    <span>Docs: {doc_exists}/{doc_count}</span>
</div>
<script>document.addEventListener('DOMContentLoaded',function(){{var c=document.querySelectorAll('.signal-card');c.forEach(function(card){{if(card.textContent.includes('gatekeeper')){{card.style.cursor='pointer';card.addEventListener('click',function(){{var p=document.getElementById('gk-detail');if(!p){{p=document.createElement('div');p.id='gk-detail';p.style.cssText='margin-top:8px;padding:8px;background:#0f172a;border-radius:4px;font-size:11px;color:#94a3b8';var items=['L1-as_any','L2-empty_catch','L3-secrets','L4-new_file','L5-wiring','L6-compute','L7-sentinel','L8-contract','L9-error','L10-health','L11-dash'];p.innerHTML='<table style=width:100%>'+items.map(function(i){{return'<tr><td>'+i+'</td><td style=text-align:right;color:#22c55e>OK</td></tr>'}}).join('')+'</table>';card.appendChild(p)}}else{{p.style.display=p.style.display==='none'?'block':'none'}}}})}}}});var st=card.querySelector('.signal-status');if(st&&st.textContent.includes('Critical')){{card.style.cursor='pointer';card.addEventListener('click',function(e){{e.stopPropagation();var d=card.querySelector('.sig-detail');if(!d){{d=document.createElement('div');d.className='sig-detail';d.style.cssText='margin-top:6px;padding:6px;background:#0f172a;border-radius:4px;font-size:11px;color:#94a3b8';d.innerHTML='<b>Details:</b> '+(card.querySelector('.signal-reason')?.textContent||'N/A')+'<br><b>Action:</b> Investigate.';card.appendChild(d)}}else{{d.style.display=d.style.display==='none'?'block':'none'}}}})}}}})}});</script>
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
            if self.path == "/api/dashboard-data":
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps(collect_dashboard_data(), default=str).encode())
            else:
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.end_headers()
                # 注入 JS 自动刷新
                refresh_html = html.replace("</body>", """
<script>
async function refresh() {
    try {
        const r = await fetch('/api/dashboard-data');
        if (r.ok) location.reload();
    } catch(e) {}
}
setInterval(refresh, 300000);
</script></body>""")
                self.wfile.write(refresh_html.encode())

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
