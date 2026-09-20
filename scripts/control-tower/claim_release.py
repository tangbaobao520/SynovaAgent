#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
claim_release.py — D839 认领制释放单一事实源（完成即释放 / 批量扫描 / 释放持久化）

背景（D296/D329 认领制的真实缺陷）:
  认领门禁（`staging_guard.py` → `resolve-commit-brief.sh`）的候选池只看 brief 里 Q2 的
  **字面路径**，不看该 brief 所属任务是否已完成 → 任何历史 brief 提及过的文件，对后续所有
  任务**永久锁死**。实证: 2026-09-19 D838 登记两条新线时被**已完成并合入**的 D806 brief
  阻断（`status=block`, `reason=认领 brief D# 与本 session 任务不一致`）。

释放证据（优先级从高到低，任一命中即为「已释放」）:
  1. `ledger`           — `task-state/claim-releases.json` 有该任务的显式释放记录
                          （算子显式裁定；唯一能释放"状态不明/未登记"任务的途径）
  2. `task-state:<st>`  — `task-state/<D#>.json` 的 `status` ∈ RELEASED_STATUSES
                          （完成即释放的自动路径，卡片口径 {impl_done, audited}）
  3. `session-archived` — `.codex/control-tower/session-registry.json` 的 `archived` 数组
                          含该 D# 的 session 记录（对应派单「或该 session 记录已归档」）

为什么不用 gen-cto-health.py 的 D393 全量派生口径（实测否决，留证）:
  该口径把「`git log --all` 含 `(D#)`」判为 impl_done。2026-09-20 本仓实测：两族失效认领
  会从 16 涨到 24，多出的 7 个含 **D711 / D819（均 `status=claimed`，进行中）**——按该口径
  释放它们 = 真实破坏并发保护（违反"进行中仍必须拦"）。故本模块**只认显式 status 声明**，
  拿不到证据一律不释放（fail-closed）。

契约（铁律 47）:
  输入 = 仓库根（`--repo`，默认本文件 parents[2]）+ 子命令参数；只读 git/task-state，不联网
  输出 = stdout：`scan` 输出 JSON（`--json`）或人读表格；`release`/`release-stale` 输出摘要行
  退出码 = 0 成功 | 1 业务否定（status: 未释放；release: 任务不存在）| 2 契约不满足（仓库不可读/参数非法）
  降级 = task-state 不可读 / 无 `status` 字段 / JSON 损坏 → **不作为释放证据**（fail-closed，
         绝不静默放行），并置 `degraded: true` + `degraded_reason`（铁律 24/31）
  副作用 = `release` / `release-stale --apply` 原子写 `task-state/claim-releases.json`
         （tmp + os.replace，禁半写）；`scan` / `status` 零副作用
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
LEDGER_REL = Path("task-state") / "claim-releases.json"
BRIEF_DIR_REL = Path(".claude") / "task-briefs"
REGISTRY_REL = Path(".codex") / "control-tower" / "session-registry.json"
LEDGER_VERSION = 1

# 已释放认领的跨进程公告前缀 —— `resolve-commit-brief.sh` 写 stderr，`staging_guard.py` 读。
# 单一事实源放本模块：两处各自定义会漂移（D839 自测期真实踩过：staging_guard 定义、
# resolver 从本模块 import → ImportError → 静默退化为"不释放"，夹具当场红）。
# 格式: SYNO-RELEASED-CLAIM\t<brief stem>\t<D#>\t<basis>\t<detail>
RELEASED_MARK = "SYNO-RELEASED-CLAIM"

# 完成即释放的自动判据（卡片口径，2026-09-20 CTO 派单）
RELEASED_STATUSES = ("impl_done", "audited")


# ─────────────────────────── 工具 ───────────────────────────

def _read_json(path: Path):
    """读 JSON。→ (data|None, error|None)。ENOENT 与解析失败都返回 error（调用方决定语义）。"""
    try:
        return json.loads(path.read_text(encoding="utf-8", errors="replace")), None
    except FileNotFoundError:
        return None, "ENOENT"
    except (json.JSONDecodeError, OSError, UnicodeError) as exc:
        return None, f"{type(exc).__name__}: {exc}"


