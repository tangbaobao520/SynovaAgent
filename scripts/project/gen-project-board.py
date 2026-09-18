#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen-project-board.py — D795 项目账本派生器（四视图数据源）

把 git 真相（task-state 卡片 + product-lines 定义 + 证据记录）派生为单一 JSON 账本，
供 D794「项目总览」插件渲染。**派生物，禁手工编辑**；真相永远在 git。

契约（铁律 47 — 先定义再实现）:
@input   — CLI 参数（全部只读，不写除 --out 外任何路径）:
             --repo-root      仓库根；默认 = 本脚本上两级目录
             --out            输出路径；默认 <repo-root>/docs/synova/project/ledger.json
             --today          覆盖"今天" YYYY-MM-DD；默认系统日期（测试注入缝，保确定性）
             --v1-dod         V1 断言表；默认 <root>/docs/synova/project/26线-V1验收标准*.md（取最新）
             --yaml           product-lines.yaml；默认 <root>/docs/synova/product-lines/product-lines.yaml
             --evidence-dirs  证据目录（可多次）；默认 产品证据 + golden-scenarios 证据**两处都算**
             --task-state-dir 任务卡目录；默认 <root>/task-state
             --strict         降级时退出码非零（默认 0）
             --compact        单行 JSON（默认缩进 2）
@output  — <out> 处的 JSON 文件，schema "project-ledger/1"：
             schema / generated_by / generated_at / git_head / sources / degraded /
             degraded_sources / skipped_sources / totals / lines / tasks / blocked / timeline
           标准输出: 一行摘要；诊断信息走 stderr（logging）
@exit    — 0  正常
             0  降级（默认）—— 文件**仍完整写出**，降级在带内（degraded:true），
                使 D794 永远拿得到可渲染的 JSON 而非 404
             1  --strict 且 degraded
             2  参数非法 / 输出不可写
@degraded— 两级显式，均不静默（铁律 24/31）:
             ① 输入级故障 → degraded_sources[] + degraded:true：
                文件/目录缺失、不可读、JSON 解析失败 —— 会让数字偏小且不可解释
             ② 记录级非证据 → skipped_sources[]，**不计 degraded**：
                JSON 合法但不含 verdicts（如 D524 自述式校验记录 record_type=d524-verify）。
                它本就不携带逐点裁决，没有可丢失的数字；若也标 degraded，真实仓库将永久红灯，
                真降级被淹没（告警疲劳）。skipped_sources 显式列出，不静默。
            受影响字段置 null，**禁止静默填 0**；ENOENT 与解析失败分别登记（不混为一谈）。
            git 不可用**不计降级**（git_head/timeline 属溯源信息，非 §B.2 声明的数据输入），
            但显式 log.warning，不静默。
@contract— 口径（派单 §B.3，照抄不得自创）:
             交付度   = v1_passed / v1_total；分母 = V1 断言表条数（冻结 125，变更走变更单）
             断言通过 = ① 有证据（record_type 与断言声明的证据类型**匹配**）
                        ② 证据龄**不影响**通过判定 —— 保鲜只计数不扣交付度（09-17 口径）
                        多份匹配证据取主证据：最新日期优先，同日按优先级
                        k3 > test > scenario > founder-demo，再按路径稳定排序
             verified = 通过的断言中，另有 record_type=k3 的 PASS 裁决（K3 独立复核，禁自我审计）
             保鲜     = 证据龄 ≤7🟢 / 8–14🟡 / >14🔴；只对"已通过"的断言分桶计数
             阻塞     = 仅当 blocked{reason,since,needs} 三要素齐全才计入；days = today - since
             backlog  = product-lines.yaml 验收点总数 - V1 断言数（V1 外不参与交付度）
@determinism — 同输入连续两次运行，除 generated_at / git_head 外逐键相等（测试组 ⑤）

