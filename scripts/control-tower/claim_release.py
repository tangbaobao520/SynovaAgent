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
                          **记录必须携带凭证**（`by` / `at` / `reason` 均非空），否则不构成证据
  2. `task-state:<st>`  — **已提交**（`git show HEAD:task-state/<D#>.json`）的 `status` ∈
                          RELEASED_STATUSES（完成即释放的自动路径，卡片口径 {impl_done, audited}）
  3. `session-archived` — `.codex/control-tower/session-registry.json` 的 `archived` 数组
                          含该 D# 的 session 记录（对应派单「或该 session 记录已归档」）

威胁模型（D846 / K3 D841 P1-1 闭合面：逐证据源回答"谁能写 / 能否无痕伪造 / 拿不到证据是否 fail-closed"）:
  · 证据源 2 **只读已提交内容**：在工作树或索引里把**他人的** `task-state/<D#>.json` 的 status 改成
    `impl_done`（不 add 不 commit，或 add 但不 commit）**不再解锁**任何认领——判定读的是共享历史
    （HEAD），不是单机私有可变状态。K3 实证的"零痕迹解锁硬阻断"路径就此关闭：要伪造必须**提交**，
    提交即进 git 历史 + PR 审查（有痕、可回滚、可追责）。
    工作树/索引与 HEAD 不一致时 → `degraded=True` + detail 点名（fail-closed，仍按未释放处理）。
  · 证据源 1（显式台账）是**算子显式通道**（D839 派单即以此作为"任务状态不明"时的唯一手段）：
    记录缺凭证 → 不作证据（fail-closed + degraded）；记录**未提交**（与 HEAD 有差异）→ 释放照旧但
    `degraded=True` + detail 显式标注"凭证在 git 历史中不可核"（把"无痕"变成门禁输出里可见）。
    残余：本地进程仍可直写**带凭证**的假记录——控制塔整体威胁模型为"本地 agent 非对抗 + PR 人工审查"
    （K3 §① 判断），该项已显式登记，未在本卡静默放过。
  · 证据源 3（本地 registry）被 `.gitignore:58` 忽略、永不进 git 历史 → **最弱证据源**，
    仅作算子归档通道保留（D839 派单「或该 session 记录已归档」），已显式登记。
  · 拿不到证据：全部路径 fail-closed（`released=False`）→ 调用方仍 block。

为什么不用 gen-cto-health.py 的 D393 全量派生口径（实测否决，留证）:
  该口径把「`git log --all` 含 `(D#)`」判为 impl_done。2026-09-20 本仓实测：两族失效认领
  会从 16 涨到 24，多出的 7 个含 **D711 / D819（均 `status=claimed`，进行中）**——按该口径
  释放它们 = 真实破坏并发保护（违反"进行中仍必须拦"）。故本模块**只认显式 status 声明**，
  拿不到证据一律不释放（fail-closed）。

契约（铁律 47）:
  输入 = 仓库根（`--repo`，默认本文件 parents[2]）+ 子命令参数；只读 git/task-state，不联网
  输出 = stdout：`scan` 输出 JSON（`--json`）或人读表格；`release`/`release-stale` 输出摘要行 + 凭证
  退出码 = 0 成功 | 1 业务否定（status: 未释放；release: 任务号非法）| 2 契约不满足
          （仓库不可读 / 参数非法 / 台账写入失败或被拒）
  降级 = task-state 不可读 / 未提交 / 无 `status` 字段 / JSON 损坏 / 台账记录缺凭证
         → **不作为释放证据**（fail-closed，绝不静默放行），并置 `degraded: true` + `detail`（铁律 24/31）
  副作用 = `release` / `release-stale --apply` 原子写 `task-state/claim-releases.json`
          （唯一 tmp 名 + os.replace，禁半写）；`scan` / `status` 零副作用
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

