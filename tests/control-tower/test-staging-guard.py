# -*- coding: utf-8 -*-
"""
tests/control-tower/test-staging-guard.py — D311 staging-guard 单元测试

覆盖（铁律 48：正常/降级/边界）:
  1. 他人文件入暂存区 → block + owner 归属
  2. 全部自己写集文件 → pass
  3. 无归属杂散文件 → warn（不阻断）
  4. 他人文件但已 committed → pass（忽略 committed）
  5. registry 缺失 → pass + degraded（fail-open）
"""
import json
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

import staging_guard as sg  # noqa: E402
import session_registry as sr  # noqa: E402


def setup_registry(tmpdir: str, sessions: dict) -> sr.SessionRegistry:
    """sessions: {session_id: [files]} — 预置注册表。"""
    reg = sr.SessionRegistry(
        registry_path=Path(tmpdir) / "session-registry.json",
        lock_dir=Path(tmpdir) / "locks",
        degraded_log=Path(tmpdir) / "degraded-events.log",
    )
    for sid, files in sessions.items():
        reg.register(session_id=sid, brief=f"{sid}.md", pid=99999)
        reg.write_set(session_id=sid, add=files)
    return reg


class TestForeignFileBlock(unittest.TestCase):
    def test_foreign_file_blocks_with_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = setup_registry(tmp, {"S-X": ["src/x.ts"]})
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/x.ts"]
            )
            self.assertEqual(result["status"], "block")
            self.assertEqual(result["foreign_files"][0]["file"], "src/x.ts")
            self.assertEqual(result["foreign_files"][0]["owner_session"], "S-X")
            self.assertIn("brief", result["foreign_files"][0])

    def test_multiple_foreign_files_all_reported(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = setup_registry(tmp, {"S-X": ["src/x.ts", "src/y.ts"]})
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/x.ts", "src/y.ts"]
            )
            self.assertEqual(result["status"], "block")
            self.assertEqual(len(result["foreign_files"]), 2)


class TestOwnFilesPass(unittest.TestCase):
    def test_own_files_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = setup_registry(tmp, {"S-Y": ["src/a.ts"]})
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/a.ts"]
            )
            self.assertEqual(result["status"], "pass")
            self.assertEqual(result["foreign_files"], [])

    def test_mixed_own_and_foreign_blocks(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = setup_registry(tmp, {"S-Y": ["src/a.ts"], "S-X": ["src/b.ts"]})
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/a.ts", "src/b.ts"]
            )
            self.assertEqual(result["status"], "block")
            self.assertEqual(result["foreign_files"][0]["file"], "src/b.ts")


class TestStrayFilesWarn(unittest.TestCase):
    def test_unclaimed_file_warns_but_passes(self):
        with tempfile.TemporaryDirectory() as tmp:
            # 空注册表 = 文件存在但无任何 session（区别于 registry 缺失）
            reg = sr.SessionRegistry(
                registry_path=Path(tmp) / "session-registry.json",
                lock_dir=Path(tmp) / "locks",
                degraded_log=Path(tmp) / "degraded-events.log",
            )
            reg._write({"version": 1, "updated_at": "", "sessions": [], "archived": []})
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/orphan.ts"]
            )
            self.assertEqual(result["status"], "warn")
            self.assertIn("src/orphan.ts", result["stray_files"])

    def test_unclaimed_mixed_with_own_is_pass(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = setup_registry(tmp, {"S-Y": ["src/a.ts"]})
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/a.ts", "src/orphan.ts"]
            )
            self.assertEqual(result["status"], "warn")  # 杂散仍提示
            self.assertIn("src/orphan.ts", result["stray_files"])


class TestCommittedIgnored(unittest.TestCase):
    def test_committed_foreign_file_not_blocking(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = setup_registry(tmp, {"S-X": ["src/x.ts"]})
            reg.write_set(session_id="S-X", status=[("src/x.ts", "committed")])
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/x.ts"]
            )
            self.assertEqual(result["status"], "pass")


class TestFailOpen(unittest.TestCase):
    def test_missing_registry_pass_with_degraded(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = sr.SessionRegistry(
                registry_path=Path(tmp) / "missing.json",
                lock_dir=Path(tmp) / "locks",
                degraded_log=Path(tmp) / "degraded-events.log",
            )
            result = sg.check_staging(
                reg, session_id="S-Y", staged_files=["src/a.ts"]
            )
            self.assertEqual(result["status"], "pass")
            self.assertTrue(result.get("degraded"))
            log = Path(tmp) / "degraded-events.log"
            self.assertTrue(log.exists())
            self.assertIn("staging-guard", log.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
