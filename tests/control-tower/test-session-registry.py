# -*- coding: utf-8 -*-
"""
tests/control-tower/test-session-registry.py — D311 session-registry 单元测试

覆盖（铁律 48：正常/降级/边界）:
  1. 注册 + 阶段流转（CP1→CP2→CP3→CP4）
  2. 写集状态流转（dirty→staged→committed，committed 不再出现在 claimants）
  3. fail-open：registry 损坏 → 空结果 + degraded 记录 + 不抛异常
  4. GC：超龄 session 移入 archived，不再活跃
  5. 双进程并发写 → registry 不损坏（write_lock 复用验证）

测试隔离: 每个测试用临时目录 + monkeypatch registry 路径。
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "scripts" / "control-tower"))

import session_registry as sr  # noqa: E402


def make_registry(tmpdir: str) -> sr.SessionRegistry:
    """构造指向临时目录的 SessionRegistry 实例。"""
    return sr.SessionRegistry(
        registry_path=Path(tmpdir) / "session-registry.json",
        lock_dir=Path(tmpdir) / "locks",
        degraded_log=Path(tmpdir) / "degraded-events.log",
    )


class TestRegisterAndPhaseFlow(unittest.TestCase):
    def test_register_creates_entry_with_all_fields(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(
                session_id="2026-08-02-D311-test",
                brief=".claude/task-briefs/D311-test.md",
                pid=12345,
            )
            sessions = reg.list(active_only=True)
            self.assertEqual(len(sessions), 1)
            s = sessions[0]
            self.assertEqual(s["session_id"], "2026-08-02-D311-test")
            self.assertEqual(s["brief"], ".claude/task-briefs/D311-test.md")
            self.assertEqual(s["pid"], 12345)
            self.assertEqual(s["phase"], "CP1")  # 初始阶段
            self.assertIn("started_at", s)
            self.assertIn("last_seen_at", s)

    def test_phase_transition_keeps_monotonic_timestamps(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            reg.phase(session_id="S1", phase="CP2")
            reg.phase(session_id="S1", phase="CP3")
            s = reg.get("S1")
            self.assertEqual(s["phase"], "CP3")
            self.assertIn("phase_entered_at", s)
            # CP2 进入时间应早于等于 CP3 进入时间（字符串 ISO 比较同一天内成立）
            self.assertLessEqual(s["phase_entered_at"], s["last_seen_at"])

    def test_illegal_phase_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            with self.assertRaises(ValueError):
                reg.phase(session_id="S1", phase="NOT-A-PHASE")

    def test_register_refreshes_last_seen(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            first = reg.get("S1")["last_seen_at"]
            reg.register(session_id="S1", brief="b1.md", pid=1)
            second = reg.get("S1")["last_seen_at"]
            self.assertGreaterEqual(second, first)


class TestWriteSetStatusTransition(unittest.TestCase):
    def test_dirty_to_committed_transition(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            reg.write_set(session_id="S1", add=["src/a.ts", "scripts/b.sh"])
            s = reg.get("S1")
            self.assertEqual(len(s["write_set"]), 2)
            statuses = {w["file"]: w["status"] for w in s["write_set"]}
            self.assertEqual(statuses["src/a.ts"], "dirty")
            self.assertEqual(statuses["scripts/b.sh"], "dirty")
            # staged
            reg.write_set(session_id="S1", status=[("src/a.ts", "staged")])
            statuses = {w["file"]: w["status"] for w in reg.get("S1")["write_set"]}
            self.assertEqual(statuses["src/a.ts"], "staged")
            # committed
            reg.write_set(session_id="S1", status=[("src/a.ts", "committed")])
            statuses = {w["file"]: w["status"] for w in reg.get("S1")["write_set"]}
            self.assertEqual(statuses["src/a.ts"], "committed")

    def test_committed_not_in_claimants(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            reg.write_set(session_id="S1", add=["src/x.ts"])
            claimants = reg.claimants("src/x.ts", active_only=True)
            self.assertIn("S1", claimants)
            # 标记 committed 后不再认领
            reg.write_set(session_id="S1", status=[("src/x.ts", "committed")])
            claimants = reg.claimants("src/x.ts", active_only=True)
            self.assertNotIn("S1", claimants)

    def test_claimants_ignores_archived(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            reg.write_set(session_id="S1", add=["src/y.ts"])
            reg.archive("S1")
            claimants = reg.claimants("src/y.ts", active_only=True)
            self.assertEqual(claimants, [])

    def test_attribution_maps_file_to_owner(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="S1", brief="b1.md", pid=1)
            reg.write_set(session_id="S1", add=["src/z.ts"])
            attr = reg.attribution(["src/z.ts", "src/none.ts"])
            by_file = {a["file"]: a["owner"] for a in attr}
            self.assertEqual(by_file["src/z.ts"], "S1")
            self.assertIsNone(by_file["src/none.ts"])


class TestFailOpenCorruptRegistry(unittest.TestCase):
    def test_corrupt_registry_returns_empty_and_logs_degraded(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg_path = reg.registry_path
            reg_path.write_text("{ this is not valid json !!!", encoding="utf-8")
            sessions = reg.list(active_only=True)
            self.assertEqual(sessions, [])  # fail-open 空结果
            # degraded 事件已记录
            log = Path(tmp) / "degraded-events.log"
            self.assertTrue(log.exists())
            content = log.read_text(encoding="utf-8")
            self.assertIn("session-registry", content)
            self.assertIn("corrupt", content)
            # 损坏即自愈: registry 被重建为合法 JSON
            repaired = json.loads(reg_path.read_text(encoding="utf-8"))
            self.assertEqual(repaired["version"], 1)

    def test_missing_registry_returns_empty(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            self.assertEqual(reg.list(active_only=True), [])
            self.assertEqual(reg.claimants("src/x.ts", active_only=True), [])


class TestGcStaleSession(unittest.TestCase):
    def test_gc_moves_stale_session_to_archived(self):
        with tempfile.TemporaryDirectory() as tmp:
            reg = make_registry(tmp)
            reg.register(session_id="STALE", brief="stale.md", pid=999999)  # 不存在的 pid
            reg.register(session_id="FRESH", brief="fresh.md", pid=os.getpid())
            # 人为把 STALE 的 last_seen 推到过去
            reg._set_last_seen("STALE", "2020-01-01T00:00:00+08:00")
            archived = reg.gc(max_age_sec=3600, stale_pid=True)
            self.assertIn("STALE", archived)
            active = reg.list(active_only=True)
            active_ids = [s["session_id"] for s in active]
            self.assertNotIn("STALE", active_ids)
            self.assertIn("FRESH", active_ids)
            # archived 保留审计（不硬删）
            archived_list = reg._read()["archived"]
            self.assertTrue(any(a["session_id"] == "STALE" for a in archived_list))


class TestConcurrentWrites(unittest.TestCase):
    def test_parallel_writes_do_not_corrupt_registry(self):
        # 用 threading 模拟并发写（Windows multiprocessing spawn 不能 pickle
        # 嵌套函数；文件锁对线程同样生效，并发语义等价）
        import threading

        with tempfile.TemporaryDirectory() as tmp:
            reg_path = Path(tmp) / "session-registry.json"
            lock_dir = Path(tmp) / "locks"
            degraded_log = Path(tmp) / "degraded-events.log"
            errors = []

            def worker(idx):
                try:
                    r = sr.SessionRegistry(
                        registry_path=reg_path,
                        lock_dir=lock_dir,
                        degraded_log=degraded_log,
                    )
                    r.register(session_id=f"S{idx}", brief=f"b{idx}.md", pid=os.getpid())
                except Exception as exc:  # pragma: no cover
                    errors.append(exc)

            threads = [threading.Thread(target=worker, args=(i,)) for i in range(4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=30)
            self.assertEqual(errors, [])
            # registry 仍是合法 JSON 且含 4 个 session
            data = json.loads(reg_path.read_text(encoding="utf-8"))
            self.assertEqual(len(data["sessions"]), 4)


if __name__ == "__main__":
    unittest.main(verbosity=2)
