#!/usr/bin/env python3
"""
SynovaAgent Environment Validator — D211  (env_validator.py)

Control Tower 5-component parallel deploy - item 4/5. Zero file conflicts.

Verify dev environment matches env-snapshot.json.
Solves known errors #13 (encoding) and #18 (python3 vs python).

Commands:
  snapshot   Capture environment snapshot to .codex/env-snapshot.json
  validate   Compare current env against saved snapshot -> show difference list

Flags:
  --update   before validate 前将快照更新至当前环境（创始人手动触发）

Exit codes:
  0  Environment consistent or only degraded skips
  1  Environment inconsistent with non-degraded differences

Referenced from: 权威文档 #17 第六章 — Environment Validator
                  AGENTS.md Iron Law 0-5 错误 #13 / #18
                  AGENTS.md 铁律 35（自动化优先）
"""

# ═══ Standard lib (zero external deps - platform compatible) ═══

import argparse
import datetime
import json
import os
import platform
import subprocess
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass
import textwrap


# ═══ Constants ═══

SNAPSHOT_VERSION = "1.0"
SNAPSHOT_PATH = ".codex/env-snapshot.json"
TIMEOUT_SEC = 15

# Check definitions: (field path, severity)
# severity = 'error'（blocking)/ 'warning'（warning only)
CHECK_DEFINITIONS: list[tuple[str, str]] = [
    ("system.os", "error"),
    ("system.encoding", "error"),
    ("node.version", "error"),
    ("npm.version", "warning"),
    ("python.version", "warning"),
    ("git.version", "error"),
    ("typescript.version", "warning"),
    ("hooks.pre_commit", "error"),
    ("hooks.post_commit", "warning"),
]


# ═══ Utility functions ═══


def _run_cmd(cmd: list[str], timeout: int = TIMEOUT_SEC) -> str | None:
    """Run command, return stdout.strip() or None.

    Windows compat: npm/npx .cmd files need shell=True to find in PATH.
    """
    try:
        # Windows: shell=True to find npm.cmd / npx.cmd in PATH
        use_shell = sys.platform == "win32" and cmd[0] in ("npm", "npx")
        if use_shell:
            cmd_str = " ".join(cmd)
            r = subprocess.run(
                cmd_str, capture_output=True, text=True, timeout=timeout, shell=True,
            )
        else:
            r = subprocess.run(
                cmd, capture_output=True, text=True, timeout=timeout,
            )
        return r.stdout.strip() if r.returncode == 0 else None
    except (FileNotFoundError, subprocess.TimeoutExpired, OSError):
        return None


# ═══ EnvValidator - Core Class ═══


