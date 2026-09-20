#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/staging_guard.py — D311 暂存区隔离 (M1b)

控制塔 V4.6.0 M1b: 提交前校验暂存区 — 防止 D286 卷走 D300 暂存类事故
（A session 的 git commit 把 B session 已暂存的文件一并提交）。

判定逻辑（优先级）:
  0. 认领制（D329）: 暂存文件被"真实认领 brief（Q2 include 命中）的 D# ≠ 本 session
     任务 D#"认领 → **block**（独立防线，不依赖 registry 登记时序；own_set 判定之前）
     0b. 完成即释放（D839）: 若该认领 brief 所属任务**已释放**（`task-state/<D#>.json`
         status ∈ {impl_done, audited} / `task-state/claim-releases.json` 显式释放 /
         session 已归档）→ **不 block**，降 warn 并打印释放理由（谁被释放 + 依据）。
         block 时附 `release_cmd`（可执行释放命令，替代旧的"去协调"文案）。
  1. 暂存文件 ∈ 他人活跃 session 写集 → **block**（输出 owner 归属）
  2. 暂存文件 ∈ 自己写集 → pass
  3. 暂存文件无任何认领 → **warn**（stray_files，不硬阻断）
  4. 他人文件但已 committed → pass（忽略 committed 条目）

fail-open（铁律 24/31 + 设计文档 §2.1.5）:
  - registry 缺失/损坏 → pass + degraded 标记 + degraded-events.log，绝不静默
  - 自身异常 → exit 0 + degraded（不阻断业务）
fail-closed（D839，方向相反，必须区分）:
  - **释放判定**拿不到证据（task-state 不可读 / 无 status / claim_release 缺失）→ 按**未释放**
    处理 → 仍 block。释放是降低保护的动作，绝不因"读不到"而静默放行。

用法:
  staging_guard.py --session-id <id> --staged <file>... [--json]
退出码: 0 = pass/warn/degraded, 1 = block
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

from session_registry import (  # noqa: E402
    DEFAULT_DEGRADED_LOG,
    SessionRegistry,
    log_degraded,
)

# D839: 释放语义单一事实源（"完成即释放"判定 / 批量扫描 / 释放台账）。
# 缺失 → 释放维度整体降级为"不释放"（fail-closed，行为与修复前一致，零回归）。
try:
    from claim_release import DEGRADED_MARK, RELEASED_MARK, is_released as _claim_is_released
except ImportError:  # pragma: no cover — 旧检出/被裁剪的树
    _claim_is_released = None
    RELEASED_MARK = "SYNO-RELEASED-CLAIM"
    DEGRADED_MARK = "SYNO-CLAIM-RELEASE-DEGRADED"

# D853: resolver 链断（python/git 不可用）时它发的显式降级公告 —— **字面量与
# `resolve-commit-brief.sh` 里 printf 的那两行相同（改一处必改两处）**。
# 语义: 认领判定这一维**整条不可用** → 拿不到认领列表 ≠ 没有认领 → 必须 fail-closed（block），
#   否则"链断了"会被翻译成"放行"（Windows CI 实测：5 场景全 ec0/pass）。
RESOLVER_DEGRADED_MARK = "SYNO-RESOLVER-DEGRADED"


def parse_resolver_degraded(stderr_text: str) -> List[str]:
    """解析 resolver 的**链断**公告（D853）。→ [原因, ...]（空 = 链正常）。

    契约: 输入 = 任意文本；输出 = 原因列表。容错: 非本前缀行忽略，绝不抛异常。
    与 `parse_degraded_claims` 的区别: 那条是"释放维度降级"（仍能判认领，只是不释放认领）；
    本条是"**认领判定整条不可用**"（python/git 不可用）→ 调用方必须 fail-closed。
    """
    out: List[str] = []
    for line in (stderr_text or "").splitlines():
        if not line.startswith(RESOLVER_DEGRADED_MARK):
            continue
        parts = line.split("\t")
        out.append(parts[1].strip() if len(parts) > 1 and parts[1].strip() else "原因未给")
    return out


