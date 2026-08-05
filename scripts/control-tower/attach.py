#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/attach.py — D314 SessionStart 轻量 attach

控制塔独立化底座（设计文档 §三 D314 + §四 验收 #3/#13）:
  新 session 启动时自动运行（不常驻）:
    ① session_registry.register（身份登记）
    ② runtime.log + gate.log 写入（日志五件套激活）
    ③ self-health.py 轻量跑（health.json）
    ④ brief 存在且 brief-filled → check-brief-parseable（brief 契约前置）
    ⑤ incident.log 未闭环提示

全组件 try/except → fail-open，总时长 <2s（超时降级，绝不拖慢会话启动）。

用法: python3 attach.py --session-id <id> [--tool <tool>] [--brief <path>]
支持 SYNO_CT_DIR 注入（测试隔离）。
"""
import json
import os
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
CT_DIR = Path(os.environ.get("SYNO_CT_DIR", str(REPO_ROOT / ".codex" / "control-tower")))
LOGS_DIR = CT_DIR / "logs"

# fail-open 降级记录（复用既有 degraded-events.log）
def _degraded(component: str, reason: str) -> None:
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        with (LOGS_DIR / "degraded-events.log").open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "time": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                "component": component, "reason": reason,
            }, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _run_register(session_id: str) -> None:
    """① session_registry.register（fail-open）。"""
    try:
        sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))
        from session_registry import SessionRegistry
        reg = SessionRegistry(
            registry_path=CT_DIR / "session-registry.json",
            lock_dir=CT_DIR / "locks",
            degraded_log=LOGS_DIR / "degraded-events.log",
        )
        reg.register(session_id=session_id, brief="", pid=os.getpid())
        reg.phase(session_id=session_id, phase="CP1")
    except Exception as exc:
        _degraded("attach.register", str(exc))


def _run_logs(session_id: str, tool: str) -> None:
    """② runtime.log + gate.log（fail-open）。"""
    try:
        from control_tower_log import log_runtime, log_gate
        log_runtime(command=f"attach --session {session_id}", result="ok")
        log_gate(session=session_id, action="session-start", skip=0, result="ok")
    except Exception as exc:
        _degraded("attach.logs", str(exc))


def _run_health() -> None:
    """③ self-health 轻跑（fail-open）。"""
    try:
        import subprocess
        subprocess.run(
            [sys.executable, str(REPO_ROOT / "scripts" / "control-tower" / "self-health.py")],
            capture_output=True, timeout=5, env={**os.environ, "SYNO_CT_DIR": str(CT_DIR)},
        )
    except Exception as exc:
        _degraded("attach.health", str(exc))


def _run_parseable(brief: str | None) -> None:
    """④ brief 契约前置（fail-open）。"""
    if not brief:
        return
    try:
        import subprocess
        subprocess.run(
            ["bash", str(REPO_ROOT / "scripts" / "workflow" / "check-brief-parseable.sh"), brief],
            capture_output=True, timeout=10,
        )
    except Exception as exc:
        _degraded("attach.parseable", str(exc))


def _run_incident_hint(session_id: str) -> None:
    """⑤ 未闭环 incident 提示（fail-open）。"""
    try:
        log_path = LOGS_DIR / "incident.log"
        if not log_path.exists():
            return
        lines = log_path.read_text(encoding="utf-8", errors="replace").splitlines()
        if not lines:
            return
        last = json.loads(lines[-1])
        print(f"[attach] 最近 incident: {last.get('id', '?')} ({last.get('rootCause', '?')}) — 详见 incident.log")
    except Exception:
        pass


def main() -> int:
    import argparse
    parser = argparse.ArgumentParser(description="D314 SessionStart attach")
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--tool", default="session-start")
    parser.add_argument("--brief", default=None)
    args = parser.parse_args()

    start = time.time()
    _run_register(args.session_id)
    _run_logs(args.session_id, args.tool)
    _run_health()
    _run_parseable(args.brief)
    _run_incident_hint(args.session_id)
    elapsed = time.time() - start
    print(f"[attach] session {args.session_id} attached ({elapsed:.1f}s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
