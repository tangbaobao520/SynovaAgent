#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-expiry-warnings.py — D774 证据过期预警（派生清单，只预警不改判分）

一句话: 扫描证据目录，按 TTL（与 calc-progress.py EVIDENCE_TTL_DAYS=14 同语义）派生
        「已过期 / 将过期」清单（线 × 点 × 过期日），供仪表盘读取。不修改任何判分。

契约:
  @input  — --yaml（默认 docs/synova/product-lines/product-lines.yaml，取线名/点归属）
            --evidence-dir（默认 docs/synova/product-lines/evidence）
            --out（默认 docs/synova/product-lines/evidence-expiry.json）
            --today YYYY-MM-DD（测试注入；缺省取系统日期）
            --ttl-days 14（只读复用 calc 语义，不改变 calc 本身）
            --warn-days 7（将过期阈值：剩余 ≤7 天 = 下个 7 天重跑周期内会过期）
  @output — out JSON:
            { generated_at, ttl_days, warn_days, today,
              expired:  [{line, point, evidence_date, expire_date, days_over}],
              expiring: [{line, point, evidence_date, expire_date, days_left}],
              scanned_points, note }
  @degraded — yaml 解析失败 → log.error + exit 2（fail-closed，绝不静默猜）;
              单条证据记录损坏 → log.warn + 跳过（铁律 24，同 calc 语义）;
              证据目录不存在（ENOENT）= 正常默认 → 空清单 + exit 0
  @exit   — 0 成功（含空清单——无证据可预警不是错误）; 2 降级/失败
  @红线   — 本脚本只产预警数据，绝不写证据/不改 product-progress.json
            （保鲜 ≠ 改判分；判分唯一入口 = calc-progress.py）

计入 TTL 计算的证据类型（与 calc 状态机对齐）:
  machine 类 = scenario / test / ci / task_redeem（任意 verdict——最新一条 governs 新鲜度）
  k3 类 = 仅 verdict=pass（calc freshness_gate 对 k3 pass 同样 14 天）
  founder_demo 不计（calc 对演示核验无 TTL——里程碑证据永久 verified）
  注意: 预警只覆盖 TTL 时间维度; 「证据日期后 modules 有 git 变更」的失效由 calc 判，
  那类点已是 stale（在 product-progress.json 可见），不在本清单重复。
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

try:
    import productline_yaml  # noqa: E402
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import productline_yaml  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("gen-expiry-warnings")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
TTL_DEFAULT = 14  # 与 calc-progress.py:67 EVIDENCE_TTL_DAYS 同值（只读对齐，不 import 改动 calc）
WARN_DEFAULT = 7
MACHINE_TYPES = ("scenario", "test", "ci", "task_redeem")


def load_latest_dates(evidence_dir: Path):
    """点 id → 最新证据日期（machine 任意 + k3 pass）。

    ENOENT = 正常默认（空 dict）。坏记录 warn 跳过（铁律 24）。
    """
    latest: dict[str, str] = {}
    if not evidence_dir.is_dir():
        return latest
    for f in sorted(evidence_dir.glob("*.json")):
        if f.name == ".gitkeep":
            continue
        try:
            with open(f, "r", encoding="utf-8") as fh:
                rec = json.load(fh)
            if rec.get("schema") != 1:
                raise ValueError("schema != 1")
            rtype = rec.get("record_type")
            rdate = rec.get("date")
            if not rtype or not rdate:
                raise ValueError("缺 record_type/date")
        except (OSError, ValueError, json.JSONDecodeError) as e:
            log.warning("证据记录损坏，跳过: %s (%s)", f.name, e)
            continue
        for v in rec.get("verdicts", []):
            pid = v.get("acceptance_point", "")
            if not pid or pid.startswith("line:"):
                continue
            is_machine = rtype in MACHINE_TYPES
            is_k3_pass = (rtype == "k3" and v.get("verdict") == "pass")
            if not (is_machine or is_k3_pass):
                continue
            prev = latest.get(pid)
            if prev is None or rdate > prev:
                latest[pid] = rdate
    return latest


def main():
    ap = argparse.ArgumentParser(description="证据过期预警（D774，只预警不改判分）")
    ap.add_argument("--yaml", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-lines.yaml"))
    ap.add_argument("--evidence-dir", default=str(PROJECT_ROOT / "docs/synova/product-lines/evidence"))
    ap.add_argument("--out", default=str(PROJECT_ROOT / "docs/synova/product-lines/evidence-expiry.json"))
    ap.add_argument("--today", default=date.today().isoformat())
    ap.add_argument("--ttl-days", type=int, default=TTL_DEFAULT)
    ap.add_argument("--warn-days", type=int, default=WARN_DEFAULT)
    args = ap.parse_args()

    try:
        today = datetime.strptime(args.today, "%Y-%m-%d").date()
    except ValueError:
        log.error("--today 日期格式非法: %r（需 YYYY-MM-DD）", args.today)
        sys.exit(2)

    try:
        spec = productline_yaml.load_file(args.yaml)
    except productline_yaml.YamlSubsetError as e:
        log.error("YAML 解析失败: %s → exit 2（fail-closed）", e)
        sys.exit(2)

    # 点 → 线归属 + 线名（无证据的点不列——无过期可言）
    point_line, line_name = {}, {}
    for line in spec.get("lines", []):
        lid = str(line["id"])
        line_name[lid] = line.get("name", lid)
        for p in line.get("acceptance_points", []):
            point_line[p["id"]] = lid

    latest = load_latest_dates(Path(args.evidence_dir))

    expired, expiring = [], []
    scanned = 0
    for pid, ev_date_str in sorted(latest.items()):
        try:
            ev_date = datetime.strptime(ev_date_str, "%Y-%m-%d").date()
        except ValueError:
            log.warning("点 %s 证据日期非法: %r（跳过预警计算）", pid, ev_date_str)
            continue
        scanned += 1
        lid = point_line.get(pid, "?")
        expire = ev_date + timedelta(days=args.ttl_days)
        days_left = (expire - today).days
        row = {
            "line": lid,
            "line_name": line_name.get(lid, lid),
            "point": pid,
            "evidence_date": ev_date_str,
            "expire_date": expire.isoformat(),
        }
        if days_left < 0:
            row["days_over"] = -days_left
            expired.append(row)
        elif days_left <= args.warn_days:
            row["days_left"] = days_left
            expiring.append(row)

    result = {
        "generated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "schema": "evidence-expiry/1",
        "today": today.isoformat(),
        "ttl_days": args.ttl_days,
        "warn_days": args.warn_days,
        "expired": expired,
        "expiring": expiring,
        "scanned_points": scanned,
        "note": "只预警不改判分（判分唯 calc-progress.py）。expired=已过 TTL; "
                "expiring=剩余 ≤ warn_days（下个重跑周期内过期）。仅 TTL 时间维度; "
                "modules git 变更类失效由 calc 判（stale 态），不在此重复。",
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    try:
        out_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n",
                            encoding="utf-8")
    except OSError as e:
        log.error("预警清单写入失败: %s (%s)", out_path, e)
        sys.exit(2)
    log.info("预警清单: 已过期 %d / 将过期 %d / 扫描 %d 点 → %s",
             len(expired), len(expiring), scanned, out_path)
    sys.exit(0)


if __name__ == "__main__":
    main()
