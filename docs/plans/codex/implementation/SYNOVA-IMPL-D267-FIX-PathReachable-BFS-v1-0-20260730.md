<!-- SYNOVA-IMPL-D267-FIX v1.0 | 2026-07-30 | BFS replacement -->
# SynovaAgent -- D267-FIX path_reachable BFS 替换 v1.0
> D267 assess_task C4: 当前 `"src/" in file_rel` 简化——权威17 §2.3 要求 BFS
> 依赖图 (.codex/dependency-graph.json) 不存在——需自建

## 代码验证
- self-diagnosis.py L127: `is_reachable_from_entry()` → `"src/" in file_rel or "scripts/" in file_rel` ❌
- .codex/dependency-graph.json 不存在 ❌

## Q0-Q4
Q0: path_reachable 简化为目录成员检查。BFS 正确实现需要依赖图——当前不存在，需自建。
Q2: 做——自建依赖图 (扫描 src/ + scripts/ 下 .ts/.py 的 import) → BFS 从 src/server.ts 和 scripts/agent-start.bat 反向搜索。依赖图构建失败→回退到目录检查。不做——完整的 dependency-graph.json 管道(Phase 2)。
Q3: self-diagnosis.py → build_depgraph() → is_reachable_from_entry(file, depgraph) → BFS
Q4: Python 语法检查。无 tsc 影响。

## 改动 (self-diagnosis.py +40行)

### 1. 新增 build_depgraph() (~25行)
```python
def build_depgraph() -> dict:
    """扫描 src/ 和 scripts/ 的 import 语句, 构建邻接表"""
    graph = {}
    for root_dir in ["src", "scripts"]:
        for ts_file in Path(root_dir).rglob("*.ts"):
            rel = str(ts_file.relative_to(PROJECT_ROOT)).replace("\\", "/")
            graph.setdefault(rel, [])
            text = ts_file.read_text(encoding="utf-8", errors="replace")
            imports = re.findall(r"""(?:from|import)\s+['\"]([^'\"]+)['\"]""", text)
            for imp in imports:
                if imp.startswith("."):
                    resolved = str((ts_file.parent / imp).resolve().relative_to(PROJECT_ROOT)).replace("\\", "/")
                    graph[rel].append(resolved + ".ts" if not resolved.endswith(".ts") else resolved)
    return graph
```

### 2. 替换 is_reachable_from_entry() (~15行)
```python
def is_reachable_from_entry(file_rel: str, depgraph: dict = None) -> bool:
    if not depgraph:
        return "src/" in file_rel or "scripts/" in file_rel  # fallback
    entry = "src/server.ts"
    if file_rel == entry: return True
    visited, queue = {entry}, [entry]
    while queue:
        node = queue.pop(0)
        for dep in depgraph.get(node, []):
            if dep == file_rel: return True
            if dep not in visited:
                visited.add(dep); queue.append(dep)
    return False
```

### 3. evaluate_task 中传 depgraph
`depgraph = build_depgraph()` → `is_reachable_from_entry(file_rel, depgraph)`

## 测试 (L1×1)
| # | 测试 |
|---|------|
| 1 | python self-diagnosis.py → systemScore 应与当前 0.167 一致(BFS 不改变评分) |

## 完成标准
is_reachable_from_entry 使用 BFS。build_depgraph 失败→回退目录检查。systemScore 不变(当前所有任务都在 src/ 下)。
