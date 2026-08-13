#!/usr/bin/env python3
"""
views/completion.py — V3 §3.3 完成度时间轴视图 (D261, D296 修复)

时间轴滑块 + 六条件雷达图 + 30天趋势线。
从 snapshots/ 目录的历史快照渲染。

D296 修复 (控制塔数据真实性):
  - 消费统一 schema (completion_schema.py): systemScore (0-1) + 六键 criteria
    (旧 overallScore 0-100 兼容降级读取)
  - 快照目录名时间解析: %Y%m%dT%H%M%SZ (self-diagnosis) + %Y%m%d-%H%M%S
    (check-gates-v2) — 旧解析全 ValueError → epoch=0 → 时间轴排序失效
  - 数据缺失/过期 → 显示 degraded 横幅 + 原因, 禁止渲染假 0% 数字

用法:
  from views.completion import render_completion
  html = render_completion(data)
"""
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
SNAPSHOTS_DIR = PROJECT_ROOT / ".codex/snapshots"

# 六条件雷达 (统一 schema 六键 → 展示名)
RADAR_KEYS = [
    ("code_exists", "代码存在"),
    ("wiring_complete", "接线完整"),
    ("test_exists", "测试存在"),
    ("path_reachable", "路径可达"),
    ("dependencies_ok", "依赖可用"),
    ("no_defects", "无已知缺陷"),
]

_SNAPSHOT_TS_FORMATS = ["%Y%m%dT%H%M%SZ", "%Y%m%d-%H%M%S",
                        "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"]


def parse_snapshot_ts(name: str) -> int:
    """解析快照目录名为 epoch 秒 (D296 时间解析修复)。

    支持 self-diagnosis (%Y%m%dT%H%M%SZ) 与 check-gates-v2 (%Y%m%d-%H%M%S)
    两种目录命名, 兼容旧 ISO 格式。解析失败返回 0 (排最前, 不阻断)。
    """
    for fmt in _SNAPSHOT_TS_FORMATS:
        try:
            dt = datetime.strptime(name[:19], fmt)
            return int(dt.replace(tzinfo=timezone.utc).timestamp())
        except (ValueError, IndexError):
            continue
    return 0


def esc(s):
    if not s:
        return ""
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _score_to_pct(score: Any) -> float:
    """统一为 0-100 百分比显示。

    统一 schema systemScore 是 0-1, 旧 overallScore 是 0-100 —
    取值 >1 视为已是百分比, 否则乘 100。
    """
    try:
        value = float(score or 0)
    except (TypeError, ValueError):
        return 0.0
    return value if value > 1 else value * 100


def load_snapshot_history(max_snapshots: int = 30) -> list[dict]:
    """从 snapshots/ 目录加载历史完成度数据"""
    if not SNAPSHOTS_DIR.exists():
        return []

    timestamps = []
    for entry in sorted(SNAPSHOTS_DIR.iterdir()):
        if entry.is_dir() and entry.name != ".gitkeep":
            completion_file = entry / "completion-scores.json"
            gate_file = entry / "gate-status.json"
            ts = entry.name
            # D296: 时间解析修复 — 支持 %Y%m%dT%H%M%SZ 与 %Y%m%d-%H%M%S
            epoch = parse_snapshot_ts(ts)

            entry_data = {"timestamp": ts, "epoch": epoch}

            if completion_file.exists():
                try:
                    entry_data["completion"] = json.loads(completion_file.read_text("utf-8", errors="replace"))
                except Exception:
                    pass
            if gate_file.exists():
                try:
                    entry_data["gates"] = json.loads(gate_file.read_text("utf-8", errors="replace"))
                except Exception:
                    pass
            timestamps.append(entry_data)

    # 按时间排序，取最近 max_snapshots 个
    timestamps.sort(key=lambda x: x.get("epoch", 0))
    return timestamps[-max_snapshots:]