def _find_bash():
    """自包含 bash 探测（windows-compat 模式 1）→ (bash|None, reason)。

    契约:
      @output ("/path/to/bash", "") 可用；否则 (None, "<原因>")
      @degraded None = **不可用** → 调用方必须 fail-closed（不得静默当作"无认领"）
      @exit   不抛异常
    D853: Windows 上 PATH 命中的 `bash` 可能是 **WSL 桩**（`C:\\Windows\\System32\\bash.exe`，
      实测输出 "Windows Subsystem for Linux has no installed distributions"）→ 只 `command -v`/`which`
      不够（那是本卡正在修的"只探存在性"同型缺陷）→ **必须试运行校验**。
      优先序: SYNO_BASH 显式指定 → Git Bash 常见安装位 → PATH 上的 bash（逐个试运行）。
    """
    cands = []
    env_bash = os.environ.get("SYNO_BASH")
    if env_bash:
        cands.append(env_bash)
    if os.name == "nt":  # pragma: no cover — Windows
        cands += [r"C:\Program Files\Git\bin\bash.exe", r"C:\Program Files\Git\usr\bin\bash.exe",
                  r"C:\Program Files (x86)\Git\bin\bash.exe"]
    found = shutil.which("bash")
    if found:
        cands.append(found)
    cands += ["/bin/bash", "/usr/bin/bash", "/usr/local/bin/bash"]
    for c in cands:
        if not c or not os.path.exists(c):
            continue
        try:
            p = subprocess.run([c, "-c", "echo SYNO_BASH_OK"], capture_output=True, text=True,
                               encoding="utf-8", errors="replace", timeout=20)
        except (OSError, subprocess.SubprocessError):
            continue
        if p.returncode == 0 and "SYNO_BASH_OK" in (p.stdout or ""):
            return c, ""
    return None, "未找到可用 bash（SYNO_BASH / Git Bash / PATH 上的 bash 试运行均失败）"


def _bash_env(bash: str) -> dict:
    """自包含 subprocess 环境（windows-compat 模式 1）: MSYS 的 PATH 分隔符是 ':'，且 Git Bash 的
    `usr/bin`（cat/grep/python3 依赖链）默认不在纯系统 PATH 上 → 显式前置。POSIX 上等价于原 env。
    """
    env = dict(os.environ)
    if os.name == "nt":  # pragma: no cover — Windows
        root = Path(bash).parent.parent
        if root.name.lower() == "usr":
            root = root.parent
        paths = [root / "usr" / "bin", root / "bin", root / "cmd", root / "mingw64" / "bin",
                 Path(sys.executable).parent]
        msys = []
        for p in paths:
            s = str(p).replace("\\", "/")
            if len(s) > 1 and s[1] == ":":
                s = "/" + s[0].lower() + s[2:]
            msys.append(s)
        env["PATH"] = ":".join(msys + [env.get("PATH", "")])
    return env


def _fail_closed(result: dict, why: str) -> dict:
    """认领判定链不可用 → **fail-closed**（block + 显式点名，绝不静默当作"无认领"）。

    D853: 与 `check_staging` 里"registry 缺失 → fail-open pass"方向相反——认领维度是**保护**维度，
    拿不到事实时不放行（与 release 维度同哲学）；差异必须由 `degraded`/`degraded_reason` 显式表达
    （铁律 11/24/31），而不是被压成同一个 pass。
    """
    result["status"] = "block"
    result["degraded"] = True
    _prev = result.get("degraded_reason", "")
    result["degraded_reason"] = (_prev + " | " if _prev else "") + f"D853 认领判定不可用（{why}）→ fail-closed 阻断"
    result["foreign_files"].append(
        {"file": "<staged>", "owner_session": "unknown", "brief": "",
         "reason": f"认领判定链不可用: {why}"})
    return result


def parse_released_claims(stderr_text: str) -> List[dict]:
    """解析 resolver stderr 的已释放认领记录。

    契约: 输入 = 任意文本；输出 = [{brief, task_id, basis, detail}]。
    容错: 非本前缀行 / 字段不足行一律忽略（stderr 可能混入其他输出），绝不抛异常。
    """
    out: List[dict] = []
    for line in (stderr_text or "").splitlines():
        if not line.startswith(RELEASED_MARK):
            continue
        parts = line.split("\t")
        if len(parts) < 4:
            continue
        out.append({"brief": parts[1], "task_id": parts[2], "basis": parts[3],
                    "detail": parts[4] if len(parts) > 4 else ""})
    return out