def _git(repo: Path, *args: str):
    """跑 git。失败 → (None, err)。"""
    try:
        p = subprocess.run(["git", "-C", str(repo), *args], capture_output=True,
                           text=True, encoding="utf-8", errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError) as exc:
        return None, f"{type(exc).__name__}: {exc}"
    if p.returncode != 0:
        return None, f"git {' '.join(args)} rc={p.returncode}"
    return p.stdout, None


# ─────────────────────────── 台账 ───────────────────────────

def ledger_path(repo) -> Path:
    return _as_repo(repo) / LEDGER_REL


def _as_repo(repo) -> Path:
    """归一化仓库根 → Path。

    必需: 调用方有 Path（staging_guard）也有 **str**（resolve-commit-brief.sh 内嵌 python
    传 `r'$ROOT'`）。str 与 str 之间的 `/` 会 TypeError —— D839 自测期真实踩过：被调用方的
    `except Exception` 吞掉 → 已释放 brief 静默未被剔除（源头过滤整条失效，只剩下游兜底）。
    """
    return repo if isinstance(repo, Path) else Path(str(repo))


def load_ledger(repo: Path) -> dict:
    """释放台账。缺失/损坏 → 空台账 + 不静默（调用方经 degraded 上报）。"""
    data, err = _read_json(ledger_path(repo))
    if not isinstance(data, dict) or "releases" not in data:
        if err and err != "ENOENT":
            sys.stderr.write(f"⚠ claim-release: 台账不可读（按空台账继续，fail-closed 不释放）: {err}\n")
        return {"version": LEDGER_VERSION, "releases": {}}
    if not isinstance(data.get("releases"), dict):
        return {"version": LEDGER_VERSION, "releases": {}}
    return data


def save_ledger(repo: Path, data: dict) -> None:
    """原子写台账（tmp + os.replace）——禁半写。"""
    p = ledger_path(repo)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                   encoding="utf-8")
    os.replace(tmp, p)


# ─────────────────────────── 判定 ───────────────────────────

def _norm_task(task_id: str) -> str:
    m = re.search(r"D\d+", task_id or "")
    return m.group(0) if m else ""


def task_status(repo: Path, task_id: str):
    """task-state/<D#>.json 的显式 status。→ (status|None, degraded_reason|None)。

    只认显式声明字段：缺失/不可读 → None（**不是** claimed）→ 调用方 fail-closed。
    """
    tid = _norm_task(task_id)
    if not tid:
        return None, "task_id 无 D# 形态"
    data, err = _read_json(_as_repo(repo) / "task-state" / f"{tid}.json")
    if data is None:
        return None, err
    st = data.get("status")
    if not isinstance(st, str) or not st.strip():
        return None, "无 status 字段"
    return st.strip(), None


def archived_sessions(repo: Path) -> set:
    """registry 中已归档的 session_id 集合。registry 缺失 → 空集（不当作释放证据）。"""
    data, _err = _read_json(_as_repo(repo) / REGISTRY_REL)
    if not isinstance(data, dict):
        return set()
    out = set()
    for s in data.get("archived") or []:
        if isinstance(s, dict):
            for k in ("session_id", "task_id"):
                v = _norm_task(s.get(k) or "")
                if v:
                    out.add(v)
    return out


def is_released(repo: Path, task_id: str, ledger: dict = None, archived: set = None) -> dict:
    """该任务的认领是否已释放。→ {released, basis, detail, degraded}。

    basis ∈ {"ledger", "task-state:<status>", "session-archived", ""}；"" = 未释放。
    优先级: ledger > task-state status > session-archived（见模块头）。
    拿不到任何证据 → released=False（fail-closed）。
    """
    tid = _norm_task(task_id)
    res = {"task_id": tid, "released": False, "basis": "", "detail": "", "degraded": False}
    if not tid:
        res["degraded"] = True
        res["detail"] = "task_id 无 D# 形态"
        return res
    if ledger is None:
        ledger = load_ledger(repo)
    rec = (ledger.get("releases") or {}).get(tid)
    if isinstance(rec, dict) and rec.get("released"):
        res.update(released=True, basis="ledger",
                   detail=f"台账显式释放（{rec.get('reason', '')}）")
        return res
    st, err = task_status(repo, tid)
    if st in RELEASED_STATUSES:
        res.update(released=True, basis=f"task-state:{st}",
                   detail=f"task-state/{tid}.json status={st}")
        return res
    if archived is None:
        archived = archived_sessions(repo)
    if tid in archived:
        res.update(released=True, basis="session-archived",
                   detail=f"session-registry 已归档 {tid}")
        return res
    if st is None and err and err != "ENOENT":
        res["degraded"] = True
        res["detail"] = f"task-state 不可读（fail-closed 不释放）: {err}"
    return res


