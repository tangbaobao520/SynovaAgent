#!/usr/bin/env python3
"""
completion-engine.py — V3 §3.2 六条件判定引擎 (D261, D296 修复)

对目标代码文件/模块进行六维度完成度判定:
A. 代码存在 (Path Exists)
B. 接线完整 (Wired — grep 调用方)
C. 测试存在 (Test Exists)
D. 路径可达 (Import Chain Verifiable)
E. 依赖可用 (Dependencies Resolvable)
F. 无已知缺陷 (No Known Defect — known-error-patterns.json match)

D296 修复 (控制塔数据真实性):
  - 输出统一 schema (completion_schema.py), 与 self-diagnosis.py 不再互相覆盖
  - 保留单文件判定 (--target) — 任务级完成度唯一生成方是 self-diagnosis.py
  - 无 --target 模式读 gate-status.json; 缺失 → degraded:true + 原因,
    禁止输出正常格式假 0 分 (任务文档 §2.3)

用法:
  python scripts/audit/completion-engine.py
  python scripts/audit/completion-engine.py --target path/to/file.ts
  python scripts/audit/completion-engine.py --target path/to/file.ts --output out.json

契约:
  @input  — 代码库文件系统 + .codex/audit/known-error-patterns.json + gate-status.json
  @output — completion-scores.json (统一 schema: completion_schema.py)
  @degraded — gate-status.json 缺失 -> degraded:true + exit 0 (不阻断调用方)
"""
import argparse
import json
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# 同目录模块 (completion_schema) — 独立运行与 importlib 测试加载都可用
sys.path.insert(0, str(Path(__file__).resolve().parent))

from completion_schema import (
    SCHEMA_VERSION,
    GENERATOR_COMPLETION_ENGINE,
    make_criteria,
    empty_criteria,
    validate_completion_schema,
)

# ═══ 常量 ═══

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SNAPSHOTS_DIR = PROJECT_ROOT / ".codex/snapshots"
SIGNALS_DIR = PROJECT_ROOT / ".codex/signals"
KNOWN_ERRORS_PATH = PROJECT_ROOT / ".codex/audit/known-error-patterns.json"

# 六条件 A-F → 统一 schema 键映射 (D296 2.2)
CRITERION_KEY_BY_LETTER = {
    "A": "code_exists",       # C1 代码存在
    "B": "wiring_complete",   # C2 接线完整
    "C": "test_exists",       # C3 测试存在
    "D": "path_reachable",    # C4 路径可达
    "E": "dependencies_ok",   # C5 依赖可用
    "F": "no_defects",        # C6 无已知缺陷
}

# ═══ 数据类型 ═══

@dataclass
class CriterionResult:
    """单条条件的判定结果"""
    letter: str          # A-F
    name: str            # 条件名称
    status: str          # pass / partial / fail / unknown
    score: float         # 0.0 ~ 1.0
    detail: str = ""
    error: Optional[str] = None

@dataclass
class CompletionResult:
    """完整完成度结果 (单文件判定)"""
    timestamp: str
    overall_score: float                 # 0-100
    completion_by_criteria: dict = field(default_factory=dict)  # {"A": pct, "B": pct, ...}
    dimension_scores: dict = field(default_factory=dict)        # 兼容保留 (空)
    active_gates: int = 0
    dimension_breakdown: list = field(default_factory=list)


# ═══ 判定器 ═══

