#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/wait_manager.py — D311 并行等待管理 (M1c)

控制塔 V4.6.0 M1c: 并行 session 的协调提示 — 阶段管理（CP1-CP4 交接点框架）、
错峰提示（他 session 在 CP3 验证 → 建议等待）、依赖提示（写集重叠 →
先协调再验证）、等待显式化（每条提示带建议动作）。

fail-open（铁律 24/31）: registry 缺失/损坏 → 空状态 + degraded 标记，
绝不静默。

用法:
  wait_manager.py phase --session-id <id> --phase <CP1|CP2|CP3|CP4|DONE>
  wait_manager.py status [--session-id <id>] [--json]
退出码: 0 = ok（提示是信息不是阻断）
"""
import argparse
import json
import sys
from pathlib import Path
from typing import Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

from session_registry import SessionRegistry  # noqa: E402

VALID_PHASES = ("CP1", "CP2", "CP3", "CP4", "DONE")


def set_phase(reg: SessionRegistry, session_id: str, phase: str) -> dict:
    """更新阶段（CP1-CP4/DONE）。回退允许（警告记录在返回中）。"""
    if phase not in VALID_PHASES:
        raise ValueError(f"非法阶段: {phase} (合法: {VALID_PHASES})")
    s = reg.get(session_id)
    rollback = False
    if s is not None:
        current = s.get("phase")
        order = {p: i for i, p in enumerate(VALID_PHASES)}
        if current and order.get(phase, 0) < order.get(current, 0):
            rollback = True
    result = reg.phase(session_id, phase)
    if rollback:
        result["rollback_warned"] = True
    return result


def status(reg: SessionRegistry, session_id: Optional[str] = None) -> dict:
    """输出并行协调状态：活跃 session 列表 + 提示（错峰/依赖）。"""
    result = {
        "status": "ok",
        "active_sessions": [],
        "hints": [],
        "degraded": False,
    }
    try:
        sessions = reg.list(active_only=True)
        result["active_sessions"] = [
            {
                "session_id": s["session_id"],
                "brief": s.get("brief"),
                "phase": s.get("phase"),
                "phase_entered_at": s.get("phase_entered_at"),
                "write_set_size": len(s.get("write_set", [])),
            }
            for s in sessions
        ]

        me = None
        for s in sessions:
            if s["session_id"] == session_id:
                me = s
                break

        for s in sessions:
            sid = s["session_id"]
            if me is not None and sid == session_id:
                continue
            # 错峰提示: 他 session 在 CP3 验证中
            if s.get("phase") == "CP3":
                result["hints"].append(
                    {
                        "type": "stagger",
                        "session": sid,
                        "message": f"{sid} 正在 CP3 验证（{s.get('phase_entered_at', '?')} 开始）→ 建议等待或先做文档类任务",
                        "action": "等待其提交，或并行做文档/研究类工作",
                    }
                )
            # 依赖提示: 写集重叠
            if me is not None:
                my_files = {w["file"].replace("\\", "/").lower() for w in me.get("write_set", [])}
                their_files = {
                    w["file"].replace("\\", "/").lower()
                    for w in s.get("write_set", [])
                }
                overlap = my_files & their_files
                if overlap:
                    result["hints"].append(
                        {
                            "type": "dependency",
                            "session": sid,
                            "message": f"与 {sid} 共享文件: {', '.join(sorted(overlap))} → 先协调边界再验证",
                            "action": "先提交共享文件，或与对方 session 协调边界",
                        }
                    )
    except Exception as exc:  # fail-open
        from session_registry import log_degraded

        log_degraded(reg.degraded_log, "wait-manager", f"status error: {exc}")
        result["degraded"] = True
        result["degraded_reason"] = str(exc)
    return result


def _out(obj: dict) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    print(json.dumps(obj, ensure_ascii=False, indent=2))


def main() -> int:
    parser = argparse.ArgumentParser(description="D311 并行等待管理")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ph = sub.add_parser("phase")
    p_ph.add_argument("--session-id", required=True)
    p_ph.add_argument("--phase", required=True, choices=list(VALID_PHASES))

    p_st = sub.add_parser("status")
    p_st.add_argument("--session-id", default=None)
    p_st.add_argument("--json", action="store_true")

    args = parser.parse_args()
    reg = SessionRegistry()

    try:
        if args.cmd == "phase":
            result = set_phase(reg, args.session_id, args.phase)
        else:
            result = status(reg, args.session_id)
        _out(result)
        return 0
    except (ValueError, OSError) as exc:
        from session_registry import log_degraded

        log_degraded(reg.degraded_log, "wait-manager", f"{args.cmd} error: {exc}")
        _out({"status": "degraded", "reason": str(exc), "degraded": True})
        return 0


if __name__ == "__main__":
    sys.exit(main())
