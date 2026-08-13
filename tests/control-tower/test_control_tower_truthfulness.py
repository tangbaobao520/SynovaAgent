#!/usr/bin/env python3
"""Tests for D296 — 控制塔数据真实性与完成度引擎修复

任务文档 SYNOVA-IMPL-D296 §4 的 7 个测试:
  T1 正常     parse_brief_file_mapping 从 brief "文件审计" 找到真实源文件
  T2 降级     无 brief 映射 → 文件名匹配 + degraded 标记
  T3 边界     D8a-D8f 各自独立 d_id; 同名 D# 多 brief 去重 (D53/D57 不再 ×2)
  T4 契约     两引擎输出均通过 validate_completion_schema() 校验
  T5 降级     缺 gate-status.json → completion-engine 输出 degraded:true
  T6 边界     数据缺失/过期 (>24h) → 视图 degraded + 原因
  T7 边界     signals 全空 → 控制塔红灯 + 原因

风格: unittest (兼容 pytest)。每个测试有真实断言。
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


def load_module(name: str, path: Path):
    """按绝对路径加载 Python 模块 (与 test_views_45.py 同模式)"""
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


completion_schema = load_module(
    "completion_schema", PROJECT_ROOT / "scripts" / "audit" / "completion_schema.py")
self_diagnosis = load_module(
    "self_diagnosis", PROJECT_ROOT / "scripts" / "audit" / "self-diagnosis.py")
completion_engine = load_module(
    "completion_engine", PROJECT_ROOT / "scripts" / "audit" / "completion-engine.py")
# generate-dashboard 依赖 views/* — 把 scripts/control-tower 加入 sys.path 后加载
sys.path.insert(0, str(PROJECT_ROOT / "scripts" / "control-tower"))
generate_dashboard = load_module(
    "generate_dashboard", PROJECT_ROOT / "scripts" / "control-tower" / "generate-dashboard.py")
completion_view = load_module(
    "completion_view", PROJECT_ROOT / "scripts" / "control-tower" / "views" / "completion.py")


class T1BriefMapping(unittest.TestCase):
    """T1: 通道1 — 解析 brief "文件审计" 字段找到真实源文件"""

    BRIEF = (
        "## Q0: 定位\n"
        "### b) 文件审计\n"
        "- src/l4/department-memory-store.ts: 本任务新建\n"
        "- tests/l4/department-memory-store.test.ts: 本任务新建\n"
        "- 无 expert/ sentinel/ extensions 冲突\n"
        "### c) 决策\n"
        "新建 L4 文件 + 测试。\n"
    )

    def test_parse_brief_file_mapping_finds_source(self):
        mapping = self_diagnosis.parse_brief_file_mapping(self.BRIEF)
        self.assertIn("src/l4/department-memory-store.ts", mapping)
        # 测试文件不进入源文件映射
        self.assertNotIn("tests/l4/department-memory-store.test.ts", mapping)

    def test_find_source_file_uses_brief_mapping(self):
        src, degraded_reason = self_diagnosis.find_source_file("D284", self.BRIEF)
        self.assertEqual(src, "src/l4/department-memory-store.ts")
        self.assertEqual(degraded_reason, "")


class T2FilenameFallback(unittest.TestCase):
    """T2: 通道2降级 — 无 brief 映射时文件名匹配 + degraded 标记"""

    def test_filename_fallback_degraded(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "d296-control-tower-fix.py").write_text(
                "# fix file\n", encoding="utf-8")
            src, reason = self_diagnosis.find_source_file("D296", None, [root])
            self.assertIsNotNone(src)
            self.assertEqual(reason, "brief 无映射, 文件名匹配")
            self.assertTrue(src.endswith("d296-control-tower-fix.py"))

    def test_no_match_reports_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            src, reason = self_diagnosis.find_source_file("D9999", None, [Path(tmp)])
            self.assertIsNone(src)
            self.assertIn("未找到 D9999 对应源文件", reason)


class T3D8NotCollapsed(unittest.TestCase):
    """T3: 边界 — D8a-D8f 独立; 同名 D# 多 brief 去重只保留最新"""

    def test_d8a_d8b_distinct_and_dup_deduped(self):
        with tempfile.TemporaryDirectory() as tmp:
            briefs_dir = Path(tmp)
            files = {
                "2026-07-21-D8a-main-agent.md": "## Done 标准\n- ok\n",
                "2026-07-21-D8b-task-decomposer.md": "## Done 标准\n- ok\n",
                "2026-07-13-D57-tone-enforcer.md": "## Done 标准\n- old\n",
                "2026-07-14-D57-tone-fusion.md": "## Done 标准\n- new\n",
            }
            for name, content in files.items():
                p = briefs_dir / name
                p.write_text(content, encoding="utf-8")
                # 控制 mtime: D57 两个 brief 用 mtime 区分新旧
                mtime = 1752800000 if "07-14-D57" in name else 1752700000
                os.utime(p, (mtime, mtime))

            tasks = self_diagnosis.list_task_briefs(briefs_dir)
            by_id = {t["d_id"]: t for t in tasks if t["d_id"]}

            # D8a / D8b 各自独立 (B3: 不归并为 D8)
            self.assertIn("D8a", by_id)
            self.assertIn("D8b", by_id)
            self.assertNotIn("D8", by_id)
            self.assertEqual(by_id["D8a"]["filename"], "2026-07-21-D8a-main-agent.md")

            # D57 去重 — 只保留最新 (B5)
            self.assertEqual(len([t for t in tasks if t["d_id"] == "D57"]), 1)
            self.assertEqual(by_id["D57"]["filename"], "2026-07-14-D57-tone-fusion.md")


