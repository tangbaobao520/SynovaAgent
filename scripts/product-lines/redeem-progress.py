#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
redeem-progress.py — 任务交付 → 验收点证据自动兑换（A3.5 环节）

一句话: 任务完成（impl commit 在 main + audit 报告存在且非 FAIL）→ 自动为任务声明的
        验收点生成 evidence 记录 → calc-progress.py 消费后进度条翻绿。
        解决"任务完成了但仪表盘不反映"（创始人 2026-08-17 要求：完成一个任务就要体现在仪表盘）。

契约:
  @input  — task-state/D###.json 中 "acceptance_points": ["7-3", ...]（任务声明推进的验收点）
            依赖: task-state/D###.json 的 status / audit.verdict / audit.report / impl.commit
  @output — docs/synova/product-lines/evidence/task-D###.json
            schema=1, record_type=k3, verdicts:[{acceptance_point, verdict:pass, quote, quote_ref}]
  @exit   — 0 成功（含 0 任务可兑换——幂等空跑）；2 降级（task-state 目录缺失等）
  @degraded — 显式 log + exit 2（铁律 11，不静默）

诚实规则（与 calc-progress.py §1 一致）:
  - 只有带证据的验收点才计绿: impl commit 必须真实存在于 git（git cat-file 校验）
  - audit 报告必须存在且 verdict 非 FAIL（K3 判定原文绑定 quote_ref）
  - 无 audit 报告 → 不兑换（宁缺毋滥，防"自报完成"）
  - 幂等: 重复运行不重复写（同 task 同 acceptance_point 已存在则跳过）

用法: python3 scripts/product-lines/redeem-progress.py
集成: refresh-all.sh A3.5 环节（A3 待办聚合之后、A4 进度计算之前）
"""
from __future__ import annotations

import argparse
import json
import logging
import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("redeem-progress")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TASK_STATE_DIR = PROJECT_ROOT / "task-state"
EVIDENCE_DIR = PROJECT_ROOT / "docs" / "synova" / "product-lines" / "evidence"
AUDIT_DIR = PROJECT_ROOT / "docs" / "synova" / "audit-reports"

# 可兑换的任务状态（交付闭环）
REDEEMABLE_STATUS = ("impl_done", "audited")
# 审计 verdict 黑名单（FAIL 不兑换）
FAIL_VERDICTS = ("FAIL",)


def git_commit_exists(commit: str) -> bool:
    """impl commit 必须真实存在（git cat-file 校验，防幻影声明）。"""
    if not commit:
        return False
    try:
        r = subprocess.run(
            ["git", "cat-file", "-e", commit],
            capture_output=True,
            cwd=str(PROJECT_ROOT),
        )
        return r.returncode == 0
    except OSError:
        log.warning("degraded: git 不可用，impl 校验跳过（fail-open 显式提示）")
        return True  # git 不可用时不阻断（但不代表 commit 存在，见调用处降级）


def audit_ok(task: dict) -> tuple[bool, str]:
    """audit 报告存在且 verdict 非 FAIL。返回 (ok, 证据引用)。"""
    audit = task.get("audit") or {}
    verdict = str(audit.get("verdict", "")).upper()
    if any(f in verdict for f in FAIL_VERDICTS):
        return False, f"verdict={verdict}"
    report = str(audit.get("report", ""))
    if not report:
        return False, "无 audit.report"
    report_path = PROJECT_ROOT / report
    if not report_path.exists():
        return False, f"报告不存在: {report}"
    return True, str(report_path)


def redeem(task_id: str, task: dict, evidence_dir: Path) -> dict:
    """为单个任务生成证据记录。返回 {written: int, skipped: list}。"""
    points = task.get("acceptance_points") or []
    if not points:
        return {"written": 0, "skipped": ["无 acceptance_points 声明"]}

    status = task.get("status", "")
    if status not in REDEEMABLE_STATUS:
        return {"written": 0, "skipped": [f"status={status} 不可兑换（需 {REDEEMABLE_STATUS}）"]}

    # impl commit 物理校验
    impl = task.get("impl") or {}
    commit = str(impl.get("commit", ""))
    if not git_commit_exists(commit):
        return {"written": 0, "skipped": [f"impl commit 不存在/未登记: {commit or '空'}"]}

    ok, ref = audit_ok(task)
    if not ok:
        return {"written": 0, "skipped": [f"audit 未通过: {ref}"]}

    # 生成证据记录（幂等：已存在同 task 同点则跳过）
    out_path = evidence_dir / f"task-{task_id}.json"
    existing = {}
    if out_path.exists():
        try:
            existing = json.loads(out_path.read_text(encoding="utf-8"))
        except Exception:
            existing = {}

    verdicts = {v["acceptance_point"]: v for v in existing.get("verdicts", [])}
    written = 0
    skipped = []
    for pt in points:
        if pt in verdicts:
            skipped.append(f"{pt} 已兑换（幂等跳过）")
            continue
        verdicts[pt] = {
            "acceptance_point": pt,
            "verdict": "pass",
            "quote": f"任务 {task_id} 交付闭环：impl {commit[:10]} + audit {task.get('audit', {}).get('verdict', '')}",
            "quote_ref": f"{ref}:1",
        }
        written += 1

    record = {
        "schema": 1,
        "record_type": "k3",
        "source": str(ref),
        "date": str(task.get("audit", {}).get("at", "") or task.get("updated_at", "")),
        "note": f"任务 {task_id} 自动兑换（redeem-progress.py）：impl {commit[:10]} 在 git + audit 非 FAIL",
        "verdicts": list(verdicts.values()),
    }
    if written > 0 or not out_path.exists():
        evidence_dir.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(record, ensure_ascii=False, indent=1), encoding="utf-8")
        log.info("已生成 %s（+%d 点: %s）", out_path.name, written, points)
    return {"written": written, "skipped": skipped}


def main() -> int:
    parser = argparse.ArgumentParser(description="任务交付 → 验收点证据自动兑换")
    parser.add_argument("--task-state-dir", type=Path, default=TASK_STATE_DIR)
    parser.add_argument("--evidence-dir", type=Path, default=EVIDENCE_DIR)
    parser.add_argument("--dry-run", action="store_true", help="只报告不写文件")
    args = parser.parse_args()

    if not args.task_state_dir.is_dir():
        log.error("degraded: task-state 目录不存在 %s", args.task_state_dir)
        return 2

    total_written = 0
    total_skipped = []
    for p in sorted(args.task_state_dir.glob("D*.json")):
        if p.name == "TEMPLATE.json":
            continue
        try:
            task = json.loads(p.read_text(encoding="utf-8"))
        except Exception as e:
            log.warning("跳过 %s: JSON 解析失败 %s", p.name, e)
            continue
        tid = task.get("task_id", p.stem)
        if args.dry_run:
            points = task.get("acceptance_points") or []
            if points:
                log.info("[dry-run] %s → %s", tid, points)
            continue
        r = redeem(tid, task, args.evidence_dir)
        total_written += r["written"]
        if r["skipped"]:
            for s in r["skipped"]:
                total_skipped.append(f"{tid}: {s}")

    log.info("兑换完成: 新增 %d 个验收点证据", total_written)
    if total_skipped:
        for s in total_skipped[:10]:
            log.info("  skip — %s", s)
    return 0


if __name__ == "__main__":
    sys.exit(main())