# 释放判定**不可用**时的显式降级公告（铁律 11 静默降级禁止）。
# 语义: 判定模块缺失 / 抛异常 → 一律按「未释放」处理（fail-closed，退回修复前的行为，
# 绝不误放行）；但必须让算子看见「释放维度已失效」，否则会再次陷入 D839 的死锁而无信号。
# 格式: SYNO-CLAIM-RELEASE-DEGRADED\t<brief stem>\t<原因>
DEGRADED_MARK = "SYNO-CLAIM-RELEASE-DEGRADED"

# 完成即释放的自动判据（卡片口径，2026-09-20 CTO 派单）
RELEASED_STATUSES = ("impl_done", "audited")

# 显式台账记录的**必需凭证**（D846：谁 / 何时 / 凭什么）。缺任一 → 记录不构成释放证据。
LEDGER_CREDENTIALS = ("by", "at", "reason")

# 不构成"显式理由"的占位值（D846：非 owner 释放必须有真理由，不接受默认值搪塞）
PLACEHOLDER_REASONS = ("", "显式释放")


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


# 已提交内容里"该路径不存在"的 git 错误特征（区别于仓库不可读等真故障）
_ABSENT_HINTS = ("does not exist", "exists on disk", "unknown revision",
                 "invalid object name", "unknown revision or path")


def _read_committed_json(repo, rel: str):
    """读 **已提交**（HEAD）内容的 JSON —— 释放证据的唯一可信入口（D846 / K3 P1-1）。

    契约:
      @input  repo（Path|str）+ 仓库相对路径（posix 风格，如 "task-state/D846.json"）
      @output (data, None) 命中并解析成功；否则 (None, err 字符串)
      @degraded err 语义: "ENOENT:HEAD"           = HEAD 中无此路径（正常默认，非告警）
                          "git show ... rc=N: <stderr>" = git 层失败（仓库不可读等）
                          "JSONDecodeError: ..."  = 已提交内容损坏（**必须告警**，铁律 24）
      @exit   不抛异常（语义交给调用方）；git 超时 60s
    为什么不用工作树: 工作树/索引是单机私有可变状态，任何本地进程可改且不留痕（K3 沙箱实证）——
      它不构成"另一个 session 现在是否还拥有该文件"这一**共享事实**的证据。
    """
    try:
        p = subprocess.run(["git", "-C", str(_as_repo(repo)), "show", f"HEAD:{rel}"],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError) as exc:
        return None, f"{type(exc).__name__}: {exc}"
    if p.returncode != 0:
        err = (p.stderr or "").strip().replace("\n", " ")
        if any(h in err for h in _ABSENT_HINTS):
            return None, "ENOENT:HEAD"
        return None, f"git show HEAD:{rel} rc={p.returncode}: {err[:160]}"
    try:
        return json.loads(p.stdout), None
    except json.JSONDecodeError as exc:
        return None, f"JSONDecodeError: {exc}"


def _working_tree_status(repo, tid: str):
    """工作树里 task-state/<D#>.json 的 status（**只用于降级提示**，绝不作为释放依据）。

    → status|None。不可读/无字段 → None（不抛异常）。
    """
    data, _err = _read_json(_as_repo(repo) / "task-state" / f"{tid}.json")
    st = data.get("status") if isinstance(data, dict) else None
    return st.strip() if isinstance(st, str) and st.strip() else None


def _degrade(res: dict, msg: str) -> None:
    """累积降级信号（铁律 11/24/31：可见、可传播、不静默）。"""
    res["degraded"] = True
    res["detail"] = f"{res['detail']}；{msg}" if res.get("detail") else msg


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
    """释放台账。缺失/损坏 → 空台账 + 不静默（调用方经 degraded 上报）。

    D846 说明: 台账读**工作树**是有意的（显式算子通道：`release` 必须立即生效，否则
    "先有鸡还是先有蛋"——台账被待释放任务的 brief 认领时，提交台账本身会被该认领 block → 死锁）。
    台账是 git 跟踪文件，篡改在 `git diff` 可见；记录缺凭证或未提交都会经 degraded 显式上报
    （见模块头威胁模型）。**不**把工作树改动当"事实"的规则由证据源 2 承担。
    """
    data, err = _read_json(ledger_path(repo))
    if not isinstance(data, dict) or "releases" not in data:
        if err and err != "ENOENT":
            sys.stderr.write(f"⚠ claim-release: 台账不可读（按空台账继续，fail-closed 不释放）: {err}\n")
        return {"version": LEDGER_VERSION, "releases": {}}
    if not isinstance(data.get("releases"), dict):
        return {"version": LEDGER_VERSION, "releases": {}}
    return data


