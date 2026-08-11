# -*- coding: utf-8 -*-
"""
tests/control-tower/staging-guard-session.test.py — D329 session 身份 + 认领制测试

覆盖（dev doc §4 表，铁律 48：正常/降级/边界/劫持/豁免）:
  1. 劫持窗口（registry 尚未登记）: session=D318 + D320 认领文件 → block（认领制独立防线）
  2. own_set 预登记绕过防护: D318 已把 D320 文件登记进自己写集 → 仍 block（认领制在 own_set 之前）
  3. 显式 session=D318 + D320 文件（registry 有 D320 写集）→ block（回归）
  4. 自己任务文件（session=D320 + D320 文件）→ pass（不误伤）
  5. 无真实认领（resolver 回退）→ 不误伤（pass/warn，不比较 D#）
  6. registry 缺失 → degraded pass + 记录（fail-open 不静默）
  7. session 专属 current-brief 优先于全局（resolver --session <sid>）
  8. commit-msg-check PYBIN 回退（无 python3 → python shim 生效，D328 P2 折入）
  9. 无 python → 显式 degraded 提示（不静默 skip）

隔离: 临时 git repo（mktemp + git init）— resolver 用 git rev-parse --show-toplevel
定位 ROOT（对齐 resolve-commit-brief.test.sh 模式）；brief 放临时 repo 的
.claude/task-briefs/（mtime 今日 → 认领候选）。
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

import staging_guard as sg  # noqa: E402
import session_registry as sr  # noqa: E402

RESOLVER = REPO_ROOT / "scripts" / "workflow" / "resolve-commit-brief.sh"
COMMIT_MSG_CHECK = REPO_ROOT / "scripts" / "commit-msg-check.sh"


# ── 临时仓库夹具 ──

def make_repo(tmp: Path) -> Path:
    repo = tmp / "repo"
    repo.mkdir(parents=True)
    subprocess.run(["git", "init", "-q", str(repo)], check=True, capture_output=True)
    subprocess.run(
        ["git", "-C", str(repo), "config", "user.email", "t@t"], check=True, capture_output=True
    )
    subprocess.run(
        ["git", "-C", str(repo), "config", "user.name", "t"], check=True, capture_output=True
    )
    (repo / ".claude" / "task-briefs").mkdir(parents=True)
    (repo / "src").mkdir()
    return repo


def write_brief(repo: Path, name: str, files: list) -> None:
    """写认领 brief（Q2 include = files，解析语义对齐 brief_parser）。"""
    lines = "\n".join(f"- {f}：修改" for f in files)
    (repo / ".claude" / "task-briefs" / name).write_text(
        "## Q0: 定位 — 测试\n\n"
        "## Q1: 调研 — 测试\n#CRITERIA: A\n\n"
        "## Q2: 范围 — 测试\n"
        "做什么：\n" + lines + "\n\n"
        "不做什么：\n- 不改 scripts/other.sh\n\n"
        "## Q3: 验收 — 测试\n\n"
        "## 架构层: 基础设施\n"
        "## Done 标准\n- [ ] 可验证\n",
        encoding="utf-8",
    )


def write_current_brief(repo: Path, name: str, content: str) -> None:
    (repo / ".claude" / name).write_text(content, encoding="utf-8")


def make_registry(tmp: Path, name: str = "session-registry.json") -> sr.SessionRegistry:
    return sr.SessionRegistry(
        registry_path=Path(tmp) / name,
        lock_dir=Path(tmp) / "locks",
        degraded_log=Path(tmp) / "degraded-events.log",
    )


def check_in(repo: Path, reg, session_id: str, staged: list) -> dict:
    """chdir 临时 repo 后调用 check_staging — resolver 用 cwd 的 git rev-parse 定位 ROOT。"""
    old = os.getcwd()
    try:
        os.chdir(repo)
        return sg.check_staging(reg, session_id=session_id, staged_files=staged)
    finally:
        os.chdir(old)


# ── 1. 劫持窗口（registry 无登记 — 缺陷 B 时序盲区）──

class TestHijackWindowClaimCheck(unittest.TestCase):
    def test_hijack_blocks_via_claim_even_without_registry_entry(self):
        """D318 session 提交 D320 认领文件，registry 尚无 D320 写集 → 认领制 block。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
            (repo / "src" / "x.ts").write_text("// x", encoding="utf-8")
            reg = make_registry(Path(tmp))
            reg._write({"version": 1, "updated_at": "", "sessions": [], "archived": []})
            result = check_in(repo, reg, "D318-dual-machine-hooks", ["src/x.ts"])
            self.assertEqual(result["status"], "block")
            ff = result["foreign_files"][0]
            self.assertEqual(ff["owner_session"], "D320-dashboard-gitify")
            self.assertIn("认领 brief D#", ff.get("reason", ""))


# ── 2. own_set 预登记绕过防护 ──

