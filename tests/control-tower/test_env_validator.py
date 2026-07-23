"""Tests for env-validator.py — D211 环境验证器 (L1 单元契约测试)

权威文档 #6 测试体系规范:
  L1 单元契约测试 — 4 组 fixture:
    1. normal:   snapshot() 生成有效 JSON → 包含 4 节 7+ 字段
    2. boundary: validate() 环境一致 → PASS + 退出码 0
    3. error:    validate() node 版本不匹配 → FAIL + 差异详情
    4. temporal: 工具不可用(如 npm 不存在) → 跳过单项 + degraded
"""

import json
import os
import sys
import tempfile
import unittest
from unittest.mock import patch, MagicMock

# ─── SUT: 导入 env_validator（从项目根或 scripts/control-tower/） ───

# 尝试从项目根 scripts/control-tower/ 导入
_SCRIPT_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "scripts", "control-tower",
)
if os.path.isdir(_SCRIPT_DIR):
    sys.path.insert(0, os.path.abspath(_SCRIPT_DIR))
from env_validator import EnvValidator, format_report, SNAPSHOT_VERSION


# ═══ 测试夹具 ═══

SNAPSHOT_FIXTURE = {
    "version": SNAPSHOT_VERSION,
    "created_at": "2026-07-22T12:00:00+00:00",
    "system": {"os": "Windows", "release": "10", "encoding": "utf-8"},
    "node": {"version": "v24.16.0", "npm_version": "11.13.0"},
    "python": {"version": "3.11.15", "executable": "python"},
    "git": {"version": "git version 2.54.0.windows.1"},
    "typescript": {"version": "Version 5.9.3"},
    "hooks": {"pre_commit": True, "post_commit": True},
}


# ═══ 测试类 ═══


class TestEnvValidatorSnapshot(unittest.TestCase):
    """L1 — snapshot() 生成有效 JSON，包含 4 节 7+ 字段"""

    def setUp(self):
        self.validator = EnvValidator()

    @patch("env_validator._run_cmd")
    @patch("env_validator.platform.system", return_value="Windows")
    @patch("env_validator.sys.getdefaultencoding", return_value="utf-8")
    def test_snapshot_contains_all_sections(
        self, mock_enc, mock_plat, mock_run,
    ):
        """normal: snapshot() 生成包含所有 6 节的 dict。"""
        mock_run.return_value = "v24.16.0"
        snap = self.validator.snapshot()

        self.assertIn("version", snap)
        self.assertEqual(snap["version"], SNAPSHOT_VERSION)
        self.assertIn("created_at", snap)
        self.assertIn("system", snap)
        self.assertIn("node", snap)
        self.assertIn("python", snap)
        self.assertIn("git", snap)
        self.assertIn("typescript", snap)
        self.assertIn("hooks", snap)

        # 验证各节有核心字段
        self.assertIn("os", snap["system"])
        self.assertIn("version", snap["node"])
        self.assertIn("version", snap["python"])
        self.assertIn("executable", snap["python"])
        self.assertIn("version", snap["git"])
        self.assertIn("version", snap["typescript"])
        self.assertIn("pre_commit", snap["hooks"])

    @patch("env_validator._run_cmd")
    def test_snapshot_handles_missing_tools(self, mock_run):
        """temporal: 工具不可用时 snapshot() 返回空字符串而非崩溃。"""
        mock_run.return_value = None  # 所有工具都不可用
        snap = self.validator.snapshot()

        self.assertEqual(snap["node"]["version"], "")
        self.assertEqual(snap["node"]["npm_version"], "")
        self.assertEqual(snap["git"]["version"], "")
        self.assertEqual(snap["typescript"]["version"], "")
        # system 和 python 使用内省，不依赖外部命令
        self.assertNotEqual(snap["system"]["os"], "")
        self.assertNotEqual(snap["python"]["version"], "")


