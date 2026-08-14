#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-k3-task.py — 审计复核任务书生成（设计 v1.4 §5.3 A7）

一句话: 线首次到 100% / 每 2 周 → 自动生成审计复核任务书（含证据包路径），
        审计员只需执行，创始人无需记得触发。

契约:
  @input  — docs/synova/product-lines/product-progress.json（calc-progress.py 产物）
  @output — docs/synova/product-lines/k3-task-line-<id>-<date>.md（复核任务书）
            内容: 线定义 + 全部验收点 + 证据文件路径清单 + 复核问题（材料与问题清单，
            审计标准由审计员定——红线：Harness 不编写审计标准）
  @degraded — product-progress.json 缺失/损坏 → log.error + exit 2（fail-closed）
  @exit   — 0 成功（含"无待复核线"的正常空跑）；2 降级

触发规则: ① 线 verified==total 且 k3_gate=pending（差最后复核）→ 必生成；
          ② 距上次该线审计证据 >14 天且线进度 ≥50% → 生成（每 2 周节奏，防重复靠
             文件名去重：同线同周只生成一次）。
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("gen-k3-task")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def load_progress(path: Path):
    if not path.is_file():
        log.error("product-progress.json 不存在: %s（先跑 calc-progress.py）", path)
        sys.exit(2)
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        log.error("product-progress.json 解析失败: %s → exit 2", e)
        sys.exit(2)


def find_candidates(progress):
    """返回需要复核的线列表（id, reason）。"""
    candidates = []
    for line in progress["lines"]:
        lid = line["id"]
        if line["k3_gate"] == "pending":
            candidates.append((line, "线首次到 100%（全部验收点已验证），按规则必须全量复核"))
            continue
        if line["progress_pct"] >= 50 and line["verified"] > 0:
            # 距上次审计证据 >14 天（每 2 周节奏）
            last_k3 = ""
            for p in line["points"]:
                for f in p["evidence_files"]:
                    if "k3" in Path(f).name:
                        last_k3 = f
            if last_k3:
                # 从证据文件名/日期推断；简化：用文件 mtime
                try:
                    mtime = (PROJECT_ROOT / last_k3).stat().st_mtime
                    if datetime.now() - datetime.fromtimestamp(mtime) > timedelta(days=14):
                        candidates.append((line, "距上次审计员证据 >14 天且线进度 ≥50%"))
                except OSError:
                    candidates.append((line, "距上次审计员证据 >14 天且线进度 ≥50%"))
    return candidates


def render_task(line, reason):
    points = []
    for p in line["points"]:
        ev = "、".join(p["evidence_files"]) or "（无证据文件——请核对为何计入）"
        points.append("- 验收点 %s | %s | 状态: %s | 证据: %s" % (p["id"], p["desc"], p["status"], ev))
    return """# 审计复核任务书 — 线 %s %s

> 生成: %s | 触发: %s
> 红线说明: 本任务书只提供材料与问题清单；审什么、怎么算过，由审计员定夺。
> 数据源: docs/synova/product-lines/product-progress.json + product-lines.yaml

## 这条线到 100%% 的定义（产品承诺）

%s

## 证据包清单（全部 git 跟踪，可复核可重跑）

%s

## 复核问题清单（供审计员参考，不构成审计标准）

1. 抽查 ≥1 个"已验证"验收点：证据文件是否真实存在？重跑/核对后是否仍成立？
2. 验收点措辞是否保持产品承诺实质（没有把做不到的包装成不需要）？
3. 线进度与各验收点状态加总是否一致？
4. 证据是否在有效期内？相关代码变更后证据是否已失效待重跑？

## 结论栏（审计员填写）

- [ ] 复核通过（线可标 100%%）
- [ ] 复核不通过（写明原因与退回项）
""" % (line["id"], line["name"], datetime.now().strftime("%Y-%m-%d"), reason,
       line["done_definition"], "\n".join(points))


def generate(progress_path, out_dir):
    progress = load_progress(progress_path)
    candidates = find_candidates(progress)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    written = []
    week = datetime.now().strftime("%Y-W%W")
    for line, reason in candidates:
        # 同线同周只生成一次（防重复派发）
        marker = "k3-task-line-%s-%s" % (line["id"], week)
        if any(f.name.startswith(marker) for f in out_dir.glob("k3-task-line-*.md")):
            continue
        target = out_dir / ("%s.md" % marker)
        target.write_text(render_task(line, reason), encoding="utf-8")
        log.info("已生成复核任务书: %s（%s）", target.name, reason)
        written.append(target.name)
    if not written:
        log.info("无待复核线（正常空跑）")
    return written


def main():
    ap = argparse.ArgumentParser(description="审计复核任务书生成（A7）")
    ap.add_argument("--progress", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-progress.json"))
    ap.add_argument("--out-dir", default=str(PROJECT_ROOT / "docs/synova/product-lines"))
    args = ap.parse_args()
    generate(Path(args.progress), Path(args.out_dir))
    sys.exit(0)


if __name__ == "__main__":
    main()
