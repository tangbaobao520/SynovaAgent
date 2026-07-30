"""
tests/control-tower/test_views_45.py — D271 View 4+5 L1/L2a 测试

L1: 1) workflow_graph.render_workflow() 返回非空
     2) agent_health.render_agent() 返回含 "●" 或专家名
L2a: 1) dependency-graph.json 存在→healthy
     2) gate-status.json 存在→正确聚合
"""
import json
import unittest
from pathlib import Path

import importlib.util

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
VIEWS_DIR = PROJECT_ROOT / "scripts" / "control-tower" / "views"


def load_view(name: str):
    path = VIEWS_DIR / f"{name}.py"
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestWorkflowGraph(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.wf = load_view("workflow_graph")

    def test_render_workflow_returns_string(self):
        """L1: render_workflow() 返回非空字符串"""
        html = self.wf.render_workflow()
        self.assertIsInstance(html, str)
        self.assertTrue(len(html) > 0)

    def test_get_status_unknown_when_no_file(self):
        """L1: 不存在 dependency-graph.json → status=unknown"""
        orig = self.wf.DEPGRAPH_PATH
        self.wf.DEPGRAPH_PATH = PROJECT_ROOT / ".codex" / "nonexistent.json"
        try:
            st = self.wf.get_status()
            self.assertEqual(st["status"], "unknown")
        finally:
            self.wf.DEPGRAPH_PATH = orig


class TestAgentHealth(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        cls.ah = load_view("agent_health")

    def test_render_agent_returns_html(self):
        """L1: render_agent() 返回含 table 或专家名的 HTML"""
        html = self.ah.render_agent()
        self.assertIsInstance(html, str)
        self.assertTrue(len(html) > 0)
        # 应包含至少一个专家名
        has_expert = any(name in html for name in ["战略专家", "组织专家", "财务专家"])
        self.assertTrue(has_expert, f"HTML 应包含专家名: {html[:200]}")

    def test_get_status_reads_gate_data(self):
        """L2a: gate-status.json 存在 → get_status() 返回非 unknown"""
        if not self.ah.GATE_STATUS_PATH.exists():
            self.skipTest("gate-status.json 不存在")
        st = self.ah.get_status()
        self.assertIn(st["status"], ("healthy", "degraded", "critical"))
        self.assertIn("gate5", st)
        self.assertIn("gate12", st)

    def test_render_agent_live_data(self):
        """L2a: gate-status.json 存在 → render_agent() 含专家名和 Gate 信息"""
        if not self.ah.GATE_STATUS_PATH.exists():
            self.skipTest("gate-status.json 不存在")
        html = self.ah.render_agent()
        # 应包含 Gate 5 或 Gate 12
        self.assertIn("Gate 5", html)
        self.assertIn("Gate 12", html)


if __name__ == "__main__":
    unittest.main()