def parse_degraded_claims(stderr_text: str) -> List[dict]:
    """解析 resolver stderr 的**释放维度降级**公告（铁律 11：降级必须可见，绝不静默）。

    契约: 输入 = 任意文本；输出 = [{brief, why}]。语义 = 释放判定不可用，已退回「不释放」
    （fail-closed，绝不误放行）。容错: 非本前缀行 / 字段不足行忽略。
    """
    out: List[dict] = []
    for line in (stderr_text or "").splitlines():
        if not line.startswith(DEGRADED_MARK):
            continue
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        out.append({"brief": parts[1], "why": parts[2]})
    return out


def release_cmd_for(task_id: str) -> str:
    """D839 ②: block 文案里的**可执行**释放命令（不再只写"去协调"）。"""
    return (f"python3 scripts/control-tower/claim_release.py release --task {task_id} "
            f'--reason "<为什么可以释放>"    # 等价入口: python3 scripts/control-tower/session_registry.py '
            f"archive --session-id {task_id}")


def _release_verdict(task_id: str) -> dict:
    """D839: 释放判定包装。

    契约: 输入 = D# 字符串；输出 = {task_id, released, basis, detail, degraded}。
    降级: claim_release 模块缺失 / 判定抛异常 → **released=False**（fail-closed，绝不静默放行），
          并置 degraded=True 让调用方显式可见（铁律 24/31）。
    """
    if _claim_is_released is None:
        return {"task_id": task_id, "released": False, "basis": "",
                "detail": "claim_release 模块不可用 → 按未释放处理（fail-closed）", "degraded": True}
    try:
        return _claim_is_released(REPO_ROOT, task_id)
    except Exception as exc:  # noqa: BLE001 — 判定异常必须降级为"不释放"，绝不当作已释放
        return {"task_id": task_id, "released": False, "basis": "",
                "detail": f"释放判定异常 → 按未释放处理（fail-closed）: {exc}", "degraded": True}



