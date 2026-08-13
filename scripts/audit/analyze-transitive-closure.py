#!/usr/bin/env python3
"""
engine-core transitive closure analysis.
From the 7 entry files, recursively trace all relative imports to find
which of the 283 .ts files are actually reachable.
"""
import os, re, json, sys
from collections import deque
from pathlib import Path

SRC_ROOT = Path(r"D:\novis-backup-20260526\Novis\synova-agent\packages\engine-core\src")

# 7 entry files (relative to SRC_ROOT)
ENTRY_FILES = [
    "pipeline/diagnosis/diagnosis-orchestrator.ts",
    "pipeline/diagnosis/graph-store.ts",
    "engine-context.ts",
    "pipeline/diagnosis/ontology-adapter.ts",
    "pipeline/diagnosis/fde-toolset.ts",
    "pipeline/diagnosis/diagnosis-event-stream.ts",
    "pipeline/diagnosis/types.ts",
]

# Regex to match relative imports
# Matches: from './foo' | from '../bar' | import './baz'
REL_IMPORT_RE = re.compile(r"""(?:from\s+|import\s+)['\"](\.\.?/[^'\"]+)['\"]""")

def resolve_import(import_path: str, from_file_rel: str) -> str | None:
    """Resolve a relative import path to a file path relative to SRC_ROOT."""
    from_dir = os.path.dirname(from_file_rel)
    candidate = os.path.normpath(os.path.join(from_dir, import_path)).replace("\\", "/")

    # Try exact path
    exact = SRC_ROOT / (candidate + ".ts")
    if exact.exists():
        return candidate + ".ts"

    # Try index.ts in directory
    index = SRC_ROOT / candidate / "index.ts"
    if index.exists():
        return candidate + "/index.ts"

    # Try without extension (already has .ts)
    exact2 = SRC_ROOT / candidate
    if exact2.exists() and exact2.suffix == ".ts":
        return candidate

    return None

def extract_rel_imports(file_rel: str) -> list[str]:
    """Extract relative import paths from a .ts file."""
    filepath = SRC_ROOT / file_rel
    if not filepath.exists():
        return []
    try:
        content = filepath.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return []

    imports = []
    for match in REL_IMPORT_RE.finditer(content):
        imp = match.group(1)
        resolved = resolve_import(imp, file_rel)
        if resolved:
            imports.append(resolved)
    return imports

def bfs_transitive_closure(entry_files: list[str]) -> dict:
    """BFS from entry files to find all reachable files."""
    visited = {}  # file_rel -> set of files that import it
    queue = deque()

    for ef in entry_files:
        queue.append(ef)
        visited[ef] = {"imported_by": ["(entry point)"], "imports": []}

    while queue:
        current = queue.popleft()
        rel_imports = extract_rel_imports(current)
        visited[current]["imports"] = rel_imports

        for imp in rel_imports:
            if imp not in visited:
                visited[imp] = {"imported_by": [current], "imports": []}
                queue.append(imp)
            else:
                if current not in visited[imp]["imported_by"]:
                    visited[imp]["imported_by"].append(current)

    return visited

def find_max_depth(visited: dict, entry_files: list[str]) -> tuple[int, list[str]]:
    """Find the longest dependency chain from any entry point."""
    depth_cache = {}

    def max_depth_from(file_rel: str, chain: set) -> int:
        if file_rel in chain:
            return 0  # cycle
        if file_rel in depth_cache:
            return depth_cache[file_rel]

        info = visited.get(file_rel, {"imports": []})
        if not info["imports"]:
            depth_cache[file_rel] = 1
            return 1

        best = 0
        for imp in info["imports"]:
            d = max_depth_from(imp, chain | {file_rel})
            best = max(best, d)
        depth_cache[file_rel] = 1 + best
        return 1 + best

    best_chain_file = None
    best_depth = 0
    for ef in entry_files:
        d = max_depth_from(ef, set())
        if d > best_depth:
            best_depth = d
            best_chain_file = ef

    # Reconstruct chain
    chain = []
    current = best_chain_file
    seen = set()
    while current and current not in seen:
        seen.add(current)
        chain.append(current)
        info = visited.get(current, {"imports": []})
        if not info["imports"]:
            break
        # Find the child with max depth
        best_next = None
        best_next_depth = 0
        for imp in info["imports"]:
            d = depth_cache.get(imp, 1)
            if d > best_next_depth:
                best_next_depth = d
                best_next = imp
        current = best_next

    return best_depth, chain

def get_all_ts_files() -> set[str]:
    """Get all .ts files in engine-core/src."""
    all_files = set()
    for f in SRC_ROOT.rglob("*.ts"):
        rel = str(f.relative_to(SRC_ROOT)).replace("\\", "/")
        all_files.add(rel)
    return all_files

