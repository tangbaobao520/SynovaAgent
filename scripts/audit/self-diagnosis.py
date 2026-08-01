#!/usr/bin/env python3
"""
self-diagnosis.py — 研发模式六条件判定 CLI (D267, D296 修复)

权威17 §二.3: 对每个 D# 任务评估 6 条件完成度。
输出到 .codex/snapshots/{ts}/completion-scores.json。

6 条件:
  1. code_exists      - 代码文件存在 + 非空壳(>5行非空有效代码)
  2. wiring_complete  - 依赖图入边 > 0 (排除 .test.)
  3. test_exists      - 测试文件存在 + expect() >= 3
  4. path_reachable   - 从入口(src/server.ts)反向可达
  5. dependencies_ok  - import 路径可解析
  6. no_defects       - deviation-report 或 gate-status 无 P0/P1

D296 修复 (控制塔数据真实性):
  B1  find_source_file 双通道: brief "文件审计" 映射优先, 文件名匹配降级
  B2  list_task_briefs 解析 "文件审计" 字段 (parse_brief_file_mapping)
  B3  d_id 正则 D\\d+[a-z]? 取首个语义完整匹配 (D8a-D8f 不再归并为 D8)
  B4  wiring 检查 Python 原生扫描 (build_ref_index, 替代 grep 子进程)
  B5  同名 D# 多 brief 去重, 只保留最新文件 (mtime)
  C   输出统一 schema (completion_schema.py), 缺数据 → degraded:true

用法:
  python scripts/audit/self-diagnosis.py
  python scripts/audit/self-diagnosis.py --output custom/path.json

契约:
  @input  — gate-status.json + git log + task-briefs/ + tests/
  @output — completion-scores.json (统一 schema: completion_schema.py)
  @degraded — 输入缺失 -> degraded:true + degradedReason (禁止假 0 分)
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

# 同目录模块 (completion_schema) — 独立运行与 importlib 测试加载都可用
sys.path.insert(0, str(Path(__file__).resolve().parent))

from completion_schema import (
    SCHEMA_VERSION,
    GENERATOR_SELF_DIAGNOSIS,
    CRITERIA_KEYS,
    make_criteria,
    validate_completion_schema,
)

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SNAPSHOT_DIR = PROJECT_ROOT / ".codex" / "snapshots"
CHECKPOINTS_DIR = PROJECT_ROOT / ".codex" / "checkpoints"
GATE_STATUS_PATH = PROJECT_ROOT / ".codex" / "signals" / "gate-status.json"
DEPGRAPH_PATH = PROJECT_ROOT / ".codex" / "dependency-graph.json"


# ═══ 数据采集 ═══


def load_gate_status() -> dict:
    """读取 gate-status.json，返回 gate 列表和汇总"""
    path = PROJECT_ROOT / ".codex" / "signals" / "gate-status.json"
    if not path.exists():
        return {"gates": [], "summary": {"passed": 0, "partial": 0, "failed": 0, "total": 0}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {"gates": [], "summary": {"passed": 0, "partial": 0, "failed": 0, "total": 0}}


def get_git_log(days: int = 30) -> list[str]:
    """获取最近 N 天的 git commit 记录"""
    try:
        r = subprocess.run(
            ["git", "log", f"--since={days}.days", "--oneline"],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            cwd=PROJECT_ROOT, timeout=15,
        )
        return [line.strip() for line in r.stdout.strip().split("\n") if line]
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return []


def list_task_briefs(briefs_dir: Path | None = None) -> list[dict]:
    """扫描 task-briefs/ 提取 D# 任务信息 (B2/B3/B5 修复)

    字段: d_id / filename / brief_text / done_standards / has_done
    修复:
      B3  d_id 正则 D\\d+[a-z]? 取**首个**语义完整匹配 (D8a-D8f 独立, D1D3D5 取 D1)
      B5  同名 D# 多 brief 只保留最新文件 (mtime 最新, 同 mtime 取文件名大者)
    """
    if briefs_dir is None:
        briefs_dir = PROJECT_ROOT / ".claude" / "task-briefs"
    tasks: list[dict] = []
    if not briefs_dir.exists():
        return tasks
    for f in sorted(briefs_dir.iterdir()):
        if not f.name.endswith(".md"):
            continue
        # B3: D\d+[a-z]? 取首个匹配
        d_matches = re.findall(r"D\d+[a-z]?", f.name)
        d_id = d_matches[0] if d_matches else ""
        brief_text = f.read_text(encoding="utf-8", errors="replace")
        # 提取关键字段
        done_match = re.search(r"## Done 标准\s*([\s\S]*?)(?=\n## |\Z)", brief_text)
        done_text = done_match.group(1).strip() if done_match else ""
        try:
            mtime = f.stat().st_mtime
        except OSError:
            mtime = 0.0
        tasks.append({
            "d_id": d_id,
            "filename": f.name,
            "brief_text": brief_text,
            "done_standards": done_text,
            "has_done": bool(done_text),
            "_mtime": mtime,
        })
    # B5: 同名 D# 去重 — 只保留最新文件
    latest_by_id: dict[str, dict] = {}
    for t in sorted(tasks, key=lambda t: (t["_mtime"], t["filename"])):
        if t["d_id"]:
            latest_by_id[t["d_id"]] = t
    deduped: list[dict] = []
    for t in tasks:
        if t["d_id"]:
            if latest_by_id.get(t["d_id"]) is t:
                deduped.append(t)
        else:
            deduped.append(t)
    return deduped


# 排除标记 — 行内含这些词的路径不是交付物 (旧 brief 常标注 "不改/排除")
# 注意: "删除/废弃" 不在其中 — D69 类任务以删除文件为交付物, 文件存在性由
# code_exists 物理判定, 不能因为行内出现 "删除" 就跳过映射。
_EXCLUDE_MARKERS = ("不改", "排除", "不动", "不修改", "不删除")

# 源文件扩展名 (含 json — D31 类纯 JSON 配置任务)
_PATH_RE = re.compile(r"([\w./-]+\.(?:ts|tsx|py|sh|js|mjs|json))\b")
# 旧格式 "filename.ts(src/monitoring/)" — 文件名在前, 目录在括号
_PAREN_DIR_RE = re.compile(r"([\w.-]+\.(?:ts|tsx|py|sh|js|mjs|json))\(([\w./-]+)/\)")


def parse_brief_file_mapping(brief_text: str) -> list[str]:
    """解析 task brief "文件审计" 字段 (B2), 提取源文件候选路径。

    兼容三种历史格式:
      1. "- src/foo.ts: 描述" 列表格式 (V4.5 现行)
      2. "| foo.ts | 零存在 | 新建" 表格格式 (2026-06/07 旧格式)
      3. "foo.ts(src/dir/): 描述" 括号目录格式 (2026-07 旧格式)
      4. 裸文件名 + 行内 (不改/排除) 标记 (自动过滤非交付物)
    小节标题兼容 "### b) 文件审计" 与 "b) 文件审计" (无 ###)。
    无 b) 小节时降级全文本提取。排除测试文件。
    返回按出现顺序去重的路径列表。
    """
    if not brief_text:
        return []
    section = re.search(r"#{0,3}\s*b\)\s*文件审计([\s\S]*?)(?=\n#{0,3}\s*[a-d]\)|\n## |\Z)", brief_text)
    section_text = section.group(1) if section else brief_text
    paths: list[str] = []
    for line in section_text.split("\n"):
        if any(mark in line for mark in _EXCLUDE_MARKERS):
            continue
        for name, dirpath in _PAREN_DIR_RE.findall(line):
            paths.append(f"{dirpath}/{name}")
        paths.extend(_PATH_RE.findall(line))
    seen: set[str] = set()
    out: list[str] = []
    for p in paths:
        p = p.strip()
        if p in seen or ".test." in p or p.startswith("."):
            continue
        seen.add(p)
        out.append(p)
    return out


# 通道1 候选解析根 — 裸文件名按这些根目录解析
_SOURCE_ROOTS = ("src", "scripts", "extensions", "packages")


def _find_by_bare_name(cand: str) -> str | None:
    """裸文件名 → 在已知根目录下递归查找 (rbac.ts → src/middleware/rbac.ts)"""
    for root in _SOURCE_ROOTS:
        base = PROJECT_ROOT / root
        if not base.exists():
            continue
        try:
            for f in base.rglob(cand):
                if "node_modules" in f.parts:
                    continue
                if f.is_file():
                    return str(f.relative_to(PROJECT_ROOT)).replace("\\", "/")
        except OSError:
            # 断裂符号链接 (packages/*/node_modules) 等 — 跳过该根
            continue
    return None


def _resolve_candidate(cand: str) -> str | None:
    """把 brief 中提取的路径解析为仓库相对路径。

    支持: 完整相对路径 (src/foo.ts), 部分路径 (routes/foo.ts → src/routes/foo.ts),
    裸文件名 (foo.ts → 递归搜索 src/ scripts/ extensions/ packages/)。
    """
    cand = cand.strip()
    if not cand:
        return None
    if (PROJECT_ROOT / cand).exists():
        return cand.replace("\\", "/")
    for root in _SOURCE_ROOTS:
        if (PROJECT_ROOT / f"{root}/{cand}").exists():
            return f"{root}/{cand}".replace("\\", "/")
    if "/" not in cand:
        return _find_by_bare_name(cand)
    return None


def build_did_content_index(roots: list[Path]) -> dict[str, str]:
    """D# → 首个内容引用文件 索引 (通道2b)。

    原设计注释即 "扫描文件名或**内容**含 d_id" — 内容匹配从未实现。
    一次扫描全部文件, 每文件提取所有 D\\d+[a-z]? 提及, 首个命中者入索引。
    主流程单次构建, 供全部任务降级通道复用 (避免每任务全仓扫描)。
    """
    index: dict[str, str] = {}
    pattern = re.compile(r"D\d+[a-z]?")
    for base in roots:
        if not base.exists():
            continue
        try:
            for f in base.rglob("*"):
                if f.suffix not in (".ts", ".tsx", ".py", ".sh", ".js", ".mjs"):
                    continue
                if "node_modules" in f.parts:
                    continue
                try:
                    text = f.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue
                rel = str(f.relative_to(PROJECT_ROOT)).replace("\\", "/")
                for m in pattern.finditer(text):
                    key = m.group(0).lower()
                    if key not in index:
                        index[key] = rel
        except OSError:
            continue
    return index


def find_source_file(
    d_id: str,
    brief_text: str | None = None,
    scan_roots: list[Path] | None = None,
    did_index: dict[str, str] | None = None,
) -> tuple[str | None, str]:
    """根据 D# 查找对应的源码文件 (B1 双通道修复)。

    通道1 (优先): 解析 task brief "文件审计" 字段 → 映射文件
    通道2 (降级): 文件名匹配, 无果时内容匹配 (D# 在文件内容中提及)
                  + degraded_reason="brief 无映射, 文件名匹配" / "文件名/内容匹配"

    返回 (相对路径 | None, degraded_reason)。degraded_reason 空 = 无降级。
    scan_roots 供测试注入 (默认 src/ + scripts/)。
    """
    # 通道1: brief 文件审计映射 (支持裸文件名 → 根目录解析)
    if brief_text:
        for cand in parse_brief_file_mapping(brief_text):
            resolved = _resolve_candidate(cand)
            if resolved is not None:
                return resolved, ""
    # 通道2a: 文件名匹配 (降级)
    roots = scan_roots if scan_roots is not None else [
        PROJECT_ROOT / "src", PROJECT_ROOT / "scripts"]
    for base in roots:
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in (".ts", ".tsx", ".py", ".sh"):
                continue
            if d_id.lower() in f.stem.lower():
                if base.is_relative_to(PROJECT_ROOT):
                    rel = str(f.relative_to(PROJECT_ROOT)).replace("\\", "/")
                else:
                    rel = str(f.relative_to(base)).replace("\\", "/")
                return rel, "brief 无映射, 文件名匹配"
    # 通道2b: 内容匹配 (D# 在文件内容中提及) — 原设计注释的意图
    if did_index:
        rel = did_index.get(d_id.lower())
        if rel is not None:
            return rel, "brief 无映射, 文件名/内容匹配"
    return None, f"未找到 {d_id} 对应源文件"


def grep_module_refs(module_stem: str, roots: list[Path], exclude_files: set[str]) -> list[str]:
    """Python 原生扫描 (B4): 返回引用 module_stem 的文件列表 (排除自身与测试)。

    复用 audit-check.py grep_in_files 模式 — Windows 无 grep 子进程也能运行。
    """
    hits: list[str] = []
    pattern = re.compile(rf"\b{re.escape(module_stem)}\b")
    for base in roots:
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in (".ts", ".tsx", ".py", ".sh"):
                continue
            rel = str(f.relative_to(PROJECT_ROOT)).replace("\\", "/")
            if rel in exclude_files or ".test." in rel:
                continue
            try:
                text = f.read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            if pattern.search(text):
                hits.append(rel)
    return hits


def build_ref_index(roots: list[Path]) -> dict[str, int]:
    """构建 模块名 → 被引用文件数 索引 (B4: wiring 检查高性能通道)。

    对每个源码文件的 stem, 统计它出现在多少其他文件中 (排除自身/测试)。
    单次扫描所有文件, 每个文件用一次正则交替匹配全部 stem。
    """
    files: list[Path] = []
    for base in roots:
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in (".ts", ".tsx", ".py", ".sh") or ".test." in f.name:
                continue
            files.append(f)

    stems: dict[str, str] = {}
    for f in files:
        rel = str(f.relative_to(PROJECT_ROOT)).replace("\\", "/")
        stems[rel] = f.stem

    index: dict[str, int] = {}
    for f in files:
        rel = str(f.relative_to(PROJECT_ROOT)).replace("\\", "/")
        try:
            text = f.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        # 一次正则交替匹配全部 stem, 避免逐 stem 扫描
        alternation = re.compile(
            r"\b(?:" + "|".join(re.escape(s) for s in stems.values()) + r")\b")
        for stem in set(alternation.findall(text)):
            if stem != stems.get(rel):
                index[stem] = index.get(stem, 0) + 1
    return index


def count_expects(file_rel: str) -> int:
    """统计测试文件中的 expect() 调用数"""
    test_path = PROJECT_ROOT / file_rel
    if not test_path.exists():
        return 0
    try:
        text = test_path.read_text(encoding="utf-8", errors="replace")
        return text.count("expect(")
    except OSError:
        return 0


def check_imports(file_rel: str) -> bool:
    """检查源码文件的 import 路径是否可解析"""
    src_path = PROJECT_ROOT / file_rel
    if not src_path.exists():
        return False
    try:
        text = src_path.read_text(encoding="utf-8", errors="replace")
        imports = re.findall(r"""(?:from|import)\s+['\"]([^'\"]+)['\"]""", text)
        local_paths = [i for i in imports if i.startswith(".") or i.startswith("src/")]
        for lp in local_paths:
            resolved = lp.replace(".", "/") + ".ts"
            full = PROJECT_ROOT / resolved
            if not full.exists():
                resolved_alt = lp + "/index.ts"
                full_alt = PROJECT_ROOT / resolved_alt
                if not full_alt.exists():
                    return False
        return True
    except OSError:
        return False


def build_depgraph() -> dict[str, list[str]]:
    """扫描 src/ 和 scripts/ 的 .ts import, 构建邻接表 (谁依赖谁)。

    格式: { "src/server.ts": ["src/foo.ts", ...], ... }
    失败时返回空 dict, 调用方回退到目录检查。
    """
    graph: dict[str, list[str]] = {}
    try:
        for root_dir in ["src", "scripts"]:
            base = PROJECT_ROOT / root_dir
            if not base.exists():
                continue
            for ts_file in base.rglob("*.ts"):
                rel = str(ts_file.relative_to(PROJECT_ROOT)).replace("\\", "/")
                graph.setdefault(rel, [])
                text = ts_file.read_text(encoding="utf-8", errors="replace")
                imports = re.findall(r"""(?:from|import)\s+['\"]([^'\"]+)['\"]""", text)
                for imp in imports:
                    if not imp.startswith("."):
                        continue
                    try:
                        imp_path = (ts_file.parent / imp).resolve()
                        resolved = str(imp_path.relative_to(PROJECT_ROOT)).replace("\\", "/")
                        if not resolved.endswith(".ts") and not resolved.endswith(".py"):
                            resolved += ".ts"
                        graph[rel].append(resolved)
                    except (ValueError, OSError):
                        continue
        return graph
    except Exception:
        return {}


def is_reachable_from_entry(file_rel: str, depgraph: dict[str, list[str]] | None = None) -> bool:
    """BFS 判定 file_rel 是否从入口 src/server.ts 可达。

    需要依赖图 depgraph。depgraph 为空时回退到目录检查 (src/ 或 scripts/)。
    """
    if not depgraph:
        return "src/" in file_rel or "scripts/" in file_rel  # fallback

    entry = "src/server.ts"
    if file_rel == entry:
        return True

    visited: set[str] = {entry}
    queue: list[str] = [entry]

    while queue:
        node = queue.pop(0)
        for dep in depgraph.get(node, []):
            if dep == file_rel:
                return True
            if dep not in visited:
                visited.add(dep)
                queue.append(dep)
    return False


def check_gate_issues(d_id: str, gate_data: dict) -> int:
    """检查 gate 状态中与当前 D# 相关的问题数量"""
    gates = gate_data.get("gates", [])
    issues = 0
    for g in gates:
        if g.get("status") in ("fail",) and d_id.lower() in g.get("details", "").lower():
            issues += 1
        for cond in g.get("conditions", {}):
            if cond == "failed" and g.get("conditions", {}).get(cond, 0) > 0:
                issues += g["conditions"][cond]
    return issues


# ═══ 核心判定 ═══


def evaluate_task(
    task: dict,
    gate_data: dict,
    depgraph: dict[str, list[str]] | None = None,
    ref_index: dict[str, int] | None = None,
    did_index: dict[str, str] | None = None,
) -> dict:
    """对单个 D# 执行 6 条件判定 (B1/B4 修复)

    B1: find_source_file 双通道 — brief 文件审计映射优先, 降级带 degradedReason
    B4: wiring 用 ref_index (Python 原生) 替代 grep 子进程
    """
    d_id = task["d_id"]
    src_file, src_degraded = find_source_file(
        d_id, task.get("brief_text"), did_index=did_index)
    test_file = None
    if src_file:
        # 推导测试文件路径
        test_file = src_file.replace(".ts", ".test.ts")
        if not (PROJECT_ROOT / test_file).exists():
            test_file = None

    conditions = {
        "code_exists": {
            "score": 0,
            "max": 1,
            "reason": "源码文件不存在",
        },
        "wiring_complete": {
            "score": 0,
            "max": 1,
            "reason": "缺少接线验证",
        },
        "test_exists": {
            "score": 0,
            "max": 1,
            "reason": "测试文件不存在或 expect 不足",
        },
        "path_reachable": {
            "score": 0,
            "max": 1,
            "reason": "从入口不可达",
        },
        "dependencies_ok": {
            "score": 0,
            "max": 1,
            "reason": "依赖解析失败",
        },
        "no_defects": {
            "score": 0,
            "max": 1,
            "reason": "Gate 检测到问题",
        },
    }

    degraded = False

    # C1: code_exists
    if src_file:
        src_path = PROJECT_ROOT / src_file
        if src_path.exists():
            code = src_path.read_text(encoding="utf-8", errors="replace")
            # 空壳检测: >5 行有效代码
            non_empty = [l for l in code.split("\n") if l.strip() and not l.strip().startswith(("#", "//", "/*", "*"))]
            if len(non_empty) > 5:
                conditions["code_exists"]["score"] = 1
                conditions["code_exists"]["reason"] = f"OK: {src_file}"
            else:
                conditions["code_exists"]["reason"] = f"空壳文件: {src_file} ({len(non_empty)} 行有效代码)"
        else:
            conditions["code_exists"]["reason"] = f"文件不存在: {src_file}"
    else:
        conditions["code_exists"]["reason"] = f"未找到 {d_id} 对应源文件"

    # C2: wiring_complete — B4: Python 原生扫描 (Windows 无 grep 也能运行)
    if src_file:
        module_stem = src_file.split("/")[-1].replace(".ts", "")
        if ref_index is not None:
            ref_count = ref_index.get(module_stem, 0)
        else:
            ref_count = len(grep_module_refs(
                module_stem, [PROJECT_ROOT / "src"], {src_file}))
        if ref_count > 0:
            conditions["wiring_complete"]["score"] = 1
            conditions["wiring_complete"]["reason"] = f"入边 {ref_count} 个引用"
        else:
            conditions["wiring_complete"]["reason"] = "零外部引用"
    else:
        conditions["wiring_complete"]["reason"] = "无源文件"

    # C3: test_exists
    if test_file:
        expects = count_expects(test_file)
        if expects >= 3:
            conditions["test_exists"]["score"] = 1
            conditions["test_exists"]["reason"] = f"OK: {test_file} ({expects} expect)"
        else:
            conditions["test_exists"]["reason"] = f"expect 不足: {test_file} ({expects}/3)"
    elif src_file:
        conditions["test_exists"]["reason"] = f"测试文件不存在: 期望 {src_file.replace('.ts', '.test.ts')}"
    else:
        conditions["test_exists"]["reason"] = "无源文件"

    # C4: path_reachable — 使用 BFS 从入口反向搜索
    if src_file and is_reachable_from_entry(src_file, depgraph):
        conditions["path_reachable"]["score"] = 1
        conditions["path_reachable"]["reason"] = "BFS: 从入口可达"
    else:
        conditions["path_reachable"]["reason"] = "BFS: 从入口不可达或文件不存在"

    # C5: dependencies_ok
    if src_file and check_imports(src_file):
        conditions["dependencies_ok"]["score"] = 1
        conditions["dependencies_ok"]["reason"] = "import 路径可解析"
    else:
        conditions["dependencies_ok"]["reason"] = "import 解析失败或无源文件"

    # C6: no_defects
    issues = check_gate_issues(d_id, gate_data)
    if issues == 0:
        conditions["no_defects"]["score"] = 1
        conditions["no_defects"]["reason"] = "Gate 无相关问题"
    else:
        conditions["no_defects"]["reason"] = f"Gate 相关问题: {issues} 项"

    total_score = sum(c["score"] for c in conditions.values())
    total_max = sum(c["max"] for c in conditions.values())
    completion = total_score / total_max if total_max > 0 else 0

    return {
        "d_id": d_id,
        "completion": round(completion, 3),
        "totalScore": total_score,
        "totalMax": total_max,
        "conditions": conditions,
        "degraded": degraded or bool(src_degraded),
        "degradedReason": src_degraded,
        "srcFile": src_file or "",
    }


# ═══ 汇总 ═══


def aggregate_results(
    results: list[dict],
    generated_at: str,
    degraded: bool = False,
    degraded_reason: str = "",
) -> dict:
    """汇总所有任务的判定结果 (D296: 统一 schema 输出)

    修复: systemScore 用全部任务的均值 (含 0 分任务),
    旧实现只对 completion>0 求均值 → 63 任务全 0.167 的假高分。
    """
    total = len(results)
    scores = [r["completion"] for r in results]
    avg = sum(scores) / total if total else 0.0

    c1 = sum(1 for r in results if r["conditions"]["code_exists"]["score"] == 1)
    c2 = sum(1 for r in results if r["conditions"]["wiring_complete"]["score"] == 1)
    c3 = sum(1 for r in results if r["conditions"]["test_exists"]["score"] == 1)
    c4 = sum(1 for r in results if r["conditions"]["path_reachable"]["score"] == 1)
    c5 = sum(1 for r in results if r["conditions"]["dependencies_ok"]["score"] == 1)
    c6 = sum(1 for r in results if r["conditions"]["no_defects"]["score"] == 1)

    return {
        "schemaVersion": SCHEMA_VERSION,
        "generator": GENERATOR_SELF_DIAGNOSIS,
        "systemScore": round(avg, 3),
        "totalTasks": total,
        "completionByCriteria": {
            "code_exists": make_criteria(c1, total),
            "wiring_complete": make_criteria(c2, total),
            "test_exists": make_criteria(c3, total),
            "path_reachable": make_criteria(c4, total),
            "dependencies_ok": make_criteria(c5, total),
            "no_defects": make_criteria(c6, total),
        },
        "degraded": degraded,
        "degradedReason": degraded_reason,
        "generatedAt": generated_at,
        "results": results,
        # 兼容字段 (非 schema 契约一部分)
        "baselineScore": 0.5,
        "trend": "stable",
    }


# ═══ CLI ═══


def write_checkpoint(filename: str, name: str, status: str, reason: str, checked_at: str) -> None:
    """写入检查点文件 (L3-5, 与 cp3-commit-check.json 同格式)"""
    try:
        CHECKPOINTS_DIR.mkdir(parents=True, exist_ok=True)
        payload = {"name": name, "status": status, "reason": reason, "checkedAt": checked_at}
        (CHECKPOINTS_DIR / filename).write_text(
            json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError as e:
        print(f"[self-diagnosis] [WARN] 检查点写入失败: {e}", file=sys.stderr)


def persist_depgraph(depgraph: dict[str, list[str]], generated_at: str) -> bool:
    """L3-4: 持久化依赖图到 .codex/dependency-graph.json (视图4 消费格式)。

    视图期望 {"nodes": {文件: [依赖...]}} — 与 D271 workflow_graph.py 契约对齐。
    失败返回 False, 不阻断主流程。
    """
    try:
        doc = {"generatedAt": generated_at, "nodes": depgraph}
        DEPGRAPH_PATH.parent.mkdir(parents=True, exist_ok=True)
        tmp = DEPGRAPH_PATH.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, DEPGRAPH_PATH)
        return True
    except OSError as e:
        print(f"[self-diagnosis] [WARN] 依赖图持久化失败: {e}", file=sys.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(description="Synova 研发模式六条件判定 CLI (D267/D296)")
    parser.add_argument("--output", default="", help="输出路径 (默认 .codex/snapshots/{ts}/completion-scores.json)")
    parser.add_argument("--quiet", action="store_true", help="静默模式")
    args = parser.parse_args()

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    gate_loaded = GATE_STATUS_PATH.exists()
    gate_data = load_gate_status()
    tasks = list_task_briefs()
    git_log = get_git_log()

    if not tasks and not args.quiet:
        print("[self-diagnosis] [WARN] 未找到 task briefs", file=sys.stderr)

    depgraph = build_depgraph()
    if depgraph and not args.quiet:
        print(f"[self-diagnosis] 依赖图构建: {len(depgraph)} 个节点")
    # B4: 引用索引单次构建, 供全部任务 wiring 判定
    ref_index = build_ref_index([PROJECT_ROOT / "src"])
    # 通道2b: D# 内容引用索引单次构建 (原设计注释 "文件名或内容含 d_id")
    did_index = build_did_content_index([PROJECT_ROOT / "src", PROJECT_ROOT / "scripts"])

    results = [evaluate_task(t, gate_data, depgraph, ref_index, did_index)
               for t in tasks if t["d_id"]]

    # D296: 缺数据 → degraded:true + 原因 (禁止正常格式假数据)
    degraded = not gate_loaded or not results
    degraded_reasons = []
    if not gate_loaded:
        degraded_reasons.append("gate-status.json 缺失")
    if not results:
        degraded_reasons.append("无 task briefs 可评估")
    degraded_extra = [r.get("degradedReason", "") for r in results if r.get("degraded")]
    degraded_extra = [r for r in degraded_extra if r][:3]
    if degraded_extra:
        degraded_reasons.append("; ".join(degraded_extra))

    report = aggregate_results(
        results, generated_at=ts,
        degraded=degraded,
        degraded_reason="; ".join(degraded_reasons),
    )
    report["gitCommits"] = len(git_log)
    report["tasksEvaluated"] = len(results)

    # 铁律 47: 输出前契约校验 — 非法文档不写入 (禁止正常格式假数据)
    schema_errors = validate_completion_schema(report)
    if schema_errors:
        for err in schema_errors:
            print(f"[self-diagnosis] [ERROR] schema 校验失败: {err}", file=sys.stderr)
        sys.exit(1)

    if args.output:
        output_path = Path(args.output)
    else:
        snapshot_dir = SNAPSHOT_DIR / ts
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        output_path = snapshot_dir / "completion-scores.json"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    # 原子写入: 临时文件 + rename, 避免半截 JSON
    tmp = output_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    os.replace(tmp, output_path)

    # L3-4: 依赖图持久化 (视图4 数据)
    persist_depgraph(depgraph, ts)
    # L3-5: cp2 完成度快照检查点
    c1_pct = report["completionByCriteria"]["code_exists"]["pct"]
    cp2_status = "pass" if c1_pct >= 90 else "fail"
    write_checkpoint(
        "cp2-completion-check.json", "CP2: 完成度快照检查", cp2_status,
        f"code_exists {c1_pct}% (目标 >=90%)", ts)

    if not args.quiet:
        print(f"[self-diagnosis] [OK] 完成: {output_path}")
        print(f"  系统评分: {report['systemScore']}")
        print(f"  任务数: {report['totalTasks']}")
        print(f"  C1代码: {report['completionByCriteria']['code_exists']['pct']}%")
        print(f"  C2接线: {report['completionByCriteria']['wiring_complete']['pct']}%")
        print(f"  C3测试: {report['completionByCriteria']['test_exists']['pct']}%")
        if report["degraded"]:
            print(f"  [degraded] {report['degradedReason']}")

    sys.exit(0)


if __name__ == "__main__":
    main()
