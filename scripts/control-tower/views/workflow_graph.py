"""
scripts/control-tower/views/workflow_graph.py — View 4 工作流图 (D271)

读取 dependency-graph.json (D267)，渲染工作流依赖图 HTML 片段。
降级: 文件不存在 → 返回 unknown 状态提示。

契约:
  @input  — .codex/dependency-graph.json (D267)
  @output — HTML 片段 (mermaid 或文字邻接表)
  @degraded — 文件不存在 → status=unknown
"""
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
DEPGRAPH_PATH = PROJECT_ROOT / ".codex" / "dependency-graph.json"


def get_status() -> dict:
    """读取依赖图并判定状态。"""
    if not DEPGRAPH_PATH.exists():
        return {"status": "unknown", "reason": "依赖图未构建，请运行 self-diagnosis.py"}
    try:
        data = json.loads(DEPGRAPH_PATH.read_text(encoding="utf-8"))
        nodes = data.get("nodes", {})
        node_count = len(nodes)
        if node_count >= 100:
            return {"status": "healthy", "reason": f"依赖图完整 ({node_count} 节点)"}
        elif node_count >= 1:
            return {"status": "degraded", "reason": f"依赖图不完整 ({node_count} 节点，预期 >=100)"}
        return {"status": "unknown", "reason": "依赖图为空"}
    except (json.JSONDecodeError, OSError) as e:
        return {"status": "degraded", "reason": f"依赖图解析失败: {e}"}


def render_workflow() -> str:
    """渲染工作流依赖图 HTML 片段。"""
    status = get_status()
    st = status["status"]
    reason = status["reason"]

    color_map = {"healthy": "#22c55e", "degraded": "#f59e0b", "critical": "#ef4444", "unknown": "#6b7280"}
    icon_map = {"healthy": "●", "degraded": "●", "critical": "●", "unknown": "○"}
    label_map = {"healthy": "正常", "degraded": "降级", "critical": "严重", "unknown": "未知"}
    color = color_map.get(st, "#6b7280")
    icon = icon_map.get(st, "○")
    label = label_map.get(st, "未知")

    if st == "unknown" or not DEPGRAPH_PATH.exists():
        return f"""<div class="card card-full">
  <h2 style="font-size:15px;margin-bottom:8px;color:#94a3b8">工作流依赖图</h2>
  <div style="display:flex;align-items:center;gap:8px;padding:12px 0;font-size:13px">
    <span style="color:{color}">{icon}</span>
    <span style="flex:1">{reason}</span>
    <span style="color:{color}">{label}</span>
  </div>
</div>"""

    # 渲染带详细节点的 mermaid 流程图
    try:
        data = json.loads(DEPGRAPH_PATH.read_text(encoding="utf-8"))
        nodes = data.get("nodes", {})
    except (json.JSONDecodeError, OSError):
        nodes = {}

    # 生成节点列表 HTML
    node_rows = ""
    for filepath, deps in list(nodes.items())[:20]:  # 限制 20 条
        dep_count = len(deps) if isinstance(deps, list) else 0
        short = filepath.split("/")[-1] if "/" in filepath else filepath[:40]
        node_rows += f"""<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12px;border-bottom:1px solid #334155">
  <span style="color:#22c55e">●</span>
  <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{short}</span>
  <span style="color:#94a3b8">{dep_count} 依赖</span>
</div>"""

    total = len(nodes)
    more = f"<div style='font-size:11px;color:#64748b;padding:4px 0'>... 以及 {total - 20} 个节点</div>" if total > 20 else ""

    return f"""<div class="card card-full">
  <h2 style="font-size:15px;margin-bottom:8px;color:#94a3b8">工作流依赖图 <span style="font-size:11px;color:#64748b">({total} 节点)</span></h2>
  <div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;border-bottom:1px solid #334155">
    <span style="color:{color}">{icon} {label}</span>
    <span style="color:#94a3b8;font-size:12px">{reason}</span>
  </div>
  <div style="margin-top:8px;max-height:300px;overflow-y:auto">{node_rows}{more}</div>
</div>"""