def render_completion(data: dict) -> str:
    """渲染完成度时间轴 HTML 片段 (D296: 统一 schema + degraded 展示)"""
    # 当前快照来自 data 参数
    current_completion = data.get("completion", {}) or {}
    overall = current_completion.get("systemScore", data.get("systemScore", 0))
    criteria = current_completion.get("completionByCriteria", data.get("completionByCriteria", {}))

    # D296: 数据缺失/过期 → degraded 展示 + 原因 (禁止假数字)
    freshness = data.get("freshness", {}) or {}
    degraded = bool(current_completion.get("degraded", False))
    degraded_reason = current_completion.get("degradedReason", "")
    if not current_completion or freshness.get("status") == "stale":
        degraded = True
        if not degraded_reason:
            stale = freshness.get("stale", []) or freshness.get("missing", [])
            degraded_reason = "完成度数据缺失或过期 (>24h)"
            if stale:
                degraded_reason += f" — {', '.join(stale[:3])}"

    # 历史快照
    history = load_snapshot_history()

    # 趋势数据: 最近 30 个快照的 score (统一 0-100)
    trend_points = []
    for snap in history[-30:]:
        comp = snap.get("completion", {})
        score = _score_to_pct(comp.get("systemScore", comp.get("overallScore", 0)))
        ts = snap.get("timestamp", "")
        trend_points.append({"ts": ts[:16] if len(ts) > 16 else ts, "score": score})

    # 当前六条件雷达值 (统一 schema 六键)
    radar_labels = [label for _, label in RADAR_KEYS]
    radar_values = [
        criteria.get(key, {}).get("pct", 0) if isinstance(criteria.get(key), dict) else 0
        for key, _ in RADAR_KEYS
    ]
    radar_json = json.dumps({"labels": radar_labels, "values": radar_values, "names": radar_labels})

    # 趋势 JSON
    trend_json = json.dumps(trend_points)

    # 快照统计
    has_snapshots = len(history) > 0
    all_scores = [_score_to_pct(s.get("completion", {}).get("systemScore",
                                                            s.get("completion", {}).get("overallScore", 0)))
                  for s in history if s.get("completion")]
    trend_dir = "up" if len(all_scores) >= 2 and all_scores[-1] > all_scores[0] else \
                "down" if len(all_scores) >= 2 and all_scores[-1] < all_scores[0] else "flat"

    # D296: degraded 横幅 — 数据缺失时显示原因, 不渲染假数字
    degraded_banner = ""
    if degraded:
        degraded_banner = f"""
    <div class="comp-degraded" style="background:#450a0a;border:1px solid #ef4444;border-radius:6px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#fca5a5">
        <b>&#9888; 数据缺失或过期:</b> {esc(degraded_reason)}
    </div>"""

    # 修复 (D296): 原实现提前 return 头部片段, 雷达/趋势/时间轴全部被丢弃 —
    # timeline_end 赋值后从未返回, 视图实际只渲染半个 div。改为拼接后返回。
    head_html = f"""
    <div class="completion-view">
        <div class="comp-header">
            <h2>系统完成度 <span style="font-size:12px;color:#64748b">V3 §3.3</span></h2>
            <div class="comp-meta">
                <span class="comp-snapshots">{len(history)} 个快照</span>
                <span class="comp-trend comp-trend-{trend_dir}">趋势: {'上升' if trend_dir == 'up' else '下降' if trend_dir == 'down' else '平稳'}</span>
            </div>
        </div>
        {degraded_banner}

        <div class="comp-grid">
            <!-- 雷达图 -->
            <div class="comp-card" id="radar-card">
                <h3>六条件雷达</h3>
                <canvas id="radar-canvas" width="300" height="240"></canvas>
            </div>

            <!-- 趋势线 -->
            <div class="comp-card" id="trend-card">
                <h3>30 天趋势</h3>
                <div class="trend-container">
                    <svg id="trend-svg" width="100%" height="160" viewBox="0 0 300 160"></svg>
                </div>
                <div class="trend-axis">
                    <span>旧</span>
                    <span>新</span>
                </div>
            </div>
        </div>

        <!-- 快照时间轴 -->
        <div class="timeline">
            <h3>快照时间轴</h3>
            <div class="timeline-scroll">"""

    timeline_items_html = ""
    for snap in history[-20:]:
        comp = snap.get("completion", {})
        score = _score_to_pct(comp.get("systemScore", comp.get("overallScore", 0)))
        ts = snap.get("timestamp", "")
        ts_short = ts[:19].replace("T", " ") if len(ts) > 19 else ts
        color = "#22c55e" if score >= 80 else "#f59e0b" if score >= 40 else "#ef4444"
        # D296: 统一 schema 无 dimensionScores — 用六键 pct 前 3 项替代
        criteria = comp.get("completionByCriteria", {})
        dim_str = " | ".join(
            f"{label}:{criteria.get(key, {}).get('pct', 0):.0f}%"
            for key, label in RADAR_KEYS[:3])

        timeline_accessible = has_snapshots
        timeline_item_style = ""
        if not timeline_accessible:
            timeline_item_style = "opacity:0.0;pointer-events:none;position:absolute"

        timeline_placeholder = ""
        if not timeline_accessible:
            timeline_placeholder = """<div class="timeline-empty">快照数据积累中 — 运行 check-gates-v2.py 自动生成</div>"""

        if timeline_accessible:
            timeline_items_html += f"""<div class="timeline-item" style="border-left:2px solid {color}">
                    <div class="tl-dot" style="background:{color}"></div>
                    <div class="tl-content">
                        <div class="tl-ts">{esc(ts_short)}</div>
                        <div class="tl-score" style="color:{color}">{score:.1f}%</div>
                        <div class="tl-dims">{esc(dim_str)}</div>
                    </div>
                </div>"""

    timeline_end = f"""
                {timeline_items_html}
            </div>
            <div class="timeline-legend">
                <span style="color:#22c55e">&#9679; &ge;80%</span>
                <span style="color:#f59e0b">&#9679; 40-79%</span>
                <span style="color:#ef4444">&#9679; &lt;40%</span>
            </div>
        </div>
    </div>

    <script>
    (function() {{
        /* 雷达图 */
        var radarData = {radar_json};
        var canvas = document.getElementById('radar-canvas');
        if (canvas) {{
            var ctx = canvas.getContext('2d');
            var cx = 150, cy = 120, r = 90;
            var n = radarData.labels.length;
            ctx.clearRect(0, 0, 300, 240);

            /* 网格 */
            for (var ring = 1; ring <= 5; ring++) {{
                ctx.beginPath();
                for (var i = 0; i <= n; i++) {{
                    var angle = Math.PI * 2 * i / n - Math.PI / 2;
                    var x = cx + r * ring / 5 * Math.cos(angle);
                    var y = cy + r * ring / 5 * Math.sin(angle);
                    ctx[i === 0 ? 'moveTo' : 'lineTo'](x, y);
                }}
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 0.5;
                ctx.stroke();
            }}

            /* 轴 */
            for (var i = 0; i < n; i++) {{
                var angle = Math.PI * 2 * i / n - Math.PI / 2;
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 0.5;
                ctx.stroke();
                /* 标签 */
                var lx = cx + (r + 18) * Math.cos(angle);
                var ly = cy + (r + 18) * Math.sin(angle);
                ctx.fillStyle = '#94a3b8';
                ctx.font = '10px sans-serif';
                ctx.textAlign = angle > Math.PI / 2 && angle < 3 * Math.PI / 2 ? 'right' : 'left';
                ctx.fillText(radarData.labels[i], lx, ly + 3);
            }}

            /* 数据 */
            ctx.beginPath();
            for (var i = 0; i <= n; i++) {{
                var idx = i % n;
                var angle = Math.PI * 2 * idx / n - Math.PI / 2;
                var val = radarData.values[idx] / 100 * r;
                var x = cx + val * Math.cos(angle);
                var y = cy + val * Math.sin(angle);
                ctx[i === 0 ? 'moveTo' : 'lineTo'](x, y);
            }}
            ctx.closePath();
            ctx.fillStyle = 'rgba(34,197,94,0.15)';
            ctx.fill();
            ctx.strokeStyle = '#22c55e';
            ctx.lineWidth = 2;
            ctx.stroke();

            /* 数据点 */
            for (var i = 0; i < n; i++) {{
                var angle = Math.PI * 2 * i / n - Math.PI / 2;
                var val = radarData.values[i] / 100 * r;
                var x = cx + val * Math.cos(angle);
                var y = cy + val * Math.sin(angle);
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fillStyle = '#22c55e';
                ctx.fill();
            }}
        }}

        /* 趋势线 SVG */
        var trendData = {trend_json};
        var svg = document.getElementById('trend-svg');
        if (svg && trendData.length >= 2) {{
            var w = 300, h = 160, pad = 20;
            var minScore = Math.min.apply(null, trendData.map(function(d){{return d.score}})) - 5;
            var maxScore = Math.max.apply(null, trendData.map(function(d){{return d.score}})) + 5;
            minScore = Math.max(0, minScore);
            maxScore = Math.min(100, maxScore);
            var xScale = (w - pad * 2) / Math.max(trendData.length - 1, 1);
            var yScale = (h - pad * 2) / Math.max(maxScore - minScore, 1);

            /* 网格线 */
            var gridSvg = '';
            for (var g = 0; g <= 4; g++) {{
                var gy = h - pad - g * (h - pad * 2) / 4;
                var gv = minScore + g * (maxScore - minScore) / 4;
                gridSvg += '<line x1="' + pad + '" y1="' + gy + '" x2="' + (w - pad) + '" y2="' + gy + '" stroke="#334155" stroke-width="0.5"/>';
                gridSvg += '<text x="' + (pad - 4) + '" y="' + (gy + 3) + '" fill="#64748b" font-size="9" text-anchor="end">' + Math.round(gv) + '</text>';
            }}

            /* 面积 + 线 */
            var points = trendData.map(function(d, i) {{
                var x = pad + i * xScale;
                var y = h - pad - (d.score - minScore) * yScale;
                return x + ',' + y;
            }}).join(' ');
            var bottom = h - pad;

            var svgContent = gridSvg;
            svgContent += '<polygon points="' + pad + ',' + bottom + ' ' + points + ' ' + (w - pad) + ',' + bottom + '" fill="rgba(34,197,64,0.08)"/>';
            svgContent += '<polyline points="' + points + '" fill="none" stroke="#22c55e" stroke-width="2"/>';

            /* 工具提示用 circle */
            var lastPoint = trendData[trendData.length - 1];
            var lx = pad + (trendData.length - 1) * xScale;
            var ly = h - pad - (lastPoint.score - minScore) * yScale;
            svgContent += '<circle cx="' + lx + '" cy="' + ly + '" r="4" fill="#22c55e"/>';
            svgContent += '<text x="' + (lx + 8) + '" y="' + (ly + 3) + '" fill="#22c55e" font-size="10">' + lastPoint.score.toFixed(1) + '%</text>';

            svg.innerHTML = svgContent;
        }} else {{
            svg.innerHTML = '<text x="150" y="80" fill="#64748b" font-size="12" text-anchor="middle">数据积累中</text>';
        }}
    }})();
    </script>

    <style>
    .completion-view {{ background:#1e293b; border-radius:8px; padding:16px; margin-bottom:16px; }}
    .comp-header {{ display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }}
    .comp-header h2 {{ margin:0; font-size:15px; color:#94a3b8; text-transform:uppercase; letter-spacing:0.5px; }}
    .comp-meta {{ display:flex; gap:12px; font-size:11px; }}
    .comp-snapshots {{ color:#64748b; }}
    .comp-trend {{ font-weight:600; }}
    .comp-trend-up {{ color:#22c55e; }}
    .comp-trend-down {{ color:#ef4444; }}
    .comp-trend-flat {{ color:#f59e0b; }}
    .comp-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }}
    .comp-card {{ background:#0f172a; border-radius:6px; padding:12px; }}
    .comp-card h3 {{ font-size:12px; color:#94a3b8; margin:0 0 8px; }}
    #radar-canvas {{ width:100%; max-width:300px; height:auto; display:block; margin:0 auto; }}
    .trend-container {{ width:100%; }}
    .trend-axis {{ display:flex; justify-content:space-between; font-size:10px; color:#64748b; padding:0 18px; }}
    .timeline h3 {{ font-size:12px; color:#94a3b8; margin:0 0 8px; }}
    .timeline-scroll {{ max-height:200px; overflow-y:auto; padding:4px 0; }}
    .timeline-item {{ position:relative; padding:4px 0 4px 16px; margin-bottom:4px; }}
    .tl-dot {{ width:8px; height:8px; border-radius:50%; position:absolute; left:-4px; top:8px; }}
    .tl-content {{ display:flex; gap:8px; align-items:baseline; font-size:11px; }}
    .tl-ts {{ color:#64748b; min-width:120px; }}
    .tl-score {{ font-weight:600; min-width:50px; }}
    .tl-dims {{ color:#94a3b8; font-size:10px; }}
    .timeline-empty {{ color:#64748b; font-size:12px; padding:16px; text-align:center; }}
    .timeline-legend {{ display:flex; gap:12px; font-size:10px; color:#64748b; margin-top:8px; }}
    @@media (max-width:640px) {{ .comp-grid {{ grid-template-columns:1fr; }} }}
    </style>"""

    # D296 修复: 拼接完整视图返回 (head + 时间轴 + JS/CSS)
    return head_html + timeline_end
