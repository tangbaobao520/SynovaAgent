#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/control_tower_log.py — D314 日志五件套写入器

控制塔自身日志（设计文档 §2.7）:
  - runtime.log        每次门禁/工具运行: 谁/何时/命令/结果/耗时
  - gate.log           每个 session 的 hook 调用轨迹
  - incident.log       事故记录 (schema: id/time/symptom/rootCause/sessions/fix/version)
  - degraded-events.log 控制塔自身降级事件 (兼容既有行格式 {time, component, reason})
  - version.log        VERSION.md 同步的追加流

格式: JSON Lines，单行原子追加（open "a" + flush），UTC+8 ISO8601。
fail-open: 日志目录不可写 → 静默跳过（日志不可写不阻断业务）。
UTF-8: stdout reconfigure。

用法（CLI）:
  control_tower_log.py runtime --command <cmd> --result <ok|fail> [--duration <sec>]
  control_tower_log.py gate --session <id> --action <act> [--skip 0|1] [--result <ok|fail>]
  control_tower_log.py incident --id <INC-...> --symptom <s> --root-cause <R#> --sessions <s> --fix <f> [--version <v>]
  control_tower_log.py degraded --component <c> --reason <r>
  control_tower_log.py version --version <v> --changes <c> [--incident <id>]
  支持 SYNO_CT_DIR 注入（测试隔离）。
"""
import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
CT_DIR = Path(__import__("os").environ.get("SYNO_CT_DIR", str(REPO_ROOT / ".codex" / "control-tower")))
LOGS_DIR = CT_DIR / "logs"

SCHEMA_MARKERS = {
    "runtime.log": "control-tower/logs/runtime/v1",
    "gate.log": "control-tower/logs/gate/v1",
    "incident.log": "control-tower/logs/incident/v1",
    "degraded-events.log": "control-tower/logs/degraded/v1",
    "version.log": "control-tower/logs/version/v1",
}


def _now() -> str:
    # UTC+8 ISO8601
    return datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")


def _append(log_name: str, record: dict) -> None:
    """JSON Lines 原子追加（fail-open: 不可写 → 静默跳过）。"""
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        path = LOGS_DIR / log_name
        record["schema"] = SCHEMA_MARKERS[log_name]
        record["time"] = record.get("time", _now())
        # 首行写 schema 标记（幂等）
        if not path.exists():
            path.write_text("", encoding="utf-8")
        with path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
            f.flush()
    except OSError:
        pass  # 日志不可写不阻断业务


def log_runtime(command: str, result: str, duration: float = 0.0) -> None:
    _append("runtime.log", {"command": command, "result": result, "duration": duration})


def log_gate(session: str, action: str, skip: int = 0, result: str = "ok") -> None:
    _append("gate.log", {"session": session, "action": action, "skip": skip, "result": result})


def log_incident(
    incident_id: str, symptom: str, root_cause: str,
    sessions: str, fix: str, version: str = "4.6.0",
) -> None:
    _append("incident.log", {
        "id": incident_id, "symptom": symptom, "rootCause": root_cause,
        "sessions": sessions, "fix": fix, "version": version,
    })


def log_degraded(component: str, reason: str) -> None:
    _append("degraded-events.log", {"component": component, "reason": reason})


def log_version(version: str, changes: str, incident: str = "") -> None:
    _append("version.log", {"version": version, "changes": changes, "incident": incident})


def main() -> int:
    parser = argparse.ArgumentParser(description="D314 日志五件套写入器")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_r = sub.add_parser("runtime")
    p_r.add_argument("--command", required=True)
    p_r.add_argument("--result", required=True)
    p_r.add_argument("--duration", type=float, default=0.0)

    p_g = sub.add_parser("gate")
    p_g.add_argument("--session", required=True)
    p_g.add_argument("--action", required=True)
    p_g.add_argument("--skip", type=int, default=0)
    p_g.add_argument("--result", default="ok")

    p_i = sub.add_parser("incident")
    p_i.add_argument("--id", required=True)
    p_i.add_argument("--symptom", required=True)
    p_i.add_argument("--root-cause", required=True)
    p_i.add_argument("--sessions", required=True)
    p_i.add_argument("--fix", required=True)
    p_i.add_argument("--version", default="4.6.0")

    p_d = sub.add_parser("degraded")
    p_d.add_argument("--component", required=True)
    p_d.add_argument("--reason", required=True)

    p_v = sub.add_parser("version")
    p_v.add_argument("--version", required=True)
    p_v.add_argument("--changes", required=True)
    p_v.add_argument("--incident", default="")

    args = parser.parse_args()

    if args.cmd == "runtime":
        log_runtime(args.command, args.result, args.duration)
    elif args.cmd == "gate":
        log_gate(args.session, args.action, args.skip, args.result)
    elif args.cmd == "incident":
        log_incident(args.id, args.symptom, args.root_cause, args.sessions, args.fix, args.version)
    elif args.cmd == "degraded":
        log_degraded(args.component, args.reason)
    elif args.cmd == "version":
        log_version(args.version, args.changes, args.incident)
    print("ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