# ─────────────────────────── 扫描 ───────────────────────────

def _tracked_files(repo: Path, paths=None):
    """git ls-files（可选限定路径族）。→ (files, err)。"""
    args = ["ls-files"]
    if paths:
        args += ["--", *paths]
    out, err = _git(repo, *args)
    if out is None:
        return [], err
    return [f for f in out.split("\n") if f.strip()], None


def _suffix_index(files):
    """后缀 → 命中文件列表。等价复刻 match_path 的「(^|/)pat$」语义，O(1) 查询。

    match_path(path, pat) ⟺ path == pat 或 path.endswith('/' + pat)，
    故 a/b/c.md 建三个键: "a/b/c.md" / "b/c.md" / "c.md"。
    """
    idx = {}
    for f in files:
        parts = f.split("/")
        for i in range(len(parts)):
            idx.setdefault("/".join(parts[i:]), []).append(f)
    return idx


def stale_claims(repo: Path, paths=None) -> dict:
    """列出「任务已释放、但 brief 仍在认领文件」的失效认领。

    认领口径 = 与生产同一套: `brief_parser.parse_q2(text)['include']` + `match_path`
      （match_path(p, pat) ⟺ p == pat 或 p.endswith('/' + pat)，故用后缀索引等价加速）。
    → {stale: [...], degraded: bool, degraded_reason: str, scanned_files: int}
    """
    out = {"stale": [], "degraded": False, "degraded_reason": "", "scanned_files": 0}
    files, ferr = _tracked_files(repo, paths)
    if ferr:
        out.update(degraded=True, degraded_reason=f"git ls-files 失败: {ferr}")
        return out
    out["scanned_files"] = len(files)
    suffixes = _suffix_index(files)
    brief_dir = _as_repo(repo) / BRIEF_DIR_REL
    if not brief_dir.is_dir():
        out.update(degraded=True, degraded_reason=f"brief 目录缺失: {brief_dir}")
        return out
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        from brief_parser import parse_q2
    except ImportError as exc:  # 解析器缺失 → 显式降级，绝不静默返回空结果
        out.update(degraded=True, degraded_reason=f"brief_parser 不可用: {exc}")
        return out

    ledger = load_ledger(repo)
    archived = archived_sessions(repo)
    for b in sorted(brief_dir.glob("*.md")):
        tid = _norm_task(b.name)
        if not tid:
            continue
        try:
            inc = parse_q2(b.read_text(encoding="utf-8", errors="replace"))["include"]
        except (OSError, KeyError, TypeError) as exc:
            out["degraded"] = True
            out["degraded_reason"] = out["degraded_reason"] or f"brief 解析失败 {b.name}: {exc}"
            continue
        claimed = _claims_of(suffixes, inc)
        if not claimed:
            continue
        rel = is_released(repo, tid, ledger=ledger, archived=archived)
        if not rel["released"]:
            continue
        out["stale"].append({
            "task_id": tid,
            "status": task_status(repo, tid)[0] or "",
            "basis": rel["basis"],
            "released": True,
            "brief": b.name,
            "files": claimed,
            "files_count": len(claimed),
        })
    return out


def _claims_of(suffix_map, includes):
    """brief 实际认领的 tracked 文件（语义 = brief_parser.match_path，此处 O(1) 查后缀表）。"""
    hits = set()
    for p in includes:
        pat = (p or "").strip()
        if not pat:
            continue
        for f in suffix_map.get(pat, ()):
            hits.add(f)
    return sorted(hits)


# ─────────────────────────── 释放 ───────────────────────────

