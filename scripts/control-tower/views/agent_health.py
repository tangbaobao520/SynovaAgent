"""
scripts/control-tower/views/agent_health.py — View 5 Agent链路健康 (D271)

读取 gate-status.json 的 Gate 5(专家诊断)+Gate 12(循环运行)，
展示 6 位专家并行工作状态。

降级: gate-status.json 不存在 → status=unknown

契约:
  @input  — .codex/signals/gate-status.json
  @output — HTML 三行表格 (专家名/状态/最近诊断)
  @degraded — gate-status.json 不存在 → status=unknown
"""
import json
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
GATE_STATUS_PATH = PROJECT_ROOT / ".codex" / "signals" / "gate-status.json"


# 6 位专家定义 (核心层3 + 扩展层2 + P0激活1)
EXPERTS = [
    {"id": "strategy",         "name": "战略专家",       "layer": "核心"},
    {"id": "organization",     "name": "组织专家",       "layer": "核心"},
    {"id": "finance",          "name": "财务专家",       "layer": "核心"},
    {"id": "technology",       "name": "技术专家",       "layer": "扩展"},
    {"id": "marketing",        "name": "营销专家",       "layer": "扩展"},
    {"id": "action",           "name": "行动专家",       "layer": "P0激活"},
]


def get_gate(gates: list, gate_id: str) -> dict:
    for g in gates:
        if g.get("id") == gate_id:
            return g
    return {}


def get_status() -> dict:
    """读取门禁状态并判定链路健康度。"""
    if not GATE_STATUS_PATH.exists():
        return {"status": "unknown", "reason": "门禁数据缺失", "gate5": "unknown", "gate12": "unknown"}
    try:
        data = json.loads(GATE_STATUS_PATH.read_text(encoding="utf-8"))
        gates = data.get("gates", [])
        g5 = get_gate(gates, "gate-5").get("status", "unknown")
        g12 = get_gate(gates, "gate-12").get("status", "unknown")
        if g5 == "fail" or g12 == "fail":
            return {"status": "critical", "reason": f"专家链路异常 (Gate 5:{g5} Gate 12:{g12})", "gate5": g5, "gate12": g12}
        if g5 == "partial" or g12 == "partial":
            return {"status": "degraded", "reason": f"专家链路部分退化 (Gate 5:{g5} Gate 12:{g12})", "gate5": g5, "gate12": g12}
        return {"status": "healthy", "reason": "专家链路正常", "gate5": g5, "gate12": g12}
    except (json.JSONDecodeError, OSError) as e:
        return {"status": "degraded", "reason": f"门禁数据解析失败: {e}", "gate5": "unknown", "gate12": "unknown"}


def render_agent() -> str:
    """渲染 Agent 链路健康 HTML 表格。"""
    status = get_status()
    st = status["status"]
    reason = status["reason"]

    color_map = {"healthy": "#22c55e", "degraded": "#f59e0b", "critical": "#ef4444", "unknown": "#6b7280"}
    icon_map = {"healthy": "●", "degraded": "●", "critical": "●", "unknown": "○"}
    label_map = {"healthy": "正常", "degraded": "降级", "critical": "严重", "unknown": "未知"}
    color = color_map.get(st, "#6b7280")
    icon = icon_map.get(st, "○")
    label = label_map.get(st, "未知")

    # 获取 Gate 5 详情
    g5_status = status.get("gate5", "unknown")
    g12_status = status.get("gate12", "unknown")

    # 生成专家行
    layer_colors = {"核心": "#22c55e", "扩展": "#f59e0b", "P0激活": "#3b82f6"}
    rows = ""
    for expert in EXPERTS:
        lc = layer_colors.get(expert["layer"], "#6b7280")
        # Gate 5 pass → expert active, partial → idle, fail → error
        if g5_status == "pass":
            expert_st = "active"
            expert_color = "#22c55e"
        elif g5_status == "partial":
            expert_st = "idle"
            expert_color = "#f59e0b"
        elif g5_status == "fail":
            expert_st = "error"
            expert_color = "#ef4444"
        else:
            expert_st = "unknown"
            expert_color = "#6b7280"
        rows += f"""<div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;border-bottom:1px solid #334155">
  <span style="color:{expert_color}">●</span>
  <span style="min-width:60px;font-size:11px;color:{lc}">{expert['layer']}</span>
  <span style="flex:1">{expert['name']}</span>
  <span style="color:{expert_color};font-size:12px">{expert_st}</span>
</div>"""

    return f"""<div class="card card-full">
  <h2 style="font-size:15px;margin-bottom:8px;color:#94a3b8">Agent 链路健康 <span style="font-size:11px;color:#64748b">(Gate 5:{g5_status} Gate 12:{g12_status})</span></h2>
  <div style="display:flex;align-items:center;gap:8px;padding:6px 0;font-size:13px;border-bottom:1px solid #334155">
    <span style="color:{color}">{icon} {label}</span>
    <span style="color:#94a3b8;font-size:12px">{reason}</span>
  </div>
  <div style="margin-top:8px">{rows}</div>
</div>"""
