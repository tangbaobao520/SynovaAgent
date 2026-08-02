#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/staging_guard.py — D311 暂存区隔离 (M1b)

控制塔 V4.6.0 M1b: 提交前校验暂存区 — 防止 D286 卷走 D300 暂存类事故
（A session 的 git commit 把 B session 已暂存的文件一并提交）。

判定逻辑（优先级）:
  1. 暂存文件 ∈ 他人活跃 session 写集 → **block**（输出 owner 归属）
  2. 暂存文件 ∈ 自己写集 → pass
  3. 暂存文件无任何认领 → **warn**（stray_files，不硬阻断）
  4. 他人文件但已 committed → pass（忽略 committed 条目）

fail-open（铁律 24/31 + 设计文档 §2.1.5）:
  - registry 缺失/损坏 → pass + degraded 标记 + degraded-events.log，绝不静默
  - 自身异常 → exit 0 + degraded（不阻断业务）

用法:
  staging_guard.py --session-id <id> --staged <file>... [--json]
退出码: 0 = pass/warn/degraded, 1 = block
"""
import argparse
import json
import sys
from pathlib import Path
from typing import List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

from session_registry import (  # noqa: E402
    DEFAULT_DEGRADED_LOG,
    SessionRegistry,
    log_degraded,
)


def check_staging(
    reg: SessionRegistry,
    session_id: str,
    staged_files: List[str],
) -> dict:
    """校验暂存文件归属。返回 {status: pass|warn|block, ...}。

    判定优先级:
      1. 文件 ∈ 他人活跃写集（未 committed）→ block
      2. 文件 ∈ 自己写集 → pass
      3. 文件曾被他人在 registry 声明但已 committed → pass（他人已提交，不再占用）
      4. 文件无任何注册记录 → warn（stray，不硬阻断 — brief 可能过时）
      5. registry 缺失/自身异常 → degraded pass（fail-open）
    """
    result = {
        "status": "pass",
        "foreign_files": [],
        "stray_files": [],
        "degraded": False,
    }
    try:
        if not reg.registry_path.exists():
            # registry 缺失 → fail-open: pass + degraded（绝不静默）
            log_degraded(
                reg.degraded_log,
                "staging-guard",
                f"registry 缺失: {reg.registry_path}",
            )
            result["degraded"] = True
            result["degraded_reason"] = f"registry 缺失: {reg.registry_path}"
            return result
        sessions = reg.list(active_only=True)
        own_set = set()
        # 文件 → 声明过它的所有 session（含 committed，用于区分"无记录"与"已提交"）
        declared_by: dict[str, list] = {}
        for s in sessions:
            if s["session_id"] == session_id:
                for w in s.get("write_set", []):
                    if w.get("status") != "committed":
                        own_set.add(w["file"].replace("\\", "/").lower())
            for w in s.get("write_set", []):
                declared_by.setdefault(w["file"].replace("\\", "/").lower(), []).append(
                    (s["session_id"], w.get("status"))
                )

        for f in staged_files:
            norm = f.replace("\\", "/").lower()
            if norm in own_set:
                continue  # 2. 自己写集 → pass
            decls = declared_by.get(norm, [])
            # 1. 他人活跃占用（未 committed）
            active_others = [
                (sid, st) for sid, st in decls if sid != session_id and st != "committed"
            ]
            if active_others:
                owner, _ = active_others[0]
                owner_brief = None
                for s in sessions:
                    if s["session_id"] == owner:
                        owner_brief = s.get("brief")
                        break
                result["foreign_files"].append(
                    {"file": f, "owner_session": owner, "brief": owner_brief}
                )
                result["status"] = "block"
            elif decls:
                # 3. 他人在 registry 声明过但已 committed → pass
                continue
            else:
                # 4. 无任何记录 → warn
                result["stray_files"].append(f)
                if result["status"] != "block":
                    result["status"] = "warn"
    except Exception as exc:  # fail-open: 自身异常 → pass + degraded
        log_degraded(reg.degraded_log, "staging-guard", f"check error: {exc}")
        result["degraded"] = True
        result["degraded_reason"] = str(exc)
        result["status"] = "pass"
    return result


def _out(obj: dict) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    print(json.dumps(obj, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="D311 暂存区隔离校验")
    parser.add_argument("--session-id", required=True, help="当前 session id")
    parser.add_argument("--staged", nargs="*", default=[], help="暂存文件列表")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    args = parser.parse_args()

    reg = SessionRegistry()
    result = check_staging(reg, args.session_id, args.staged or [])
    _out(result)

    # block → exit 1（硬阻断）；warn/pass/degraded → exit 0
    return 1 if result["status"] == "block" else 0


if __name__ == "__main__":
    sys.exit(main())