def release_task(repo: Path, task_id: str, reason: str, by: str) -> dict:
    """写显式释放记录到台账（持久、git 跟踪、与 brief 文本无关）。"""
    tid = _norm_task(task_id)
    if not tid:
        return {"ok": False, "error": "task_id 无 D# 形态"}
    ledger = load_ledger(repo)
    ledger.setdefault("releases", {})[tid] = {
        "released": True,
        "reason": reason,
        "by": by,
        "at": _now(),
        "basis_at_release": is_released(repo, tid, ledger={"releases": {}})["basis"] or "explicit-only",
    }
    ledger["version"] = LEDGER_VERSION
    save_ledger(repo, ledger)
    return {"ok": True, "task_id": tid, "ledger": str(ledger_path(repo))}


def _now() -> str:
    import datetime
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


# ─────────────────────────── CLI ───────────────────────────

def _out(obj) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    print(json.dumps(obj, ensure_ascii=False))


def main() -> int:
    ap = argparse.ArgumentParser(description="D839 认领制释放（完成即释放 / 批量扫描 / 持久化）")
    ap.add_argument("--repo", default=str(REPO_ROOT))
    sub = ap.add_subparsers(dest="cmd", required=True)

    p_scan = sub.add_parser("scan", help="列出失效认领（已完结仍在认领的 brief）")
    p_scan.add_argument("--path", action="append", default=[], help="限定路径族（可多次）")
    p_scan.add_argument("--json", action="store_true")

    p_rel = sub.add_parser("release", help="显式释放一个任务的认领")
    p_rel.add_argument("--task", required=True)
    p_rel.add_argument("--reason", default="显式释放")
    p_rel.add_argument("--by", default=os.environ.get("SYNO_AGENT", "claim-release"))

    p_rs = sub.add_parser("release-stale", help="批量释放 scan 结果")
    p_rs.add_argument("--path", action="append", default=[])
    p_rs.add_argument("--apply", action="store_true", help="真正写入台账（缺省 dry-run）")
    p_rs.add_argument("--by", default=os.environ.get("SYNO_AGENT", "claim-release"))

    p_st = sub.add_parser("status", help="查询单任务释放态")
    p_st.add_argument("--task", required=True)

    args = ap.parse_args()
    repo = Path(args.repo).resolve()
    if not (_as_repo(repo) / "task-state").is_dir():
        sys.stderr.write(f"❌ 契约不满足: 仓库根不可识别（无 task-state/）: {repo}\n")
        return 2

    if args.cmd == "scan":
        r = stale_claims(repo, args.path or None)
        if args.json:
            _out(r)
        else:
            print(f"失效认领 {len(r['stale'])} 份（扫描 {r['scanned_files']} 个 tracked 文件"
                  f"{'，限 ' + ','.join(args.path) if args.path else ''}）")
            for s in r["stale"]:
                print(f"  {s['task_id']:8} {s['status'] or '—':10} {s['basis']:24} "
                      f"认领 {s['files_count']:3} 文件  {s['brief'][:56]}")
            if r["degraded"]:
                print(f"⚠ degraded: {r['degraded_reason']}")
        return 0

    if args.cmd == "status":
        r = is_released(repo, args.task)
        _out(r)
        return 0 if r["released"] else 1

    if args.cmd == "release":
        r = release_task(repo, args.task, args.reason, args.by)
        if not r["ok"]:
            sys.stderr.write(f"❌ {r['error']}\n")
            return 1
        print(f"✅ 已释放 {r['task_id']} → 写入台账 {r['ledger']}")
        return 0

    # release-stale
    r = stale_claims(repo, args.path or None)
    if r["degraded"]:
        sys.stderr.write(f"⚠ degraded: {r['degraded_reason']}\n")
    if not args.apply:
        print(f"[dry-run] 待释放 {len(r['stale'])} 份（加 --apply 落台账）: "
              f"{' '.join(s['task_id'] for s in r['stale'])}")
        return 0
    done = []
    for s in r["stale"]:
        res = release_task(repo, s["task_id"], f"批量释放（{s['basis']}）", args.by)
        if res["ok"]:
            done.append(s["task_id"])
    print(f"✅ 批量释放 {len(done)}/{len(r['stale'])} 份 → {ledger_path(repo)}")
    print(f"   {' '.join(done)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
