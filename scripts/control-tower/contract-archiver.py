#!/usr/bin/env python3
"""
contract-archiver.py — 契约存档器 (D208)

权威文档 #17 第三章 Ch3 §3.1-§4.1.
从 Agent 任务产出 Markdown 中提取接口契约 → 结构化的 contract.json。

用法:
  python contract-archiver.py extract --input <file.md> --output <contract.json>
  python contract-archiver.py validate --contract <contract.json>
  python contract-archiver.py --help

契约:
  @input  — Markdown 文件路径
  @output — contract.json (ContractRecord[])
  @degraded — 输入非 Markdown -> 警告 + 空输出; grep 不可用 -> 跳过 validate + degraded
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import uuid
from pathlib import Path
from typing import List, Dict, Optional, Any

# ═══ 类型 ═══

class ContractRecord:
    """从 Agent 产出中提取的结构化契约记录 (Ch3 §4.1)"""
    def __init__(self, type_name: str, name: str, signature: str = "",
                 file_path: str = "", edge_ids: Optional[List[str]] = None,
                 caller_file: str = "", confidence: float = 0.5,
                 source_line: int = 0):
        self.contractId = f"CT-{uuid.uuid4().hex[:8].upper()}"
        self.type = type_name
        self.name = name
        self.signature = signature
        self.filePath = file_path
        self.edgeIds = edge_ids or []
        self.callerFile = caller_file
        self.confidence = confidence
        self.sourceLine = source_line
        self.extractedAt = datetime.datetime.now(datetime.timezone.utc).isoformat()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "contractId": self.contractId,
            "type": self.type,
            "name": self.name,
            "signature": self.signature,
            "filePath": self.filePath,
            "edgeIds": self.edgeIds,
            "callerFile": self.callerFile,
            "confidence": self.confidence,
            "sourceLine": self.sourceLine,
            "extractedAt": self.extractedAt,
        }

class ValidationItem:
    def __init__(self, contract_id: str, name: str, check: str, passed: bool, detail: str = ""):
        self.contractId = contract_id
        self.name = name
        self.check = check
        self.passed = passed
        self.detail = detail

    def to_dict(self) -> Dict[str, Any]:
        return {"contractId": self.contractId, "name": self.name,
                "check": self.check, "passed": self.passed, "detail": self.detail}

# ═══ ContractArchiver ═══

class ContractArchiver:
    """契约存档器 — 提取 + 验证 + 存档。"""

    def __init__(self, project_root: Optional[str] = None):
        self.project_root = project_root or os.getcwd()

    # ─── Extract ───

    def extract(self, md_path: str) -> List[ContractRecord]:
        """从 Markdown 中提取契约记录。

        @input  — Markdown 文件路径
        @output — ContractRecord[]
        @degraded — 非 Markdown 或无内容 -> 空列表 + warning
        """
        if not md_path.endswith(".md"):
            print(f"[archiver] [!] 输入非 Markdown: {md_path} — 返回空输出", file=sys.stderr)
            return []

        if not os.path.exists(md_path):
            print(f"[archiver] [!] 文件未找到: {md_path}", file=sys.stderr)
            return []

        with open(md_path, "r", encoding="utf-8") as f:
            content = f.read()

        if not content.strip():
            print("[archiver] [!] 文件为空 — 返回空输出", file=sys.stderr)
            return []

        records: List[ContractRecord] = []
        lines = content.split("\n")
        seen_signatures: set = set()

        for line_num, line in enumerate(lines, 1):
            stripped = line.strip()

            # 规则 1: export function 声明
            m = re.search(r'(export\s+(?:async\s+)?function\s+(\w+)\s*\([^)]*\))', stripped)
            if m and m.group(2) not in seen_signatures:
                seen_signatures.add(m.group(2))
                records.append(ContractRecord(
                    "export_function", m.group(2), m.group(1),
                    confidence=0.9, source_line=line_num,
                ))

            # 规则 2: export class 声明
            m = re.search(r'(export\s+(?:abstract\s+)?class\s+(\w+))', stripped)
            if m and m.group(2) not in seen_signatures:
                seen_signatures.add(m.group(2))
                records.append(ContractRecord(
                    "export_class", m.group(2), m.group(1),
                    confidence=0.9, source_line=line_num,
                ))

            # 规则 3: @input/@output/@degraded JSDoc
            m = re.search(r'@(input|output|degraded)\s+.*?(\w+(?:\.\w+)*(?:\([^)]*\))?)', stripped)
            if m:
                tag = m.group(1)
                name = m.group(2)
                sig = f"@{tag} {name}"
                if sig not in seen_signatures:
                    seen_signatures.add(sig)
                    records.append(ContractRecord(
                        "jsdoc_contract", f"@{tag}", sig,
                        confidence=0.8, source_line=line_num,
                    ))

            # 规则 4: E-XX Edge ID 引用
            for m in re.finditer(r'(E-\d{2})', stripped):
                eid = m.group(1)
                if eid not in seen_signatures:
                    seen_signatures.add(eid)
                    records.append(ContractRecord(
                        "edge_id", eid, f"Edge ID {eid}",
                        edge_ids=[eid],
                        confidence=0.9, source_line=line_num,
                    ))

            # 规则 5: 文件路径 (src/ / extensions/ / packages/)
            for m in re.finditer(r'((?:src|extensions|packages|app)/[^\s\)\]"\'》；,;]+)', stripped):
                fp = m.group(1)
                if fp not in seen_signatures:
                    seen_signatures.add(fp)
                    records.append(ContractRecord(
                        "file_path", fp, f"File: {fp}",
                        file_path=fp,
                        confidence=0.7, source_line=line_num,
                    ))

        # 去重（按 name）
        seen_names: set = set()
        unique_records = []
        for r in records:
            if r.name not in seen_names:
                seen_names.add(r.name)
                unique_records.append(r)

        print(f"[archiver] 提取完成: {len(unique_records)} 条契约 ({md_path})")
        return unique_records

    # ─── Validate ───

    def validate(self, contract_path: str) -> List[ValidationItem]:
        """逐条验证契约是否符合当前代码库。

        @input  — contract.json 文件路径
        @output — ValidationItem[]
        @degraded — grep 不可用 -> 跳过 + degraded
        """
        if not os.path.exists(contract_path):
            print(f"[archiver] [!] 契约文件不存在: {contract_path}", file=sys.stderr)
            return []

        with open(contract_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        contracts = data if isinstance(data, list) else data.get("contracts", [])
        results: List[ValidationItem] = []

        for c in contracts:
            name = c.get("name", "")
            ctype = c.get("type", "")
            cid = c.get("contractId", "")

            if ctype == "export_function":
                # grep 确认函数在 src/ 中存在
                try:
                    r = subprocess.run(
                        ["grep", "-rn", f"function {name}\\|export function {name}", "src/"],
                        capture_output=True, text=True, cwd=self.project_root, timeout=10,
                    )
                    passed = r.returncode == 0
                    detail = r.stdout[:120] if passed else "函数未找到"
                except (subprocess.TimeoutExpired, FileNotFoundError):
                    passed = False
                    detail = "grep 不可用 (degraded)"
                results.append(ValidationItem(cid, name, "grep_function", passed, detail))

            elif ctype == "export_class":
                try:
                    r = subprocess.run(
                        ["grep", "-rn", f"class {name}\\b", "src/"],
                        capture_output=True, text=True, cwd=self.project_root, timeout=10,
                    )
                    passed = r.returncode == 0
                    detail = r.stdout[:120] if passed else "类未找到"
                except (subprocess.TimeoutExpired, FileNotFoundError):
                    passed = False
                    detail = "grep 不可用 (degraded)"
                results.append(ValidationItem(cid, name, "grep_class", passed, detail))

            elif ctype == "edge_id":
                # 确认 Edge ID 在代码库中存在
                try:
                    r = subprocess.run(
                        ["grep", "-r", name, "--include=*.ts", "--include=*.json",
                         "extensions/sentinels/", "packages/ontology/", "extensions/ontology/edge-types/"],
                        capture_output=True, text=True, cwd=self.project_root, timeout=10,
                    )
                    passed = r.returncode == 0
                    detail = f"Edge {name} 在代码库中{'存在' if passed else '不存在'}"
                except (subprocess.TimeoutExpired, FileNotFoundError):
                    passed = False
                    detail = "grep 不可用 (degraded)"
                results.append(ValidationItem(cid, name, "grep_edge", passed, detail))

            elif ctype == "file_path":
                full_path = os.path.join(self.project_root, name) if not os.path.isabs(name) else name
                passed = os.path.exists(full_path)
                detail = f"文件{'存在' if passed else '不存在'}: {name}"
                results.append(ValidationItem(cid, name, "test_path", passed, detail))

        passed_count = sum(1 for r in results if r.passed)
        print(f"[archiver] 验证完成: {passed_count}/{len(results)} 通过")
        return results

    # ─── Save / Load ───

    def save(self, contracts: List[ContractRecord], output_path: str):
        d = os.path.dirname(output_path)
        os.makedirs(d, exist_ok=True)
        import tempfile
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump({"contracts": [c.to_dict() for c in contracts],
                       "extractedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                       "totalCount": len(contracts)},
                      f, indent=2, ensure_ascii=False)
        os.replace(tmp, output_path)
        print(f"[archiver] 已保存: {output_path} ({len(contracts)} 条契约)")

    def load(self, contract_path: str) -> List[Dict[str, Any]]:
        with open(contract_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else data.get("contracts", [])


# ═══ CLI ═══

def _emit_signal(status: str, reason: str, p0: int = 0) -> None:
    """D214 信号发射 (委托 emit-signal.py，原子写入)"""
    import subprocess
    try:
        script = os.path.join(os.path.dirname(__file__), "emit-signal.py")
        subprocess.run([sys.executable, script, "contract-archiver", status, reason,
                       "--p0", str(p0)], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass  # 降级


def main():
    parser = argparse.ArgumentParser(description="契约存档器 (D208) — 从 Agent 产出中提取结构化接口契约")
    sub = parser.add_subparsers(dest="command", help="子命令")

    # extract
    p_extract = sub.add_parser("extract", help="从 Markdown 提取契约")
    p_extract.add_argument("--input", required=True, help="输入 Markdown 文件")
    p_extract.add_argument("--output", default="contract.json", help="输出 contract.json 路径")

    # validate
    p_val = sub.add_parser("validate", help="验证契约是否符合代码库")
    p_val.add_argument("--contract", required=True, help="contract.json 路径")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    archiver = ContractArchiver()

    if args.command == "extract":
        records = archiver.extract(args.input)
        if records:
            archiver.save(records, args.output)
        _emit_signal("green", f"extracted_{len(records)}_contracts")
        sys.exit(0)

    elif args.command == "validate":
        results = archiver.validate(args.contract)
        if not results:
            print("[archiver] 无验证结果")
            _emit_signal("yellow", "no_results")
            sys.exit(0)

        failed = [r for r in results if not r.passed]
        for r in results:
            status = "[OK]" if r.passed else "[FAIL]"
            print(f"  {status} {r.check}: {r.name} - {r.detail}")

        if failed:
            print(f"\n[archiver] 验证未通过: {len(failed)}/{len(results)} 项失败")
            _emit_signal("red", f"validate_{len(failed)}_failed", p0=len(failed))
            sys.exit(1)
        else:
            print(f"\n[archiver] 全部通过: {len(results)}/{len(results)}")
            _emit_signal("green", f"validate_{len(results)}_passed")
            sys.exit(0)


if __name__ == "__main__":
    main()
