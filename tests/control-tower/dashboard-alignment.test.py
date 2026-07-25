"""Tests for D220-PHASE4 — 仪表盘 Ch7 对齐 (L1 单元契约)

权威文档 #6 测试体系规范:
  5 tests:
    1. 6 张信号卡片含 env-validator 而非 dev-doc-gatekeeper
    2. 网守卡片点击展开 L1-L11（非组件信号）
    3. 活跃任务计数 = RDC 未全部完成的任务数
    4. 仪表盘自检行含 "控制塔仪表盘" + 信号计数
    5. Agent 可靠性趋势 Phase2 占位行
"""
import sys
import os
import json
import unittest
import importlib.util

# ─── SUT: 加载 generate-dashboard.py ───
_SCRIPT = os.path.join(
    os.path.dirname(__file__), "..", "..", "scripts", "control-tower", "generate-dashboard.py",
)
_spec = importlib.util.spec_from_file_location("dashboard", os.path.abspath(_SCRIPT))
_dash = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_dash)
collect_dashboard_data = _dash.collect_dashboard_data
render_html = _dash.render_html
count_active_tasks = _dash.count_active_tasks


class TestDashboardAlignment(unittest.TestCase):
    """L1 单元契约 — D220-PHASE4 7 项 Ch7 对齐"""

    @classmethod
    def setUpClass(cls):
        cls.data = collect_dashboard_data()
        cls.html = render_html(cls.data)

    # ════════════════════════════════════════════════════════════════
    # Test 1: 6 张信号卡片含 env-validator 而非 dev-doc-gatekeeper
    # ════════════════════════════════════════════════════════════════

    def test_component_list_has_env_validator(self):
        """env-validator 出现在组件循环中"""
        # grep 组件列表
        content = open(_SCRIPT, encoding="utf-8").read()
        # 检查 .py 源文件中的组件列表
        env_in_list = "env-validator" in content
        dev_doc_gone = "dev-doc-gatekeeper" not in content
        self.assertTrue(env_in_list, "env-validator should be in component list")
        self.assertTrue(dev_doc_gone, "dev-doc-gatekeeper should be removed from component list")

    def test_env_validator_in_rendered_html(self):
        """env-validator 出现在渲染 HTML 的卡片区"""
        self.assertIn("env-validator", self.html)

    # ════════════════════════════════════════════════════════════════
    # Test 2: 网守卡片点击展开 L1-L11（非组件信号）
    # ════════════════════════════════════════════════════════════════

    def test_gatekeeper_has_l1_to_l11(self):
        """网守 JS 展开包含 L1-L11"""
        self.assertIn("L1-as_any", self.html)
        self.assertIn("L2-empty-catch", self.html)
        self.assertIn("L3-engine-core", self.html)
        self.assertIn("L4-wiring", self.html)
        self.assertIn("L5-arch-boundary", self.html)
        self.assertIn("L6-task-brief", self.html)
        self.assertIn("L7-arch-compliance", self.html)
        self.assertIn("L8-file-driven", self.html)
        self.assertIn("L9-hardcode", self.html)
        self.assertIn("L10-health", self.html)
        self.assertIn("L11-dash", self.html)

    def test_gatekeeper_no_component_signals(self):
        """网守展开不再包含 signals 遍历"""
        # 检查 JS 部分没有 Object.keys(signals)
        content = open(_SCRIPT, encoding="utf-8").read()
        js_start = content.index("DOMContentLoaded")
        js_end = content.index("/* --- 自动刷新")
        js_code = content[js_start:js_end]
        # should NOT have the old component signal iteration
        self.assertNotIn("Object.keys(signals)", js_code)

    # ════════════════════════════════════════════════════════════════
    # Test 3: 活跃任务计数 = RDC 未全部完成的任务数
    # ════════════════════════════════════════════════════════════════

    def test_count_active_tasks(self):
        """count_active_tasks 返回未 committed 的 RDC 项数"""
        pipeline = [
            {"name": "D1", "committed": True},
            {"name": "D2", "committed": False},
            {"name": "D3", "committed": True},
            {"name": "D4", "committed": False},
        ]
        self.assertEqual(count_active_tasks(pipeline), 2)

    def test_active_tasks_in_render(self):
        """activeTasks 出现在渲染数据和 HTML 中"""
        self.assertIn("activeTasks", str(self.data))
        self.assertIn("活跃任务", self.html)

    # ════════════════════════════════════════════════════════════════
    # Test 4: 仪表盘自检行含 "控制塔仪表盘" + 信号计数
    # ════════════════════════════════════════════════════════════════

    def test_status_bar_has_control_tower_heading(self):
        """状态栏包含 '控制塔仪表盘'"""
        self.assertIn("控制塔仪表盘", self.html)

    def test_status_bar_has_signal_count(self):
        """状态栏包含信号计数 /6"""
        self.assertIn("/6", self.html)

    # ════════════════════════════════════════════════════════════════
    # Test 5: Agent 可靠性趋势 Phase2 占位行
    # ════════════════════════════════════════════════════════════════

    def test_reliability_section_exists(self):
        """底部包含 Agent 可靠性趋势 Phase2"""
        self.assertIn("Agent 可靠性趋势", self.html)
        self.assertIn("Phase 2", self.html)
        self.assertIn("数据积累中", self.html)


if __name__ == "__main__":
    unittest.main()