class TestEnvValidatorValidate(unittest.TestCase):
    """L1 — validate() 环境一致/不一致/降级"""

    def setUp(self):
        self.validator = EnvValidator()

    def test_validate_pass(self):
        """boundary: 环境一致 → ok=True + 零差异。"""
        # 使用相同的快照（mock snapshot() 返回快照本身）
        with patch.object(self.validator, "snapshot") as mock_snap:
            mock_snap.return_value = dict(SNAPSHOT_FIXTURE)  # 一致
            report = self.validator.validate_against(SNAPSHOT_FIXTURE)

        self.assertTrue(report["ok"])
        self.assertEqual(report["total_checks"], 9)
        self.assertEqual(report["passed_checks"], 9)
        self.assertEqual(report["failed_checks"], 0)
        self.assertEqual(len(report["differences"]), 0)

    def test_validate_node_mismatch(self):
        """error: node 版本不匹配 → ok=False + 差异详情。"""
        bad_snapshot = dict(SNAPSHOT_FIXTURE)
        bad_snapshot["node"] = dict(SNAPSHOT_FIXTURE["node"])
        bad_snapshot["node"]["version"] = "v20.0.0"  # 与当前 v24 不匹配

        with patch.object(self.validator, "snapshot") as mock_snap:
            mock_snap.return_value = dict(SNAPSHOT_FIXTURE)  # 当前是 v24
            report = self.validator.validate_against(bad_snapshot)

        self.assertFalse(report["ok"])
        self.assertEqual(report["failed_checks"], 1)

        node_diffs = [d for d in report["differences"] if d["field"] == "node.version"]
        self.assertEqual(len(node_diffs), 1)
        self.assertEqual(node_diffs[0]["expected"], "v20.0.0")
        self.assertEqual(node_diffs[0]["actual"], "v24.16.0")

    def test_degraded_tool_missing(self):
        """temporal: 工具不可用时 degraded=True + 不阻断总结果。"""
        # 模拟当前环境 TypeScript 不可用
        current = dict(SNAPSHOT_FIXTURE)
        current["typescript"] = {"version": ""}  # 空 = 不可用

        with patch.object(self.validator, "snapshot") as mock_snap:
            mock_snap.return_value = current
            report = self.validator.validate_against(SNAPSHOT_FIXTURE)

        # 检查 TypeScript 差异是否标记为 degraded
        ts_diffs = [
            d for d in report["differences"] if d["field"] == "typescript.version"
        ]
        self.assertEqual(len(ts_diffs), 1)
        self.assertTrue(ts_diffs[0]["degraded"])
        # degraded 项不导致 check 失败
        self.assertGreater(report["degraded_skips"], 0)


class TestSnapshotIO(unittest.TestCase):
    """L2a — 快照读写 + 接线"""

    def test_write_and_read(self):
        """写入 → 读出后内容一致。"""
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "env-snapshot.json")
            EnvValidator.write_snapshot(SNAPSHOT_FIXTURE, path)
            self.assertTrue(os.path.isfile(path))

            loaded = EnvValidator.read_snapshot(path)
            self.assertIsNotNone(loaded)
            self.assertEqual(loaded["version"], SNAPSHOT_VERSION)
            self.assertEqual(loaded["node"]["version"], "v24.16.0")

    def test_read_missing_returns_none(self):
        """快照文件不存在 → None。"""
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "nonexistent.json")
            result = EnvValidator.read_snapshot(path)
            self.assertIsNone(result)

    def test_read_corrupted_returns_none(self):
        """快照文件 JSON 损坏 → None。"""
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "corrupted.json")
            with open(path, "w", encoding="utf-8") as f:
                f.write("{bad json}")
            result = EnvValidator.read_snapshot(path)
            self.assertIsNone(result)


class TestFormatReport(unittest.TestCase):
    """L1 — format_report 输出格式"""

    def test_format_ok_report(self):
        """一致的报告包含 ✅ 标记。"""
        report = {
            "ok": True,
            "total_checks": 9,
            "passed_checks": 9,
            "failed_checks": 0,
            "degraded_skips": 0,
            "differences": [],
        }
        output = format_report(report)
        self.assertIn("✅", output)
        self.assertIn("一致", output)

    def test_format_fail_report(self):
        """不一致的报告包含差异详情。"""
        report = {
            "ok": False,
            "total_checks": 9,
            "passed_checks": 8,
            "failed_checks": 1,
            "degraded_skips": 0,
            "differences": [
                {
                    "field": "node.version",
                    "expected": "v20.0.0",
                    "actual": "v24.16.0",
                    "severity": "error",
                    "degraded": False,
                },
            ],
        }
        output = format_report(report)
        self.assertIn("❌", output)
        self.assertIn("不一致", output)
        self.assertIn("node.version", output)
        self.assertIn("v20.0.0", output)
        self.assertIn("v24.16.0", output)

    def test_format_degraded_report(self):
        """降级跳过的报告包含 ⚠ 标记。"""
        report = {
            "ok": True,
            "total_checks": 9,
            "passed_checks": 8,
            "failed_checks": 0,
            "degraded_skips": 1,
            "differences": [
                {
                    "field": "typescript.version",
                    "expected": "5.9.3",
                    "actual": "",
                    "severity": "warning",
                    "degraded": True,
                },
            ],
        }
        output = format_report(report)
        self.assertIn("⚠", output)
        self.assertIn("降级跳过", output)
        self.assertIn("typescript.version", output)


# ═══ 入口 ═══

if __name__ == "__main__":
    unittest.main()