红线: 不修改 calc-progress.py；不写回 product-lines.yaml；不碰 scripts/audit/**；零三方依赖。
"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

LOG = logging.getLogger("gen-project-board")

SCHEMA = "project-ledger/1"
GENERATED_BY = "gen-project-board.py"

# 证据类型优先级（派单 §B.3）: k3 > test > scenario > founder-demo
EVIDENCE_PRIORITY = ("k3", "test", "scenario", "founder-demo")

# 保鲜分桶边界（派单 §B.3）: ≤7 🟢 / 8–14 🟡 / >14 🔴
FRESH_GREEN_MAX_DAYS = 7
FRESH_YELLOW_MAX_DAYS = 14

# 冻结分母（v0.2 §三 变更单：125 → 128 = +2 由 backlog 提入 V1（20-5/25-6）+1 线26 新增（26-7），
# 依据 `docs/synova/project/26线-V1验收标准-v0.2-20260917.md` §三；元断言 M1–M5 不计入）。
# 仅作漂移告警，**不覆盖**从断言表解析出的实测值。
FROZEN_V1_TOTAL = 128

DEFAULT_EVIDENCE_RELS = (
    "docs/synova/product-lines/evidence",
    "scripts/golden-scenarios/evidence",
)


# ── 通用工具 ──────────────────────────────────────────────────────────────

def parse_date(value):
    """把 'YYYY-MM-DD' 或 ISO 时间戳解析为 date；不可解析 → None（调用方决定降级）。"""
    if value is None:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(value).strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def freshness_bucket(age_days):
    """证据龄 → 保鲜桶。@input age_days:int|None @output 'green'|'yellow'|'red'|None"""
    if age_days is None:
        return None
    if age_days <= FRESH_GREEN_MAX_DAYS:
        return "green"
    if age_days <= FRESH_YELLOW_MAX_DAYS:
        return "yellow"
    return "red"


def rel_to(path, root):
    """路径相对 root 展示（越界则原样），保证 sources 可读且幂等。"""
    try:
        return str(Path(path).resolve().relative_to(Path(root).resolve()))
    except (ValueError, OSError):
        return str(path)


def evidence_priority(kind):
    """优先级序号，越小越优先；未知类型排最后。"""
    return EVIDENCE_PRIORITY.index(kind) if kind in EVIDENCE_PRIORITY else len(EVIDENCE_PRIORITY)


# ── 输入解析（每块独立失败 → 独立降级，铁律 31）────────────────────────────

def resolve_v1_dod(root, explicit):
    """定位 V1 断言表。@return (Path|None, error:str|None)"""
    if explicit:
        p = Path(explicit)
        return (p, None) if p.is_file() else (None, "V1 断言表缺失: %s" % p)
    pattern = str(Path(root) / "docs" / "synova" / "project" / "26线-V1验收标准*.md")
    found = sorted(glob.glob(pattern))
    if not found:
        return None, "V1 断言表缺失（未匹配 %s）" % pattern
    return Path(found[-1]), None


def parse_v1_dod(path):
    """解析 V1 断言表。

    @input  — path:Path；格式 = '### 线N 名称' 分节 + '| ID | 断言 | verify | 证据 | fail_when |' 表
    @output — (lines:list[dict], total:int, error:str|None)；lines 按文档出现顺序
    @degraded — 文件缺失/不可读 → (lines, total, 原因)；调用方置 v1_total=null
    """
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return [], 0, "V1 断言表缺失: %s" % path
    except OSError as exc:
        return [], 0, "V1 断言表不可读: %s (%s)" % (path, exc)

    lines = []
    current = None
    for raw in text.splitlines():
        line = raw.rstrip()
        header = re.match(r"^###\s*线\s*(\d+)\s*(.*)$", line)
        if header:
            current = {"id": int(header.group(1)), "name": header.group(2).strip(), "assertions": []}
            lines.append(current)
            continue
        if current is None or not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5:
            continue
        aid = cells[0]
        # 只认 'N-M' 形态的断言 ID——自动跳过表头/分隔行/总览表
        if not re.match(r"^\d+-\d+$", aid):
            continue
        kind = cells[3] if cells[3] in EVIDENCE_PRIORITY else (cells[3] or None)
        current["assertions"].append({
            "id": aid,
            "text": cells[1],
            "verify": cells[2],
            "kind": kind,
            "fail_when": cells[4],
        })

    if not lines:
        return [], 0, "V1 断言表解析为空（格式变更？）: %s" % path
    total = sum(len(ln["assertions"]) for ln in lines)
    if total == 0:
        return lines, 0, "V1 断言表零条断言（格式变更？）: %s" % path
    return lines, total, None


def load_product_lines(yaml_path):
    """解析 product-lines.yaml（复用仓内纯 Python 子集解析器，零三方依赖）。

    @input  — yaml_path:Path
    @output — (by_id:dict[int,dict], total_points:int, error:str|None)
    @degraded — 文件缺失 / YamlSubsetError → (by_id, 0, 原因)
    """
    if not yaml_path.is_file():
        return {}, 0, "product-lines.yaml 缺失: %s" % yaml_path
    product_lines_dir = Path(__file__).resolve().parent.parent / "product-lines"
    if str(product_lines_dir) not in sys.path:
        sys.path.insert(0, str(product_lines_dir))
    try:
        import productline_yaml  # noqa: E402  (复用仓内解析器，PyYAML 非可用依赖)
    except ImportError as exc:
        return {}, 0, "productline_yaml 不可导入: %s" % exc
    try:
        data = productline_yaml.load_file(str(yaml_path))
    except (OSError, ValueError) as exc:  # YamlSubsetError 继承 ValueError
        return {}, 0, "product-lines.yaml 解析失败: %s" % exc
    if not isinstance(data, dict) or not isinstance(data.get("lines"), list):
        return {}, 0, "product-lines.yaml 结构异常（缺 lines）: %s" % yaml_path

    by_id = {}
    total_points = 0
    for ln in data["lines"]:
        if not isinstance(ln, dict) or ln.get("id") is None:
            continue
        try:
            lid = int(ln["id"])
        except (TypeError, ValueError):
            continue
        points = ln.get("acceptance_points") or []
        total_points += len(points)
        by_id[lid] = {
            "name": ln.get("name"),
            "done_definition": ln.get("done_definition"),
            "points_total": len(points),
            "modules": [m for m in (ln.get("modules") or []) if isinstance(m, str)],
        }
    return by_id, total_points, None


def load_evidence(dirs):
    """读取两处证据目录。

    @input  — dirs:list[Path]
    @output — (records:list[(Path,dict)], degraded:list[str], skipped:list[str])
    @degraded — 目录缺失 / 文件不可读 / 坏 JSON → degraded（输入级故障，数字会偏小）
    @skipped  — JSON 合法但非 verdicts 记录 → skipped（记录级，不计 degraded；见文件头契约）
    """
    records = []
    degraded = []
    skipped = []
    for d in dirs:
        if not d.is_dir():
            degraded.append("证据目录缺失: %s" % d)
            continue
        for f in sorted(d.glob("*.json")):
            try:
                rec = json.loads(f.read_text(encoding="utf-8"))
            except FileNotFoundError:
                continue  # 扫描间隙被删 = 正常，不降级
            except OSError as exc:
                LOG.warning("证据文件不可读，跳过: %s (%s)", f, exc)
                degraded.append("证据文件不可读: %s (%s)" % (f.name, exc))
                continue
            except ValueError as exc:
                LOG.warning("证据文件坏 JSON，跳过: %s (%s)", f, exc)
                degraded.append("证据记录损坏(JSON): %s (%s)" % (f.name, exc))
                continue
            if not isinstance(rec, dict) or "verdicts" not in rec:
                LOG.warning("非 verdicts 证据记录（不计降级，已登记 skipped）: %s", f)
                skipped.append("非 verdicts 证据记录: %s (record_type=%s)"
                               % (f.name, (rec or {}).get("record_type") if isinstance(rec, dict) else "?"))
                continue
            records.append((f, rec))
    return records, degraded, skipped


def index_evidence(records):
    """把证据记录索引为 acceptance_point → 通过裁决列表。

    @input  — records:list[(Path,dict)]
    @output — dict[str, list[dict]]；每条 = {kind, date, path}
    """
    index = {}
    for path, rec in records:
        kind = rec.get("record_type")
        rec_date = parse_date(rec.get("date")) or parse_date(rec.get("at"))
        for verdict in rec.get("verdicts") or []:
            if not isinstance(verdict, dict):
                continue
            if str(verdict.get("verdict", "")).lower() != "pass":
                continue
            ap = verdict.get("acceptance_point")
            if not ap:
                continue
            index.setdefault(str(ap), []).append({
                "kind": kind,
                "date": rec_date,
                "path": str(path),
            })
    return index


def pick_primary(cands):
    """选主证据: 最新日期优先 → 同日按优先级 → 再按路径稳定排序（幂等）。"""
    return max(
        cands,
        key=lambda c: (
            c["date"] or date.min,
            -evidence_priority(c["kind"]),
            c["path"],
        ),
    )


def load_task_state(task_dir, today):
    """读取任务卡。@return (tasks:list[dict], blocked:list[dict], degraded:list[str])"""
    tasks = []
    blocked = []
    degraded = []
    if not Path(task_dir).is_dir():
        return [], [], ["task-state 目录缺失: %s" % task_dir]
    for f in sorted(Path(task_dir).glob("D*.json")):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except FileNotFoundError:
            continue
        except OSError as exc:
            LOG.warning("任务卡不可读，跳过: %s (%s)", f, exc)
            degraded.append("任务卡不可读: %s (%s)" % (f.name, exc))
            continue
        except ValueError as exc:
            LOG.warning("任务卡坏 JSON，跳过: %s (%s)", f, exc)
            degraded.append("任务卡坏 JSON: %s (%s)" % (f.name, exc))
            continue
        if not isinstance(rec, dict):
            degraded.append("任务卡结构异常: %s" % f.name)
            continue

        blk = rec.get("blocked")
        blocked_obj = None
        if isinstance(blk, dict):
            reason = (blk.get("reason") or "").strip()
            since_raw = blk.get("since")
            needs = (blk.get("needs") or "").strip()
            since = parse_date(since_raw)
            # 三要素齐全才计入（派单 §B.3）——缺一即视为未申报，不静默补
            if reason and needs and since:
                blocked_obj = {
                    "reason": reason,
                    "since": since.isoformat(),
                    "needs": needs,
                    "days": (today - since).days,
                }
        updated = parse_date(rec.get("updated_at"))
        # 可选 line 绑定（口径外扩展字段）: 任务卡显式声明属于哪条线时，
        # 其阻塞才会进入 lines[].blocked —— 缺绑定则不臆测归属（宁缺勿造）
        line_raw = rec.get("line")
        try:
            line_id = int(line_raw) if line_raw is not None else None
        except (TypeError, ValueError):
            line_id = None
        task = {
            "id": rec.get("task_id") or f.stem,
            "title": rec.get("title"),
            "status": rec.get("status"),
            "owner": rec.get("owner"),
            "domain": rec.get("domain"),
            "depends_on": rec.get("depends_on") or [],
            "blocked": blocked_obj,
            "stale_days": (today - updated).days if updated else None,
            "updated_at": updated.isoformat() if updated else None,
            "_line": line_id,
        }
        tasks.append(task)
        if blocked_obj:
            entry = {"id": task["id"]}
            entry.update(blocked_obj)
            blocked.append(entry)

    tasks.sort(key=lambda t: str(t["id"]))
    blocked.sort(key=lambda b: str(b["id"]))
    return tasks, blocked, degraded


def git_head_sha(root):
    """当前 HEAD sha；git 不可用 → (None, 原因)。不计入 degraded（溯源信息，非数据输入）。"""
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return None, str(exc)
    if proc.returncode != 0:
        return None, (proc.stderr or "").strip() or "git exit %d" % proc.returncode
    sha = (proc.stdout or "").strip()
    return (sha, None) if sha else (None, "git rev-parse 返回空")


def git_first_commit(root, modules):
    """该线 modules 最早一次提交日期（timeline.actual.first_commit）；取不到 → None。"""
    if not modules:
        return None
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "log", "--format=%as", "--"] + [str(m) for m in modules],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        LOG.debug("git log 失败（modules=%s）: %s", modules, exc)
        return None
    if proc.returncode != 0:
        LOG.debug("git log 非零退出（modules=%s）: %s", modules, (proc.stderr or "").strip())
        return None
    dates = [d.strip() for d in (proc.stdout or "").splitlines() if d.strip()]
    return dates[-1] if dates else None


# ── 派生主逻辑 ────────────────────────────────────────────────────────────

def build_ledger(args):
    """组装账本 dict。@return (ledger:dict, degraded:bool)"""
    root = Path(args.repo_root).resolve()
    today = parse_date(args.today) if args.today else date.today()
    degraded_sources = []

    # ① V1 断言表（分母来源）
    v1_path, v1_err = resolve_v1_dod(root, args.v1_dod)
    if v1_err:
        degraded_sources.append(v1_err)
        v1_lines, v1_total = [], None
    else:
        v1_lines, v1_total, v1_err = parse_v1_dod(v1_path)
        if v1_err:
            degraded_sources.append(v1_err)
            v1_total = None
        elif v1_total != FROZEN_V1_TOTAL:
            # 分母冻结（派单 §B.3）: 只告警不覆盖实测值——冻结是治理属性，不是隐藏数字
            LOG.warning("V1 分母漂移: 实测 %d ≠ 冻结 %d（改动需走变更单）", v1_total, FROZEN_V1_TOTAL)

    # ② product-lines.yaml（线名 / done_definition / backlog 底数）
    yaml_path = Path(args.yaml) if args.yaml else root / "docs/synova/product-lines/product-lines.yaml"
    pl_by_id, pl_total_points, pl_err = load_product_lines(yaml_path)
    if pl_err:
        degraded_sources.append(pl_err)
        pl_total_points = None

    # ③ 任务卡
    task_dir = Path(args.task_state_dir) if args.task_state_dir else root / "task-state"
    tasks, blocked, ts_degraded = load_task_state(task_dir, today)
    degraded_sources.extend(ts_degraded)

    # ④ 证据（两处都算）
    ev_dirs = [Path(d) for d in args.evidence_dirs] if args.evidence_dirs \
        else [root / r for r in DEFAULT_EVIDENCE_RELS]
    records, ev_degraded, ev_skipped = load_evidence(ev_dirs)
    degraded_sources.extend(ev_degraded)
    ev_index = index_evidence(records)

    # ⑤ git 溯源（非数据输入 → 不降级，但显式告警）
    head_sha, head_err = git_head_sha(root)
    if head_err:
        LOG.warning("git 不可用，git_head/timeline 置空（不计 degraded）: %s", head_err)

    # ⑥ 逐线逐断言判定
    totals_fresh = {"green": 0, "yellow": 0, "red": 0}
    v1_passed = 0
    v1_verified = 0
    out_lines = []

    for ln in v1_lines:
        lid = ln["id"]
        meta = pl_by_id.get(lid, {})
        line_fresh = {"green": 0, "yellow": 0, "red": 0}
        assertions = []
        line_passed = 0
        line_verified = 0

        for a in ln["assertions"]:
            cands = ev_index.get(a["id"], [])
            matched = [c for c in cands if c["kind"] == a["kind"]] if a["kind"] else []
            ok = bool(matched)
            primary = pick_primary(matched) if matched else None
            age_days = (today - primary["date"]).days if (primary and primary["date"]) else None
            bucket = freshness_bucket(age_days) if ok else None
            # verified = 通过 且 另有 k3 独立复核 PASS（禁自我审计）
            verified = bool(ok and any(c["kind"] == "k3" for c in cands))

            if ok:
                line_passed += 1
                v1_passed += 1
                if bucket:
                    line_fresh[bucket] += 1
                    totals_fresh[bucket] += 1
            if verified:
                line_verified += 1
                v1_verified += 1

            assertions.append({
                "id": a["id"],
                "text": a["text"],
                "verify": a["verify"],
                "kind": a["kind"],
                "ok": ok,
                "evidence": [rel_to(c["path"], root) for c in matched],
                "age_days": age_days,
                "freshness": bucket,
                "fail_when": a["fail_when"],
            })

        # 线级阻塞: 任务卡显式绑定 line 且三要素齐全（缺绑定 = 不臆测归属）
        line_blocked = []
        for t in tasks:
            if t["blocked"] and t.get("_line") == lid:
                line_blocked.append(dict(t["blocked"]))

        out_lines.append({
            "id": lid,
            "name": meta.get("name") or ln["name"],
            "done_definition": meta.get("done_definition"),
            "v1_total": len(ln["assertions"]),
            "v1_passed": line_passed,
            "v1_verified": line_verified,
            "points_total": meta.get("points_total"),
            "freshness": line_fresh,
            "blocked": line_blocked,
            "assertions": assertions,
        })

    # ⑦ timeline（每线 modules 最早提交日；git 不可用 → 全 null，D794 显示"待数据"）
    timeline = []
    for ln in v1_lines:
        modules = pl_by_id.get(ln["id"], {}).get("modules") or []
        timeline.append({
            "line": ln["id"],
            "milestone": None,
            "planned_week": None,
            "actual": {
                "dispatched": None,
                "first_commit": git_first_commit(root, modules) if head_sha else None,
                "merged": None,
                "audited": None,
            },
        })

    # 剥离内部字段 `_line`——它只用于线级阻塞归属，不进输出 schema
    for t in tasks:
        t.pop("_line", None)

    totals = {
        "v1_total": v1_total,
        "v1_passed": v1_passed if v1_total is not None else None,
        "v1_verified": v1_verified if v1_total is not None else None,
        "delivery_pct": round(100.0 * v1_passed / v1_total, 1) if v1_total else None,
        "verify_pct": round(100.0 * v1_verified / v1_passed, 1) if v1_passed else None,
        "freshness": totals_fresh,
        "blocked_count": len(blocked),
        "backlog_points": (pl_total_points - v1_total)
                          if (pl_total_points is not None and v1_total is not None) else None,
    }

    ledger = {
        "schema": SCHEMA,
        "generated_by": GENERATED_BY,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "git_head": head_sha,
        "sources": {
            "yaml": rel_to(yaml_path, root) if yaml_path.is_file() else None,
            "v1_dod": rel_to(v1_path, root) if v1_path else None,
            "evidence_dirs": [rel_to(d, root) for d in ev_dirs],
        },
        "degraded": bool(degraded_sources),
        "degraded_sources": degraded_sources,
        "skipped_sources": ev_skipped,
        "totals": totals,
        "lines": out_lines,
        "tasks": tasks,
        "blocked": blocked,
        "timeline": timeline,
    }
    return ledger, bool(degraded_sources)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="D795 项目账本派生器 — 把 git 真相派生为 ledger.json（禁手工编辑）")
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parent.parent.parent))
    parser.add_argument("--out")
    parser.add_argument("--today")
    parser.add_argument("--v1-dod")
    parser.add_argument("--yaml")
    parser.add_argument("--task-state-dir")
    parser.add_argument("--evidence-dirs", nargs="*")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s", stream=sys.stderr)

    if args.today and not parse_date(args.today):
        LOG.error("--today 非法（需 YYYY-MM-DD）: %s", args.today)
        return 2

    root = Path(args.repo_root).resolve()
    out_path = Path(args.out) if args.out else root / "docs/synova/project/ledger.json"

    try:
        ledger, degraded = build_ledger(args)
    except Exception as exc:  # 兜底: 绝不让宿主拿到半截账本而不自知（铁律 11/24）
        LOG.error("派生失败（未捕获异常）: %s", exc, exc_info=True)
        return 2

    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(ledger, ensure_ascii=False, sort_keys=False,
                             indent=None if args.compact else 2)
        out_path.write_text(payload + ("\n" if not args.compact else ""), encoding="utf-8")
    except OSError as exc:
        LOG.error("输出不可写: %s (%s)", out_path, exc)
        return 2

    if not args.quiet:
        t = ledger["totals"]
        print("ledger.json → %s | v1_total=%s v1_passed=%s verified=%s delivery=%s%% "
              "freshness=%s blocked=%s degraded=%s"
              % (out_path, t["v1_total"], t["v1_passed"], t["v1_verified"], t["delivery_pct"],
                 t["freshness"], t["blocked_count"], ledger["degraded"]))
        for reason in ledger["degraded_sources"]:
            print("  ⚠ degraded: %s" % reason, file=sys.stderr)

    if degraded and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
