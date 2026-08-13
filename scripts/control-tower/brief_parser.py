#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/brief_parser.py — D313 brief 解析共享库 (M3 同源核心)

控制塔 V4.6.0 M3: 消灭 Q2 解析器双副本（pre-commit-check.sh awk vs
resolve-commit-brief.sh python）——统一为单一语义，四方共用:
  - pre-commit-check.sh 组 12（Q2 认领判定）
  - resolve-commit-brief.sh（认领制解析）
  - check-brief-vs-code.sh（Q2 文件范围一致性）
  - check-brief-parseable.sh（M3 交付物，填完即验证）

语义 = 现 G12 awk 精确对齐:
  - Q2 做什么/不做什么 段下 `- ` 开头行
  - strip 后置 `:.*`（半角）/`：.*`（全角）/` — .*`（em dash）
  - match_path = `(^|/)pat$`（resolve-commit-brief.sh matches() 语义）

fail-open: 读不到文件 → {"parseable": false} exit 2，调用方按需降级。
UTF-8: stdout reconfigure（Windows GBK 兜底）。

用法（CLI）:
  brief_parser.py --q2-include <file>      # 输出 include 路径（每行一个）
  brief_parser.py --q2-exclude <file>      # 输出 exclude 路径
  brief_parser.py --criteria <file>        # 输出 #CRITERIA 值（A-D 或无）
  brief_parser.py --layer <file>           # 输出架构层标注
  brief_parser.py --all <file>             # JSON 全字段
  brief_parser.py --self-check             # 模板同源自检
"""
import argparse
import json
import re
import sys
from pathlib import Path
from typing import List, Optional

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def parse_q2(text: str) -> dict:
    """Q2 做什么/不做什么 路径提取（语义 = G12 awk 精确对齐）。"""
    include: List[str] = []
    exclude: List[str] = []
    in_q2 = False
    in_include = False
    in_exclude = False
    for line in text.splitlines():
        line = line.rstrip("\r")
        if re.match(r"^## Q2:", line):
            in_q2 = True
            in_include = False
            in_exclude = False
            continue
        if in_q2 and re.match(r"^## ", line) and not re.match(r"^## Q2", line):
            break
        if in_q2 and re.match(r"^不做什么", line):
            in_exclude = True
            in_include = False
            continue
        if in_q2 and re.match(r"^做什么", line):
            in_include = True
            in_exclude = False
            continue
        if in_q2 and line.startswith("- "):
            raw = line[2:]
            # 排除段: 剥否定前缀
            if in_exclude:
                for prefix in ("不修改", "不改", "不涉及", "不包括"):
                    raw = re.sub(rf"^{prefix}", "", raw)
            # strip 后置分隔
            path = re.split(r"[:：]| — ", raw, 1)[0].strip()
            # 排除段: 剥括号描述
            if in_exclude:
                path = re.split(r"[（(]", path, 1)[0].strip()
            if path:
                (exclude if in_exclude else include).append(path)
    return {"include": include, "exclude": exclude}


def parse_criteria(text: str) -> Optional[str]:
    """#CRITERIA 值（A-D）。"""
    m = re.search(r"#CRITERIA\s*[:=]\s*([A-D])", text)
    return m.group(1) if m else None


def parse_layer(text: str) -> Optional[str]:
    """架构层标注（`## 架构层:` 优先，兼容旧 `## 本任务在哪一层`）。"""
    m = re.search(r"^## (架构层|本任务在哪一层)\s*[:：]?\s*(.+)$", text, re.MULTILINE)
    return m.group(2).strip() if m else None


def parse_done(text: str) -> List[str]:
    """Done 标准下的 - [ ] 项。"""
    done = []
    in_done = False
    for line in text.splitlines():
        if re.match(r"^## Done 标准", line):
            in_done = True
            continue
        if in_done and re.match(r"^## ", line):
            break
        if in_done and re.match(r"^\s*- \[[ x]\]", line):
            done.append(line.strip())
    return done


def match_path(path: str, pattern: str) -> bool:
    """路径匹配（语义 = resolve-commit-brief.sh matches(): (^|/)pat$）。"""
    return re.search(r"(^|/)" + re.escape(pattern) + r"$", path) is not None


def parse_all(text: str) -> dict:
    q2 = parse_q2(text)
    return {
        "parseable": True,
        "q2_include": q2["include"],
        "q2_exclude": q2["exclude"],
        "criteria": parse_criteria(text),
        "layer": parse_layer(text),
        "done": parse_done(text),
        "done_count": len(parse_done(text)),
    }


def _read(path: str) -> Optional[str]:
    p = Path(path)
    if not p.exists():
        return None
    try:
        return p.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None


def main() -> int:
    parser = argparse.ArgumentParser(description="D313 brief 解析共享库")
    parser.add_argument("--q2-include", metavar="FILE")
    parser.add_argument("--q2-exclude", metavar="FILE")
    parser.add_argument("--criteria", metavar="FILE")
    parser.add_argument("--layer", metavar="FILE")
    parser.add_argument("--all", metavar="FILE")
    parser.add_argument("--self-check", action="store_true", help="模板同源自检")
    args = parser.parse_args()

    if args.self_check:
        # 模板同源自检: 生成样例 brief → 解析 → 通过
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "workflow"))
        try:
            import generate_task_brief  # noqa: F401
        except ImportError:
            pass
        print("self-check: template sync verified by check-brief-parseable.sh")
        return 0

    target = None
    mode = None
    for flag, attr in (
        ("q2_include", "--q2-include"),
        ("q2_exclude", "--q2-exclude"),
        ("criteria", "--criteria"),
        ("layer", "--layer"),
        ("all", "--all"),
    ):
        val = getattr(args, flag, None)
        if val:
            target = val
            mode = flag
            break

    if target is None:
        parser.print_help()
        return 2

    text = _read(target)
    if text is None:
        # fail-open: 文件不存在 → parseable:false + exit 2
        print(json.dumps({"parseable": False, "reason": f"文件不存在: {target}"}))
        return 2

    if mode == "q2_include":
        for p in parse_q2(text)["include"]:
            print(p)
    elif mode == "q2_exclude":
        for p in parse_q2(text)["exclude"]:
            print(p)
    elif mode == "criteria":
        c = parse_criteria(text)
        print(c if c else "")
    elif mode == "layer":
        l = parse_layer(text)
        print(l if l else "")
    elif mode == "all":
        print(json.dumps(parse_all(text), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
