#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/incident-loop.py — D314 学习闭环

设计文档 §2.4: incident → 根因归类 → 规则生成 → 验证 → 防复发。

闭环:
  record  → incident.log 追加 + known-error-patterns.json 匹配
  suggest → 根因 R1-R4 → 机制推荐（门禁/工具/基线/文档）
  verify  → 取已闭环案例跑对应门禁于合成输入 → 被拦 = 闭环成功

根因 R1-R4（设计文档 §1.2）:
  R1 多会话共享工作区无协调
  R2 hook 与 git 操作冲突
  R3 brief 模板与解析器漂移
  R4 存量错误无基线豁免

机制映射:
  R1 → 门禁 verify-parallel.sh / staging_guard.py / wait_manager.py
  R2 → 门禁 hook-git-detect.sh（禁 stash）
  R3 → 工具 check-brief-parseable.sh / brief_parser.py
  R4 → 基线 baseline-check.sh

fail-open: incident.log 不可写 → degraded 记录不阻断。
UTF-8: stdout reconfigure。
"""
import argparse
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
INCIDENT_LOG = LOGS_DIR / "incident.log"
KNOWN_PATTERNS = REPO_ROOT / ".codex" / "audit" / "known-error-patterns.json"

ROOT_CAUSE_MAP = {
    "R1": {"label": "多会话共享工作区无协调", "mechanism": "门禁", "tools": ["verify-parallel.sh", "staging_guard.py", "wait_manager.py"]},
    "R2": {"label": "hook 与 git 操作冲突", "mechanism": "门禁", "tools": ["hook-git-detect.sh"]},
    "R3": {"label": "brief 模板与解析器漂移", "mechanism": "工具", "tools": ["check-brief-parseable.sh", "brief_parser.py"]},
    "R4": {"label": "存量错误无基线豁免", "mechanism": "基线", "tools": ["baseline-check.sh"]},
}


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())


def _load_known_patterns() -> list:
    """known-error-patterns.json（复用 completion-engine 的规则库）。"""
    try:
        return json.loads(KNOWN_PATTERNS.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []


def _match_known(symptom: str) -> list:
    """已知 pattern 匹配（symptom 与 id/name/desc/pattern 关键词双向命中）。"""
    hits = []
    s_lower = symptom.lower()
    for p in _load_known_patterns():
        text = " ".join(str(p.get(k, "")) for k in ("id", "name", "desc", "pattern")).lower()
        # 语义关键词（stash/brief/基线/并行/空构造）命中规则库，或规则 name 出现在 symptom
        semantic = {
            "stash": "stash", "brief": "brief", "模板": "brief",
            "基线": "baseline", "并行": "parallel", "空构造": "空构造",
            "构造函数": "构造函数", "类型导入": "import type",
        }
        matched = False
        for kw_s, kw_t in semantic.items():
            if kw_s in symptom and kw_t in text:
                matched = True
                break
        if matched:
            hits.append(p.get("id", "?"))
    return hits


def record(incident_id: str, symptom: str, root_cause: str,
           sessions: str, fix: str, version: str) -> dict:
    """记录 incident + 匹配已知 pattern。幂等: 同 id 不重复追加。"""
    # 幂等: 同 id 已存在 → 标注
    existing_ids = set()
    if INCIDENT_LOG.exists():
        for line in INCIDENT_LOG.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                existing_ids.add(json.loads(line).get("id", ""))
            except json.JSONDecodeError:
                pass
    if incident_id in existing_ids:
        return {"status": "duplicate", "id": incident_id}

    # D314: 复用 control_tower_log.py 写入器（五件套格式统一）
    try:
        sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))
        from control_tower_log import log_incident as _log_incident
        _log_incident(
            incident_id=incident_id, symptom=symptom, root_cause=root_cause,
            sessions=sessions, fix=fix, version=version,
        )
    except Exception:
        # 降级: 直接写（fail-open）
        record_obj = {
            "id": incident_id, "time": _now(), "symptom": symptom,
            "rootCause": root_cause, "sessions": sessions, "fix": fix, "version": version,
        }
        try:
            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            with INCIDENT_LOG.open("a", encoding="utf-8") as f:
                f.write(json.dumps(record_obj, ensure_ascii=False) + "\n")
        except OSError:
            return {"status": "degraded", "reason": "incident.log 不可写"}

    hits = _match_known(symptom)
    result = {"status": "recorded", "id": incident_id}
    if hits:
        result["known_patterns"] = hits
    return result


def suggest(root_cause: str) -> dict:
    """根因 → 机制推荐。"""
    if root_cause not in ROOT_CAUSE_MAP:
        return {"status": "unknown", "root_cause": root_cause}
    info = ROOT_CAUSE_MAP[root_cause]
    return {
        "status": "ok", "root_cause": root_cause,
        "label": info["label"], "mechanism": info["mechanism"], "tools": info["tools"],
    }


def verify(case_id: str) -> dict:
    """验证已闭环案例: 跑对应门禁于合成输入 → 被拦 = 闭环成功。"""
    if case_id == "INC-20260802-stash":
        # D312 真实闭环案例: hook-git-detect 拦截 stash
        import subprocess
        try:
            r = subprocess.run(
                ["bash", str(REPO_ROOT / "scripts/hooks/hook-git-detect.sh")],
                input='{"tool_input":{"command":"git stash"}}',
                capture_output=True, text=True, timeout=10,
            )
            out = r.stdout + r.stderr
            if "禁止" in out:
                return {"status": "closed", "case": case_id, "blocked": True,
                        "mechanism": "hook-git-detect.sh"}
            return {"status": "open", "case": case_id, "blocked": False}
        except Exception as exc:
            return {"status": "degraded", "case": case_id, "reason": str(exc)}
    return {"status": "unknown", "case": case_id}


def main() -> int:
    parser = argparse.ArgumentParser(description="D314 学习闭环")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_r = sub.add_parser("record")
    p_r.add_argument("--id", required=True)
    p_r.add_argument("--symptom", required=True)
    p_r.add_argument("--root-cause", required=True)
    p_r.add_argument("--sessions", required=True)
    p_r.add_argument("--fix", required=True)
    p_r.add_argument("--version", default="4.6.0")

    p_s = sub.add_parser("suggest")
    p_s.add_argument("--root-cause", required=True)

    p_v = sub.add_parser("verify")
    p_v.add_argument("--case", required=True)

    args = parser.parse_args()

    if args.cmd == "record":
        result = record(args.id, args.symptom, args.root_cause, args.sessions, args.fix, args.version)
    elif args.cmd == "suggest":
        result = suggest(args.root_cause)
    else:
        result = verify(args.case)
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
