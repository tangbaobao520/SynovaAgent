#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
scripts/control-tower/worktree-manager.py — D307 session 级 worktree 隔离

根治病症: 多 session 共享同一主 worktree index 的拉锯/劫持（D320 写集被吞、
D330-D331 共享暂存区劫持）。git worktree = 物理隔离的最小机制（决策点 1:
第一性原理 + git 官方 worktree 标准用法开源实证, 收敛）:

  create <sid> [--base <branch>]
    — 在 <repo>/../synova-wt-<sid> 建独立 worktree, checkout 新分支
      session/<sid>（git 物理约束: 两个 worktree 不能 checkout 同一分支）,
      registry 记录 worktree_path/worktree_branch
  finish <sid>
    — 安全检查 → 主 worktree merge session/<sid> → worktree remove →
      branch -d → registry 清字段 + phase DONE
  list      — 全部 worktree 的 JSON 视图（git worktree list --porcelain）
  status <sid> — 单 session 状态（worktree 存在/分支存在/已合并/脏）

退出码三态（ctrl-tower-change 模式 1）:
  exit 0 = ok | exit 1 = 业务阻断(block) | exit 2 = 自身降级(degraded)
git 生命周期操作 fail-closed（决策点 4, Anthropic 基线）: 任何 git 失败
显式报错, 绝不静默假装成功。registry 是簿记层 fail-open: 写失败记
degraded-events.log, git 操作照常进行。

用法: python3 worktree-manager.py create S1 [--base main] [--repo <path>]
注入: SYNO_CT_DIR（registry 目录）+ --repo（仓库路径）— 测试隔离
（ctrl-tower-change 模式 5: 零真实目录零网络）。
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

REPO_ROOT = Path(__file__).resolve().parents[2]
CT_DIR = Path(os.environ.get("SYNO_CT_DIR", str(REPO_ROOT / ".codex" / "control-tower")))
LOGS_DIR = CT_DIR / "logs"

GIT_CANDIDATES = (
    r"C:\Program Files\Git\cmd\git.exe",
    r"C:\Program Files\Git\bin\git.exe",
)


class GitError(RuntimeError):
    """git 命令失败（fail-closed 信号载体）— 携带 rc 与 stderr 供显式报错。"""

    def __init__(self, args, rc, stderr):
        super().__init__(f"git {' '.join(args)} → exit {rc}: {(stderr or '').strip()[:400]}")
        self.rc = rc
        self.stderr = stderr


def _find_git():
    """解析 git 可执行（不依赖进程 PATH, windows-compat 模式 1）— None = 降级。"""
    found = shutil.which("git")
    if found:
        return found
    for cand in GIT_CANDIDATES:
        if os.path.exists(cand):
            return cand
    return None


GIT = _find_git()


def _git(repo: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    """subprocess 调 git。直接调 git.exe（非 bash）→ Windows 路径无 MSYS 转义。
    check=True → git 非零退出抛 GitError（fail-closed, 绝不静默）。"""
    try:
        proc = subprocess.run(
            [GIT, *args], cwd=str(repo), check=False,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
        )
    except OSError as exc:
        raise GitError(args, -1, f"git 启动失败: {exc}") from exc
    if check and proc.returncode != 0:
        raise GitError(args, proc.returncode, proc.stderr)
    return proc


def _degraded(component: str, reason: str) -> None:
    """fail-open 降级记录（复用控制塔 degraded-events.log, 绝不静默）。"""
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        with (LOGS_DIR / "degraded-events.log").open("a", encoding="utf-8") as f:
            f.write(json.dumps({
                "time": time.strftime("%Y-%m-%dT%H:%M:%S+00:00", time.gmtime()),
                "component": component, "reason": reason,
            }, ensure_ascii=False) + "\n")
    except OSError:
        pass


def _registry():
    """SessionRegistry（SYNO_CT_DIR 注入）。None = 簿记不可用（fail-open）。"""
    try:
        sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))
        from session_registry import SessionRegistry
        return SessionRegistry(
            registry_path=CT_DIR / "session-registry.json",
            lock_dir=CT_DIR / "locks",
            degraded_log=LOGS_DIR / "degraded-events.log",
        )
    except Exception as exc:  # pragma: no cover - 簿记层 fail-open
        _degraded("worktree-manager.registry", f"registry 初始化失败: {exc}")
        return None


