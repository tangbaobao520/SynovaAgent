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

    def test_physical_facts_dimensions_in_source(self):
        """右边栏六维物理核验维度出现在源（Option A, D431: 替代 6 组件自报）"""
        content = open(_SCRIPT, encoding="utf-8-sig").read()
        for dim in ("任务真相", "代码提交", "合并 main", "诚信账本", "北星对齐", "CI 状态"):
            self.assertIn(dim, content, f"{dim} 应出现在物理事实维度里")
        # 自报信号渲染循环已被物理事实替代（不再硬编码 env-validator 渲染）
        self.assertIn("read_physical_facts", content)

    def test_physical_facts_in_rendered_html(self):
        """六维物理事实出现在渲染 HTML 的卡片区 + 每个带"怎么算的"可复核数据源"""
        for dim in ("任务真相", "代码提交", "合并 main", "诚信账本", "北星对齐", "CI 状态"):
            self.assertIn(dim, self.html, f"{dim} 应出现在渲染 HTML")
        # 6 个卡片各带一个"怎么算的"
        self.assertEqual(self.html.count("怎么算的"), 6, "六维各带一个可复核数据源")

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