def ledger_record_verdict(rec) -> tuple:
    """台账记录是否构成释放证据。→ (ok: bool, detail: str)。

    契约: ok=True 仅当 rec 是 dict 且 `released` 为真、且 `LEDGER_CREDENTIALS` 三项全部非空
          （谁 / 何时 / 凭什么）。detail 在 ok=False 且记录"看起来像释放"时点名缺哪项
          （让算子看见"为什么不认这条记录"，而不是静默忽略）。
    """
    if not isinstance(rec, dict) or not rec.get("released"):
        return False, ""
    missing = [k for k in LEDGER_CREDENTIALS if not str(rec.get(k) or "").strip()]
    if missing:
        return False, (f"台账记录缺凭证（{'/'.join(missing)}）→ 不构成释放证据"
                       f"（fail-closed 不释放；请用 release 子命令补全凭证）")
    return True, ""


def ledger_uncommitted(repo) -> bool:
    """台账文件相对 HEAD 是否有未提交变更（新增/改动/暂存都算）。

    契约: @output True = 有差异或无法判定（保守）；False = 与 HEAD 一致（已提交、凭证可核）。
    用途: 把"本地直写台账即解锁"从**无痕**变成门禁输出里**可见**的降级标注（D846 威胁模型）。
    """
    rel = LEDGER_REL.as_posix()
    try:
        p = subprocess.run(["git", "-C", str(_as_repo(repo)), "status", "--porcelain", "--", rel],
                           capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=60)
    except (OSError, subprocess.SubprocessError):
        return True
    if p.returncode != 0:
        return True  # 无法判定 → 保守按未提交（降级可见，不是静默放行）
    return bool((p.stdout or "").strip())


