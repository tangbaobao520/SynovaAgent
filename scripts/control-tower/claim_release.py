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
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# D853-④: stdout **与 stderr** 一律 UTF-8。Windows 管道/控制台默认 cp1252 → 中文 stderr 被
#   backslashreplace 成 \uXXXX 转义（实测：`PYTHONIOENCODING=cp1252` 下 `❌ 契约不满足…` 变成
#   `\u274c \u5951\u7ea6…`）→ 夹具断言「契约不满足」恒红、算子读不懂报错。与调用者 locale 无关。
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):  # 非标准流（被重定向为对象）→ 保持原样
        pass

REPO_ROOT = Path(__file__).resolve().parents[2]
LEDGER_REL = Path("task-state") / "claim-releases.json"
BRIEF_DIR_REL = Path(".claude") / "task-briefs"
REGISTRY_REL = Path(".codex") / "control-tower" / "session-registry.json"
LEDGER_VERSION = 1

# D853-⑤: git 事实源加固 —— 与 D847 在 `_git_env()` 里确立的同一条不变量（仓库事实由入参决定、
#   不由调用者环境决定），本卡把它补齐到**工具层**（PATH 上放假 git = 事实由攻击者提供）：
#   ① 剥净 GIT_*（GIT_DIR/GIT_WORK_TREE/GIT_INDEX_FILE/GIT_OBJECT_DIRECTORY/GIT_COMMON_DIR/
#      GIT_ALTERNATE_OBJECT_DIRECTORIES/GIT_NAMESPACE）② git 可执行文件**试运行校验**
#      （`--version` 形如 `git version N.`，且不在临时目录）——只探存在性正是本卡要修的缺陷。
_GIT_ENV_DROP = ("GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_OBJECT_DIRECTORY",
                 "GIT_COMMON_DIR", "GIT_ALTERNATE_OBJECT_DIRECTORIES", "GIT_NAMESPACE")
_GIT_BIN_CACHE: list = []


def _clean_env() -> dict:
    """剥净 GIT_* 的子进程环境（仓库事实不可被调用者环境换掉）。"""
    return {k: v for k, v in os.environ.items() if k not in _GIT_ENV_DROP}


def git_bin():
    """**试运行校验过的** git 绝对路径。→ str | None（None = 不可用/不可信）。

    契约:
      @output 绝对路径字符串（已通过 `<bin> --version` 输出匹配 `^git version \\d+\\.`）；否则 None
      @degraded None = 拒绝把读到的东西当证据（调用方 fail-closed + 显式 reason，**不静默**）
      @exit   不抛异常（OSError/超时 → 换下一候选）
    为什么要试运行: `command -v`/`shutil.which` 只回答"PATH 里有没有这个名字"——PATH 上放一个假 git
      即可让 `ls-files`/`rev-parse` 回吐攻击者给的事实；损坏 shim 则让读取静默失败。
    残余: 能让假 git 输出合法 `git version N.` 的本地进程仍可骗过（无外部信任锚，需本地任意代码执行权限）
      —— 已在 brief 威胁模型显式登记，超出本卡范围。
    """
    if _GIT_BIN_CACHE:
        return _GIT_BIN_CACHE[0]
    cands = [shutil.which("git")]
    if os.name == "nt":  # pragma: no cover - Windows 常见安装位（PATH 上的 shim 可能是占位件）
        cands += [r"C:\Program Files\Git\cmd\git.exe", r"C:\Program Files (x86)\Git\cmd\git.exe"]
    else:
        cands += ["/usr/bin/git", "/usr/local/bin/git", "/opt/homebrew/bin/git"]
    tmp_roots = []
    for t in (tempfile.gettempdir(), "/tmp", "/var/folders"):
        try:
            if t and os.path.isdir(t):
                tmp_roots.append(os.path.realpath(t).lower().rstrip(os.sep) + os.sep)
        except OSError:
            continue
    for c in cands:
        if not c or not os.path.isabs(c) or not os.path.exists(c):
            continue
        try:
            rp = os.path.realpath(c)
        except OSError:
            continue
        if any(rp.lower().startswith(t) for t in tmp_roots):
            continue  # 真 git 不在临时目录：PATH 上的临时目录 git = 可疑（假 git 的典型落点）
        try:
            p = subprocess.run([c, "--version"], capture_output=True, text=True, env=_clean_env(),
                               encoding="utf-8", errors="replace", timeout=20)
        except (OSError, subprocess.SubprocessError):
            continue
        if p.returncode == 0 and re.match(r"^git version \d+\.", (p.stdout or "").strip()):
            _GIT_BIN_CACHE.append(c)
            return c
    _GIT_BIN_CACHE.append(None)
    return None


# 已释放认领的跨进程公告前缀 —— `resolve-commit-brief.sh` 写 stderr，`staging_guard.py` 读。
# 单一事实源放本模块：两处各自定义会漂移（D839 自测期真实踩过：staging_guard 定义、
# resolver 从本模块 import → ImportError → 静默退化为"不释放"，夹具当场红）。
# 格式: SYNO-RELEASED-CLAIM\t<brief stem>\t<D#>\t<basis>\t<detail>
RELEASED_MARK = "SYNO-RELEASED-CLAIM"

# 释放判定**不可用**时的显式降级公告（铁律 11 静默降级禁止）。
# 语义: 判定模块缺失 / 抛异常 → 一律按「未释放」处理（fail-closed，退回修复前的行为，
# 绝不误放行）；但必须让算子看见「释放维度已失效」，否则会再次陷入 D839 的死锁而无信号。
# 格式: SYNO-CLAIM-RELEASE-DEGRADED\t<brief stem>\t<原因>
DEGRADED_MARK = "SYNO-CLAIM-RELEASE-DEGRADED"

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
    """跑 git（**校验过的绝对路径 + 剥净 GIT_\* 的环境**）。失败 → (None, err)。

    契约:
      @input  repo + git 参数
      @output (stdout, None) 成功；否则 (None, err)。err 含 "git 不可用/不可信: <原因>"（工具层降级）
      @degraded git 不可用/不可信 → 一律 (None, err)：调用方把"读不到"当 **拿不到证据** 处理
                （fail-closed + degraded 上报，铁律 11/24/31），绝不静默当"无变更/无认领"
      @exit   不抛异常
    D853: 基线是裸 `["git", ...]` —— ① 继承调用者 GIT_*（GIT_WORK_TREE 可换掉被判定的仓库）
      ② 听 PATH（假 git 可回吐任意事实）。两者都属"调用者环境决定事实源"，与本卡其他根因同族。
    """
    gb = git_bin()
    if gb is None:
        return None, "git 不可用/不可信（试运行校验未过）→ 拒绝把读取结果当证据"
    try:
        rp = os.path.realpath(gb)
        root = os.path.realpath(str(_as_repo(repo)))
        if root and rp.lower().startswith(root.lower().rstrip(os.sep) + os.sep):
            return None, f"git 位于被判定的仓库内（{gb}）→ 拒绝把读取结果当证据"
    except OSError:
        pass
    try:
        p = subprocess.run([gb, "-C", str(repo), *args], capture_output=True, env=_clean_env(),
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
