#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
evidence-writer.py — 机器验证入库（设计 v1.4 §5.3 A2）

一句话: CI/场景跑完把结果写成证据记录，供 calc-progress.py 消费。

契约:
  @input  — 命令行: --type ci|scenario|test|founder_demo
            --date YYYY-MM-DD --verdict pass|fail --points "7-1,9-2"
            --source 来源说明（CI job 名 / 场景脚本路径）[--quote 佐证] [--out-dir]
            [--machine 机器标识 — 缺省按平台推断: darwin→mac / windows→win / linux→linux；
             可用环境变量 SYNO_MACHINE 覆盖]
  @output — <out-dir>/<type>-<date>-<machine>[-n].json（证据记录，schema=1；
            同日/同类/同机递增序号防覆盖）；记录内含 machine 字段
  @degraded — 参数非法 → log.error + exit 2；out-dir 不可写 → log.error + exit 2
              （fail-closed：证据写不进去绝不当成功——铁律 11/24）；
              机器标识非法（含无法归一为 ASCII 记号）→ log.error + exit 2
  @exit   — 0 成功；2 参数/IO 失败

证据规则: 证据必须可复核——source/quote 写明"哪里来的、怎么重跑"。
          本脚本只写机器事实，不写"声称"（无对应运行结果的 verdict 拒绝写入）。

D726（双机撞车修复）: 文件名曾为 `<type>-<date>[-n]`，而 `-n` 只在**本地目录**内递增 →
  Mac 与 Win 同日跑同类型场景，各自产出 `<type>-<date>.json` → 合并（PR/pull）时同名相撞，
  一方被覆盖或产生冲突。加机器维度后两机产物天然不同名；不同机器跑同一机（罕见）仍靠 `-n` 兜底。
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import platform
import re
import sys
from datetime import datetime
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("evidence-writer")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
VALID_TYPES = ("ci", "scenario", "test", "founder_demo")
VALID_VERDICTS = ("pass", "fail")

# D726: 平台 → 机器标识（仓库既有惯例 mac/win，见 evidence/D712-mac-20260913/ 等目录命名）
_PLATFORM_MACHINE = {"darwin": "mac", "windows": "win", "linux": "linux"}
_MACHINE_TOKEN_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*$")


def normalize_machine(raw):
    """机器标识归一化。非法（归一后为空或不符合 token 规则）→ None（调用方 fail-closed）。

    @input  — raw: 任意字符串（CLI --machine / 环境变量 / 平台推断值）
    @output — 小写 ASCII 记号（如 mac/win/linux/ci-runner-2），非法时 None
    """
    token = re.sub(r"[^a-z0-9._-]", "-", str(raw).strip().lower()).strip("-._")
    if not token or not _MACHINE_TOKEN_RE.match(token):
        return None
    return token


def detect_machine():
    """机器标识: 显式 --machine > 环境变量 SYNO_MACHINE > 平台推断。

    @output — 归一化后的机器记号（永不为空；未知平台回退 'unknown'）
    """
    for candidate in (os.environ.get("SYNO_MACHINE"), platform.system()):
        if not candidate:
            continue
        token = normalize_machine(_PLATFORM_MACHINE.get(str(candidate).strip().lower(),
                                                         candidate))
        if token:
            return token
    return "unknown"


def write_evidence(rec_type, date, verdict, points, source, quote, out_dir, machine=None):
    if rec_type not in VALID_TYPES:
        log.error("非法证据类型: %r（可选 %s）", rec_type, "/".join(VALID_TYPES))
        sys.exit(2)
    if verdict not in VALID_VERDICTS:
        log.error("非法结论: %r（可选 pass/fail）", verdict)
        sys.exit(2)
    try:
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        log.error("日期格式非法: %r（需 YYYY-MM-DD）", date)
        sys.exit(2)
    pts = [p.strip() for p in points.split(",") if p.strip()]
    if not pts:
        log.error("--points 为空（至少一个验收点 id，如 7-1）")
        sys.exit(2)
    if rec_type == "founder_demo" and not quote:
        log.error("创始人核验证据必须附演示记录（--quote 填记录路径）——防空壳核验")
        sys.exit(2)
    # D726: 机器维度 —— 显式传入非法值必须显式拒绝（不静默回退到平台值，铁律 11）
    if machine is None:
        machine = detect_machine()
    else:
        normalized = normalize_machine(machine)
        if not normalized:
            log.error("机器标识非法: %r（需 ASCII 记号，如 mac / win / linux / ci-runner-2）",
                      machine)
            sys.exit(2)
        machine = normalized

    out_dir = Path(out_dir)
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        log.error("证据目录不可写: %s (%s)", out_dir, e)
        sys.exit(2)

    # D726: 文件名加机器维度（<type>-<date>-<machine>[-n]）——双机同日同类不再撞名。
    #   保留 <type>-<date>* 前缀，既有 glob 与 verify 命令（如 scenario-2026-09-13*.json）不受影响。
    base = "%s-%s-%s" % (rec_type, date, machine)
    n = 0
    target = out_dir / ("%s.json" % base)
    while target.exists():
        n += 1
        target = out_dir / ("%s-%d.json" % (base, n))

    record = {
        "schema": 1,
        "record_type": rec_type,
        "machine": machine,
        "source": source,
        "date": date,
        "written_by": "evidence-writer.py",
        "verdicts": [
            {"acceptance_point": p, "verdict": verdict, "quote": quote} for p in pts
        ],
    }
    try:
        target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
    except OSError as e:
        log.error("证据写入失败: %s (%s)", target, e)
        sys.exit(2)
    log.info("已写入证据: %s（%s / %s / %d 个验收点 / 结论=%s）",
             target, rec_type, machine, len(pts), verdict)
    return target


def main():
    ap = argparse.ArgumentParser(description="机器验证入库（A2）")
    ap.add_argument("--type", required=True, help="ci|scenario|test|founder_demo")
    ap.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"))
    ap.add_argument("--verdict", required=True, choices=["pass", "fail"])
    ap.add_argument("--points", required=True, help="逗号分隔验收点 id，如 7-1,9-2")
    ap.add_argument("--source", required=True, help="来源（CI job / 场景脚本路径）")
    ap.add_argument("--quote", default="", help="佐证（日志/断言输出/演示记录路径）")
    ap.add_argument("--machine", default=None,
                    help="机器标识（缺省按平台推断: mac/win/linux；环境变量 SYNO_MACHINE 可覆盖）")
    ap.add_argument("--out-dir", default=str(PROJECT_ROOT / "docs/synova/product-lines/evidence"))
    args = ap.parse_args()
    write_evidence(args.type, args.date, args.verdict, args.points, args.source,
                   args.quote, args.out_dir, args.machine)
    sys.exit(0)


if __name__ == "__main__":
    main()