def save_ledger(repo: Path, data: dict) -> None:
    """原子写台账（唯一 tmp 名 + os.replace）——禁半写。

    D846 只做到"唯一 tmp 名"（进程 pid 后缀，杜绝多进程共用同一 tmp 被互相吃掉）；
    真正的**并发互斥**（lost-update）是 D847 的写集，走 write_lock.py，不在本卡。
    """
    p = ledger_path(repo)
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_name(f".{p.name}.{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                   encoding="utf-8")
    os.replace(tmp, p)


# ─────────────────────────── 判定 ───────────────────────────

def _norm_task(task_id: str) -> str:
    m = re.search(r"D\d+", task_id or "")
    return m.group(0) if m else ""


def task_status(repo: Path, task_id: str):
    """**已提交**的 task-state/<D#>.json 显式 status。→ (status|None, degraded_reason|None)。

    契约（D846）:
      @input  repo（Path|str）+ 任意含 D# 形态字符串
      @output 已提交卡的 `status`（str）；无 D# 形态 / HEAD 无此文件 → None
      @degraded 工作树/索引有该卡而 HEAD 无（未提交的卡）→ (None, "未提交（…）")
                工作树 status ∈ RELEASED_STATUSES 而已提交 status 不在 → (已提交 status, "不一致（…）")
                已提交内容不可读/损坏 → (None, err)
      @exit   不抛异常（拿不到证据一律交调用方 fail-closed）
    只认显式声明字段，且只认**已提交**内容：改工作树/加索引（不提交）不能解锁任何认领。
    """
    tid = _norm_task(task_id)
    if not tid:
        return None, "task_id 无 D# 形态"
    rel = f"task-state/{tid}.json"
    data, err = _read_committed_json(repo, rel)
    wt_st = _working_tree_status(repo, tid)
    if data is None:
        if err == "ENOENT:HEAD":
            if wt_st is not None:
                return None, (f"未提交（HEAD 无 {rel}，工作树有 status={wt_st}；"
                              f"工作树/索引改动不作为释放依据）")
            return None, "ENOENT:HEAD"
        return None, err
    st = data.get("status")
    if not isinstance(st, str) or not st.strip():
        return None, f"已提交 {rel} 无 status 字段"
    st = st.strip()
    if st not in RELEASED_STATUSES and wt_st in RELEASED_STATUSES:
        return st, (f"工作树 status={wt_st} 与已提交 status={st} 不一致 → 不作为释放依据"
                    f"（改工作树/不提交不能解锁他人认领；D846/K3 P1-1）")
    return st, None


def task_owner(repo: Path, task_id: str):
    """**已提交**卡的 owner（缺省回退 executor）。→ (owner|None, err|None)。

    用于 D846「非 owner 释放需显式理由」判定：owner 不明（未提交卡/字段缺失）→ None
    → 调用方按"非 owner"从严处理（fail-closed）。
    """
    tid = _norm_task(task_id)
    if not tid:
        return None, "task_id 无 D# 形态"
    data, err = _read_committed_json(repo, f"task-state/{tid}.json")
    if data is None:
        return None, err
    for k in ("owner", "executor"):
        v = data.get(k) if isinstance(data, dict) else None
        if isinstance(v, str) and v.strip():
            return v.strip(), None
    return None, "已提交卡无 owner/executor 字段"


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
    D846: task-state 证据只认**已提交**内容；台账证据只认**凭证完备**的记录；
          台账记录未提交 → 释放照旧但 degraded=True（凭证在 git 历史中不可核）。
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
    ok, why = ledger_record_verdict(rec)
    if ok:
        res.update(released=True, basis="ledger",
                   detail=(f"台账显式释放（{rec.get('reason', '')}；by={rec.get('by')} "
                           f"at={rec.get('at')}）"))
        if ledger_uncommitted(repo):
            _degrade(res, "⚠ 台账记录未提交（工作树变更）→ 凭证在 git 历史中不可核"
                          "；提交 task-state/claim-releases.json 后即变为可核")
        return res
    if why:
        _degrade(res, why)
    st, err = task_status(repo, tid)
    if st in RELEASED_STATUSES:
        res.update(released=True, basis=f"task-state:{st}",
                   detail=f"已提交 task-state/{tid}.json status={st}")
        return res
    if err and err != "ENOENT:HEAD":
        _degrade(res, f"释放证据不可用（fail-closed 不释放）: {err}")
    if archived is None:
        archived = archived_sessions(repo)
    if tid in archived:
        res.update(released=True, basis="session-archived",
                   detail=f"session-registry 已归档 {tid}（本地 registry＝最弱证据源）")
        return res
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
    """写显式释放记录到台账（持久、git 跟踪、与 brief 文本无关）。

    契约（D846 加严）:
      @input  repo / task_id（D#）/ reason（释放理由）/ by（操作者标识）
      @output {"ok": True, "task_id", "ledger", "record": {released, reason, by, at,
               basis_at_release, owner_at_release}}
      @degraded ok=False + code=2（契约不满足，**禁静默**）: by 为空 / 非 owner（或 owner 不明）
                而 reason 为占位值（空、"显式释放"）/ 台账写入失败
              ok=False + code=1（业务否定）: task_id 无 D# 形态
      @exit   本函数不抛异常；CLI 按 code 作为退出码
    为什么要有凭证: 释放是**降低保护**的动作（K3 D841 P1-1：`--by attacker` 无鉴权即落台账）。
      凭证（谁/何时/凭什么 + 释放时 owner 快照）是事后可核的最小集——缺凭证的记录不再被
      `ledger_record_verdict` 认作证据。
    """
    tid = _norm_task(task_id)
    if not tid:
        return {"ok": False, "code": 1, "error": "task_id 无 D# 形态"}
    by = (by or "").strip()
    if not by:
        return {"ok": False, "code": 2,
                "error": "操作者标识为空（--by，或 SYNO_AGENT 环境变量）→ 凭证不完整，拒绝写台账"}
    reason = (reason or "").strip()
    owner, _oerr = task_owner(repo, tid)
    if by != (owner or "") and reason in PLACEHOLDER_REASONS:
        return {"ok": False, "code": 2,
                "error": (f"非 owner 释放需显式理由：--by={by}，"
                          f"owner={owner or '未知（已提交卡无 owner/executor 字段，从严处理）'}；"
                          f'请加 --reason "<为什么可以释放>"（禁默认值/占位值）')}
    if not reason:
        # 凭证必须自足：owner 自释放不强制理由，但**记录里不能留空 reason**——
        # 空凭证的记录会被 ledger_record_verdict 判为"不构成证据"→ 释放静默失效
        # （D846 自测期实测踩到：③e「owner 释放生效」当场红）。
        reason = f"owner 自释放（{by}），未附额外理由"
    ledger = load_ledger(repo)
    ledger.setdefault("releases", {})[tid] = {
        "released": True,
        "reason": reason,
        "by": by,
        "at": _now(),
        "basis_at_release": is_released(repo, tid, ledger={"releases": {}})["basis"] or "explicit-only",
        "owner_at_release": owner or "",
    }
    ledger["version"] = LEDGER_VERSION
    try:
        save_ledger(repo, ledger)
    except OSError as exc:  # 禁静默吞（铁律 24）：写不进台账 = 释放没发生
        return {"ok": False, "code": 2,
                "error": f"台账写入失败（释放未生效，禁静默）: {type(exc).__name__}: {exc}"}
    return {"ok": True, "task_id": tid, "ledger": str(ledger_path(repo)),
            "record": dict(ledger["releases"][tid])}


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
    p_rel.add_argument("--reason", default="",
                       help='释放理由；非 owner 释放必填（禁"显式释放"占位值）')
    p_rel.add_argument("--by", default=os.environ.get("SYNO_AGENT") or "claim-release",
                       help="操作者标识（默认取 SYNO_AGENT，缺失则 claim-release；空则拒绝）")

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
            return r.get("code", 1)
        rec = r["record"]
        print(f"✅ 已释放 {r['task_id']} → 写入台账 {r['ledger']}")
        print(f"   凭证: by={rec['by']} at={rec['at']} "
              f"owner_at_release={rec['owner_at_release'] or '—'} "
              f"basis={rec['basis_at_release']} reason={rec['reason']}")
        if ledger_uncommitted(repo):
            print("   ⚠ 记录尚未提交（工作树变更）：凭证在 git 历史中不可核 → "
                  "建议 `git add task-state/claim-releases.json` 后随任务提交")
        return 0

    # release-stale
    r = stale_claims(repo, args.path or None)
    if r["degraded"]:
        sys.stderr.write(f"⚠ degraded: {r['degraded_reason']}\n")
    if not args.apply:
        print(f"[dry-run] 待释放 {len(r['stale'])} 份（加 --apply 落台账）: "
              f"{' '.join(s['task_id'] for s in r['stale'])}")
        return 0
    done, failed = [], []
    for s in r["stale"]:
        res = release_task(repo, s["task_id"], f"批量释放（{s['basis']}）", args.by)
        if res["ok"]:
            done.append(s["task_id"])
        else:
            failed.append((s["task_id"], res.get("error", "未知")))
    print(f"✅ 批量释放 {len(done)}/{len(r['stale'])} 份 → {ledger_path(repo)}")
    print(f"   {' '.join(done)}")
    for tid, why in failed:  # 禁静默吞（铁律 24）：任一失败必须点名
        sys.stderr.write(f"❌ {tid} 释放失败（未写入台账）: {why}\n")
    return 2 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
