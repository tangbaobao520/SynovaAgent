#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
parse-k3-report.py — 审计报告 JSON 解析（设计 v1.4 §5.3 A6）

一句话: 审计报告 JSON 双轨输出落地后（权威文档18 D347/D349），自动把审计判定写入证据记录，
        进度状态机直接消费——无需人工登记"审计员说过了什么"。

契约:
  @input  — docs/synova/audit-reports/*.json（审计报告 JSON 双轨产物）
            期望 schema（D347/D349 落地前的约定，可演化）:
              { "report_id": str, "date": "YYYY-MM-DD",
                "verdicts": [ {"acceptance_point": "7-1", "verdict": "pass"|"fail",
                               "quote": "...", "quote_ref": "..."} ] }
  @output — docs/synova/product-lines/evidence/k3-<report_id>.json（证据记录，schema=1）
  @degraded — 无 JSON 报告 → log.warning + exit 2（显式降级：当前为人工登记路径，
              见设计 v1.4 §十"降级路径先通"——绝不静默当作"没有审计判定"）；
              报告 JSON 结构非法 → log.error + exit 2（fail-closed）。
  @exit   — 0 成功解析 ≥1 份；2 降级（无报告/解析失败）

红线: 本脚本只解析审计产物的 JSON 外壳，不编写审计标准、不替审计员下结论。
      报告内容字段原样搬运，判定结果以报告原文为准。
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("parse-k3-report")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def parse_reports(audit_dir: Path, out_dir: Path):
    json_reports = sorted(audit_dir.glob("*.json")) if audit_dir.is_dir() else []
    if not json_reports:
        log.warning("degraded: 无审计报告 JSON（双轨输出 D347/D349 未落地）——"
                    "当前走人工登记路径（证据记录由 Harness 从报告原文登记，见 k3-full-chain-20260813.json）")
        return 2

    written = 0
    degraded = []
    for rep in json_reports:
        try:
            data = json.loads(rep.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as e:
            degraded.append("报告 JSON 损坏: %s (%s)" % (rep.name, e))
            continue
        if not isinstance(data, dict) or "date" not in data or "verdicts" not in data:
            degraded.append("报告结构非法（缺 date/verdicts）: %s" % rep.name)
            continue
        verdicts = []
        for v in data["verdicts"]:
            if not isinstance(v, dict) or "acceptance_point" not in v or "verdict" not in v:
                degraded.append("报告 %s 含非法判定行，跳过该行" % rep.name)
                continue
            verdicts.append({
                "acceptance_point": v["acceptance_point"],
                "verdict": v["verdict"] if v["verdict"] in ("pass", "fail") else "fail",
                "quote": v.get("quote", ""),
                "quote_ref": v.get("quote_ref", rep.name),
            })
        record = {
            "schema": 1,
            "record_type": "k3",
            "source": str(rep.relative_to(PROJECT_ROOT))
                     if str(rep).startswith(str(PROJECT_ROOT)) else str(rep),
            "date": data["date"],
            "written_by": "parse-k3-report.py",
            "verdicts": verdicts,
        }
        out_dir.mkdir(parents=True, exist_ok=True)
        target = out_dir / ("k3-%s.json" % (data.get("report_id") or rep.stem))
        target.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")
        log.info("已解析: %s → %s（%d 条判定）", rep.name, target, len(verdicts))
        written += 1

    if degraded:
        for d in degraded:
            log.warning("degraded: %s", d)
    if written == 0:
        return 2
    return 0


def main():
    ap = argparse.ArgumentParser(description="审计报告 JSON 解析（A6）")
    ap.add_argument("--audit-dir", default=str(PROJECT_ROOT / "docs/synova/audit-reports"))
    ap.add_argument("--out-dir", default=str(PROJECT_ROOT / "docs/synova/product-lines/evidence"))
    args = ap.parse_args()
    sys.exit(parse_reports(Path(args.audit_dir), Path(args.out_dir)))


if __name__ == "__main__":
    main()
