#!/usr/bin/env python3
"""
emit-signal.py — D214 共享信号发射 CLI

各控制塔组件脚本（bash/Python）统一调用此工具向 .codex/signals/{component}.json 写信号。
产生的 JSON 格式与 TypeScript emitSignal() 完全一致。

用法:
  python emit-signal.py <component> <status> <reason> [--p0 N] [--p1 N] [--p2 N]

示例:
  python emit-signal.py write-lock green "lock_healthy"
  python emit-signal.py external-auditor yellow "3 P0 findings" --p0 3

契约:
  @input  — component, status(green|yellow|red), reason
  @output — .codex/signals/{component}.json
  @degraded — 目录不可写 → exit 0 + stderr（不阻断调用方）
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

SIGNALS_DIR = ".codex/signals"


def emit_signal(
    component: str,
    status: str,
    reason: str,
    p0: int = 0,
    p1: int = 0,
    p2: int = 0,
    completion_score: float = 0.0,
    deviation_list: list | None = None,
) -> None:
    """写入信号到 .codex/signals/{component}.json。不抛异常。"""
    signal = {
        "component": component,
        "status": status,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "reason": reason,
        "p0_count": p0,
        "p1_count": p1,
        "p2_count": p2,
        "completionScore": completion_score,
        "deviationList": deviation_list or [],
    }
    try:
        os.makedirs(SIGNALS_DIR, exist_ok=True)
        path = os.path.join(SIGNALS_DIR, f"{component}.json")
        # 原子写入：先写临时文件再 rename，避免 Windows 文件锁冲突
        import tempfile
        fd, tmp = tempfile.mkstemp(dir=SIGNALS_DIR, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(signal, f, indent=2, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError as e:
        print(f"[emit-signal] 警告: 信号写入失败 — {e}", file=sys.stderr)
        # 降级：不阻断调用方


def main() -> None:
    parser = argparse.ArgumentParser(description="D214 信号发射器")
    parser.add_argument("component", help="组件名称 (如 write-lock, external-auditor)")
    parser.add_argument("status", choices=["green", "yellow", "red"],
                        help="信号状态")
    parser.add_argument("reason", help="状态原因描述")
    parser.add_argument("--p0", type=int, default=0, help="P0 计数")
    parser.add_argument("--p1", type=int, default=0, help="P1 计数")
    parser.add_argument("--p2", type=int, default=0, help="P2 计数")
    parser.add_argument("--completion-score", type=float, default=0.0, help="完成度分数 0-100")
    parser.add_argument("--deviation-list", default="", help="偏差列表 JSON 字符串")

    args = parser.parse_args()
    emit_signal(args.component, args.status, args.reason,
                p0=args.p0, p1=args.p1, p2=args.p2,
                completion_score=args.completion_score,
                deviation_list=json.loads(args.deviation_list) if args.deviation_list else None)
    # 总是 exit 0 — 信号写入失败不阻碍调用方
    sys.exit(0)


if __name__ == "__main__":
    main()
