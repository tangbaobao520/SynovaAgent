#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
calc-progress.py — 产品进度计算器（设计 v1.4 §三/§五；A1 证据失效检测 + A4 进度重算）

一句话: 读 product-lines.yaml + 证据记录 → 按 §3.4 六态状态机算每条线进度 → product-progress.json。

契约:
  @input  — docs/synova/product-lines/product-lines.yaml（单一事实源）
            docs/synova/product-lines/evidence/*.json（证据记录，schema=1）
            docs/synova/product-lines/cockpit-override.yaml（待裁决清单，A8 源；缺失→degraded）
            git 事实: git log --since=<证据日期> --name-only -- <线 modules>（A1 惰性失效）
  @output — docs/synova/product-lines/product-progress.json
            { generated_at, product_progress_pct, lines:[{id,name,progress_pct,verified,total,
              baseline_pct, status_counts:{...}, k3_gate, points:[{id,desc,status,evidence_files,
              stale_reason}] }], decisions:[...], degraded:{...} }
  @degraded — yaml 解析失败 → log.error + exit 2（fail-closed，绝不静默猜）；
              单条证据记录损坏 → log.warn + 跳过该记录 + degraded.sources 登记（铁律 24/31）；
              git 不可用 → log.warn + 跳过失效检测 + degraded.git=true；
              ENOENT（证据目录尚不存在）= 正常默认（铁律 24），不告警不 degraded。
  @exit   — 0 成功；2 降级/失败（calc 本身不可用）

六态状态机（§3.4）:
  uncommitted  ⚪ 未开始（git 无 / 无证据 / yaml 种子 uncommitted）
  failed       🔴 机器验证红（场景/测试证据 fail，或 yaml 种子 failed）
  pending_k3   🟡 待裁判（场景/测试绿但审计员未审——不计分）
  verified     🟢 已验证（审计员 pass 或创始人演示核验——计分）
  rejected     🔴 存疑/否决（审计员 fail——不计分，git 全绿也不算）
  stale        🟡 待重跑（证据过期 >14 天，或证据日期后相关代码有变更，A1）

诚实规则（§3.3 硬逻辑）:
  1. 无证据 = 未验证 = 不计分（yaml 里 status: verified 若无对应证据记录 → 降为 uncommitted 并告警）
  2. 场景/测试类证据: 日期后该线 modules 有 git 变更 → stale（自动失效，不继承旧绿）
  3. 线 100% 门槛: verified==total 且无 k3 线级复核（record_type=k3, acceptance_point="line:<id>", pass）
     → 进度封顶 99 + k3_gate="待审计员全量复核"（防最后 10% 烂尾）
  4. 百分比只显整数
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# 兼容: 直接运行时从仓库任意目录也能定位；测试可 sys.path.insert 本目录后 import
try:
    import productline_yaml  # noqa: E402
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import productline_yaml  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("calc-progress")

# 兼容: 直接运行时从仓库任意目录也能定位
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

EVIDENCE_TTL_DAYS = 14  # 场景/测试类证据有效期（§3.2）

SIX_STATES = ("uncommitted", "failed", "pending_k3", "verified", "rejected", "stale")


def load_yaml(path: Path):
    """解析 yaml；失败抛 YamlSubsetError（调用方决定 exit 2 fail-closed）。"""
    return productline_yaml.load_file(str(path))


def load_evidence_records(evidence_dir: Path):
    """读取证据记录。返回 (records, degraded_sources)。ENOENT=正常默认。"""
    records = []
    degraded = []
    if not evidence_dir.is_dir():
        return records, degraded
    for f in sorted(evidence_dir.glob("*.json")):
        if f.name == ".gitkeep":
            continue
        try:
            with open(f, "r", encoding="utf-8") as fh:
                rec = json.load(fh)
            if rec.get("schema") != 1:
                raise ValueError("schema != 1")
            if "record_type" not in rec or "date" not in rec or "verdicts" not in rec:
                raise ValueError("缺 record_type/date/verdicts 字段")
            # D576（CT-53）: 存量降级——redeem-progress 曾把任务闭环兑换冒充 record_type=k3
            # （一票翻绿假绿，K3 D572 实证 1-2）。识别特征 = note 含「自动兑换（redeem-progress.py）」，
            # 降级为 task_redeem（走 machine 路径），不改历史文件（加载时修正）。
            if rec.get("record_type") == "k3" and "自动兑换（redeem-progress.py）" in str(rec.get("note", "")):
                rec["record_type"] = "task_redeem"
                degraded.append("%s: 存量自动兑换证据降级 k3→task_redeem（假 k3 冒充修正，CT-53）" % f.name)
            records.append((f, rec))
        except (OSError, ValueError, json.JSONDecodeError) as e:
            log.warning("证据记录损坏，跳过: %s (%s)", f, e)
            degraded.append("证据记录损坏: %s (%s)" % (f.name, e))
    return records, degraded


def git_touched_after(modules, since_date: str, git_cmd: str):
    """证据日期之后，该线 modules 是否有提交（A1 惰性失效）。

    @input  — modules: 路径列表; since_date: YYYY-MM-DD; git_cmd: git 可执行（测试可注入）
    @output — (touched: bool, error: str|None)。git 失败 → touched=False + error 显式返回
              （绝不把"查不了"当"没变过"——fail-closed，调用方转 degraded）
    """
    if not modules:
        return False, None
    since = since_date + "T00:00:00"
    cmd = [git_cmd, "log", "--since=%s" % since, "--name-only", "--format=", "--"] + list(modules)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30,
                              cwd=str(PROJECT_ROOT))
    except (OSError, subprocess.SubprocessError) as e:
        return False, "git 调用失败: %s" % e
    if proc.returncode != 0:
        return False, "git exit=%s: %s" % (proc.returncode, proc.stderr.strip()[:120])
    touched_files = {line.strip() for line in proc.stdout.splitlines() if line.strip()}
    if touched_files:
        return True, None
    return False, None


def status_for_point(point, verdicts_by_point, line_modules, git_cmd, today, problems):
    """按六态状态机计算单个验收点的最终状态。"""
    pid = point["id"]
    verdicts = verdicts_by_point.get(pid, [])
    seed = point.get("status", "uncommitted")
    if seed not in SIX_STATES:
        problems.append("点 %s 非法 status 种子: %r" % (pid, seed))
        seed = "uncommitted"

    k3 = [v for v in verdicts if v["record_type"] == "k3" and not v.get("superseded_by")]
    demo = [v for v in verdicts if v["record_type"] == "founder_demo"]
    machine = [v for v in verdicts if v["record_type"] in ("scenario", "test", "ci", "task_redeem")]

    # D576（CT-53）: k3_only 点（desc 含「审计员复核」的每线收尾点）只有 k3 裁决能 verified——
    # 任务兑换/演示核验最高到 pending_k3（自我指认禁止，1-8 型，K3 D572 实证）。
    if point.get("k3_only"):
        if any(v["verdict"] == "fail" for v in k3):
            return "rejected"
        if any(v["verdict"] == "pass" for v in k3):
            return "verified"
        return "pending_k3"

    # 审计员裁决最高优先（一票否决/一票通过）
    if any(v["verdict"] == "fail" for v in k3):
        return "rejected"
    if any(v["verdict"] == "pass" for v in k3):
        return "verified"

    # 创始人演示核验 = 里程碑证据
    if any(v["verdict"] == "pass" for v in demo):
        return "verified"

    if machine:
        latest = max(machine, key=lambda v: v["date"])
        if latest["verdict"] == "fail":
            return "failed"
        # 机器验证绿 → 待裁判；但先查失效（A1 + 14 天 TTL）
        try:
            date_dt = datetime.strptime(latest["date"], "%Y-%m-%d")
            if (today - date_dt).days > EVIDENCE_TTL_DAYS:
                return "stale"
        except ValueError:
            problems.append("点 %s 证据日期格式非法: %r" % (pid, latest["date"]))
            return "pending_k3"
        touched, err = git_touched_after(line_modules, latest["date"], git_cmd)
        if err:
            problems.append("点 %s 失效检测降级: %s" % (pid, err))
        if touched:
            return "stale"
        return "pending_k3"

    # 无证据: yaml 种子只允许 failed/rejected/uncommitted；verified 种子无证据 → 降级 + 告警
    if seed == "verified":
        problems.append("点 %s yaml 标 verified 但无证据记录——按诚实规则降为 uncommitted" % pid)
        return "uncommitted"
    if seed in ("failed", "rejected"):
        return seed
    return "uncommitted"


def compute(yaml_path, evidence_dir, override_path, git_cmd, out_path):
    spec = load_yaml(yaml_path)
    records, degraded_sources = load_evidence_records(evidence_dir)
    problems = []
    today = datetime.now()

    # 证据索引: point id → verdict 列表
    verdicts_by_point = {}
    line_reviews = {}

    def _rel(f: Path) -> str:
        try:
            return str(f.relative_to(PROJECT_ROOT))
        except ValueError:
            return str(f)

    for f, rec in records:
        for v in rec.get("verdicts", []):
            ap = v.get("acceptance_point", "")
            if ap.startswith("line:"):
                line_reviews[ap.split(":", 1)[1]] = v
                continue
            verdicts_by_point.setdefault(ap, []).append({
                "record_type": rec["record_type"],
                "verdict": v.get("verdict"),
                "date": rec["date"],
                "record_path": _rel(f),
                "quote": v.get("quote", ""),
                "superseded_by": v.get("superseded_by"),
            })

    # 待裁决清单（A8）
    decisions = []
    if override_path.is_file():
        try:
            ov = productline_yaml.load_file(str(override_path))
            decisions = ov.get("pending_decisions", []) or []
        except productline_yaml.YamlSubsetError as e:
            log.warning("cockpit-override.yaml 解析失败: %s", e)
            degraded_sources.append("cockpit-override.yaml 解析失败: %s" % e)
    else:
        degraded_sources.append("cockpit-override.yaml 不存在（待裁决区为空）")

    lines_out = []
    for line in spec.get("lines", []):
        points = line.get("acceptance_points", [])
        modules = line.get("modules", []) or []
        counts = {s: 0 for s in SIX_STATES}
        points_out = []
        for p in points:
            st = status_for_point(p, verdicts_by_point, modules, git_cmd, today, problems)
            counts[st] += 1
            evidence_files = [v["record_path"] for v in verdicts_by_point.get(p["id"], [])]
            points_out.append({
                "id": p["id"],
                "desc": p.get("desc", ""),
                "status": st,
                "evidence_files": evidence_files,
                "note": p.get("note", ""),
            })
        total = len(points)
        verified = counts["verified"]
        progress = round(verified / total * 100) if total else 0
        k3_gate = ""
        line_id = str(line["id"])
        if total and verified == total:
            review = line_reviews.get(line_id)
            if review and review.get("verdict") == "pass":
                k3_gate = "passed"
            else:
                progress = min(progress, 99)  # 线 100% 门槛（§3.3 规则 3）
                k3_gate = "pending"
        lines_out.append({
            "id": line["id"],
            "name": line.get("name", ""),
            "value": line.get("value", ""),
            "weight": float(line.get("weight", 1.0)),
            "baseline_pct": int(line.get("baseline_pct", 0)),
            "baseline_note": line.get("baseline_note", ""),
            "done_definition": line.get("done_definition", ""),
            "total": total,
            "verified": verified,
            "progress_pct": progress,
            "k3_gate": k3_gate,
            "status_counts": counts,
            "points": points_out,
        })

    # 产品总进度 = Σ(线进度×权重)/Σ权重（§3.1，整数）
    total_weight = sum(l["weight"] for l in lines_out) or 1.0
    product_pct = round(sum(l["progress_pct"] * l["weight"] for l in lines_out) / total_weight)

    result = {
        "generated_at": today.strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.0",
        "product_progress_pct": product_pct,
        "total_lines": len(lines_out),
        "lines": lines_out,
        "decisions": decisions,
        "degraded": {
            "sources": degraded_sources,
            "problems": problems,
            "git_check": "ok",
        },
    }
    if problems:
        result["degraded"]["git_check"] = "partial"

    # 幂等: 仅 generated_at 变化 → 不重写（防 CI 每跑一次就产生一条噪音提交/bot PR）
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if out_path.is_file():
        try:
            old = json.loads(out_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            old = None
        if isinstance(old, dict):
            old_norm = dict(old)
            old_norm["generated_at"] = result["generated_at"]
            if json.dumps(old_norm, ensure_ascii=False, indent=2) == payload:
                log.info("进度无变化（仅时间戳），不重写（幂等）")
                return result

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(payload + "\n")
    return result


def main():
    ap = argparse.ArgumentParser(description="产品进度计算（A1+A4）")
    ap.add_argument("--yaml", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-lines.yaml"))
    ap.add_argument("--evidence-dir", default=str(PROJECT_ROOT / "docs/synova/product-lines/evidence"))
    ap.add_argument("--override", default=str(PROJECT_ROOT / "docs/synova/product-lines/cockpit-override.yaml"))
    ap.add_argument("--out", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-progress.json"))
    ap.add_argument("--git-cmd", default="git", help="测试注入: 指向伪造 git 脚本")
    args = ap.parse_args()

    try:
        result = compute(Path(args.yaml), Path(args.evidence_dir), Path(args.override),
                         args.git_cmd, Path(args.out))
    except productline_yaml.YamlSubsetError as e:
        log.error("YAML 解析失败: %s (retryable=%s) → exit 2（fail-closed，绝不静默）",
                  e, e.retryable)
        sys.exit(2)

    verified_total = sum(l["verified"] for l in result["lines"])
    stale_total = sum(l["status_counts"]["stale"] for l in result["lines"])
    rejected_total = sum(l["status_counts"]["rejected"] for l in result["lines"])
    log.info("产品总进度 %s%% | 已验证验收点 %s | 待重跑 %s | 审计否决 %s | 线数 %s",
             result["product_progress_pct"], verified_total, stale_total,
             rejected_total, result["total_lines"])
    if result["degraded"]["sources"]:
        log.warning("degraded: %d 个数据源降级: %s", len(result["degraded"]["sources"]),
                    "; ".join(result["degraded"]["sources"][:3]))
    if result["degraded"]["problems"]:
        log.warning("degraded: 状态机问题 %d 处（详见 product-progress.json）",
                    len(result["degraded"]["problems"]))
    sys.exit(0)


if __name__ == "__main__":
    main()