class TestOwnSetPreRegistrationBypass(unittest.TestCase):
    def test_own_set_preregistered_foreign_file_still_blocks(self):
        """synova-commit --files 把他人文件先登记进自己写集 → 认领制仍 block（判定在 own_set 之前）。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
            (repo / "src" / "x.ts").write_text("// x", encoding="utf-8")
            reg = make_registry(Path(tmp))
            # D318 已把 src/x.ts 登记进自己写集（--files 预登记 bug 路径）
            reg.register(session_id="D318-dual-machine-hooks", brief="D318-dual-machine-hooks.md", pid=99999)
            reg.write_set(session_id="D318-dual-machine-hooks", add=["src/x.ts"])
            result = check_in(repo, reg, "D318-dual-machine-hooks", ["src/x.ts"])
            self.assertEqual(result["status"], "block")
            self.assertEqual(result["foreign_files"][0]["owner_session"], "D320-dashboard-gitify")


# ── 3. 显式 session 的既有阻断（回归）──

class TestExplicitSessionRegression(unittest.TestCase):
    def test_explicit_session_foreign_registry_entry_blocks(self):
        """显式 --session-id D318 + D320 文件（registry 有 D320 写集）→ block（既有行为不变）。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
            (repo / "src" / "x.ts").write_text("// x", encoding="utf-8")
            reg = make_registry(Path(tmp))
            reg.register(session_id="D320-dashboard-gitify", brief="D320-dashboard-gitify.md", pid=99999)
            reg.write_set(session_id="D320-dashboard-gitify", add=["src/x.ts"])
            result = check_in(repo, reg, "D318-dual-machine-hooks", ["src/x.ts"])
            self.assertEqual(result["status"], "block")


# ── 4. 自己任务文件不误伤 ──

class TestOwnTaskFilesPass(unittest.TestCase):
    def test_own_task_files_pass(self):
        """session=D320 + D320 认领文件 → 认领制与写集均 pass（不误伤）。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
            (repo / "src" / "x.ts").write_text("// x", encoding="utf-8")
            reg = make_registry(Path(tmp))
            reg.register(session_id="D320-dashboard-gitify", brief="D320-dashboard-gitify.md", pid=99999)
            reg.write_set(session_id="D320-dashboard-gitify", add=["src/x.ts"])
            result = check_in(repo, reg, "D320-dashboard-gitify", ["src/x.ts"])
            self.assertEqual(result["status"], "pass")
            self.assertEqual(result["foreign_files"], [])

    def test_own_task_did_prefix_not_confused(self):
        """D3290 不能误配 D329（精确相等，禁 startswith）。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            write_brief(repo, "D3290-other-task.md", ["src/y.ts"])
            (repo / "src" / "y.ts").write_text("// y", encoding="utf-8")
            reg = make_registry(Path(tmp))
            result = check_in(repo, reg, "D329-session-identity-staging-guard", ["src/y.ts"])
            # D3290 ≠ D329 → 认领制 block（证明精确相等；若用 startswith 会误放行）
            self.assertEqual(result["status"], "block")
            self.assertEqual(result["foreign_files"][0]["owner_session"], "D3290-other-task")


# ── 5. 无真实认领 → 不误伤 ──

class TestNoGenuineClaimNoMisjudge(unittest.TestCase):
    def test_unclaimed_file_not_blocked(self):
        """暂存文件无任何 brief 真实认领（resolver 回退）→ 不比较 D#，不误伤。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
            (repo / "src" / "y.ts").write_text("// y", encoding="utf-8")
            reg = make_registry(Path(tmp))
            reg._write({"version": 1, "updated_at": "", "sessions": [], "archived": []})
            result = check_in(repo, reg, "D318-dual-machine-hooks", ["src/y.ts"])
            self.assertNotEqual(result["status"], "block")
            self.assertEqual(result["foreign_files"], [])


# ── 6. registry 缺失 → degraded pass ──

class TestRegistryMissingDegraded(unittest.TestCase):
    def test_missing_registry_pass_with_degraded_logged(self):
        """registry 缺失 → fail-open pass + degraded 必记录（不静默）。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
            (repo / "src" / "y.ts").write_text("// y", encoding="utf-8")
            reg = make_registry(Path(tmp), name="missing.json")
            result = check_in(repo, reg, "D318-dual-machine-hooks", ["src/y.ts"])
            self.assertEqual(result["status"], "pass")
            self.assertTrue(result.get("degraded"))
            log = Path(tmp) / "degraded-events.log"
            self.assertTrue(log.exists())
            self.assertIn("staging-guard", log.read_text(encoding="utf-8"))


# ── 7. resolver --session：session 专属 current-brief 优先 ──

