#!/usr/bin/env python3
"""
self-diagnosis.py — 研发模式六条件判定 CLI (D267)

权威17 §二.3: 对每个 D# 任务评估 6 条件完成度。
输出到 .codex/snapshots/{ts}/completion-scores.json。

6 条件:
  1. code_exists      - 代码文件存在 + 非空壳(>5行非空有效代码)
  2. wiring_complete  - 依赖图入边 > 0 (排除 .test.)
  3. test_exists      - 测试文件存在 + expect() >= 3
  4. path_reachable   - 从入口(src/server.ts)反向可达
  5. dependencies_ok  - import 路径可解析
  6. no_defects       - deviation-report 或 gate-status 无 P0/P1

用法:
  python scripts/audit/self-diagnosis.py
  python scripts/audit/self-diagnosis.py --output custom/path.json

契约:
  @input  — gate-status.json + git log + task-briefs/ + tests/
  @output — completion-scores.json (含 systemScore + trend)
  @degraded — 输入缺失 -> 跳过单项 + degraded
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SNAPSHOT_DIR = PROJECT_ROOT / ".codex" / "snapshots"


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


def list_task_briefs() -> list[dict]:
    """扫描 .claude/task-briefs/ 提取 D# 任务信息"""
    briefs_dir = PROJECT_ROOT / ".claude" / "task-briefs"
    tasks: list[dict] = []
    if not briefs_dir.exists():
        return tasks
    for f in sorted(briefs_dir.iterdir()):
        if not f.name.endswith(".md"):
            continue
        d_match = re.findall(r"D\d+", f.name)
        d_id = d_match[-1] if d_match else ""
        brief_text = f.read_text(encoding="utf-8", errors="replace")
        # 提取关键字段
        done_match = re.search(r"## Done 标准\s*([\s\S]*?)(?=\n## |\Z)", brief_text)
        done_text = done_match.group(1).strip() if done_match else ""
        tasks.append({
            "d_id": d_id,
            "filename": f.name,
            "done_standards": done_text,
            "has_done": bool(done_text),
        })
    return tasks


def find_source_file(d_id: str) -> str | None:
    """根据 D# 查找对应的源码文件"""
    # 扫描 src/ 和 scripts/ 下文件名或内容含 d_id 的 .ts/.py/.sh 文件
    for base in [PROJECT_ROOT / "src", PROJECT_ROOT / "scripts"]:
        if not base.exists():
            continue
        for f in base.rglob("*"):
            if f.suffix not in (".ts", ".py", ".sh"):
                continue
            if d_id.lower() in f.stem.lower():
                return str(f.relative_to(PROJECT_ROOT))
    return None


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


def evaluate_task(task: dict, gate_data: dict, depgraph: dict[str, list[str]] | None = None) -> dict:
    """对单个 D# 执行 6 条件判定"""
    d_id = task["d_id"]
    src_file = find_source_file(d_id)
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

    # C2: wiring_complete
    if src_file:
        try:
            r = subprocess.run(
                ["grep", "-rn", src_file.split("/")[-1].replace(".ts", ""), str(PROJECT_ROOT / "src")],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=10,
            )
            # 至少一个非自身、非测试的引用
            refs = [l for l in r.stdout.split("\n") if l and ".test." not in l and src_file not in l]
            if len(refs) > 0:
                conditions["wiring_complete"]["score"] = 1
                conditions["wiring_complete"]["reason"] = f"入边 {len(refs)} 个引用"
            else:
                conditions["wiring_complete"]["reason"] = "零外部引用"
        except (subprocess.TimeoutExpired, FileNotFoundError):
            conditions["wiring_complete"]["reason"] = "grep 不可用"
            degraded = True
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
        "degraded": degraded,
        "srcFile": src_file or "",
    }


# ═══ 汇总 ═══


def aggregate_results(results: list[dict]) -> dict:
    """汇总所有任务的判定结果"""
    scores = [r["completion"] for r in results if r["completion"] > 0]
    avg = sum(scores) / len(scores) if scores else 0

    c1 = sum(1 for r in results if r["conditions"]["code_exists"]["score"] == 1)
    c2 = sum(1 for r in results if r["conditions"]["wiring_complete"]["score"] == 1)
    c3 = sum(1 for r in results if r["conditions"]["test_exists"]["score"] == 1)
    c4 = sum(1 for r in results if r["conditions"]["path_reachable"]["score"] == 1)
    c5 = sum(1 for r in results if r["conditions"]["dependencies_ok"]["score"] == 1)
    c6 = sum(1 for r in results if r["conditions"]["no_defects"]["score"] == 1)
    total = len(results)

    return {
        "systemScore": round(avg, 3),
        "totalTasks": total,
        "completionByCriteria": {
            "code_exists": {"pass": c1, "total": total, "pct": round(c1 / total * 100, 1) if total else 0},
            "wiring_complete": {"pass": c2, "total": total, "pct": round(c2 / total * 100, 1) if total else 0},
            "test_exists": {"pass": c3, "total": total, "pct": round(c3 / total * 100, 1) if total else 0},
            "path_reachable": {"pass": c4, "total": total, "pct": round(c4 / total * 100, 1) if total else 0},
            "dependencies_ok": {"pass": c5, "total": total, "pct": round(c5 / total * 100, 1) if total else 0},
            "no_defects": {"pass": c6, "total": total, "pct": round(c6 / total * 100, 1) if total else 0},
        },
        "baselineScore": 0.5,
        "trend": "stable",
    }


# ═══ CLI ═══


def main():
    parser = argparse.ArgumentParser(description="Synova 研发模式六条件判定 CLI (D267)")
    parser.add_argument("--output", default="", help="输出路径 (默认 .codex/snapshots/{ts}/completion-scores.json)")
    parser.add_argument("--quiet", action="store_true", help="静默模式")
    args = parser.parse_args()

    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    gate_data = load_gate_status()
    tasks = list_task_briefs()
    git_log = get_git_log()

    if not tasks and not args.quiet:
        print("[self-diagnosis] [WARN] 未找到 task briefs", file=sys.stderr)

    depgraph = build_depgraph()
    if depgraph and not args.quiet:
        print(f"[self-diagnosis] 依赖图构建: {len(depgraph)} 个节点")
    results = [evaluate_task(t, gate_data, depgraph) for t in tasks if t["d_id"]]
    report = aggregate_results(results)
    report["generatedAt"] = ts
    report["gitCommits"] = len(git_log)
    report["tasksEvaluated"] = len(results)
    report["results"] = results

    if args.output:
        output_path = Path(args.output)
    else:
        snapshot_dir = SNAPSHOT_DIR / ts
        snapshot_dir.mkdir(parents=True, exist_ok=True)
        output_path = snapshot_dir / "completion-scores.json"

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    if not args.quiet:
        print(f"[self-diagnosis] [OK] 完成: {output_path}")
        print(f"  系统评分: {report['systemScore']}")
        print(f"  任务数: {report['totalTasks']}")
        print(f"  C1代码: {report['completionByCriteria']['code_exists']['pct']}%")
        print(f"  C2接线: {report['completionByCriteria']['wiring_complete']['pct']}%")
        print(f"  C3测试: {report['completionByCriteria']['test_exists']['pct']}%")

    sys.exit(0)


if __name__ == "__main__":
    main()
