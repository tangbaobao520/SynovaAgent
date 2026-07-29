#!/usr/bin/env python3
"""
completion-engine.py — V3 §3.2 六条件判定引擎 (D261)

对目标代码文件/模块进行六维度完成度判定:
A. 代码存在 (Path Exists)
B. 接线完整 (Wired — grep 调用方)
C. 测试存在 (Test Exists)
D. 路径可达 (Import Chain Verifiable)
E. 依赖可用 (Dependencies Resolvable)
F. 无已知缺陷 (No Known Defect — known-error-patterns.json match)

输出 completion-scores.json 到 snapshots/ 目录。

用法:
  python scripts/audit/completion-engine.py
  python scripts/audit/completion-engine.py --target path/to/file.ts
  python scripts/audit/completion-engine.py --output snapshots/completion-scores.json

契约:
  @input  — 代码库文件系统 + .codex/audit/known-error-patterns.json + node_modules
  @output — completion-scores.json (含 overall/completionByCriteria/dimensions)
  @degraded — known-error-patterns.json 缺失 -> C6 标记 unknown, 不阻止其他判定
"""
import argparse
import json
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ═══ 常量 ═══

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SNAPSHOTS_DIR = PROJECT_ROOT / ".codex/snapshots"
SIGNALS_DIR = PROJECT_ROOT / ".codex/signals"
KNOWN_ERRORS_PATH = PROJECT_ROOT / ".codex/audit/known-error-patterns.json"

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
class CriteriaGroup:
    """四个条件分组 (V3 §2.2)"""
    letter: str          # A/B/C/D
    name: str            # 分组名称
    completion_pct: float = 0.0  # 0-100
    remaining_tasks: list = field(default_factory=list)

@dataclass
class CompletionResult:
    """完整完成度结果"""
    timestamp: str
    overall_score: float                 # 0-100
    completion_by_criteria: dict = field(default_factory=dict)  # {"A": pct, "B": pct, ...}
    dimension_scores: dict = field(default_factory=dict)        # {"基础": 85, "接入": 70, ...}
    active_gates: int = 0
    dimension_breakdown: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "overallScore": round(self.overall_score, 1),
            "completionByCriteria": {k: round(v, 1) for k, v in self.completion_by_criteria.items()},
            "dimensionScores": {k: round(v, 1) for k, v in self.dimension_scores.items()},
            "activeGates": self.active_gates,
            "dimensionBreakdown": self.dimension_breakdown,
        }


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

    def run_all(self, gate_data: dict) -> CompletionResult:
        """基于 gate-status.json 的门禁数据执行完整评估"""
        gates = gate_data.get("gates", [])
        summary = gate_data.get("summary", {})

        # 按 dimension 分组
        dim_gates: dict[str, list] = {}
        for g in gates:
            dim = g.get("dimension", "unknown")
            dim_gates.setdefault(dim, []).append(g)

        dimension_scores = {}
        dim_breakdown = []
        total_weighted = 0.0
        total_count = 0

        status_w = {"pass": 1.0, "partial": 0.5, "fail": 0.0, "unverifiable": 0.0}

        for dim, dim_gate_list in dim_gates.items():
            count = len(dim_gate_list)
            total_count += count
            dim_score = sum(status_w.get(g.get("status", "fail"), 0.0) for g in dim_gate_list)
            avg = (dim_score / max(count, 1)) * 100
            dimension_scores[dim] = round(avg, 1)
            total_weighted += dim_score
            dim_breakdown.append({
                "dimension": dim,
                "gateCount": count,
                "score": round(avg, 1),
                "status": "pass" if avg >= 80 else "partial" if avg >= 40 else "fail",
            })

        overall = (total_weighted / max(total_count, 1)) * 100

        # 四条件分组 — 按 V3 §2.2
        completion_by_criteria = {
            "A": dimension_scores.get("基础", 0),
            "B": dimension_scores.get("接入", 0),
            "C": dimension_scores.get("诊断", 0),
            "D": (dimension_scores.get("导航", 0) + dimension_scores.get("持续运行", 0)
                  + dimension_scores.get("进化", 0) + dimension_scores.get("控制", 0)) / 4,
        }

        return CompletionResult(
            timestamp=datetime.now(timezone.utc).isoformat(),
            overall_score=overall,
            completion_by_criteria={k: round(v, 1) for k, v in completion_by_criteria.items()},
            dimension_scores=dimension_scores,
            active_gates=len(gates),
            dimension_breakdown=dim_breakdown,
        )


# ═══ CLI ═══

def main():
    parser = argparse.ArgumentParser(description="D261 六条件完成度判定引擎")
    parser.add_argument("--target", default="", help="目标文件路径 (默认基于 gate-status.json)")
    parser.add_argument("--output", default="", help="输出路径 (默认 snapshots/{ts}/completion-scores.json)")
    parser.add_argument("--quiet", action="store_true", help="静默模式")
    args = parser.parse_args()

    engine = CompletionEngine(quiet=args.quiet)

    if args.target:
        # 单目标模式
        export = Path(args.target).stem
        result = engine.evaluate(args.target, export)
    else:
        # 从 gate-status.json 读取
        gate_path = SIGNALS_DIR / "gate-status.json"
        if not gate_path.exists():
            print("[completion-engine] gate-status.json 不存在 — 空运行")
            result = CompletionResult(
                timestamp=datetime.now(timezone.utc).isoformat(),
                overall_score=0.0,
                completion_by_criteria={"A": 0, "B": 0, "C": 0, "D": 0},
                dimension_scores={},
                active_gates=0,
            )
        else:
            gate_data = json.loads(gate_path.read_text("utf-8", errors="replace"))
            result = engine.run_all(gate_data)

    # 输出
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    output_dir = SNAPSHOTS_DIR / ts
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "completion-scores.json"
    output_path.write_text(
        json.dumps(result.to_dict(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    if not args.quiet:
        print(f"\n  overall: {result.overall_score:.1f}%")
        for k, v in result.completion_by_criteria.items():
            print(f"    {k}: {v:.1f}%")
        print(f"  输出: {output_path}")
    print(json.dumps(result.to_dict(), ensure_ascii=False))


if __name__ == "__main__":
    main()