class TestResolverSessionCurrentBrief(unittest.TestCase):
    def test_session_specific_current_brief_preferred(self):
        """--session <sid> 读 .claude/current-brief.<sid>，无则回退全局。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo = make_repo(Path(tmp))
            # 两个 brief 都认领 src/x.ts；全局指向 D320，session 专属指向 D318
            write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
            write_brief(repo, "D318-dual-machine-hooks.md", ["src/x.ts"])
            write_current_brief(repo, "current-brief", "D320-dashboard-gitify.md\n")
            write_current_brief(repo, "current-brief.SESS1", "D318-dual-machine-hooks.md\n")
            (repo / "src" / "x.ts").write_text("// x", encoding="utf-8")

            def run(*args: str) -> str:
                out = subprocess.run(
                    ["bash", str(RESOLVER), *args],
                    cwd=repo, capture_output=True, text=True,
                    encoding="utf-8", errors="replace",
                )
                return out.stdout.strip()

            # 无 --session → 全局 current-brief 认领（rule 1）
            no_session = run("src/x.ts")
            self.assertTrue(no_session.endswith("D320-dashboard-gitify.md"), no_session)
            # --session SESS1 → session 专属 current-brief 优先
            with_session = run("--session", "SESS1", "src/x.ts")
            self.assertTrue(with_session.endswith("D318-dual-machine-hooks.md"), with_session)
            # 专属文件不存在 → 回退全局
            fallback = run("--session", "NO-SUCH-SESSION", "src/x.ts")
            self.assertTrue(fallback.endswith("D320-dashboard-gitify.md"), fallback)


# ── 8/9. commit-msg-check.sh PYBIN 回退（D328 P2 折入）──

def _system_path_without_python(exclude: list = ("python3", "python", "py")) -> list:
    """系统 PATH 中剔除含 python 解释器可执行文件的目录（保留 git/coreutils）。"""
    keep = []
    for d in os.environ.get("PATH", "").split(os.pathsep):
        if not d:
            continue
        try:
            entries = {e.lower() for e in os.listdir(d)}
        except OSError:
            continue
        if any(any(e == x or e == x + ".exe" for x in exclude) for e in entries):
            continue
        keep.append(d)
    return keep


def _msys_path(p: str) -> str:
    """C:\\x\\y → /c/x/y（MSYS bash exec 用）。"""
    p = p.replace("\\", "/")
    if len(p) > 1 and p[1] == ":":
        p = "/" + p[0].lower() + p[2:]
    return p


class TestCommitMsgPybinFallback(unittest.TestCase):
    def _setup(self, tmp) -> tuple:
        repo = make_repo(Path(tmp))
        write_brief(repo, "D320-dashboard-gitify.md", ["src/x.ts"])
        (repo / "src" / "x.ts").write_text("// x", encoding="utf-8")
        subprocess.run(["git", "-C", str(repo), "add", "src/x.ts"], check=True, capture_output=True)
        msg = Path(tmp) / "COMMIT_EDITMSG"
        msg.write_text("feat(D320): test", encoding="utf-8")
        return repo, msg

    def _shim(self, tmp: Path, marker: Path) -> Path:
        bin_dir = tmp / "bin"
        bin_dir.mkdir()
        shim = bin_dir / "python"
        shim.write_text(
            "#!/bin/bash\n"
            "echo python-shim-called >> \"$SHIM_MARKER\"\n"
            f'exec "{_msys_path(sys.executable)}" "$@"\n',
            encoding="utf-8",
        )
        os.chmod(shim, 0o755)
        return bin_dir

    def test_python3_missing_falls_back_to_python_shim(self):
        """无 python3/py → PYBIN 回退 python（shim 生效），一致性检查仍执行（D328 P2）。

        行为断言：消息声明 D318 ≠ 文件认领 D320 → 修复后（GENUINE 真的算出）exit 1；
        修复前（裸 python3 静默 skip）→ exit 0。
        """
        with tempfile.TemporaryDirectory() as tmp:
            repo, msg = self._setup(Path(tmp))
            # 消息声明 D318，文件被 D320 brief 认领 → 一致性检查必须拦截
            msg.write_text("feat(D318): test", encoding="utf-8")
            marker = Path(tmp) / "shim-marker"
            bin_dir = self._shim(Path(tmp), marker)
            env = dict(os.environ)
            env["PATH"] = os.pathsep.join([str(bin_dir)] + _system_path_without_python())
            env["SHIM_MARKER"] = str(marker)
            out = subprocess.run(
                ["bash", str(COMMIT_MSG_CHECK), str(msg)],
                cwd=repo, env=env, capture_output=True, text=True,
                encoding="utf-8", errors="replace",
            )
            self.assertEqual(out.returncode, 1, out.stdout + out.stderr)
            self.assertIn("不一致", out.stdout + out.stderr)
            self.assertTrue(marker.exists(), "python shim 未被调用 — PYBIN 未回退")
            self.assertNotIn("python 不可用", out.stdout + out.stderr)

    def test_no_python_at_all_explicit_degraded_not_silent(self):
        """全无 python → 显式 degraded 提示（fail-open skip，不静默）。"""
        with tempfile.TemporaryDirectory() as tmp:
            repo, msg = self._setup(Path(tmp))
            env = dict(os.environ)
            env["PATH"] = os.pathsep.join(_system_path_without_python())
            out = subprocess.run(
                ["bash", str(COMMIT_MSG_CHECK), str(msg)],
                cwd=repo, env=env, capture_output=True, text=True,
                encoding="utf-8", errors="replace",
            )
            self.assertEqual(out.returncode, 0)
            self.assertIn("python 不可用", out.stdout + out.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
