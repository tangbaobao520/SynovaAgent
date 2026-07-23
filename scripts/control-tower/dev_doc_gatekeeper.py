#!/usr/bin/env python3
"""
dev-doc-gatekeeper.py — Dev Doc 校验网守 Python 版 (D212)

替换 D206 bash 版（Windows 乱码）。在 dev doc 分发给 Claude Code 前，
运行 5 项机械验证。任一 FAIL → 不能分发。

C1: Edge ID 存在性 — 每个 E-XX 在代码中真实存在
C2: 文件路径存在性 — 每个 src/extensions/packages/app 路径真实存在
C3: Test Requirements 章节 — 包含 L1/L2a 引用
C4: Wiring Verification 章节 — 包含调用方文件路径
C5: Authority Doc Verification 章节 — 包含来源路径引用

用法:
  python dev-doc-gatekeeper.py <path-to-dev-doc.md>

退出码:
  0 = ALL PASS (可以分发)
  1 = FAIL (有阻断项)
  2 = DEGRADED (检查自身降级，允许分发但告警)

契约:
  @input  — dev doc Markdown 文件路径
  @output — 逐项 PASS/FAIL 报告
  @degraded — 文件不存在 -> exit 2
"""
import argparse
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

PROJECT_ROOT = Path(__file__).parent.parent.parent


class CheckResult:
    def __init__(self, label: str, passed: bool, message: str, severity: str = "PASS"):
        self.label = label
        self.passed = passed
        self.message = message
        self.severity = severity if not passed else ("PASS" if passed else "FAIL")

    def __str__(self) -> str:
        icon = "[OK]" if self.passed else ("[!]" if self.severity == "SKIP" else "[FAIL]")
        return f"  {icon} {self.label}: {self.message}"