class CompletionEngine:
    """六条件完成度判定"""

    def __init__(self, root: Path = PROJECT_ROOT, quiet: bool = False):
        self.root = root
        self.quiet = quiet
        self.results: list[CriterionResult] = []
        self._known_errors: list[dict] = []
        self._load_known_errors()

    def _load_known_errors(self) -> None:
        """加载已知缺陷模式（降级友好）"""
        if KNOWN_ERRORS_PATH.exists():
            try:
                raw = json.loads(KNOWN_ERRORS_PATH.read_text("utf-8", errors="replace"))
                self._known_errors = raw if isinstance(raw, list) else raw.get("errors", [])
            except (json.JSONDecodeError, Exception):
                self.log("  已知缺陷: 文件损坏 — C6 标记 unknown")
                self._known_errors = []

    def log(self, msg: str) -> None:
        if not self.quiet:
            print(msg)

    def ok(self, msg: str) -> None:
        self.log(f"    [OK] {msg}")

    def warn(self, msg: str) -> None:
        self.log(f"    [!]  {msg}")

    # ── 六条件判定 ──

    def check_A_path_exists(self, target_path: str) -> CriterionResult:
        """C1: 代码存在"""
        full = self.root / target_path
        exists = full.exists()
        if exists:
            size = full.stat().st_size
            if size > 0:
                return CriterionResult("A", "代码存在", "pass", 1.0, f"存在({size} bytes)")
            return CriterionResult("A", "代码存在", "partial", 0.5, f"存在但空文件({size} bytes)")
        return CriterionResult("A", "代码存在", "fail", 0.0, f"路径不存在: {target_path}")

    def check_B_wired(self, export_name: str, source_path: str) -> CriterionResult:
        """C2: 接线完整 — grep 调用方"""
        if not export_name:
            return CriterionResult("B", "接线完整", "unknown", 0.0, "无 export 名提供")
        try:
            import subprocess
            r = subprocess.run(
                ["grep", "-rn", f"\\b{export_name}\\b", str(self.root / "src")],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=10,
            )
            refs = [l for l in r.stdout.split("\n") if l.strip()
                    and source_path not in l and ".test." not in l
                    and "export" not in l.split(":")[-1]]
            count = len(refs)
            if count >= 2:
                return CriterionResult("B", "接线完整", "pass", 1.0, f"{count} 处调用引用")
            elif count == 1:
                return CriterionResult("B", "接线完整", "partial", 0.5, f"仅 {count} 处调用引用")
            return CriterionResult("B", "接线完整", "fail", 0.0, "零处生产引用")
        except Exception as e:
            return CriterionResult("B", "接线完整", "unknown", 0.0, f"grep 失败: {e}")

    def check_C_test_exists(self, target_path: str) -> CriterionResult:
        """C3: 测试存在"""
        # 尝试 .test.ts, .integration.test.ts, .spec.ts 后缀
        stem = Path(target_path).stem
        parent = Path(target_path).parent
        candidates = [
            self.root / "tests" / parent / f"{stem}.test.ts",
            self.root / "tests" / parent / f"{stem}.integration.test.ts",
            self.root / "tests" / parent / f"{stem}.spec.ts",
        ]
        # 也搜整个 tests/ 目录下的文件名
        found = []
        for c in candidates:
            if c.exists():
                found.append(str(c.relative_to(self.root)))
        if found:
            return CriterionResult("C", "测试存在", "pass", 1.0, f"测试文件: {found[0]}")
        # 放宽: grep tests/ 下含目标文件名的 import
        try:
            import subprocess
            r = subprocess.run(
                ["grep", "-rl", Path(target_path).name.replace(".ts", ""),
                 str(self.root / "tests")],
                capture_output=True, text=True, timeout=5,
            )
            if r.stdout.strip():
                return CriterionResult("C", "测试存在", "partial", 0.5, "间接匹配")
        except Exception:
            pass
        return CriterionResult("C", "测试存在", "fail", 0.0, "无测试文件")

    def check_D_path_reachable(self, target_path: str) -> CriterionResult:
        """C4: 路径可达 — 检查 import 链"""
        full = self.root / target_path
        if not full.exists():
            return CriterionResult("D", "路径可达", "fail", 0.0, "目标文件不存在")
        text = full.read_text("utf-8", errors="replace")
        imports = re.findall(r"from ['\"]([^'\"]+)['\"]", text)
        if not imports:
            return CriterionResult("D", "路径可达", "pass", 1.0, "无外部依赖(独立模块)")
        # 检查每个 import 的目标是否存在
        missing = []
        for imp in imports:
            resolved = self._resolve_import(imp, Path(target_path).parent)
            if resolved and not resolved.exists():
                missing.append(imp)
        if not missing:
            return CriterionResult("D", "路径可达", "pass", 1.0, f"{len(imports)} 个 import 全部可解析")
        rate = 1.0 - (len(missing) / max(len(imports), 1))
        if rate >= 0.8:
            return CriterionResult("D", "路径可达", "partial", rate, f"{len(missing)}/{len(imports)} import 缺失")
        return CriterionResult("D", "路径可达", "fail", rate, f"{len(missing)}/{len(imports)} import 缺失: {missing[:3]}")

    def _resolve_import(self, imp: str, relative_to: Path) -> Optional[Path]:
        """尝试解析 import 路径为实际文件"""
        candidates = []
        # 相对路径
        if imp.startswith("./") or imp.startswith("../"):
            cand = (self.root / relative_to / imp).resolve()
            # 尝试不同后缀
            for ext in [".ts", ".tsx", ".js", "/index.ts", "/index.js"]:
                p = Path(str(cand) + ext) if not cand.name.endswith(ext) else cand
                if p.exists():
                    return p
            return cand
        # 绝对路径（从 src/ 开始）
        for base in [self.root / "src", self.root / "packages"]:
            cand = base / f"{imp}.ts"
            if cand.exists():
                return cand
            cand = base / imp / "index.ts"
            if cand.exists():
                return cand
        return None

    def check_E_deps_resolvable(self, target_path: str) -> CriterionResult:
        """C5: 依赖可用 — 检查 node_modules"""
        # 检查 package.json 的依赖是否都装好了
        pkg_path = self.root / "package.json"
        if not pkg_path.exists():
            return CriterionResult("E", "依赖可用", "unknown", 0.0, "无 package.json")
        try:
            pkg = json.loads(pkg_path.read_text("utf-8", errors="replace"))
            all_deps = {**pkg.get("dependencies", {}), **pkg.get("devDependencies", {})}
            missing = []
            for dep, ver in all_deps.items():
                if ver.startswith("file:") or dep.startswith("@"):
                    continue  # 跳过 monorepo 内部引用
                dep_path = self.root / "node_modules" / dep
                if not dep_path.exists():
                    missing.append(dep)
            if not missing:
                return CriterionResult("E", "依赖可用", "pass", 1.0, f"{len(all_deps)} 依赖全部安装")
            rate = 1.0 - (len(missing) / max(len(all_deps), 1))
            return CriterionResult("E", "依赖可用", "partial", max(rate, 0.0), f"{len(missing)} 依赖缺失")
        except Exception as e:
            return CriterionResult("E", "依赖可用", "unknown", 0.0, f"检查失败: {e}")

    def check_F_no_known_defect(self, target_path: str) -> CriterionResult:
        """C6: 无已知缺陷 — 匹配 known-error-patterns.json"""
        if not self._known_errors:
            return CriterionResult("F", "无已知缺陷", "unknown", 0.5, "已知缺陷库缺失(降级)")
        full = self.root / target_path
        if not full.exists():
            return CriterionResult("F", "无已知缺陷", "fail", 0.0, "目标文件不存在")
        text = full.read_text("utf-8", errors="replace")
        matched = []
        for pattern in self._known_errors:
            pat_str = pattern.get("pattern", "") if isinstance(pattern, dict) else ""
            if pat_str and re.search(pat_str, text, re.IGNORECASE):
                matched.append(pattern.get("id", "unknown") if isinstance(pattern, dict) else pat_str)
        if matched:
            return CriterionResult("F", "无已知缺陷", "fail", 0.0, f"匹配 {len(matched)} 个已知缺陷: {matched[:3]}")
        return CriterionResult("F", "无已知缺陷", "pass", 1.0, "未匹配已知缺陷模式")

    # ── 综合评分 ──

    def evaluate(self, target_path: str, export_name: str = "") -> CompletionResult:
        """对目标执行全部六条件判定"""
        # 每次判定独立 — 清空上次累积 (build_single_file_doc 多次调用安全)
        self.results = []
        self.log(f"\n  判定: {target_path}")
        checks = [
            ("A", lambda: self.check_A_path_exists(target_path)),
            ("B", lambda: self.check_B_wired(export_name or Path(target_path).stem, target_path)),
            ("C", lambda: self.check_C_test_exists(target_path)),
            ("D", lambda: self.check_D_path_reachable(target_path)),
            ("E", lambda: self.check_E_deps_resolvable(target_path)),
            ("F", lambda: self.check_F_no_known_defect(target_path)),
        ]
        for label, check_fn in checks:
            result = check_fn()
            self.results.append(result)
            self.log(f"    [{result.letter}] {result.name}: {result.status} ({result.score})")

        # 计算 overall score
        scores = [r.score for r in self.results]
        overall = (sum(scores) / max(len(scores), 1)) * 100

        # 按条件分组 (A/B/C/D — V3 §2.2)
        criteria_groups = {
            "A": self.results[0].score * 100 if len(self.results) > 0 else 0,  # 代码存在
            "B": self.results[1].score * 100 if len(self.results) > 1 else 0,  # 接线完整
            "C": self.results[2].score * 100 if len(self.results) > 2 else 0,  # 测试存在
            "D": (self.results[3].score + self.results[4].score + self.results[5].score) / 3 * 100
                  if len(self.results) > 5 else 0,  # 综合(路径+依赖+缺陷)
        }

        return CompletionResult(
            timestamp=datetime.now(timezone.utc).isoformat(),
            overall_score=overall,
            completion_by_criteria={k: round(v, 1) for k, v in criteria_groups.items()},
            dimension_scores={},
            active_gates=0,
        )

    # ── 统一 schema 文档构建 (D296) ──

    def build_single_file_doc(self, target_path: str) -> dict:
        """单文件六条件判定 → 统一 schema 文档。

        A-F 条件映射到 completionByCriteria 六键 (CRITERION_KEY_BY_LETTER)。
        任一条件 status=unknown (数据缺失) → degraded:true + 原因。
        """
        export = Path(target_path).stem
        result = self.evaluate(target_path, export)
        by_letter = {r.letter: r for r in self.results}

        criteria = {}
        conditions = {}
        degraded = False
        reasons = []
        for letter, key in CRITERION_KEY_BY_LETTER.items():
            r = by_letter.get(letter)
            if r is None:
                criteria[key] = make_criteria(0, 1)
                conditions[key] = {"score": 0, "max": 1, "reason": "无判定结果"}
                continue
            passed = 1 if r.status == "pass" else 0
            criteria[key] = make_criteria(passed, 1)
            conditions[key] = {"score": round(r.score, 3), "max": 1, "reason": r.detail}
            if r.status == "unknown":
                degraded = True
                reasons.append(f"{r.name} 数据缺失")

        return {
            "schemaVersion": SCHEMA_VERSION,
            "generator": GENERATOR_COMPLETION_ENGINE,
            "systemScore": round(result.overall_score / 100, 3),
            "totalTasks": 1,
            "completionByCriteria": criteria,
            "degraded": degraded,
            "degradedReason": "; ".join(reasons),
            "generatedAt": result.timestamp,
            "results": [{
                "d_id": target_path,
                "completion": round(result.overall_score / 100, 3),
                "totalScore": round(sum(r.score for r in self.results), 3),
                "totalMax": len(self.results),
                "conditions": conditions,
                "degraded": degraded,
                "degradedReason": "; ".join(reasons),
                "srcFile": target_path,
            }],
        }

    def build_gate_doc(self, gate_data: dict | None) -> dict:
        """基于 gate-status.json 的门禁汇总 → 统一 schema 文档 (D296 2.3)。

        gate_data=None (文件缺失/损坏) → degraded:true + 原因, exit 0,
        禁止输出正常格式假 0 分数据。

        门禁模式六键来自 criteriaGroups (V3 §2.2 条件分组 A/B/C/D):
          A→code_exists, B→wiring_complete, C→test_exists,
          D→path_reachable/dependencies_ok/no_defects (质量组共用 D 数据)
        """
        generated_at = datetime.now(timezone.utc).isoformat()
        if gate_data is None:
            return {
                "schemaVersion": SCHEMA_VERSION,
                "generator": GENERATOR_COMPLETION_ENGINE,
                "systemScore": 0.0,
                "totalTasks": 0,
                "completionByCriteria": empty_criteria(),
                "degraded": True,
                "degradedReason": "gate-status.json missing",
                "generatedAt": generated_at,
                "results": [],
            }

        groups = gate_data.get("criteriaGroups", {})
        summary = gate_data.get("summary", {})
        weighted = summary.get("weightedProgress")
        system_score = float(weighted) if isinstance(weighted, (int, float)) else 0.0

        def group_criteria(letter: str) -> dict:
            g = groups.get(letter, {})
            return make_criteria(g.get("passed", 0), g.get("total", 0))

        return {
            "schemaVersion": SCHEMA_VERSION,
            "generator": GENERATOR_COMPLETION_ENGINE,
            "systemScore": round(system_score, 3),
            "totalTasks": len(gate_data.get("gates", [])),
            "completionByCriteria": {
                "code_exists": group_criteria("A"),
                "wiring_complete": group_criteria("B"),
                "test_exists": group_criteria("C"),
                "path_reachable": group_criteria("D"),
                "dependencies_ok": group_criteria("D"),
                "no_defects": group_criteria("D"),
            },
            "degraded": False,
            "degradedReason": "",
            "generatedAt": generated_at,
            "results": [],
        }


