#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/devdoc_writeset.py — D313 dev doc 写集解析共享库 (M3b)

从 verify-parallel.sh 提取的写集表解析 + 4 形态清洗，统一供:
  - verify-parallel.sh（两 doc 零交集比对）
  - check-dev-doc-write-set.sh（声明 vs 代码 grep 差异）

写集表格式（VERSION.md 契约）:
  标题: `### N.N 写集 (N 修改 + M 新建)`（正则 ^#{2,4}\\s*\\d+(\\.\\d+)*\\s*写集）
  表头: `| 文件 | 操作 | 说明 |`，第一列 4 形态:
    纯路径 / [text](url) 链接 / 行号后缀 L750 / 计数 (N 个) / 目录级（/ 结尾）

fail-open: 文件不存在/无写集表 → (None, err)；解析异常 → (None, err)。
UTF-8: stdout reconfigure。
"""
import argparse
import json
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass


def extract_write_set(path: str) -> Tuple[Optional[List[str]], Optional[str]]:
    """解析写集表第一列原始条目。返回 (entries|None, err|None)。"""
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None, f"读取失败: {path}"
    lines = text.splitlines()
    in_table = False
    entries: List[str] = []
    for line in lines:
        if re.match(r"^#{2,4}\s*\d+(\.\d+)*\s*写集", line):
            in_table = True
            continue
        if in_table and re.match(r"^\s*\|[-:\s|]+\|\s*$", line):
            continue  # 分隔行
        if in_table and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 1 and cells[0] and not cells[0].startswith("文件"):
                entries.append(cells[0])
            continue
        if in_table and not line.strip().startswith("|"):
            # D381 (2026-08-16): 标题后空行容忍 — 空行不重置表格状态,
            # 防止 "### 3.1 写集 (5 修改 + 1 新建)\n\n| 文件 |" 提取失败
            if not line.strip():
                continue
            if line.strip().startswith("#"):
                # 新标题: 若是写集标题则继续表格, 否则结束
                if re.match(r"^#{2,4}\s*\d+(\.\d+)*\s*写集", line):
                    continue
                in_table = False
            else:
                in_table = False
    if not entries:
        return None, f"无写集表: {path}"
    return entries, None


def clean_entry(raw: str) -> str:
    """清洗第一列: 链接/行号/计数/反斜杠/绝对前缀 → 归一化路径。"""
    e = raw.strip()
    # markdown 链接 [text](url) → text
    m = re.match(r"^\[([^\]]+)\]", e)
    if m:
        e = m.group(1)
    # 去行号 (path L750)
    e = re.sub(r"\s+L\d+$", "", e)
    # 去计数注释 (N 个 / N 修改)
    e = re.sub(r"\s*\(\d+\s*[个修改新建删除]+\)\s*$", "", e)
    # 反斜杠 → 正斜杠; 小写 (Windows FS 大小写不敏感)
    e = e.replace("\\", "/").lower()
    # 去绝对前缀 (D:\...\synova-agent\ 或 /d/.../synova-agent/)
    e = re.sub(r"^[a-z]:[/\\].*?synova-agent[/\\]", "", e)
    e = re.sub(r"^/+.*?synova-agent/", "", e)
    return e.strip()


def is_dir_entry(e: str) -> bool:
    return e.endswith("/")


def find_overlap(a_entries: List[str], b_entries: List[str]) -> List[str]:
    """两写集交集判定: 精确相等 / 目录前缀 / glob 通配。"""
    a = [clean_entry(x) for x in a_entries if clean_entry(x)]
    b = [clean_entry(x) for x in b_entries if clean_entry(x)]
    hits: List[str] = []
    for x in a:
        for y in b:
            if x == y:
                hits.append(x)
            elif is_dir_entry(x) and y.startswith(x):
                hits.append(f"{x} vs {y}")
            elif is_dir_entry(y) and x.startswith(y):
                hits.append(f"{y} vs {x}")
    return list(dict.fromkeys(hits))


def main() -> int:
    parser = argparse.ArgumentParser(description="D313 dev doc 写集解析共享库")
    parser.add_argument("--extract", metavar="FILE", help="提取写集表条目")
    parser.add_argument("--clean", metavar="RAW", help="清洗单条目")
    parser.add_argument("--overlap-a", metavar="FILE")
    parser.add_argument("--overlap-b", metavar="FILE")
    args = parser.parse_args()

    if args.extract:
        entries, err = extract_write_set(args.extract)
        if err:
            print(json.dumps({"status": "skip", "reason": err}, ensure_ascii=False))
            return 0
        cleaned = [clean_entry(e) for e in entries if clean_entry(e)]
        print(json.dumps({"status": "ok", "entries": entries, "cleaned": cleaned}, ensure_ascii=False))
        return 0

    if args.clean:
        print(clean_entry(args.clean))
        return 0

    if args.overlap_a and args.overlap_b:
        ea, err_a = extract_write_set(args.overlap_a)
        if err_a:
            print(json.dumps({"status": "skip", "reason": err_a}, ensure_ascii=False))
            return 0
        eb, err_b = extract_write_set(args.overlap_b)
        if err_b:
            print(json.dumps({"status": "skip", "reason": err_b}, ensure_ascii=False))
            return 0
        hits = find_overlap(ea, eb)
        print(json.dumps({"status": "block" if hits else "pass", "overlap": hits}, ensure_ascii=False))
        return 1 if hits else 0

    parser.print_help()
    return 2


if __name__ == "__main__":
    sys.exit(main())
