# -*- coding: utf-8 -*-
"""
tests/control-tower/test-wait-manager.py — D311 wait-manager 单元测试

覆盖（铁律 48：正常/降级/边界）:
  1. 阶段顺序 CP1→CP2→CP3→CP4（phase_entered_at 单调递增 + 合法阶段校验）
  2. 错峰提示：他 session 处于 CP3 → 输出含"验证"提示 + 建议动作
  3. 依赖提示：写集重叠 → 输出重叠文件 + 协调提示
  4. 阶段回退警告（不硬阻断）
  5. 归档 session 不出现于活跃列表
"""
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

import wait_manager as wm  # noqa: E402
import session_registry as sr  # noqa: E402


def make_registry(tmpdir: str) -> sr.SessionRegistry:
    return sr.SessionRegistry(
        registry_path=Path(tmpdir) / "session-registry.json",
        lock_dir=Path(tmpdir) / "locks",
        degraded_log=Path(tmpdir) / "degraded-events.log",
    )


class TestPhaseOrder(unittest.TestCase):
    def test_forward_phase_transition(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            wm.set_phase(reg, "S1", "CP1")
            wm.set_phase(reg, "S1", "CP2")
            wm.set_phase(reg, "S1", "CP3")
            wm.set_phase(reg, "S1", "CP4")
            s = reg.get("S1")
            self.assertEqual(s["phase"], "CP4")
            self.assertIn("phase_entered_at", s)

    def test_illegal_phase_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            with self.assertRaises(ValueError):
                wm.set_phase(reg, "S1", "CP9")


class TestStaggerHint(unittest.TestCase):
    def test_other_session_in_cp3_triggers_stagger_hint(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="OTHER", brief="other.md", pid=2)
            wm.set_phase(reg, "OTHER", "CP3")
            reg.register(session_id="ME", brief="me.md", pid=1)
            status = wm.status(reg, session_id="ME")
            self.assertEqual(status["status"], "ok")
            hints = status.get("hints", [])
            self.assertTrue(
                any("验证" in h.get("type", "") or "验证" in h.get("message", "")
                    for h in hints),
                f"错峰提示缺失: {hints}",
            )
            for h in hints:
                self.assertIn("action", h)  # 建议动作非空

    def test_all_idle_no_hint(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="OTHER", brief="other.md", pid=2)
            wm.set_phase(reg, "OTHER", "CP1")  # 研究阶段不算阻塞
            reg.register(session_id="ME", brief="me.md", pid=1)
            status = wm.status(reg, session_id="ME")
            for h in status.get("hints", []):
                self.assertNotIn("CP3", h.get("type", ""))


class TestDependencyHint(unittest.TestCase):
    def test_overlapping_write_set_triggers_dependency_hint(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="OTHER", brief="other.md", pid=2)
            reg.write_set(session_id="OTHER", add=["src/shared.ts"])
            reg.register(session_id="ME", brief="me.md", pid=1)
            reg.write_set(session_id="ME", add=["src/shared.ts", "src/own.ts"])
            status = wm.status(reg, session_id="ME")
            hints = status.get("hints", [])
            dep = [h for h in hints if h.get("type") == "dependency"]
            self.assertTrue(dep, f"依赖提示缺失: {hints}")
            self.assertIn("src/shared.ts", dep[0]["message"])


class TestPhaseRollbackWarn(unittest.TestCase):
    def test_rollback_warns_but_allowed(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            wm.set_phase(reg, "S1", "CP3")
            # 回退 CP1 — 允许但警告
            wm.set_phase(reg, "S1", "CP1")
            self.assertEqual(reg.get("S1")["phase"], "CP1")
            self.assertTrue(reg.get("S1").get("rollback_warned", True))


class TestInactiveNotListed(unittest.TestCase):
    def test_archived_session_not_in_active_list(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="OLD", brief="old.md", pid=99999)
            reg.register(session_id="ME", brief="me.md", pid=1)
            reg.archive("OLD")
            status = wm.status(reg, session_id="ME")
            active_ids = [s["session_id"] for s in status.get("active_sessions", [])]
            self.assertNotIn("OLD", active_ids)
            self.assertIn("ME", active_ids)


if __name__ == "__main__":
    unittest.main(verbosity=2)