if __name__ == "__main__":
    print("=== engine-core Transitive Closure Analysis ===")
    print(f"Entry files: {len(ENTRY_FILES)}")
    print(f"SRC_ROOT: {SRC_ROOT}")
    print()

    # Run BFS
    visited = bfs_transitive_closure(ENTRY_FILES)
    closed_files = set(visited.keys())

    print(f"Transitive closure size: {len(closed_files)} files")

    # Get all files
    all_files = get_all_ts_files()
    print(f"Total .ts files in engine-core/src: {len(all_files)}")

    # Dead code
    dead_files = all_files - closed_files
    print(f"Dead code (unreachable): {len(dead_files)} files")
    print()

    # Depth
    max_d, example_chain = find_max_depth(visited, ENTRY_FILES)
    print(f"Max dependency depth: {max_d}")
    print(f"Example chain ({len(example_chain)} nodes):")
    for i, f in enumerate(example_chain):
        indent = "  " * i
        print(f"{indent}{'→ ' if i > 0 else ''}{f}")

    # Write detailed report
    report_path = Path(r"D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-AUDIT-engine-core传递闭包-20260707.md")
    report_path.parent.mkdir(parents=True, exist_ok=True)

    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# engine-core 传递闭包分析\n\n")
        f.write("> 审计日期: 2026-07-07 | 审计路线1: 传递闭包\n\n")

        f.write("## 入口文件 (7个)\n\n")
        for ef in ENTRY_FILES:
            f.write(f"- `{ef}`\n")
        f.write("\n")

        f.write(f"## 统计数据\n\n")
        f.write(f"| 指标 | 数量 |\n")
        f.write(f"|------|------|\n")
        f.write(f"| engine-core/src 总 .ts 文件数 | {len(all_files)} |\n")
        f.write(f"| 传递闭包内文件 | {len(closed_files)} |\n")
        f.write(f"| 死代码文件（不被引用） | {len(dead_files)} |\n")
        f.write(f"| 覆盖率 | {len(closed_files)/len(all_files)*100:.1f}% |\n")
        f.write(f"| 最深依赖链 | {max_d} 层 |\n\n")

        f.write("## 传递闭包内文件\n\n")
        # Sort by directory for readability
        sorted_closed = sorted(closed_files)
        for file_rel in sorted_closed:
            info = visited[file_rel]
            importers = info["imported_by"]
            imports = info["imports"]
            f.write(f"### `{file_rel}`\n")
            f.write(f"- **被引用者**: {', '.join(f'`{x}`' for x in importers[:5])}")
            if len(importers) > 5:
                f.write(f" ... +{len(importers)-5} more")
            f.write("\n")
            if imports:
                f.write(f"- **引用了**: {', '.join(f'`{x}`' for x in imports[:10])}")
                if len(imports) > 10:
                    f.write(f" ... +{len(imports)-10} more")
                f.write("\n")
            f.write("\n")

        f.write("## 死代码文件（不被任何传递闭包内文件引用）\n\n")
        sorted_dead = sorted(dead_files)
        for file_rel in sorted_dead:
            f.write(f"- `{file_rel}`\n")
        f.write("\n")

        f.write("## 依赖图深度分析\n\n")
        f.write(f"最深依赖链 ({max_d} 层):\n\n")
        for i, node in enumerate(example_chain):
            indent = "  " * i
            f.write(f"{indent}{i+1}. `{node}`\n")
        f.write("\n")

        f.write("## 建议\n\n")
        f.write(f"### 闭包内文件 ({len(closed_files)}个)\n")
        f.write("- 这些文件被生产代码引用，需要评估代码质量后决定是否迁移\n")
        f.write("- 优先检查这些文件中的 `as any`、空 catch、死代码\n\n")
        f.write(f"### 闭包外文件 ({len(dead_files)}个)\n")
        f.write("- 这些文件不被任何运行中代码引用，可作为删除候选\n")
        f.write("- 删除前建议做最后一次全仓库 grep 确认无动态 import 或 require\n")
        f.write("- 建议分批删除：先删除独立的 leaf 文件，再删除目录\n\n")

    print(f"\nReport written to: {report_path}")

    # Also write JSON for programmatic use
    json_path = Path(r"D:\novis-backup-20260526\Novis\synova-agent\docs\plans\codex\implementation\SYNOVA-AUDIT-engine-core传递闭包-20260707.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump({
            "entry_files": ENTRY_FILES,
            "total_files": len(all_files),
            "closed_files": len(closed_files),
            "dead_files": len(dead_files),
            "max_depth": max_d,
            "example_chain": example_chain,
            "closed_list": sorted(closed_files),
            "dead_list": sorted(dead_files),
            "graph": {k: {"imported_by": v["imported_by"], "imports": v["imports"]} for k, v in visited.items()}
        }, f, indent=2, ensure_ascii=False)
    print(f"JSON written to: {json_path}")