class DevDocGatekeeper:
    """Dev Doc 校验网守 — 5 项机械验证 (C1-C5)。"""

    def __init__(self, doc_path: str):
        self.doc_path = Path(doc_path)
        self.content = ""
        if self.doc_path.exists():
            self.content = self.doc_path.read_text(encoding="utf-8")

    # ─── C1: Edge ID 存在性 ───

    def check_c1_edge_ids(self) -> CheckResult:
        edge_ids = sorted(set(re.findall(r'E-\d{2}', self.content)))
        if not edge_ids:
            return CheckResult("C1: Edge ID existence", True, "SKIP (no edge IDs in doc)", "SKIP")

        # 从代码库提取有效 Edge ID
        valid_edges = self._extract_valid_edges()

        missing = [e for e in edge_ids if e not in valid_edges]
        if missing:
            return CheckResult("C1: Edge ID existence", False,
                               f"FAIL: {', '.join(missing)} not found ({len(missing)}/{len(edge_ids)} missing)")
        return CheckResult("C1: Edge ID existence", True,
                           f"PASS: {len(edge_ids)}/{len(edge_ids)} verified")

    # ─── C2: 文件路径存在性 ───

    def check_c2_file_paths(self) -> CheckResult:
        paths = sorted(set(re.findall(r'(src|extensions|packages|app)/[^\s\)\]"\'》；,;、，。]+', self.content)))
        if not paths:
            return CheckResult("C2: File path existence", True, "SKIP (no file paths in doc)", "SKIP")

        missing = []
        for p in paths:
            full = PROJECT_ROOT / p
            if not full.exists():
                missing.append(p)

        if missing:
            return CheckResult("C2: File path existence", False,
                               f"FAIL: {', '.join(missing[:5])} not found ({len(missing)}/{len(paths)})")
        return CheckResult("C2: File path existence", True,
                           f"PASS: {len(paths)}/{len(paths)} verified")

    # ─── C3: Test Requirements 章节 ───

    def check_c3_test_requirements(self) -> CheckResult:
        has_section = bool(re.search(r'Test Requirements|Test Specification|测试要求', self.content, re.IGNORECASE))
        has_l1 = bool(re.search(r'\bL1\b', self.content))

        if has_section and has_l1:
            return CheckResult("C3: Test Requirements", True, "PASS: section + L1 reference found")
        elif has_section:
            return CheckResult("C3: Test Requirements", False, "FAIL: section found but missing L1/L2a/L2b/L2c reference")
        else:
            return CheckResult("C3: Test Requirements", False, "FAIL: missing 'Test Requirements' section")

    # ─── C4: Wiring Verification 章节 ───

    def check_c4_wiring_verification(self) -> CheckResult:
        has_section = bool(re.search(r'Wiring Verification|接线验证|Iron Law 4|铁律 4', self.content, re.IGNORECASE))
        has_path = bool(re.search(r'src/|extensions/|\.ts', self.content))

        if has_section and has_path:
            return CheckResult("C4: Wiring Verification", True, "PASS: section + caller file paths found")
        elif has_section:
            return CheckResult("C4: Wiring Verification", False, "FAIL: section found but missing specific caller file paths")
        else:
            return CheckResult("C4: Wiring Verification", False, "FAIL: missing 'Wiring Verification' section")

    # ─── C5: Authority Doc Verification 章节 ───

    def check_c5_authority_doc(self) -> CheckResult:
        has_ref = bool(re.search(r'Authority Doc|Auth Doc|权威文档|权威文档原文', self.content, re.IGNORECASE))
        has_path = bool(re.search(r'docs/synova/research|packages/|src/', self.content))

        if has_ref and has_path:
            return CheckResult("C5: Auth Doc Verification", True, "PASS: section + source path references found")
        elif has_ref:
            return CheckResult("C5: Auth Doc Verification", False, "FAIL: references found but missing specific file paths")
        else:
            return CheckResult("C5: Auth Doc Verification", False, "FAIL: missing 'Authority Doc Verification' section")

    # ─── All checks ───

    def validate(self) -> List[CheckResult]:
        return [
            self.check_c1_edge_ids(),
            self.check_c2_file_paths(),
            self.check_c3_test_requirements(),
            self.check_c4_wiring_verification(),
            self.check_c5_authority_doc(),
        ]

    # ─── Helper ───

    def _extract_valid_edges(self) -> set:
        edges: set = set()
        auth_dir = PROJECT_ROOT / "docs/synova/research/权威文档01-本体层因果体系权威规范-20260714"
        if auth_dir.exists():
            for md_file in auth_dir.rglob("*.md"):
                try:
                    content = md_file.read_text(encoding="utf-8", errors="replace")
                    edges.update(re.findall(r'E-\d{2}', content))
                except (OSError, UnicodeDecodeError):
                    pass
        return edges


# ═══ CLI ═══

def main():
    parser = argparse.ArgumentParser(description="Dev Doc Gatekeeper (D212) — 5 项机械验证")
    parser.add_argument("doc_path", nargs="?", help="dev doc Markdown 文件路径")
    args = parser.parse_args()

    if not args.doc_path:
        parser.print_help()
        sys.exit(0)

    doc_path = Path(args.doc_path)
    if not doc_path.exists():
        print(f"[!] 文件不存在: {doc_path}", file=sys.stderr)
        sys.exit(2)

    gatekeeper = DevDocGatekeeper(str(doc_path))
    results = gatekeeper.validate()

    print(f"\nDev Doc Gatekeeper — {doc_path.name}")
    print("=" * 60)
    for r in results:
        print(r)

    passed = sum(1 for r in results if r.passed)
    failed = sum(1 for r in results if not r.passed)
    skipped = sum(1 for r in results if r.severity == "SKIP")
    print(f"\n  {passed} PASS, {failed} FAIL, {skipped} SKIP")

    if failed > 0:
        print("\n[FAIL] 存在阻断项 — 不能分发")
        sys.exit(1)
    else:
        print("\n[OK] ALL PASS — 可以分发")
        sys.exit(0)


if __name__ == "__main__":
    main()
