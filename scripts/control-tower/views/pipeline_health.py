#!/usr/bin/env python3
"""
pipeline_health.py — V3 P0 流水线健康度视图 (D260)

读取 4 个检查点(CP1-CP4)的 JSON 输出，渲染三行摘要 HTML。
CP1: hook-block-write.sh #CRITERIA 验证结果
CP2: pre-doc-audit.sh 扩展审计结果
CP3: pre-commit-check.sh G10/G11 检查结果
CP4: D256 --dispatch 审计结果 (预留)

用法:
  python scripts/control-tower/views/pipeline_health.py          # 输出 HTML 摘要
  python scripts/control-tower/views/pipeline_health.py --json   # 输出 JSON

契约:
  @input  — .codex/checkpoints/ 下的 JSON 文件
  @output — 三行 HTML 摘要（green/yellow/red）
  @degraded — JSON 文件不存在 → 状态 'unknown'
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
CHECKPOINTS_DIR = PROJECT_ROOT / ".codex" / "checkpoints"


def load_checkpoint(name: str) -> dict:
    """读取检查点 JSON，文件不存在时返回 unknown 状态。"""
    path = CHECKPOINTS_DIR / f"{name}.json"
    if not path.exists():
        return {"name": name, "status": "unknown", "reason": "检查点未运行", "checkedAt": None}
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, dict):
            raise ValueError("not a dict")
        return data
    except (json.JSONDecodeError, ValueError, OSError) as e:
        return {"name": name, "status": "degraded", "reason": f"读取失败: {e}", "checkedAt": None}


def status_color(status: str) -> str:
    return {"pass": "#22c55e", "ok": "#22c55e",
            "partial": "#f59e0b", "warn": "#f59e0b",
            "fail": "#ef4444", "error": "#ef4444",
            "unknown": "#6b7280", "degraded": "#6b7280"}.get(status, "#6b7280")


def status_icon(status: str) -> str:
    return {"pass": "&#9679;", "ok": "&#9679;",
            "partial": "&#9679;", "warn": "&#9679;",
            "fail": "&#9679;", "error": "&#9679;",
            "unknown": "&#9678;", "degraded": "&#9678;"}.get(status, "&#9678;")


def render_health(checkpoints: list[dict]) -> str:
    """渲染三行 HTML 摘要。"""
    rows = []
    for cp in checkpoints:
        st = cp.get("status", "unknown")
        color = status_color(st)
        icon = status_icon(st)
        label = cp.get("name", "?")
        reason = cp.get("reason", "")
        detail = f" &mdash; {reason}" if reason else ""
        rows.append(
            f'<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;'
            f'border-bottom:1px solid #334155">'
            f'<span style="color:{color}">{icon}</span>'
            f'<span style="flex:1">{label}</span>'
            f'<span style="color:{color};font-size:11px">{st}{detail}</span>'
            f'</div>'
        )

    return f"""<div class="card card-full">
  <h2 style="font-size:15px;margin-bottom:8px;color:#94a3b8">流水线健康度</h2>
  {''.join(rows)}
</div>"""


def collect_health_data() -> dict:
    """聚合全部检查点数据。"""
    cps = [
        ("cp1-criteria", "CP1: 条件归属"),
        ("cp2-doc-audit", "CP2: DevDoc 审计"),
        ("cp3-commit-check", "CP3: 预提交检查"),
        ("cp4-audit-dispatch", "CP4: 审计调度"),
    ]
    checkpoints = []
    for name, label in cps:
        data = load_checkpoint(name)
        data["name"] = label
        checkpoints.append(data)
    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "checkpoints": checkpoints,
        "summary": {
            "pass": sum(1 for c in checkpoints if c.get("status") in ("pass", "ok")),
            "warn": sum(1 for c in checkpoints if c.get("status") in ("partial", "warn")),
            "fail": sum(1 for c in checkpoints if c.get("status") in ("fail", "error")),
            "unknown": sum(1 for c in checkpoints if c.get("status") in ("unknown", "degraded")),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="V3 P0 流水线健康度视图")
    parser.add_argument("--json", action="store_true", help="输出 JSON 而非 HTML")
    args = parser.parse_args()

    data = collect_health_data()
    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        print(render_health(data["checkpoints"]))


if __name__ == "__main__":
    main()