# ═══ CLI ═══

def main():
    parser = argparse.ArgumentParser(description="D261 六条件完成度判定引擎 (D296 统一 schema)")
    parser.add_argument("--target", default="", help="目标文件路径 (任务级完成度由 self-diagnosis.py 生成)")
    parser.add_argument("--output", default="", help="输出路径 (默认 snapshots/{ts}/completion-scores.json)")
    parser.add_argument("--quiet", action="store_true", help="静默模式")
    args = parser.parse_args()

    engine = CompletionEngine(quiet=args.quiet)

    if args.target:
        # 单文件判定模式 (D296 2.2 保留)
        doc = engine.build_single_file_doc(args.target)
    else:
        # 门禁汇总模式 — 缺 gate-status.json → degraded:true (禁止假 0 分)
        gate_data = None
        gate_path = SIGNALS_DIR / "gate-status.json"
        if gate_path.exists():
            try:
                gate_data = json.loads(gate_path.read_text("utf-8", errors="replace"))
            except (json.JSONDecodeError, OSError):
                gate_data = None
        if gate_data is None:
            print("[completion-engine] gate-status.json 缺失或损坏 — degraded 输出", file=sys.stderr)
        doc = engine.build_gate_doc(gate_data)

    # 铁律 47: 输出前契约校验 — 非法文档不写入
    schema_errors = validate_completion_schema(doc)
    if schema_errors:
        for err in schema_errors:
            print(f"[completion-engine] [ERROR] schema 校验失败: {err}", file=sys.stderr)
        sys.exit(1)

    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    if args.output:
        output_path = Path(args.output)
    else:
        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        output_dir = SNAPSHOTS_DIR / ts
        output_dir.mkdir(parents=True, exist_ok=True)
        output_path = output_dir / "completion-scores.json"
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # 原子写入: 临时文件 + rename, 避免半截 JSON
    tmp = output_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, output_path)

    if not args.quiet:
        print(f"\n  systemScore: {doc['systemScore']:.3f}")
        for key, entry in doc["completionByCriteria"].items():
            print(f"    {key}: {entry['pct']}%")
        if doc["degraded"]:
            print(f"  [degraded] {doc['degradedReason']}")
        print(f"  输出: {output_path}")

    # degraded 也 exit 0 — 缺数据是运行时状态, 不是脚本失败 (D296 2.3)
    sys.exit(0)


if __name__ == "__main__":
    main()