class T4UnifiedSchema(unittest.TestCase):
    """T4: 契约 — 两引擎输出均通过 validate_completion_schema()"""

    def _self_diagnosis_doc(self):
        brief = T1BriefMapping.BRIEF
        task = {
            "d_id": "D284",
            "filename": "2026-07-31-auto.md",
            "brief_text": brief,
            "done_standards": "- ok",
            "has_done": True,
        }
        result = self_diagnosis.evaluate_task(
            task, {"gates": [], "summary": {}}, depgraph=None,
            ref_index={"department-memory-store": 2})
        return self_diagnosis.aggregate_results(
            [result], generated_at="2026-08-01T00:00:00Z")

    def test_self_diagnosis_output_passes_validation(self):
        doc = self._self_diagnosis_doc()
        errors = completion_schema.validate_completion_schema(doc)
        self.assertEqual(errors, [])

    def test_completion_engine_output_passes_validation(self):
        engine = completion_engine.CompletionEngine(quiet=True)
        doc = engine.build_single_file_doc("src/server.ts")
        errors = completion_schema.validate_completion_schema(doc)
        self.assertEqual(errors, [])
        self.assertEqual(doc["generator"], "completion-engine.py")
        self.assertEqual(doc["totalTasks"], 1)

    def test_invalid_doc_reports_errors(self):
        errors = completion_schema.validate_completion_schema({"schemaVersion": 1})
        self.assertTrue(len(errors) >= 1)
        errors2 = completion_schema.validate_completion_schema(
            self._self_diagnosis_doc())
        self.assertEqual(errors2, [])


class T5MissingGateStatus(unittest.TestCase):
    """T5: 降级 — 缺 gate-status.json → completion-engine 输出 degraded:true"""

    def test_missing_gate_status_degraded(self):
        engine = completion_engine.CompletionEngine(quiet=True)
        doc = engine.build_gate_doc(None)
        self.assertTrue(doc["degraded"])
        self.assertIn("gate-status.json missing", doc["degradedReason"])
        self.assertEqual(doc["systemScore"], 0.0)
        # 降级输出仍是合法统一 schema (禁止正常格式假数据 ≠ 输出坏 JSON)
        errors = completion_schema.validate_completion_schema(doc)
        self.assertEqual(errors, [])


class T6FreshnessGate(unittest.TestCase):
    """T6: 边界 — 数据缺失/过期 (>24h) → 视图 degraded + 原因"""

    def _render_with_stale_data(self):
        return completion_view.render_completion({
            "completion": {},
            "freshness": {"status": "stale", "missing": [], "stale": ["gate-status"]},
        })

    def test_stale_data_renders_degraded(self):
        html = self._render_with_stale_data()
        self.assertIn("数据缺失或过期", html)
        self.assertNotIn("100.0%", html[:2000])  # 不渲染假数字

    def test_freshness_check_detects_stale_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            old = root / "old.json"
            fresh = root / "fresh.json"
            old.write_text("{}", encoding="utf-8")
            fresh.write_text("{}", encoding="utf-8")
            now = __import__("time").time()
            os.utime(old, (now - 3 * 86400, now - 3 * 86400))  # 3 天前
            os.utime(fresh, (now - 3600, now - 3600))          # 1 小时前

            result = generate_dashboard.freshness_check(
                {"completion": {}},
                sources={
                    "gate-status": old,
                    "completion": fresh,
                },
            )
            self.assertEqual(result["status"], "stale")
            self.assertIn("gate-status", result["stale"])


class T7EmptySignalsRed(unittest.TestCase):
    """T7: 边界 — signals 全空 → 控制塔红灯 + 原因"""

    def test_empty_signals_red(self):
        result = generate_dashboard.measurement_self_check({
            "completion": {},
            "signals": {},
        })
        self.assertEqual(result["status"], "red")
        self.assertTrue(any("信号" in r for r in result["reasons"]))

    def test_all_zero_scores_red(self):
        result = generate_dashboard.measurement_self_check({
            "completion": {
                "totalTasks": 63,
                "systemScore": 0.0,
                "completionByCriteria": {
                    k: {"pass": 0, "total": 63, "pct": 0.0}
                    for k in completion_schema.CRITERIA_KEYS
                },
            },
            "signals": {"write-lock": {"status": "green", "reason": "ok"}},
        })
        self.assertEqual(result["status"], "red")
        self.assertTrue(any("0 分" in r or "0%" in r for r in result["reasons"]))


if __name__ == "__main__":
    unittest.main()
