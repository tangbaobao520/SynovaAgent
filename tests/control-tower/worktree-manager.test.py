# -*- coding: utf-8 -*-
"""
tests/control-tower/worktree-manager.test.py — D307 session 级 worktree 隔离单元测试

覆盖矩阵（dev doc §4，铁律 48 正常/降级/边界）:
  1. create 生成独立 worktree（git worktree list 含 session/<sid> 分支）+ registry 字段
  2. 双 worktree 独立 index：A 在 wt-A add 文件 → B 在 wt-B 的 index 不可见（物理隔离证明）
  3. A/B 各自 commit 互不干扰（无共享 index 拉锯）
  4. finish 合并回主分支 + worktree 清理 + registry 清理
  5. hooks 在 worktree 内生效（共享 .git/hooks，12 组门禁回归确认）
  6. registry worktree 字段（worktree CLI --path/--branch/--clear）
  7. 边界: finish 遇脏主 worktree → block 且不删任何东西（fail-closed）
  8. 边界: finish 遇脏 session worktree → block 且保留 worktree（fail-closed）
  9. 边界: create 遇已存在分支 → block 显式报错
  10. attach 并行检测: 活跃 session 存在/不存在 → 提示/静默；_in_worktree 主/链接 worktree 判定

测试隔离: 全部 git 操作在 tempfile.TemporaryDirectory 内真实临时仓库执行
（git init + 初始 commit），零真实目录、零网络。SYNO_CT_DIR 注入隔离 registry。
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

import session_registry as sr  # noqa: E402


# ── git 可执行解析（不依赖进程 PATH；Windows Git Bash/纯系统环境双兼容）──

GIT_CANDIDATES = (
    r"C:\Program Files\Git\cmd\git.exe",
    r"C:\Program Files\Git\bin\git.exe",
)


def find_git() -> str:
    found = shutil.which("git")
    if found:
        return found
    for cand in GIT_CANDIDATES:
        if os.path.exists(cand):
            return cand
    raise RuntimeError("git 不可用 — 测试无法执行")


GIT = find_git()


def git(*args: str, cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    """subprocess 调 git；check=True 让 git 失败显式炸出（测试环境允许）。"""
    return subprocess.run(
        [GIT, *args], cwd=str(cwd), check=check,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )


def make_repo(root: Path) -> Path:
    """在 root 下建真实 git 仓库（main 分支 + 1 个初始 commit），返回仓库路径。"""
    repo = root / "repo"
    repo.mkdir()
    git("init", cwd=repo)
    git("symbolic-ref", "HEAD", "refs/heads/main", cwd=repo)
    git("config", "user.name", "D307 Test", cwd=repo)
    git("config", "user.email", "d307-test@synova.local", cwd=repo)
    (repo / "base.txt").write_text("base\n", encoding="utf-8")
    git("add", "base.txt", cwd=repo)
    git("commit", "-m", "init base", cwd=repo)
    return repo


def make_registry(ct_dir: Path) -> sr.SessionRegistry:
    return sr.SessionRegistry(
        registry_path=ct_dir / "session-registry.json",
        lock_dir=ct_dir / "locks",
        degraded_log=ct_dir / "degraded-events.log",
    )


def run_manager(repo: Path, ct_dir: Path, *args: str) -> dict:
    """subprocess 调 worktree-manager.py，返回解析后的 JSON + exit code。"""
    env = dict(os.environ)
    env["SYNO_CT_DIR"] = str(ct_dir)
    proc = subprocess.run(
        [sys.executable, str(REPO_ROOT / "scripts" / "control-tower" / "worktree-manager.py"),
         *args, "--repo", str(repo)],
        capture_output=True, text=True, encoding="utf-8", errors="replace", env=env,
    )
    try:
        out = json.loads(proc.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError):
        out = {"_raw": proc.stdout, "_stderr": proc.stderr}
    return {"code": proc.returncode, **out}


class WorktreeManagerTestCase(unittest.TestCase):
    """基类: 每个用例独立临时仓库 + 独立 CT 目录 + worktree 路径跟踪清理。"""

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        self.repo = make_repo(self.root)
        self.ct = self.root / "ct"
        self.created_wt: list[Path] = []

    def tearDown(self):
        # worktree 目录建在 repo 父级（Temp 根），TemporaryDirectory 清不到 → 显式清理
        for wt in self.created_wt:
            if wt.exists():
                git("worktree", "remove", "--force", str(wt), cwd=self.repo, check=False)
                shutil.rmtree(wt, ignore_errors=True)
        self._tmp.cleanup()

    def wt_path(self, sid: str) -> Path:
        return self.repo.parent / f"synova-wt-{sid}"


class TestCreate(unittest.TestCase):
    def test_create_generates_independent_worktree(self):
        """用例 1: create 生成独立 worktree + session 分支 + registry 字段。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            res = run_manager(t.repo, t.ct, "create", "S1", "--base", "main")
            self.assertEqual(res.get("code"), 0, res)
            self.assertEqual(res.get("status"), "ok", res)
            wt = t.wt_path("S1")
            self.assertTrue(wt.is_dir(), f"worktree 目录未创建: {wt}")
            t.created_wt.append(wt)
            # worktree list 含 session/S1 分支
            listing = git("worktree", "list", "--porcelain", cwd=t.repo).stdout
            self.assertIn(f"branch refs/heads/session/S1", listing)
            self.assertIn("session/S1", git("branch", "--list", "session/S1", cwd=t.repo).stdout)
            # registry 记录 worktree 字段
            reg = make_registry(t.ct)
            s = reg.get("S1")
            self.assertIsNotNone(s, "registry 无 S1 记录")
            self.assertTrue(s.get("worktree_path"))
            self.assertEqual(s.get("worktree_branch"), "session/S1")
        finally:
            t.tearDown()

    def test_create_blocks_on_existing_branch(self):
        """用例 9 (边界): 分支已存在 → block，exit 1，不创建 worktree。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            git("branch", "session/S9", cwd=t.repo)
            res = run_manager(t.repo, t.ct, "create", "S9", "--base", "main")
            self.assertEqual(res.get("code"), 1, res)
            self.assertEqual(res.get("status"), "block", res)
            self.assertFalse(t.wt_path("S9").exists(), "block 后不应创建 worktree")
        finally:
            t.tearDown()


class TestIndexIsolation(unittest.TestCase):
    def test_dual_worktree_independent_index(self):
        """用例 2: A 在 wt-A add 文件 → B 在 wt-B 的 index 不可见（物理隔离）。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            ra = run_manager(t.repo, t.ct, "create", "A", "--base", "main")
            rb = run_manager(t.repo, t.ct, "create", "B", "--base", "main")
            self.assertEqual(ra.get("code"), 0, ra)
            self.assertEqual(rb.get("code"), 0, rb)
            wt_a, wt_b = t.wt_path("A"), t.wt_path("B")
            t.created_wt.extend([wt_a, wt_b])
            # A 写文件并 add（只入 A 的 index）
            (wt_a / "a-only.txt").write_text("from A\n", encoding="utf-8")
            git("add", "a-only.txt", cwd=wt_a)
            a_staged = git("status", "--porcelain", cwd=wt_a).stdout
            self.assertIn("a-only.txt", a_staged, "A 自己的 index 应含该文件")
            # B 的 index 不可见（共享 index 缺陷下这里会看到 A 的文件）
            b_staged = git("status", "--porcelain", cwd=wt_b).stdout
            self.assertEqual(b_staged.strip(), "", f"B 的 index 泄漏了 A 的暂存: {b_staged!r}")
            # 主 worktree 的 index 同样不可见
            m_staged = git("status", "--porcelain", cwd=t.repo).stdout
            self.assertEqual(m_staged.strip(), "", f"主 worktree index 泄漏: {m_staged!r}")
        finally:
            t.tearDown()

    def test_parallel_commits_do_not_interfere(self):
        """用例 3: A/B 各自 commit 互不干扰（无共享 index 拉锯）。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            for sid in ("A", "B"):
                self.assertEqual(run_manager(t.repo, t.ct, "create", sid, "--base", "main").get("code"), 0)
            wt_a, wt_b = t.wt_path("A"), t.wt_path("B")
            t.created_wt.extend([wt_a, wt_b])
            (wt_a / "a.txt").write_text("A commit\n", encoding="utf-8")
            git("add", "a.txt", cwd=wt_a)
            git("commit", "-m", "commit from A", cwd=wt_a)
            (wt_b / "b.txt").write_text("B commit\n", encoding="utf-8")
            git("add", "b.txt", cwd=wt_b)
            git("commit", "-m", "commit from B", cwd=wt_b)
            # 各自提交成功且互不可见
            self.assertIn("commit from A", git("log", "--oneline", cwd=wt_a).stdout)
            self.assertNotIn("commit from B", git("log", "--oneline", cwd=wt_a).stdout)
            self.assertIn("commit from B", git("log", "--oneline", cwd=wt_b).stdout)
            self.assertNotIn("commit from A", git("log", "--oneline", cwd=wt_b).stdout)
            # 合并前主分支不含任何一方（隔离 = 未合并前互不污染）
            self.assertNotIn("commit from A", git("log", "--oneline", cwd=t.repo).stdout)
            self.assertNotIn("commit from B", git("log", "--oneline", cwd=t.repo).stdout)
        finally:
            t.tearDown()


class TestFinish(unittest.TestCase):
    def test_finish_merges_and_cleans(self):
        """用例 4: finish 合并回主分支 + worktree 清理 + registry 清理。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            self.assertEqual(run_manager(t.repo, t.ct, "create", "S1", "--base", "main").get("code"), 0)
            wt = t.wt_path("S1")
            t.created_wt.append(wt)
            (wt / "work.txt").write_text("merged content\n", encoding="utf-8")
            git("add", "work.txt", cwd=wt)
            git("commit", "-m", "session S1 work", cwd=wt)
            res = run_manager(t.repo, t.ct, "finish", "S1")
            self.assertEqual(res.get("code"), 0, res)
            self.assertEqual(res.get("status"), "ok", res)
            # 主分支含 session 提交 + 文件内容真实合并
            self.assertIn("session S1 work", git("log", "--oneline", cwd=t.repo).stdout)
            self.assertEqual((t.repo / "work.txt").read_text(encoding="utf-8"), "merged content\n")
            # worktree 已清理 + 分支已删
            listing = git("worktree", "list", "--porcelain", cwd=t.repo).stdout
            self.assertNotIn("session/S1", listing, "finish 后 worktree 应清空")
            self.assertEqual(git("branch", "--list", "session/S1", cwd=t.repo).stdout.strip(), "")
            # registry 字段清空 + 阶段 DONE
            reg = make_registry(t.ct)
            s = reg.get("S1")
            self.assertIsNotNone(s)
            self.assertFalse(s.get("worktree_path"), "finish 后 worktree_path 应清空")
            self.assertFalse(s.get("worktree_branch"), "finish 后 worktree_branch 应清空")
            self.assertEqual(s.get("phase"), "DONE")
        finally:
            t.tearDown()

    def test_finish_blocks_on_dirty_main(self):
        """用例 7 (边界): 主 worktree 有未提交变更 → block，不合并不清理。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            self.assertEqual(run_manager(t.repo, t.ct, "create", "S1", "--base", "main").get("code"), 0)
            wt = t.wt_path("S1")
            t.created_wt.append(wt)
            (wt / "work.txt").write_text("x\n", encoding="utf-8")
            git("add", "work.txt", cwd=wt)
            git("commit", "-m", "session S1 work", cwd=wt)
            (t.repo / "dirty.txt").write_text("uncommitted\n", encoding="utf-8")
            res = run_manager(t.repo, t.ct, "finish", "S1")
            self.assertEqual(res.get("code"), 1, res)
            self.assertEqual(res.get("status"), "block", res)
            self.assertNotIn("session S1 work", git("log", "--oneline", cwd=t.repo).stdout, "block 后不应合并")
            self.assertIn("session/S1", git("worktree", "list", "--porcelain", cwd=t.repo).stdout, "block 后 worktree 应保留")
            self.assertIn("session/S1", git("branch", "--list", "session/S1", cwd=t.repo).stdout, "block 后分支应保留")
        finally:
            t.tearDown()

    def test_finish_blocks_on_dirty_session_worktree(self):
        """用例 8 (边界): session worktree 有未提交变更 → block，保留一切。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            self.assertEqual(run_manager(t.repo, t.ct, "create", "S1", "--base", "main").get("code"), 0)
            wt = t.wt_path("S1")
            t.created_wt.append(wt)
            (wt / "uncommitted.txt").write_text("not staged\n", encoding="utf-8")
            res = run_manager(t.repo, t.ct, "finish", "S1")
            self.assertEqual(res.get("code"), 1, res)
            self.assertEqual(res.get("status"), "block", res)
            self.assertIn("session/S1", git("worktree", "list", "--porcelain", cwd=t.repo).stdout)
            self.assertIn("session/S1", git("branch", "--list", "session/S1", cwd=t.repo).stdout)
            self.assertTrue((wt / "uncommitted.txt").exists(), "未提交文件必须原样保留")
        finally:
            t.tearDown()


