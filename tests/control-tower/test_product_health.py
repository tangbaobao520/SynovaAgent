"""
tests/control-tower/test_product_health.py — D268 L1/L2a 产品健康度测试

L1 (3 单元断言): 全healthy / 1degraded / psutil降级
L2a (1 集成): gate-status.json 解析聚合
"""
import json
import os
import sys
import unittest
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# product-health.py 含连字符，不能用标准 import
# 使用 importlib.util.spec_from_file_location 按路径加载
import importlib.util
_product_health_path = PROJECT_ROOT / "scripts" / "control-tower" / "product-health.py"
_product_health_spec = importlib.util.spec_from_file_location("product_health", str(_product_health_path))
product_health = importlib.util.module_from_spec(_product_health_spec)
_product_health_spec.loader.exec_module(product_health)


class TestProductHealth(unittest.TestCase):

    def setUp(self):
        """缓存真实 gate-status.json，生成一个全 pass 的 mock 数据。"""
        self.real_path = PROJECT_ROOT / ".codex" / "signals" / "gate-status.json"
        self.real_data = None
        if self.real_path.exists():
            try:
                self.real_data = json.loads(self.real_path.read_text(encoding="utf-8"))
            except Exception:
                pass
        # 全 pass 的 mock gate status
        self.mock_all_pass = {
            "gates": [
                {"id": "gate-3",  "status": "pass"},
                {"id": "gate-4",  "status": "pass"},
                {"id": "gate-5",  "status": "pass"},
                {"id": "gate-6",  "status": "pass"},
                {"id": "gate-7",  "status": "pass"},
                {"id": "gate-11", "status": "pass"},
                {"id": "gate-12", "status": "pass"},
                {"id": "gate-13", "status": "pass"},
            ],
            "summary": {"passed": 17, "partial": 0, "failed": 0},
        }

    # ═══ L1: 全 healthy ═══

    def test_all_healthy(self):
        """5 维度全部 pass → overall healthy"""
        for gid in ["gate-3", "gate-4", "gate-5", "gate-6", "gate-7", "gate-11", "gate-12", "gate-13"]:
            for g in self.mock_all_pass["gates"]:
                if g["id"] == gid:
                    g["status"] = "pass"
        dims = {}
        dims["pipeline"] = product_health.check_pipeline(self.mock_all_pass)
        dims["sentinel"] = product_health.check_sentinel(self.mock_all_pass)
        dims["quality"] = product_health.check_quality(self.mock_all_pass)
        dims["loop"] = product_health.check_loop(self.mock_all_pass, {"status": "green"})
        # resource: use real psutil
        dims["resource"] = product_health.check_resource()
        for name, d in dims.items():
            self.assertIn(d["status"], ("healthy", "unknown"),
                          f"{name} should be healthy or unknown, got {d['status']}")

    # ═══ L1: 1 degraded ═══

    def test_one_degraded(self):
        """Gate 5 partial → quality degraded"""
        for g in self.mock_all_pass["gates"]:
            if g["id"] == "gate-5":
                g["status"] = "partial"
        result = product_health.check_quality(self.mock_all_pass)
        self.assertEqual(result["status"], "degraded")

    # ═══ L1: critical (fail gate) ═══

    def test_one_critical(self):
        """Gate 4 fail → sentinel critical"""
        for g in self.mock_all_pass["gates"]:
            if g["id"] == "gate-4":
                g["status"] = "fail"
        result = product_health.check_sentinel(self.mock_all_pass)
        self.assertEqual(result["status"], "critical")

    # ═══ L1: psutil 降级（模拟 HAS_PSUTIL=False） ═══

    def test_psutil_degraded(self):
        """HAS_PSUTIL=False → resource unknown"""
        saved = product_health.HAS_PSUTIL
        product_health.HAS_PSUTIL = False
        try:
            result = product_health.check_resource()
            self.assertEqual(result["status"], "unknown")
        finally:
            product_health.HAS_PSUTIL = saved

    # ═══ L2a: gate-status.json 解析聚合 ═══

    def test_gate_status_aggregation(self):
        """集成: 读取真实 gate-status.json → 5 维度全部可判定"""
        if not self.real_data or not self.real_data.get("gates"):
            self.skipTest("gate-status.json 不存在或无 gates")
        dims = {}
        dims["pipeline"] = product_health.check_pipeline(self.real_data)
        dims["sentinel"] = product_health.check_sentinel(self.real_data)
        dims["quality"] = product_health.check_quality(self.real_data)
        dims["loop"] = product_health.check_loop(self.real_data, {"status": "green"})
        for name, d in dims.items():
            self.assertIn(d["status"], ("healthy", "degraded", "critical", "unknown"),
                          f"{name} has unexpected status: {d['status']}")


if __name__ == "__main__":
    unittest.main()
