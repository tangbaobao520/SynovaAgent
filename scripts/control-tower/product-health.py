#!/usr/bin/env python3
"""
product-health.py — 产品模式五维检测 CLI (D268)

权威17 §三: 对产品健康度做 5 维度判定——数据管道/哨兵/诊断质量/循环/资源。
每维度返回 healthy|degraded|critical|unknown。
整体 trust_level: 0退化→healthy, 1-2→degraded, 3+→critical。

用法:
  python scripts/control-tower/product-health.py
  python scripts/control-tower/product-health.py --check pipeline
  python scripts/control-tower/product-health.py --output custom/path.json

契约:
  @input  — gate-status.json + loop-scheduler.json + psutil (可选)
  @output — .codex/signals/product-health.json
  @degraded — 输入缺失->unknown, psutil不可用->降级
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
SIGNALS_DIR = PROJECT_ROOT / ".codex" / "signals"
OUTPUT_FILE = SIGNALS_DIR / "product-health.json"

# psutil可选——不可用时资源维度降级为unknown
try:
    import psutil as _psutil
    HAS_PSUTIL = True
except ImportError:
    HAS_PSUTIL = False


# ═══ 数据采集 ═══

def load_json(filepath: Path) -> dict:
    """加载JSON文件，失败返回空dict。"""
    if not filepath.exists():
        return {}
    try:
        return json.loads(filepath.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def load_gate_status() -> dict:
    """加载gate-status.json。"""
    return load_json(SIGNALS_DIR / "gate-status.json")


def load_loop_scheduler() -> dict:
    """加载loop-scheduler.json信号。"""
    return load_json(SIGNALS_DIR / "loop-scheduler.json")


def get_gate(gates: list, gate_id: str) -> dict:
    """从gate列表查找指定gate。"""
    for g in gates:
        if g.get("id") == gate_id:
            return g
    return {}


# ═══ 维度判定 ═══

def check_pipeline(gate_status: dict) -> dict:
    """数据管道健康度: Gate 3 (数据管道接通)。"""
    gates = gate_status.get("gates", [])
    gate3 = get_gate(gates, "gate-3")
    if not gate3:
        return {"status": "unknown", "reason": "gate-status.json 缺失或 Gate 3 不存在"}
    status = gate3.get("status", "unknown")
    if status == "pass":
        return {"status": "healthy", "reason": "Gate 3 数据管道接通 — pass"}
    elif status in ("partial", "fail"):
        return {"status": "degraded", "reason": f"Gate 3 数据管道 — {status}"}
    return {"status": "unknown", "reason": f"Gate 3 状态未知: {status}"}


def check_sentinel(gate_status: dict) -> dict:
    """哨兵健康度: Gate 4(哨兵巡检) + Gate 5(专家诊断) + Gate 6(诊断可验证) + Gate 7(方向监测)。"""
    gates = gate_status.get("gates", [])
    sentinel_gates = ["gate-4", "gate-5", "gate-6", "gate-7"]
    results = []
    for gid in sentinel_gates:
        g = get_gate(gates, gid)
        if not g:
            results.append("unknown")
        else:
            results.append(g.get("status", "unknown"))
    if not any(r != "unknown" for r in results):
        return {"status": "unknown", "reason": "gate-status.json 缺失——哨兵状态未知"}
    fail_count = results.count("fail")
    partial_count = results.count("partial")
    pass_count = results.count("pass")
    if fail_count > 0:
        return {"status": "critical", "reason": f"哨兵门禁 {fail_count} fail (G4-G7: {results})"}
    if partial_count > 0:
        return {"status": "degraded", "reason": f"哨兵门禁 {partial_count} partial (G4-G7: {results})"}
    return {"status": "healthy", "reason": f"哨兵门禁 4/4 pass (G4-G7)"}


def check_quality(gate_status: dict) -> dict:
    """诊断质量: Gate 5(专家诊断) + Gate 6(可验证) + Gate 11(闭环验证)。"""
    gates = gate_status.get("gates", [])
    quality_gates = ["gate-5", "gate-6", "gate-11"]
    results = []
    for gid in quality_gates:
        g = get_gate(gates, gid)
        if not g:
            results.append("unknown")
        else:
            results.append(g.get("status", "unknown"))
    if not any(r != "unknown" for r in results):
        return {"status": "unknown", "reason": "gate-status.json 缺失——诊断质量未知"}
    fail_count = results.count("fail")
    partial_count = results.count("partial")
    if fail_count > 0:
        return {"status": "critical", "reason": f"质量门禁 {fail_count} fail (G5/G6/G11: {results})"}
    if partial_count > 0:
        return {"status": "degraded", "reason": f"质量门禁 {partial_count} partial (G5/G6/G11: {results})"}
    return {"status": "healthy", "reason": f"质量门禁 3/3 pass (G5/G6/G11)"}


def check_loop(gate_status: dict, loop_signal: dict) -> dict:
    """循环运行: Gate 12(核心循环定时) + Gate 13(停滞检测) + loop-scheduler信号。"""
    gates = gate_status.get("gates", [])
    gate12 = get_gate(gates, "gate-12")
    gate13 = get_gate(gates, "gate-13")
    g12_status = gate12.get("status", "unknown") if gate12 else "unknown"
    g13_status = gate13.get("status", "unknown") if gate13 else "unknown"
    loop_status = loop_signal.get("status", "unknown") if loop_signal else "unknown"
    if g12_status == "unknown" and g13_status == "unknown" and loop_status == "unknown":
        return {"status": "unknown", "reason": "gate-status.json + loop-scheduler 均缺失"}
    if g12_status == "fail" or g13_status == "fail":
        return {"status": "critical", "reason": f"循环门禁 fail (G12:{g12_status} G13:{g13_status})"}
    if loop_status == "red":
        return {"status": "critical", "reason": "loop-scheduler 信号 red"}
    if g12_status == "partial" or g13_status == "partial" or loop_status == "yellow":
        return {"status": "degraded", "reason": f"循环状态异常 (G12:{g12_status} G13:{g13_status} loop:{loop_status})"}
    return {"status": "healthy", "reason": "循环正常 (G12/G13 pass, loop-scheduler green)"}


def check_resource() -> dict:
    """资源使用: psutil CPU/内存/磁盘。psutil不可用时降级。"""
    if not HAS_PSUTIL:
        return {"status": "unknown", "reason": "psutil 未安装——资源监控不可用"}
    try:
        cpu = _psutil.cpu_percent(interval=0.5)
        mem = _psutil.virtual_memory().percent
        disk = _psutil.disk_usage("/").percent
        details = f"CPU:{cpu:.0f}% MEM:{mem:.0f}% DISK:{disk:.0f}%"
        if cpu >= 95 or mem >= 95 or disk >= 95:
            return {"status": "critical", "reason": f"资源严重不足 ({details})"}
        if cpu >= 80 or mem >= 80 or disk >= 80:
            return {"status": "degraded", "reason": f"资源紧张 ({details})"}
        return {"status": "healthy", "reason": f"资源正常 ({details})"}
    except Exception as e:
        return {"status": "unknown", "reason": f"psutil 调用失败: {e}"}


# ═══ 整体判定 ═══

def classify_trust(dimensions: dict) -> dict:
    """根据退化维度数判定报告可信度。"""
    degraded_count = sum(
        1 for d in dimensions.values()
        if d["status"] in ("degraded", "critical")
    )
    unknown_count = sum(
        1 for d in dimensions.values()
        if d["status"] == "unknown"
    )
    if degraded_count >= 3:
        trust = "critical"
        message = "系统健康度: 严重退化——本次诊断结论不可信，请联系管理员"
    elif degraded_count >= 1 or unknown_count >= 2:
        trust = "degraded"
        message = f"系统健康度: 部分退化({degraded_count}维退化/{unknown_count}维未知)——本次诊断结论仅供参考"
    else:
        trust = "healthy"
        message = "系统健康度: 正常——本次诊断结论可信"
    return {
        "trustLevel": trust,
        "degradedCount": degraded_count,
        "unknownCount": unknown_count,
        "message": message,
    }


# ═══ 主逻辑 ═══

def run(check_filter: str = "all") -> dict:
    """运行五维检测，返回结果dict。"""
    gate_status = load_gate_status()
    loop_signal = load_loop_scheduler()
    dims = {}
    if check_filter in ("all", "pipeline"):
        dims["pipeline"] = check_pipeline(gate_status)
    if check_filter in ("all", "sentinel"):
        dims["sentinel"] = check_sentinel(gate_status)
    if check_filter in ("all", "quality"):
        dims["quality"] = check_quality(gate_status)
    if check_filter in ("all", "loop"):
        dims["loop"] = check_loop(gate_status, loop_signal)
    if check_filter in ("all", "resource"):
        dims["resource"] = check_resource()
    trust = classify_trust(dims)
    ts = datetime.now(timezone.utc).isoformat()
    degraded_reasons = [
        f"{k}: {v['reason']}" for k, v in dims.items()
        if v["status"] in ("degraded", "critical")
    ]
    result = {
        "component": "product-health",
        "status": trust["trustLevel"],
        "timestamp": ts,
        "dimensions": {k: v["status"] for k, v in dims.items()},
        "details": {k: v["reason"] for k, v in dims.items()},
        "degradedCount": trust["degradedCount"],
        "unknownCount": trust["unknownCount"],
        "reportTrust": trust["trustLevel"],
        "reportTrustMessage": trust["message"],
        "degradedReasons": degraded_reasons,
    }
    return result


def emit_signal(result: dict) -> None:
    """调用emit-signal.py发射控制塔信号。"""
    emit_py = Path(__file__).resolve().parent / "emit-signal.py"
    if not emit_py.exists():
        return
    import subprocess
    status = result["status"]
    reason = result["reportTrustMessage"][:80]
    try:
        subprocess.run(
            [sys.executable, str(emit_py), "product-health", status, reason,
             "--p0", str(1 if status == "critical" else 0),
             "--p1", str(1 if status == "degraded" else 0)],
            capture_output=True, timeout=10,
        )
    except Exception:
        pass  # 信号发射失败不阻断主流程


def main():
    parser = argparse.ArgumentParser(description="Synova 产品健康度五维检测 (D268)")
    parser.add_argument("--check", default="all",
                        choices=["all", "pipeline", "sentinel", "quality", "loop", "resource"],
                        help="检测维度 (默认: all)")
    parser.add_argument("--output", default=None,
                        help="输出路径 (默认: .codex/signals/product-health.json)")
    parser.add_argument("--no-signal", action="store_true",
                        help="跳过emit-signal发射")
    args = parser.parse_args()
    result = run(check_filter=args.check)
    output_path = Path(args.output) if args.output else OUTPUT_FILE
    os.makedirs(output_path.parent, exist_ok=True)
    try:
        output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    except (PermissionError, OSError) as e:
        print(f"[D268] WARNING: 无法写入 {output_path}: {e}", file=sys.stderr)
        print("[D268] stdout 输出:")
        print(json.dumps(result, ensure_ascii=False, indent=2))
    print(f"[D268] product-health → {output_path}")
    print(f"  status={result['status']}  degradedCount={result['degradedCount']}  unknownCount={result['unknownCount']}")
    for k, v in result["dimensions"].items():
        print(f"  {k}: {v} — {result['details'][k]}")
    if not args.no_signal:
        emit_signal(result)
    return 0


if __name__ == "__main__":
    sys.exit(main())