class TestHooksShared(unittest.TestCase):
    def test_hooks_run_inside_worktree(self):
        """用例 5: hooks 共享 .git/hooks — worktree 内提交触发同一套 pre-commit。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            marker = t.repo / ".git" / "hook-marker"
            hook = t.repo / ".git" / "hooks" / "pre-commit"
            hook.write_text(
                f"#!/bin/sh\necho 'fired' >> '{marker.as_posix()}'\nexit 0\n",
                encoding="utf-8",
            )
            hook.chmod(0o755)
            self.assertEqual(run_manager(t.repo, t.ct, "create", "S1", "--base", "main").get("code"), 0)
            wt = t.wt_path("S1")
            t.created_wt.append(wt)
            (wt / "h.txt").write_text("h\n", encoding="utf-8")
            git("add", "h.txt", cwd=wt)
            git("commit", "-m", "commit inside worktree", cwd=wt)
            self.assertTrue(marker.exists(), "worktree 内提交应触发共享 .git/hooks/pre-commit")
            self.assertIn("fired", marker.read_text(encoding="utf-8", errors="replace"))
        finally:
            t.tearDown()


class TestRegistryWorktreeFields(unittest.TestCase):
    def test_worktree_cli_set_and_clear(self):
        """用例 6: session-registry worktree CLI 设置/清除字段。"""
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            reg = make_registry(t.ct)
            reg.register(session_id="S1", brief="b.md", pid=123)
            # 新记录默认带空字段（schema 稳定）
            self.assertFalse(reg.get("S1").get("worktree_path"))
            env = dict(os.environ)
            env["SYNO_CT_DIR"] = str(t.ct)
            subprocess.run(
                [sys.executable, str(REPO_ROOT / "scripts" / "control-tower" / "session_registry.py"),
                 "worktree", "--session-id", "S1", "--path", "D:/x/synova-wt-S1", "--branch", "session/S1"],
                check=True, capture_output=True, env=env,
            )
            s = reg.get("S1")
            self.assertEqual(s["worktree_path"], "D:/x/synova-wt-S1")
            self.assertEqual(s["worktree_branch"], "session/S1")
            subprocess.run(
                [sys.executable, str(REPO_ROOT / "scripts" / "control-tower" / "session_registry.py"),
                 "worktree", "--session-id", "S1", "--clear"],
                check=True, capture_output=True, env=env,
            )
            s = reg.get("S1")
            self.assertFalse(s.get("worktree_path"))
            self.assertFalse(s.get("worktree_branch"))
        finally:
            t.tearDown()


class TestAttachParallelDetection(unittest.TestCase):
    """attach.py 并行检测（D307 部分）— 纯函数直测，零 subprocess。"""

    def _load_attach(self):
        import attach as at
        return at

    def test_detect_parallel_with_active_session(self):
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            reg = make_registry(t.ct)
            reg.register(session_id="OTHER", brief="other.md", pid=1)
            reg.phase(session_id="OTHER", phase="CP2")
            at = self._load_attach()
            self.assertTrue(at._detect_parallel(reg, "SELF", force=False))
            self.assertTrue(at._detect_parallel(reg, "SELF", force=True))
        finally:
            t.tearDown()

    def test_detect_parallel_quiet_when_alone(self):
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            reg = make_registry(t.ct)
            at = self._load_attach()
            self.assertFalse(at._detect_parallel(reg, "SELF", force=False))
        finally:
            t.tearDown()

    def test_detect_parallel_ignores_done_sessions(self):
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            reg = make_registry(t.ct)
            reg.register(session_id="OLD", brief="old.md", pid=1)
            reg.phase(session_id="OLD", phase="DONE")
            at = self._load_attach()
            self.assertFalse(at._detect_parallel(reg, "SELF", force=False))
        finally:
            t.tearDown()

    def test_in_worktree_main_vs_linked(self):
        t = WorktreeManagerTestCase()
        t.setUp()
        try:
            self.assertEqual(run_manager(t.repo, t.ct, "create", "S1", "--base", "main").get("code"), 0)
            wt = t.wt_path("S1")
            t.created_wt.append(wt)
            at = self._load_attach()
            self.assertFalse(at._in_worktree(t.repo), "主 worktree 不应判定为链接 worktree")
            self.assertTrue(at._in_worktree(wt), "session worktree 应判定为链接 worktree")
        finally:
            t.tearDown()


if __name__ == "__main__":
    unittest.main(verbosity=2)
