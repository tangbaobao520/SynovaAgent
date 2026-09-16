#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""check-progress-freshness.py — D786 产物过期看门狗

契约（铁律 47）:
  @input  — [--file <product-progress.json 路径>]
            （默认 <本脚本上级上级>/docs/synova/product-lines/product-progress.json）
            [--max-age-days N]（默认 3；generated_at 距今**超过** N 天 → 告警）
            [--now "YYYY-MM-DD HH:MM:SS"]（时间覆盖——测试注入缝，规避平台 date 差异）
  @output — stdout 单行结论: ✅ 新鲜 / 🚨 过期（含 generated_at、age 天数、阈值、文件路径）
  @exit   — 0 = 新鲜（age ≤ 阈值；恰好等于阈值仍算新鲜——「超过 3 天」才告警）
            1 = 过期（🚨 看门狗触发——CI job 据此红灯 + Actions 失败邮件 = 告警可见）
            2 = 降级（文件缺失 / JSON 损坏 / generated_at 缺失或不可解析——
               查不了 ≠ 新鲜，fail-closed 铁律 11；CI 同样红灯：产物不存在比过期更糟）
  @degraded — exit 2 + stderr "degraded: <原因>"（显式留痕，不静默）
  @error  — 不抛异常；全部经退出码 + stdout/stderr 表达（ctrl-tower 三态）

红线: 只读产物，不改判分（calc-progress.py 零依赖、零 import）。
用法: python3 scripts/product-lines/check-progress-freshness.py
      （CI: .github/workflows/progress-freshness-watchdog.yml 每日 01:30 UTC）
"""
import json
import os
import sys
from datetime import datetime

try:  # D313 M5: Windows 控制台 UTF-8（无 reconfigure 的旧解释器不炸）
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DEFAULT_FILE = os.path.join(REPO_ROOT, "docs", "synova", "product-lines", "product-progress.json")
DATE_FMT = "%Y-%m-%d %H:%M:%S"


def main() -> int:
    target = DEFAULT_FILE
    max_age_days = 3.0
    now = None
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--file" and i + 1 < len(args):
            target = args[i + 1]
            i += 2
        elif args[i] == "--max-age-days" and i + 1 < len(args):
            try:
                max_age_days = float(args[i + 1])
            except ValueError:
                print("degraded: --max-age-days 非数字: %r" % args[i + 1], file=sys.stderr)
                return 2
            i += 2
        elif args[i] == "--now" and i + 1 < len(args):
            now = args[i + 1]
            i += 2
        elif args[i] in ("--help", "-h"):
            print(__doc__)
            return 0
        else:
            print("degraded: 未知参数: %r（--file/--max-age-days/--now 可用）" % args[i], file=sys.stderr)
            return 2

    if now is None:
        now = datetime.now().strftime(DATE_FMT)
    try:
        now_dt = datetime.strptime(now, DATE_FMT)
    except ValueError:
        print("degraded: --now 不可解析: %r（期望 YYYY-MM-DD HH:MM:SS）" % now, file=sys.stderr)
        return 2

    # ── 读产物（fail-closed: 查不了 ≠ 新鲜）──
    if not os.path.isfile(target):
        print("degraded: 产物不存在: %s" % target, file=sys.stderr)
        return 2
    try:
        with open(target, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError) as e:
        print("degraded: 产物不可读/JSON 损坏: %s (%s)" % (target, e), file=sys.stderr)
        return 2
    gen = data.get("generated_at")
    if not gen or not isinstance(gen, str):
        print("degraded: 产物缺 generated_at 字段: %s" % target, file=sys.stderr)
        return 2
    try:
        gen_dt = datetime.strptime(gen, DATE_FMT)
    except ValueError:
        print("degraded: generated_at 不可解析: %r（期望 YYYY-MM-DD HH:MM:SS）" % gen, file=sys.stderr)
        return 2

    age_days = (now_dt - gen_dt).total_seconds() / 86400.0
    if age_days > max_age_days:
        print("🚨 产物过期: %s | generated_at=%s | 距今 %.1f 天 > 阈值 %.1f 天" % (target, gen, age_days, max_age_days))
        print("   → 刷新链路可能已断（见 docs/synova/coordination/CI-诊断通道.md）: "
              "bash scripts/product-lines/rerun-evidence.sh 后走 PR 落 main")
        return 1
    print("✅ 产物新鲜: %s | generated_at=%s | 距今 %.1f 天 ≤ 阈值 %.1f 天" % (target, gen, age_days, max_age_days))
    return 0


if __name__ == "__main__":
    sys.exit(main())