def check_staging(
    reg: SessionRegistry,
    session_id: str,
    staged_files: List[str],
) -> dict:
    """校验暂存文件归属。返回 {status: pass|warn|block, ...}。

    判定优先级:
      1. 文件 ∈ 他人活跃写集（未 committed）→ block
      2. 文件 ∈ 自己写集 → pass
      3. 文件曾被他人在 registry 声明但已 committed → pass（他人已提交，不再占用）
      4. 文件无任何注册记录 → warn（stray，不硬阻断 — brief 可能过时）
      5. registry 缺失/自身异常 → degraded pass（fail-open）
    """
    result = {
        "status": "pass",
        "foreign_files": [],
        "stray_files": [],
        "degraded": False,
    }

    # ── D329: 认领制硬校验 — 文件被"认领 brief 的 D# ≠ 本 session 任务 D#"认领 → block ──
    # ── D839: 完成即释放 — 该 brief 所属任务已释放（task-state 完结 / 台账显式释放 / session 已归档）
    #          → 不再 block，降 warn 并打印释放理由（谁被释放 + 依据）。──
    # 必须放在 own_set 放行之前：否则 synova-commit 的 write-set 预登记会让被声明文件
    # 先进 own_set 直接 pass（D329 自查发现的设计缺陷）。registry 写集判定保留（防已登记
    # 占用），认领制判定是独立防线（不依赖登记时序）。session_id 无 D# → 跳过（不误伤）。
    released_claims: List[dict] = []
    try:
        staged_arg = "\n".join(staged_files)
        # D331 (P2-2): --session 生产接线 — resolver 的 session 专属 current-brief
        # 支持已实现但零生产调用方（KIMI K3 审计: D329 dev doc §5 只要求"resolver
        # 读取"，没要求"生产调用方真实传递"）。本调用是生产唯一调用点（WIRE CHECK
        # 升级: grep "resolve-commit-brief.sh.*--session" scripts/ ≥1 真实命中）。
        # D853-①: bash 必须**自包含 + 试运行校验**——Windows 上裸 "bash" 会命中 WSL 桩
        #   （C:\Windows\System32\bash.exe，输出 "no installed distributions"）→ resolver 根本没执行
        #   → rc=1 零输出 → 认领判定整条消失（CI 实测：5 场景全 ec0/pass）。
        _bash, _bash_why = _find_bash()
        if _bash is None:
            log_degraded(reg.degraded_log, "staging-guard", f"D853 bash 不可用: {_bash_why}")
            return _fail_closed(result, f"bash 不可用（{_bash_why}）")
        _proc = subprocess.run(
            [_bash, str(REPO_ROOT / "scripts/workflow/resolve-commit-brief.sh"), "--session", session_id, staged_arg],
            capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
            env=_bash_env(_bash),
        )
        # D853-②: 链断 ≠ 无认领 —— resolver 自报 python/git 不可用时必须 fail-closed（不是跳过判定）
        _resolver_broken = parse_resolver_degraded(_proc.stderr)
        if _resolver_broken:
            _why = "; ".join(_resolver_broken)
            log_degraded(reg.degraded_log, "staging-guard", f"D853 resolver 链断: {_why}")
            return _fail_closed(result, f"resolver 链断（{_why}）")
        claimed = _proc.stdout.strip().splitlines()
        # D839 ①: resolver 已把"已释放"的 brief 剔出候选池 —— 剔除理由在 stderr，取回来降 warn 用
        released_claims = parse_released_claims(_proc.stderr)
        degraded_claims = parse_degraded_claims(_proc.stderr)
        if degraded_claims:
            # 铁律 11/31: 释放维度不可用 → 显式记录 + 传播（不阻断，但绝不静默）
            log_degraded(reg.degraded_log, "staging-guard",
                         "claim-release degraded: " + "; ".join(
                             f"{c['brief']}({c['why']})" for c in degraded_claims))
            result["degraded"] = True
            _prev = result.get("degraded_reason", "")
            result["degraded_reason"] = (_prev + " | " if _prev else "") + \
                "释放判定不可用（按未释放 fail-closed）: " + "; ".join(
                    f"{c['brief']}({c['why']})" for c in degraded_claims)
            result["claim_release_degraded"] = degraded_claims
        if claimed:
            brief = claimed[0]
            # 防假阳性: 仅当 brief 真实认领 ≥1 个暂存文件才比较 D#（Q2 include 命中）
            try:
                sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))
                from brief_parser import parse_q2, match_path
                text = Path(brief).read_text(encoding="utf-8", errors="replace")
                inc = parse_q2(text).get("include", [])
                genuine = any(match_path(f, p) for f in staged_files for p in inc)
            except Exception:
                genuine = False
            if genuine:
                claim_did = re.search(r"D\d+", Path(brief).stem)
                sess_did = re.search(r"D\d+", session_id or "")
                # 精确相等（禁 startswith）: D3290 不能匹配 D329；session_id 无 D# → 跳过认领制判定
                if claim_did and sess_did and claim_did.group(0) != sess_did.group(0):
                    rel = _release_verdict(claim_did.group(0))
                    if rel["released"]:
                        # D839 ①: 完成即释放 — 降 warn，不再阻断其他 session
                        released_claims.append(
                            {"task_id": claim_did.group(0), "brief": Path(brief).stem,
                             "basis": rel["basis"], "detail": rel["detail"]}
                        )
                    else:
                        result["status"] = "block"
                        result["foreign_files"].append(
                            {"file": "<staged>", "owner_session": Path(brief).stem,
                             "brief": brief, "reason": "认领 brief D# 与本 session 任务不一致"}
                        )
                        # D839 ②: block 文案必须给可执行的释放命令（不再只写"去协调"）
                        result["release_cmd"] = release_cmd_for(claim_did.group(0))
                        if rel.get("degraded"):
                            result["degraded"] = True
                            result["degraded_reason"] = rel.get("detail", "")
    except Exception as exc:  # fail-open: 认领判定异常 → degraded 记录，registry 判定兜底
        log_degraded(reg.degraded_log, "staging-guard", f"claim check degraded: {exc}")
        result["degraded"] = True
        result["degraded_reason"] = f"claim check degraded: {exc}"

    # D839 ①: 有已释放的认领被跳过 → 降 warn + 打印释放理由（谁被释放 / 依据=哪个 task-state 状态）。
    # 绝不覆盖 block —— 真实并发阻断优先级最高。
    if released_claims:
        result["released_claims"] = released_claims
        result["release_reason"] = "; ".join(
            f"{c['task_id']} 已释放（依据 {c['basis']}"
            + (f": {c['detail']}" if c.get("detail") else "") + ")"
            for c in released_claims
        )
        if result["status"] == "pass":
            result["status"] = "warn"

    try:
        if not reg.registry_path.exists():
            # registry 缺失 → fail-open: pass + degraded（绝不静默）
            log_degraded(
                reg.degraded_log,
                "staging-guard",
                f"registry 缺失: {reg.registry_path}",
            )
            result["degraded"] = True
            result["degraded_reason"] = f"registry 缺失: {reg.registry_path}"
            return result
        sessions = reg.list(active_only=True)
        # D331 (P2-1): 归属判定用 task_id — 同任务并行 session（如分阶段协同）的
        # 写集视同己方（不误伤）；my_task 无（旧注册）→ 回退 session_id 仅判。
        session_tasks = {s["session_id"]: s.get("task_id") for s in sessions}
        my_task = session_tasks.get(session_id)
        own_set = set()
        # 文件 → 声明过它的所有 session（含 committed，用于区分"无记录"与"已提交"）
        declared_by: dict[str, list] = {}
        for s in sessions:
            sid = s["session_id"]
            is_own = (sid == session_id) or (
                my_task is not None and s.get("task_id") == my_task
            )
            if is_own:
                for w in s.get("write_set", []):
                    if w.get("status") != "committed":
                        own_set.add(w["file"].replace("\\", "/").lower())
            for w in s.get("write_set", []):
                declared_by.setdefault(w["file"].replace("\\", "/").lower(), []).append(
                    (sid, w.get("status"))
                )

        for f in staged_files:
            norm = f.replace("\\", "/").lower()
            if norm in own_set:
                continue  # 2. 自己写集（含同任务 session）→ pass
            decls = declared_by.get(norm, [])
            # 1. 他人活跃占用（未 committed；同任务不视为他人）
            active_others = [
                (sid, st)
                for sid, st in decls
                if sid != session_id
                and not (my_task is not None and session_tasks.get(sid) == my_task)
                and st != "committed"
            ]
            if active_others:
                owner, _ = active_others[0]
                owner_brief = None
                for s in sessions:
                    if s["session_id"] == owner:
                        owner_brief = s.get("brief")
                        break
                result["foreign_files"].append(
                    {"file": f, "owner_session": owner, "brief": owner_brief}
                )
                result["status"] = "block"
            elif decls:
                # 3. 他人在 registry 声明过但已 committed → pass
                continue
            else:
                # 4. 无任何记录 → warn
                result["stray_files"].append(f)
                if result["status"] != "block":
                    result["status"] = "warn"
    except Exception as exc:  # fail-open: 自身异常 → pass + degraded
        log_degraded(reg.degraded_log, "staging-guard", f"check error: {exc}")
        result["degraded"] = True
        result["degraded_reason"] = str(exc)
        result["status"] = "pass"
    return result


def _out(obj: dict) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    print(json.dumps(obj, ensure_ascii=False))


def main() -> int:
    parser = argparse.ArgumentParser(description="D311 暂存区隔离校验")
    parser.add_argument("--session-id", required=True, help="当前 session id")
    parser.add_argument("--staged", nargs="*", default=[], help="暂存文件列表")
    parser.add_argument("--json", action="store_true", help="JSON 输出")
    args = parser.parse_args()

    reg = SessionRegistry()
    result = check_staging(reg, args.session_id, args.staged or [])
    _out(result)

    # block → exit 1（硬阻断）；warn/pass/degraded → exit 0
    return 1 if result["status"] == "block" else 0


if __name__ == "__main__":
    sys.exit(main())
