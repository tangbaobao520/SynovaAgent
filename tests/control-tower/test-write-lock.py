#!/usr/bin/env python3
"""
test-write-lock.py — D209 写入锁测试

覆盖: acquire/release 正常 / 重复 acquire 拒绝 / timeout 自动释放 / 降级
约束: ≥4 测试, 每测试 ≥3 expect()
"""
import json
import os
import sys
import tempfile
import time
import unittest

# Add write-lock directory to path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCK_DIR = os.path.join(SCRIPT_DIR, "..", "..", "scripts", "control-tower")
sys.path.insert(0, LOCK_DIR)
from write_lock import WriteLock


class TestWriteLock(unittest.TestCase):
    """写入锁 4 项测试"""

    def setUp(self):
        self.test_dir = tempfile.mkdtemp(prefix="write_lock_test_")
        self.lock = WriteLock(lock_dir=os.path.join(self.test_dir, ".locks"), timeout_sec=1)

    def tearDown(self):
        import shutil
        shutil.rmtree(self.test_dir, ignore_errors=True)

    # ── Test 1: acquire + release 正常流程 ──

    def test_acquire_release(self):
        """acquire → 成功 → release → 释放"""
        file_path = "src/routes/test.ts"

        # acquire
        r1 = self.lock.acquire(file_path, owner="test-agent")
        self.assertTrue(r1.get("acquired"), "acquire 应返回 acquired=True")
        self.assertIn("lock_id", r1)
        self.assertTrue(r1["lock_id"], "lock_id 不应为空")

        # 确认锁定
        self.assertTrue(self.lock.is_locked(file_path), "文件应被锁定")

        # release
        r2 = self.lock.release(file_path)
        self.assertTrue(r2.get("released"), "release 应返回 released=True")

        # 确认释放
        self.assertFalse(self.lock.is_locked(file_path), "文件应已释放")

    # ── Test 2: 重复 acquire 拒绝 ──

    def test_double_acquire_rejected(self):
        """同一文件重复 acquire → 第二次失败"""
        file_path = "src/routes/conflict.ts"

        r1 = self.lock.acquire(file_path)
        self.assertTrue(r1.get("acquired"), "首次 acquire 应成功")

        r2 = self.lock.acquire(file_path)
        self.assertFalse(r2.get("acquired"), "重复 acquire 应拒绝")
        self.assertIn("reason", r2)

        # 释放
        self.lock.release(file_path)

    # ── Test 3: 超时自动释放 ──

    def test_timeout_release(self):
        """锁超时后自动释放 → 新 acquire 成功"""
        file_path = "src/routes/timeout.ts"

        self.lock.acquire(file_path)
        self.assertTrue(self.lock.is_locked(file_path), "acquire 后应锁定")

        # 等待超时 (timeout_sec=1)
        time.sleep(1.5)

        # 超时后 is_locked 应返回 False
        self.assertFalse(self.lock.is_locked(file_path), "超时后应自动释放")

        # 超时后新 acquire 应成功
        r2 = self.lock.acquire(file_path)
        self.assertTrue(r2.get("acquired"), "超时后 acquire 应成功")

        self.lock.release(file_path)

    # ── Test 4: 降级 — 锁目录不可用 → 允许写入 ──

    def test_degrade_readonly_lockdir(self):
        """锁目录不可写入 → 降级允许写入"""
        import platform
        if platform.system() == "Windows":
            self.skipTest("Windows 权限模型不支持此测试")
        file_path = "src/routes/degrade.ts"
        readonly_dir = os.path.join(self.test_dir, "readonly_locks")
        os.makedirs(readonly_dir, exist_ok=True)
        os.chmod(readonly_dir, 0o444)
        degrade_lock = WriteLock(lock_dir=readonly_dir, timeout_sec=300)
        try:
            r = degrade_lock.acquire(file_path)
            self.assertTrue(r.get("acquired"), "降级模式应允许写入")
            self.assertTrue(r.get("degraded"), "应标记 degraded=True")
        finally:
            os.chmod(readonly_dir, 0o755)


if __name__ == "__main__":
    unittest.main()
