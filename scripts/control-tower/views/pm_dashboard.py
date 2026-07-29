#!/usr/bin/env python3
"""
views/pm_dashboard.py — V3 §2.2 PM 仪表盘视图 (D261)

四条件进度条(A/B/C/D) + 每个条件的剩余任务列表。
从 gate-status.json + completion-scores.json 渲染。

用法:
  from views.pm_dashboard import render_pm
  html = render_pm(data)
"""
from typing import Any


def esc(s):
    if not s:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def render_pm(data: dict) -> str:
    """渲染 PM 仪表盘 HTML 片段 — 四条件进度条 + 任务列表"""
    gates = data.get("gates", {}).get("gates", data.get("gates", []))
    if isinstance(gates, list):
        pass
    elif isinstance(data.get("gates"), dict):
        gates = data["gates"].get("gates", [])

    # 从 completion-scores.json 取条件分组完成度
    completion = data.get("completion", {})
    criteria = completion.get("completionByCriteria", data.get("completionByCriteria", {}))
    overall = completion.get("overallScore", data.get("overallScore", 0))

    # 四个条件组的定义 (V3 §2.2)
    criteria_defs = [
        ("A", "代码存在 (Path Exists)", criteria.get("A", 0)),
        ("B", "接线完整 (Wired)", criteria.get("B", 0)),
        ("C", "测试存在 (Test Exists)", criteria.get("C", 0)),
        ("D", "综合质量 (Quality)", criteria.get("D", 0)),
    ]

    # 按条件分组门禁
    gate_groups: dict[str, list] = {"A": [], "B": [], "C": [], "D": []}
    criteria_map = {
        "基础": "A", "接入": "B", "诊断": "C",
        "导航": "D", "持续运行": "D", "进化": "D", "控制": "D",
    }
    for g in (gates if isinstance(gates, list) else []):
        dim = g.get("dimension", "unknown")
        c = criteria_map.get(dim, "D")
        gate_groups.setdefault(c, []).append(g)

    bars = ""
    for letter, name, pct in criteria_defs:
        remaining = [g for g in gate_groups.get(letter, [])
                     if g.get("status") in ("fail", "partial")]
        pct = min(max(pct, 0), 100)
        color = "#22c55e" if pct >= 80 else "#f59e0b" if pct >= 40 else "#ef4444"
        bars += f"""
        <div class="pm-criterion">
            <div class="pm-criterion-header">
                <span class="pm-letter">{letter}</span>
                <span class="pm-criterion-name">{esc(name)}</span>
                <span class="pm-pct" style="color:{color}">{pct:.0f}%</span>
            </div>
            <div class="pm-bar-bg">
                <div class="pm-bar-fill" style="width:{pct}%;background:{color}"></div>
            </div>
            <div class="pm-remaining">
                <span style="font-size:11px;color:#94a3b8">{len(remaining)} 项剩余</span>
                <ul class="pm-task-list">"""

        for g in remaining[:5]:
            gs = g.get("status", "unknown")
            icon = "&#9679;" if gs == "partial" else "&#9678;"
            gcolor = {"partial": "#f59e0b", "fail": "#ef4444"}.get(gs, "#6b7280")
            bars += f"""
                    <li><span style="color:{gcolor}">{icon}</span> {esc(g.get("name", ""))} [{esc(g.get("id", ""))}]</li>"""

        if len(remaining) > 5:
            bars += f"""<li style="color:#64748b">...还有 {len(remaining) - 5} 项</li>"""

        bars += """
                </ul>
            </div>
        </div>"""

    # 总进度
    overall_color = "#22c55e" if overall >= 80 else "#f59e0b" if overall >= 40 else "#ef4444"

    return f"""
    <div class="pm-dashboard">
        <div class="pm-header">
            <h2>PM 仪表盘 <span style="font-size:12px;color:#64748b">V3 §2.2</span></h2>
            <div class="pm-overall" style="color:{overall_color}">
                <span class="pm-overall-pct">{overall:.1f}%</span>
                <span class="pm-overall-label">总完成度</span>
            </div>
        </div>
        <div class="pm-grid">
            {bars}
        </div>
    </div>

    <style>
    .pm-dashboard {{ background:#1e293b; border-radius:8px; padding:16px; margin-bottom:16px; }}
    .pm-header {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:16px; }}
    .pm-header h2 {{ margin:0; font-size:15px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }}
    .pm-overall {{ text-align:center; }}
    .pm-overall-pct {{ font-size:28px; font-weight:700; display:block; }}
    .pm-overall-label {{ font-size:11px; color:#64748b; }}
    .pm-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }}
    .pm-criterion {{ background:#0f172a; border-radius:6px; padding:12px; }}
    .pm-criterion-header {{ display:flex; align-items:center; gap:8px; margin-bottom:8px; }}
    .pm-letter {{ width:24px; height:24px; border-radius:50%; background:#1e293b; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:#22c55e; }}
    .pm-criterion-name {{ flex:1; font-size:13px; font-weight:600; color:#e2e8f0; }}
    .pm-pct {{ font-size:18px; font-weight:700; }}
    .pm-bar-bg {{ height:6px; background:#334155; border-radius:3px; overflow:hidden; margin-bottom:8px; }}
    .pm-bar-fill {{ height:100%; border-radius:3px; transition:width 0.3s; }}
    .pm-remaining {{ margin-top:4px; }}
    .pm-task-list {{ list-style:none; padding:0; margin:4px 0 0; }}
    .pm-task-list li {{ font-size:11px; color:#94a3b8; padding:2px 0; display:flex; align-items:center; gap:4px; }}
    @@media (max-width:640px) {{ .pm-grid {{ grid-template-columns:1fr; }} }}
    </style>"""