def _resolve_repo(repo_arg) -> Path:
    """--repo 显式注入优先, 否则 cwd 向上解析仓库根。"""
    if repo_arg:
        return Path(repo_arg).resolve()
    return Path(_git(Path.cwd(), "rev-parse", "--show-toplevel").stdout.strip())


def _worktrees(repo: Path) -> list:
    """git worktree list --porcelain → [{path, branch}]（空行分隔条目）。"""
    entries, cur = [], {}
    for line in _git(repo, "worktree", "list", "--porcelain").stdout.splitlines():
        if not line.strip():
            if cur:
                entries.append(cur)
                cur = {}
        elif line.startswith("worktree "):
            cur["path"] = line[len("worktree "):]
        elif line.startswith("branch "):
            cur["branch"] = line[len("branch "):]
    if cur:
        entries.append(cur)
    return entries


def ok(extra: dict) -> dict:
    return {"status": "ok", **extra}


def block(reason: str) -> dict:
    return {"status": "block", "reason": reason}


def cmd_create(sid: str, base, repo: Path) -> dict:
    if not sid or "/" in sid or "\\" in sid:
        return block("非法 session id: 不能为空且不能含路径分隔符")
    wt = repo.parent / f"synova-wt-{sid}"
    if wt.exists():
        return block(f"worktree 目录已存在: {wt} — 请先 finish 或手动清理")
    if not base:
        base = _git(repo, "rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
        if not base or base == "HEAD":
            return block("无法解析主 worktree 当前分支（--base 未指定且 HEAD detached）")
    branch = f"session/{sid}"
    # 分支已存在 → 显式阻断（git worktree add -b 本身会失败, 提前报更清晰的错）
    if _git(repo, "branch", "--list", branch).stdout.strip():
        return block(f"分支已存在: {branch} — 疑似残留, 请确认或换 sid")
    try:
        _git(repo, "worktree", "add", str(wt), "-b", branch, base)
    except GitError as exc:
        return block(f"git worktree add 失败: {exc}")
    # 簿记 (fail-open): registry 记录 worktree 绑定
    reg = _registry()
    if reg is not None:
        try:
            reg.register(session_id=sid, brief="worktree-manager create", pid=os.getpid())
            reg.set_worktree(session_id=sid, worktree_path=str(wt), worktree_branch=branch)
        except Exception as exc:
            _degraded("worktree-manager.create", f"registry 簿记失败 (worktree 已创建, 隔离不受影响): {exc}")
    return ok({
        "session_id": sid,
        "worktree_path": str(wt),
        "worktree_branch": branch,
        "base_branch": base,
    })


def cmd_finish(sid: str, repo: Path) -> dict:
    branch = f"session/{sid}"
    match = next((w for w in _worktrees(repo) if w.get("branch") == f"refs/heads/{branch}"), None)
    if not match:
        return block(f"未找到 {branch} 对应的 worktree — 可能已 finish 或从未 create")
    wt = Path(match["path"])
    # 安全检查 1: session worktree 脏 → block（fail-closed, 决策点 4）
    dirty_wt = _git(wt, "status", "--porcelain").stdout.strip()
    if dirty_wt:
        return block(f"session worktree 有未提交变更, 拒绝合并: {wt}\n{dirty_wt[:400]}")
    # 安全检查 2: 主 worktree 脏 → block
    dirty_main = _git(repo, "status", "--porcelain").stdout.strip()
    if dirty_main:
        return block(f"主 worktree 有未提交变更, 拒绝合并: {repo}\n{dirty_main[:400]}")
    # merge → 失败/冲突: abort + 保留一切 + 显式报错（绝不丢数据）
    try:
        _git(repo, "merge", branch, "--no-edit")
    except GitError as exc:
        _git(repo, "merge", "--abort", check=False)
        return block(f"merge {branch} 失败（已 abort, worktree 与分支保留）: {exc}")
    try:
        _git(repo, "worktree", "remove", str(wt))
    except GitError as exc:
        return block(f"merge 成功但 worktree remove 失败（请手动 git worktree remove {wt}）: {exc}")
    try:
        _git(repo, "branch", "-d", branch)
    except GitError as exc:
        return block(f"merge 成功但分支删除失败（请手动 git branch -D {branch}）: {exc}")
    # 簿记 (fail-open): registry 清字段 + phase DONE
    reg = _registry()
    if reg is not None:
        try:
            reg.set_worktree(session_id=sid, worktree_path=None, worktree_branch=None)
            reg.phase(session_id=sid, phase="DONE")
        except Exception as exc:
            _degraded("worktree-manager.finish", f"registry 清理失败: {exc}")
    return ok({
        "session_id": sid,
        "merged_branch": branch,
        "removed_worktree": str(wt),
        "deleted_branch": branch,
    })


def cmd_list(repo: Path) -> dict:
    return ok({"worktrees": _worktrees(repo)})


def cmd_status(sid: str, repo: Path) -> dict:
    branch = f"session/{sid}"
    match = next((w for w in _worktrees(repo) if w.get("branch") == f"refs/heads/{branch}"), None)
    branch_exists = bool(_git(repo, "branch", "--list", branch).stdout.strip())
    merged = False
    if branch_exists:
        merged = branch in _git(repo, "branch", "--merged").stdout
    dirty = ""
    if match:
        dirty = _git(Path(match["path"]), "status", "--porcelain").stdout.strip()
    return ok({
        "session_id": sid,
        "worktree_exists": match is not None,
        "worktree_path": match["path"] if match else None,
        "branch_exists": branch_exists,
        "merged": merged,
        "worktree_dirty": bool(dirty),
    })


def _out(obj: dict) -> None:
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    print(json.dumps(obj, ensure_ascii=False))


def main(argv=None) -> int:
    global GIT
    parser = argparse.ArgumentParser(description="D307 session 级 worktree 隔离")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_create = sub.add_parser("create")
    p_create.add_argument("sid")
    p_create.add_argument("--base", default=None)
    p_finish = sub.add_parser("finish")
    p_finish.add_argument("sid")
    p_list = sub.add_parser("list")
    p_status = sub.add_parser("status")
    p_status.add_argument("sid")
    for p in (p_create, p_finish, p_list, p_status):
        p.add_argument("--repo", default=None)
    args = parser.parse_args(argv)

    if GIT is None:
        GIT = _find_git()
    if GIT is None:
        _out({"status": "degraded", "degraded": True, "reason": "git 不可用 — worktree 管理无法执行"})
        return 2

    try:
        repo = _resolve_repo(args.repo)
    except GitError as exc:
        _out({"status": "degraded", "degraded": True, "reason": f"仓库解析失败: {exc}"})
        return 2

    try:
        if args.cmd == "create":
            res = cmd_create(args.sid, args.base, repo)
        elif args.cmd == "finish":
            res = cmd_finish(args.sid, repo)
        elif args.cmd == "list":
            res = cmd_list(repo)
        else:
            res = cmd_status(args.sid, repo)
        _out(res)
        if res.get("status") == "ok":
            return 0
        return 1 if res.get("status") == "block" else 2
    except GitError as exc:
        _out({"status": "block", "reason": f"git 失败: {exc}"})
        return 1
    except Exception as exc:  # 兜底: 自身缺陷 → degraded, 绝不静默成功
        _degraded("worktree-manager", f"unexpected: {exc}")
        _out({"status": "degraded", "degraded": True, "reason": str(exc)})
        return 2


if __name__ == "__main__":
    sys.exit(main())