class EnvValidator:
    """Environment Validator — Collect 7indicators + 对比快照。"""

    # --─ Collection methods (each can independently fail -> degraded) --─

    @staticmethod
    def _collect_system() -> dict:
        return {
            "os": platform.system(),
            "release": platform.release(),
            "encoding": sys.getdefaultencoding(),
        }

    @staticmethod
    def _collect_node() -> dict:
        node_v = _run_cmd(["node", "--version"])
        npm_v = _run_cmd(["npm", "--version"])
        return {"version": node_v or "", "npm_version": npm_v or ""}

    @staticmethod
    def _collect_python() -> dict:
        return {
            "version": sys.version.split()[0] if sys.version else "",
            "executable": sys.executable or "",
        }

    @staticmethod
    def _collect_git() -> dict:
        v = _run_cmd(["git", "--version"])
        return {"version": v or ""}

    @staticmethod
    def _collect_typescript() -> dict:
        # Try local tsc first, fallback to npx
        v = _run_cmd(["node_modules/.bin/tsc", "--version"])
        if v is None:
            v = _run_cmd(["npx", "tsc", "--version"])
        return {"version": v or ""}

    @staticmethod
    def _collect_hooks() -> dict:
        return {
            "pre_commit": os.path.isfile(".git/hooks/pre-commit"),
            "post_commit": os.path.isfile(".git/hooks/post-commit"),
        }

    # --─ Snapshot generation --─

    def snapshot(self) -> dict:
        """Collect 7 env metrics, return snapshot dict."""
        return {
            "version": SNAPSHOT_VERSION,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "system": self._collect_system(),
            "node": self._collect_node(),
            "python": self._collect_python(),
            "git": self._collect_git(),
            "typescript": self._collect_typescript(),
            "hooks": self._collect_hooks(),
        }

    # --─ Snapshot I/O --─

    @staticmethod
    def read_snapshot(path: str = SNAPSHOT_PATH) -> dict | None:
        """Read snapshot file. Returns None if corrupted."""
        if not os.path.isfile(path):
            return None
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except (json.JSONDecodeError, OSError):
            return None

    @staticmethod
    def write_snapshot(data: dict, path: str = SNAPSHOT_PATH) -> None:
        """Write snapshot file. 原子写入避免 Windows 文件锁冲突。"""
        import tempfile
        d = os.path.dirname(path)
        os.makedirs(d, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(tmp, path)

    # --─ Validation --─

    def validate_against(self, snap: dict) -> dict:
        """Compare current env against saved snapshot snap，返回Validation报告。

        @input  snap - snapshot dict (returned by read_snapshot)
        @output dict — Validation报告（.ok / .differences / .failed_checks）
        @degraded — degraded=true when tool unavailable, skip without blocking
        """
        current = self.snapshot()
        diffs: list[dict] = []

        def _get(obj: dict, dotted: str) -> str:
            parts = dotted.split(".")
            v: object = obj
            for p in parts:
                if isinstance(v, dict):
                    v = v.get(p, "")
                else:
                    return ""
            return str(v) if v is not None else ""

        for field, severity in CHECK_DEFINITIONS:
            expected = _get(snap, field)
            actual = _get(current, field)
            if expected != actual:
                # Empty string = tool unavailable = degraded skip
                degraded = not bool(actual)
                diffs.append({
                    "field": field,
                    "expected": expected,
                    "actual": actual,
                    "severity": severity,
                    "degraded": degraded,
                })

        total = len(CHECK_DEFINITIONS)
        failed = sum(1 for d in diffs if not d["degraded"])
        degraded_count = sum(1 for d in diffs if d["degraded"])
        passed = total - len(diffs)

        return {
            "ok": failed == 0,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "total_checks": total,
            "passed_checks": passed,
            "failed_checks": failed,
            "degraded_skips": degraded_count,
            "differences": diffs,
        }


# ═══ Output formatting ═══


def format_report(report: dict) -> str:
    """格式化的Validation报告文本。"""
    lines: list[str] = []
    ok = report.get("ok", False)
    lines.append("=" * 58)
    lines.append("  SynovaAgent Environment Validation Report - D211")
    lines.append("=" * 58)
    lines.append(f"  Result:       {'[PASS] Consistent' if ok else '[FAIL] Inconsistent'}")
    lines.append(f"  Total Checks: {report.get('total_checks', 0)}")
    lines.append(f"  Passed:       {report.get('passed_checks', 0)}")
    lines.append(f"  Failed:       {report.get('failed_checks', 0)}")
    lines.append(f"  Degraded Skips:   {report.get('degraded_skips', 0)}")

    diffs = report.get("differences", [])
    if diffs:
        lines.append("")
        lines.append("  -- Differences --")
        for d in diffs:
            icon = "[WARN]" if d.get("degraded") else "[FAIL]"
            degraded_tag = " (degraded, skipped)" if d.get("degraded") else ""
            lines.append(f"  {icon} {d.get('field', '?')}{degraded_tag}")
            lines.append(f"      Expected: {d.get('expected', '')}")
            lines.append(f"      Actual: {d.get('actual', '')}")
            lines.append(f"      Severity: {d.get('severity', 'warning')}")
    lines.append("=" * 58)
    return "\n".join(lines)


# ═══ CLI Entry ═══


def _emit_signal(status: str, reason: str, p0: int = 0) -> None:
    """D214 信号发射 (委托 emit-signal.py，原子写入)"""
    import subprocess
    try:
        script = os.path.join(os.path.dirname(__file__), "emit-signal.py")
        subprocess.run([sys.executable, script, "env-validator", status, reason,
                       "--p0", str(p0)], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass  # 降级


def build_parser() -> argparse.ArgumentParser:
    """Build argument parser."""
    parser = argparse.ArgumentParser(
        prog="env_validator.py",
        description="SynovaAgent Environment Validator (D211) - Collect/Compare 7 env indicators",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=textwrap.dedent("""\
            Commands:
              snapshot  Capture environment snapshot to .codex/env-snapshot.json
              validate  Compare current env against saved snapshot -> show difference list

            Flags:
              --update  Update snapshot then validate

            Exit codes:
              0  Environment consistent or only degraded skips
              1  Environment inconsistent with non-degraded differences

            Examples:
              python env_validator.py snapshot
              python env_validator.py validate
              python env_validator.py validate --update
        """),
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=["snapshot", "validate"],
        help="snapshot | validate",
    )
    parser.add_argument(
        "--update",
        action="store_true",
        help="Update snapshot to current env before validate",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    validator = EnvValidator()

    # --─ snapshot 命令 --─
    if args.command == "snapshot":
        snap = validator.snapshot()
        EnvValidator.write_snapshot(snap)
        print(f"[OK] Snapshot written to {SNAPSHOT_PATH}")
        print(f"      Sections: version / system / node / python / git / typescript / hooks")
        _emit_signal("green", "snapshot_taken")
        return

    # --─ validate 命令 --─
    if args.command == "validate":
        # --update Flags: 先拍照再Validation
        if args.update:
            snap = validator.snapshot()
            EnvValidator.write_snapshot(snap)
            print(f"[OK] Snapshot updated to current environment")
            print()

        snap = EnvValidator.read_snapshot()
        if snap is None:
            _emit_signal("red", "snapshot_missing")
            print(
                f"[FAIL]  Snapshot file missing or corrupted ({SNAPSHOT_PATH})。\n"
                "   Run `python env-validator.py snapshot`。",
                file=sys.stderr,
            )
            sys.exit(1)

        report = validator.validate_against(snap)
        print(format_report(report))
        if report.get("ok", False):
            _emit_signal("green", "environment_consistent")
            sys.exit(0)
        else:
            failed = report.get("failed_checks", 0)
            _emit_signal("red", f"{failed}_checks_inconsistent", p0=failed)
            sys.exit(1)

    # --─ No command -> help --─
    parser.print_help()


if __name__ == "__main__":
    main()
