"""Tests for D371 — 产品完成度仪表盘 scripts/product-lines/（正常/降级/边界 三路径）

依据: SYNOVA-DESIGN-产品完成度仪表盘-v1.4 §三（状态机/诚实规则）+ §五（三脚本契约）+ §5.3（A1-A8）
      铁律 47/48: 契约优先 + 测试非空壳（每用例有 expect 断言——本文件为 unittest 断言）。
      铁律 12: 集成用例 cover 真实数据源（真实 yaml/台账/看板），不 mock 管线。

覆盖矩阵:
  1. YAML 子集解析器: 正常（product-lines.yaml 26 线 + node-yaml 交叉验证）/ 边界（非法语法逐类报错）
  2. calc-progress.py: 六态状态机（k3 pass/fail、场景 pass/fail、TTL 过期、创始人核验、
     yaml 自报 verified 无证据降级）/ A1 git 失效（注入假 git）/ 100% 门槛（k3_gate）/
     降级（坏证据文件、缺 override、坏 yaml fail-closed）
  3. aggregate-todos.py: 真实 5 源（台账区间 D355-D360 展开、C线标准映射、看板未完成项）/
     幂等（两次运行内容一致）/ MANUAL 区保留 / 映射缺失 fail-closed
  4. gen-progress-page.py: 真实链路生成 + 术语零泄漏（无 D#/P0/P1/K3）/
     输入缺失 fail-closed / manual 覆盖生效
  5. evidence-writer.py (A2): 正常写入 / founder_demo 缺演示记录拒绝 / 非法日期拒绝
  6. parse-k3-report.py (A6): JSON 双轨解析 / 无 JSON 显式降级 exit 2 / 损坏 fail-closed
  7. gen-k3-task.py (A7): 线 100% 生成任务书 / 无候选正常空跑
  8. refresh-all.sh: 真实链路端到端（exit 0 + 三产物存在）

运行: python3 tests/control-tower/product-lines.test.py
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PL_DIR = REPO_ROOT / "scripts" / "product-lines"
DOC_DIR = REPO_ROOT / "docs" / "synova" / "product-lines"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pl_yaml = _load("productline_yaml", PL_DIR / "productline_yaml.py")

# 先注册共享解析器模块，再加载 SUT——让 SUT 内的 `import productline_yaml`
# 命中同一模块实例（否则 YamlSubsetError 类身份不一致，assertRaises 失效）
sys.modules.setdefault("productline_yaml", pl_yaml)

calc = _load("calc_progress", PL_DIR / "calc-progress.py")
aggregate = _load("aggregate_todos", PL_DIR / "aggregate-todos.py")
genpage = _load("gen_progress_page", PL_DIR / "gen-progress-page.py")
evw = _load("evidence_writer", PL_DIR / "evidence-writer.py")
k3parse = _load("parse_k3_report", PL_DIR / "parse-k3-report.py")
k3task = _load("gen_k3_task", PL_DIR / "gen-k3-task.py")

YamlSubsetError = pl_yaml.YamlSubsetError


def write(tmp, name: str, content: str) -> Path:
    p = Path(tmp) / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return p


MINI_YAML = """version: 1.0
lines:
  - id: 1
    name: "测试线"
    value: "v"
    weight: 1.0
    baseline_pct: 0
    baseline_note: "n"
    modules: ["src/l4/"]
    done_definition: "d"
    acceptance_points:
      - id: "1-1"
        desc: "k3 通过点"
        evidence: ["k3:test"]
        status: uncommitted
        note: ""
      - id: "1-2"
        desc: "k3 否决点"
        evidence: ["k3:test"]
        status: uncommitted
        note: ""
      - id: "1-3"
        desc: "场景绿点"
        evidence: ["scenario:GS-03"]
        status: uncommitted
        note: ""
      - id: "1-4"
        desc: "场景红点"
        evidence: ["scenario:GS-03"]
        status: uncommitted
        note: ""
      - id: "1-5"
        desc: "创始人核验点"
        evidence: ["founder-demo:x"]
        status: uncommitted
        note: ""
      - id: "1-6"
        desc: "yaml 自报 verified 无证据"
        evidence: []
        status: verified
        note: ""
"""


def k3_record(date, verdicts):
    return json.dumps({"schema": 1, "record_type": "k3", "source": "s",
                       "date": date, "verdicts": verdicts}, ensure_ascii=False)


class TestYamlSubset(unittest.TestCase):
    """1. 子集解析器: 正常 + 边界"""

    def test_real_yaml_26_lines(self):
        d = pl_yaml.load_file(str(DOC_DIR / "product-lines.yaml"))
        self.assertEqual(len(d["lines"]), 26)
        for l in d["lines"]:
            self.assertTrue(5 <= len(l["acceptance_points"]) <= 12,
                            "线 %s 验收点数量越界" % l["id"])

    def test_quoted_escapes_and_comments(self):
        d = pl_yaml.parse('k: "a\\"b"  # 注释\nn: 3\nlst: ["x", 1]\n')
        self.assertEqual(d["k"], 'a"b')
        self.assertEqual(d["n"], 3)
        self.assertEqual(d["lst"], ["x", 1])

    def test_unsupported_syntax_fails_closed(self):
        cases = [
            ("a: {b: 1}", "flow map"),
            ("a:\n\tb: 1", "tab indent"),
            ('a: "未闭合', "unclosed string"),
            ("a: 1\na: 2", "duplicate key"),
            ("a: 中文裸", "bare chinese scalar"),
            ("a: |\n  x", "literal block"),
            ("- a: 1\n  b: 2\n c: 3", "bad indent"),
        ]
        for text, why in cases:
            with self.assertRaises(YamlSubsetError, msg=why):
                pl_yaml.parse(text)

    def test_inline_list_items_and_nested(self):
        d = pl_yaml.parse('l:\n  - id: "1-1"\n    desc: "x"\n  - id: "1-2"\n    desc: "y"\n')
        self.assertEqual(len(d["l"]), 2)
        self.assertEqual(d["l"][1]["id"], "1-2")


class TestCalcStateMachine(unittest.TestCase):
    """2. calc-progress.py: 六态 + 诚实规则 + A1 + 100% 门槛 + 降级"""

    def _run(self, tmp, evidence_files, git_cmd="git", mini_yaml=MINI_YAML):
        tmp = Path(tmp)
        ypath = write(tmp, "y.yaml", mini_yaml)
        evdir = tmp / "evidence"
        evdir.mkdir()
        for name, content in evidence_files.items():
            (evdir / name).write_text(content, encoding="utf-8")
        ovr = write(tmp, "override.yaml", "version: 1.0\npending_decisions: []\n")
        out = tmp / "out.json"
        result = calc.compute(ypath, evdir, ovr, git_cmd, out)
        return result, json.loads(out.read_text(encoding="utf-8"))

    def test_six_states(self):
        from datetime import datetime, timedelta
        old = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {
            "k3.json": k3_record("2026-08-13", [
                {"acceptance_point": "1-1", "verdict": "pass"},
                {"acceptance_point": "1-2", "verdict": "fail"}]),
            "scenario.json": json.dumps({"schema": 1, "record_type": "scenario", "source": "s",
                                         "date": fresh, "verdicts": [
                                             {"acceptance_point": "1-3", "verdict": "pass"},
                                             {"acceptance_point": "1-4", "verdict": "fail"}]}),
            "demo.json": json.dumps({"schema": 1, "record_type": "founder_demo", "source": "s",
                                     "date": fresh, "verdicts": [
                                         {"acceptance_point": "1-5", "verdict": "pass"}]}),
            "old.json": json.dumps({"schema": 1, "record_type": "test", "source": "s",
                                    "date": old, "verdicts": [
                                        {"acceptance_point": "1-3", "verdict": "pass"}]}),
        }
        result, data = self._run(tempfile.mkdtemp(), ev)
        statuses = {p["id"]: p["status"] for p in data["lines"][0]["points"]}
        self.assertEqual(statuses["1-1"], "verified")
        self.assertEqual(statuses["1-2"], "rejected")
        self.assertEqual(statuses["1-3"], "pending_k3")
        self.assertEqual(statuses["1-4"], "failed")
        self.assertEqual(statuses["1-5"], "verified")
        # 1-6: yaml 自报 verified 但无证据 → 降级 uncommitted + 告警（诚实规则 1）
        self.assertEqual(statuses["1-6"], "uncommitted")
        self.assertTrue(any("1-6" in p for p in data["degraded"]["problems"]))

    def test_stale_by_ttl(self):
        from datetime import datetime, timedelta
        old = (datetime.now() - timedelta(days=15)).strftime("%Y-%m-%d")
        ev = {"s.json": json.dumps({"schema": 1, "record_type": "scenario", "source": "s",
                                    "date": old, "verdicts": [
                                        {"acceptance_point": "1-3", "verdict": "pass"}]})}
        _, data = self._run(tempfile.mkdtemp(), ev)
        statuses = {p["id"]: p["status"] for p in data["lines"][0]["points"]}
        self.assertEqual(statuses["1-3"], "stale")

    def test_stale_by_git_change(self):
        fake = write(tempfile.mkdtemp(), "git.sh",
                     "#!/usr/bin/env bash\necho src/l4/graph-bridge.ts\nexit 0\n")
        os.chmod(fake, 0o755)
        from datetime import datetime
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"s.json": json.dumps({"schema": 1, "record_type": "scenario", "source": "s",
                                    "date": fresh, "verdicts": [
                                        {"acceptance_point": "1-3", "verdict": "pass"}]})}
        _, data = self._run(tempfile.mkdtemp(), ev, git_cmd=str(fake))
        statuses = {p["id"]: p["status"] for p in data["lines"][0]["points"]}
        self.assertEqual(statuses["1-3"], "stale")

    def test_git_unavailable_degrades(self):
        fake = write(tempfile.mkdtemp(), "git.sh", "#!/usr/bin/env bash\nexit 1\n")
        os.chmod(fake, 0o755)
        from datetime import datetime
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"s.json": json.dumps({"schema": 1, "record_type": "scenario", "source": "s",
                                    "date": fresh, "verdicts": [
                                        {"acceptance_point": "1-3", "verdict": "pass"}]})}
        _, data = self._run(tempfile.mkdtemp(), ev, git_cmd=str(fake))
        self.assertTrue(data["degraded"]["problems"],
                        "git 失败必须显式进入 problems（不静默）")

    def test_hundred_percent_gate(self):
        mini = MINI_YAML.replace('evidence: ["k3:test"]\n        status: uncommitted',
                                 'evidence: ["k3:test"]\n        status: uncommitted', 1)
        # 全部 6 点都绑 k3 pass（1-1~1-5 已有绑定, 1-6 改为 k3 pass 且 seed uncommitted）
        mini = mini.replace('evidence: []\n        status: verified',
                            'evidence: ["k3:test"]\n        status: uncommitted')
        ev = {"k3.json": k3_record("2026-08-13", [
            {"acceptance_point": "1-%d" % i, "verdict": "pass"} for i in range(1, 7)])}
        _, data = self._run(tempfile.mkdtemp(), ev, mini_yaml=mini)
        line = data["lines"][0]
        self.assertEqual(line["verified"], 6)
        self.assertEqual(line["k3_gate"], "pending")
        self.assertEqual(line["progress_pct"], 99, "无审计员线级复核 → 封顶 99")

        # 补线级复核记录 → 100 放行
        ev["k3line.json"] = k3_record("2026-08-14", [
            {"acceptance_point": "line:1", "verdict": "pass"}])
        _, data = self._run(tempfile.mkdtemp(), ev, mini_yaml=mini)
        line = data["lines"][0]
        self.assertEqual(line["k3_gate"], "passed")
        self.assertEqual(line["progress_pct"], 100)

    def test_corrupt_evidence_degraded(self):
        ev = {"bad.json": "{not json"}
        _, data = self._run(tempfile.mkdtemp(), ev)
        self.assertTrue(any("bad.json" in s for s in data["degraded"]["sources"]))

    def test_bad_yaml_fails_closed(self):
        with self.assertRaises(YamlSubsetError):
            calc.compute(write(tempfile.mkdtemp(), "y.yaml", "a: {b}"),
                         Path(tempfile.mkdtemp()), Path(tempfile.mkdtemp()) / "o.yaml", "git",
                         Path(tempfile.mkdtemp()) / "out.json")

    def test_real_repo_capital_line_zero_of_eight(self):
        """集成: 真实 yaml + 真实证据 → 资本循环 0/8 精确显示（Phase 1 验收项）。"""
        tmp = tempfile.mkdtemp()
        result = calc.compute(DOC_DIR / "product-lines.yaml",
                              DOC_DIR / "evidence",
                              DOC_DIR / "cockpit-override.yaml", "git",
                              Path(tmp) / "out.json")
        line10 = next(l for l in result["lines"] if l["id"] == 10)
        self.assertEqual(line10["verified"], 0)
        self.assertEqual(line10["total"], 8)
        self.assertEqual(line10["progress_pct"], 0)
        # 5 个 K3 已验证点 + 4 个审计否决点（来自真实证据记录）
        self.assertEqual(sum(l["verified"] for l in result["lines"]), 5)
        self.assertEqual(sum(l["status_counts"]["rejected"] for l in result["lines"]), 4)
        self.assertEqual(len(result["decisions"]), 2)
        self.assertEqual(result["total_lines"], 26)

    def test_idempotent_no_rewrite(self):
        """D372: 内容无变化（仅时间戳）→ 不重写文件（防 CI 噪音提交）。"""
        tmp = Path(tempfile.mkdtemp())
        out = tmp / "out.json"
        calc.compute(DOC_DIR / "product-lines.yaml", DOC_DIR / "evidence",
                     DOC_DIR / "cockpit-override.yaml", "git", out)
        mtime1 = out.stat().st_mtime_ns
        calc.compute(DOC_DIR / "product-lines.yaml", DOC_DIR / "evidence",
                     DOC_DIR / "cockpit-override.yaml", "git", out)
        self.assertEqual(out.stat().st_mtime_ns, mtime1, "第二次运行不得重写（幂等）")


class TestAggregateTodos(unittest.TestCase):
    """3. aggregate-todos.py: 真实源 + 区间展开 + 幂等 + MANUAL 保留 + fail-closed"""

    def _args(self, tmp, ledger=None, registry=None, cline=None, dashboard=None):
        tmp = Path(tmp)
        def d(name, content):
            p = write(tmp, name, content)
            return str(p)
        ledger = ledger or d("ledger.md", "# 审计发现台账\n## 一、审计发现台账\n"
                             "| 日期 | D# | 级别 | 发现 | 根因 | 修复 | 改进归属 |\n"
                             "|------|----|:---:|------|------|------|:---:|\n"
                             "| 08-14 | 全链路 | P0×3 | 全链路 FAIL | x | D355-D360（见仪表盘） | 产品 |\n")
        registry = registry or d("registry.md", "| 项 | v1.1 | 验证 |\n|---|---|---|\n"
                                 "| 4. 待决策项分析（2 项） | 材料产出 P0-8 | N14 去重键不稳定 |\n")
        cline = cline or d("cline.md", "| S3-1 | 部署门槛 | ⚠️ | 30 分钟 | 未验证 | P0-block | R1 |\n"
                           "| S4-1 | 定价 | 📊 | 未定稿 | 未测量 | P1 | 创始人决策 |\n")
        dashboard = dashboard or d("dash.md", "| D355 | 契约修复 | dev doc（P0） | — |\n"
                                   "| D111 | 旧任务 | ✅ 已提交 | c967797 |\n")
        return Namespace(ledger=ledger, registry=registry, cline=cline, dashboard=dashboard,
                         gs_dir=str(tmp / "nogs"), out=str(tmp / "todos.yaml"),
                         map=str(write(tmp, "map.yaml",
                                       "version: 1.0\n"
                                       "d_override:\n  D355: 10\n  D356: 10\n  D357: 4\n"
                                       "keywords:\n  - [\"去重\", 8]\n"
                                       "standards:\n  S3-1: 1\n"
                                       "line_scenarios:\n  10: [\"GS-03\"]\n"
                                       "default_owner: \"Claude Code\"\n"
                                       "harness_lines: [1]\n")))

    def test_range_expansion_and_mapping(self):
        tmp = tempfile.mkdtemp()
        todos, degraded = aggregate.aggregate(self._args(tmp))
        lines = sorted(set(t["line"] for t in todos))
        self.assertIn(10, lines)
        self.assertIn(4, lines)
        self.assertIn(1, lines, "S3-1 标准映射 → 线 1")
        self.assertNotIn(8, lines, "登记册摘要行应被过滤")
        # D355 与 D356 都归属线 10（区间展开）
        d_nums = [t["depends"][0] for t in todos if t["line"] == 10]
        self.assertIn("D355", d_nums)
        self.assertIn("D356", d_nums)
        # 看板未完成 D355 也入线 10
        self.assertTrue(any(t["source"] == "任务看板（未完成）" and t["line"] == 10 for t in todos))

    def test_idempotent_and_manual_preserved(self):
        tmp = tempfile.mkdtemp()
        args = self._args(tmp)
        aggregate.aggregate(args)
        out = Path(args.out)
        first = out.read_text(encoding="utf-8")
        mtime1 = out.stat().st_mtime_ns
        aggregate.aggregate(args)
        self.assertEqual(out.read_text(encoding="utf-8"), first, "两次运行内容一致（幂等）")
        # MANUAL 区人工微调后重跑 → 保留
        manual_block = "manual:\n  - id: \"T-10-99\"\n    line: 10\n    title: \"人工加\"\n"
        out.write_text(first.replace("manual: []", manual_block), encoding="utf-8")
        aggregate.aggregate(args)
        self.assertIn("T-10-99", out.read_text(encoding="utf-8"), "MANUAL 区逐字节保留")

    def test_missing_map_fails_closed(self):
        tmp = Path(tempfile.mkdtemp())
        args = self._args(tmp)
        args.map = str(tmp / "nope.yaml")
        with self.assertRaises(SystemExit) as cm:
            aggregate.aggregate(args)
        self.assertEqual(cm.exception.code, 2)

    def test_real_sources(self):
        """集成: 真实 5 源 → ≥30 条待办且覆盖 10+ 条线。"""
        tmp = Path(tempfile.mkdtemp())
        args = Namespace(
            ledger=str(REPO_ROOT / "docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md"),
            registry=str(REPO_ROOT / "docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v2.md"),
            cline=str(REPO_ROOT / "docs/synova/research/C线-世界级基准-20260802/第五章-差距清单与路线图-20260802.md"),
            dashboard=str(REPO_ROOT / "docs/synova/DASHBOARD-CN.md"),
            gs_dir=str(REPO_ROOT / "scripts/golden-scenarios"),
            out=str(tmp / "todos.yaml"),
            map=str(DOC_DIR / "todo-line-map.yaml"))
        todos, degraded = aggregate.aggregate(args)
        self.assertGreaterEqual(len(todos), 30)
        self.assertGreaterEqual(len(set(t["line"] for t in todos)), 10)
        self.assertIn(10, set(t["line"] for t in todos), "资本循环线有待办")


class TestGenPage(unittest.TestCase):
    """4. gen-progress-page.py: 真实链路 + 术语零泄漏 + fail-closed + manual 覆盖"""

    def _real_chain(self, tmp):
        calc.compute(DOC_DIR / "product-lines.yaml", DOC_DIR / "evidence",
                     DOC_DIR / "cockpit-override.yaml", "git", Path(tmp) / "progress.json")
        args = Namespace(
            ledger=str(REPO_ROOT / "docs/synova/coordination/AUDIT-FINDINGS-LEDGER.md"),
            registry=str(REPO_ROOT / "docs/synova/research/AUTHORITY-DEVIATION-REGISTRY-v2.md"),
            cline=str(REPO_ROOT / "docs/synova/research/C线-世界级基准-20260802/第五章-差距清单与路线图-20260802.md"),
            dashboard=str(REPO_ROOT / "docs/synova/DASHBOARD-CN.md"),
            gs_dir=str(REPO_ROOT / "scripts/golden-scenarios"),
            out=str(Path(tmp) / "todos.yaml"),
            map=str(DOC_DIR / "todo-line-map.yaml"))
        aggregate.aggregate(args)
        return Path(tmp) / "progress.json", Path(tmp) / "todos.yaml"

    def test_real_page_and_no_jargon(self):
        import re
        tmp = tempfile.mkdtemp()
        progress, todos = self._real_chain(tmp)
        out = Path(tmp) / "page.html"
        genpage.generate(progress, todos, DOC_DIR / "todo-line-map.yaml", out)
        html_text = out.read_text(encoding="utf-8")
        self.assertEqual(html_text.count('class="line"'), 26)
        self.assertIn("需要创始人拍板", html_text)
        self.assertIn("资本循环", html_text)
        # 术语零泄漏（创始人驾驶舱红线）
        self.assertEqual(len(re.findall(r"\bD\d{3}\b", html_text)), 0, "无任务编号术语")
        self.assertEqual(len(re.findall(r"\bK3\b|\bP0\b|\bP1\b|\bP2\b", html_text)), 0,
                         "无审计/优先级术语")
        self.assertIn("0/8", html_text, "资本循环 0/8 精确显示")

    def test_missing_progress_fails_closed(self):
        with self.assertRaises(SystemExit) as cm:
            genpage.generate(Path(tempfile.mkdtemp()) / "nope.json",
                             Path(tempfile.mkdtemp()) / "nope.yaml",
                             DOC_DIR / "todo-line-map.yaml",
                             Path(tempfile.mkdtemp()) / "out.html")
        self.assertEqual(cm.exception.code, 2)

    def test_manual_todo_overrides(self):
        import re
        tmp = tempfile.mkdtemp()
        progress, todos = self._real_chain(tmp)
        text = todos.read_text(encoding="utf-8")
        text = text.replace("manual: []",
                            "manual:\n  - id: \"T-10-01\"\n    line: 10\n    title: \"人工覆盖标题\"\n"
                            "    source: \"人工\"\n    priority: P0\n    owner: \"创始人\"\n"
                            "    depends: []\n    acceptance: \"手工验收\"\n")
        todos.write_text(text, encoding="utf-8")
        out = Path(tmp) / "page.html"
        genpage.generate(progress, todos, DOC_DIR / "todo-line-map.yaml", out)
        self.assertIn("人工覆盖标题", out.read_text(encoding="utf-8"))

    def test_idempotent_no_rewrite(self):
        """D372: 页面内容无变化 → 不重写（mtime 不变）。"""
        tmp = Path(tempfile.mkdtemp())
        progress, todos = self._real_chain(tmp)
        out = tmp / "page.html"
        genpage.generate(progress, todos, DOC_DIR / "todo-line-map.yaml", out)
        mtime1 = out.stat().st_mtime_ns
        genpage.generate(progress, todos, DOC_DIR / "todo-line-map.yaml", out)
        self.assertEqual(out.stat().st_mtime_ns, mtime1)


class TestAScripts(unittest.TestCase):
    """5-7. A2/A6/A7 支撑脚本"""

    def test_evidence_writer_normal(self):
        tmp = Path(tempfile.mkdtemp())
        evw.write_evidence("ci", "2026-08-16", "pass", "7-1,9-2", "test-job", "log:42", tmp)
        rec = json.loads((tmp / "ci-2026-08-16.json").read_text(encoding="utf-8"))
        self.assertEqual(rec["record_type"], "ci")
        self.assertEqual(len(rec["verdicts"]), 2)
        # 同日同类第二次 → 递增序号防覆盖
        evw.write_evidence("ci", "2026-08-16", "fail", "7-1", "test-job", "", tmp)
        self.assertTrue((tmp / "ci-2026-08-16-1.json").exists())

    def test_evidence_writer_boundary(self):
        tmp = Path(tempfile.mkdtemp())
        with self.assertRaises(SystemExit) as cm:
            evw.write_evidence("founder_demo", "2026-08-16", "pass", "1-6", "x", "", tmp)
        self.assertEqual(cm.exception.code, 2, "创始人核验缺演示记录 → 拒绝")
        with self.assertRaises(SystemExit) as cm2:
            evw.write_evidence("ci", "bad-date", "pass", "1-6", "x", "", tmp)
        self.assertEqual(cm2.exception.code, 2)

    def test_parse_k3_normal(self):
        tmp = Path(tempfile.mkdtemp())
        (tmp / "audit").mkdir()
        (tmp / "audit" / "rep.json").write_text(json.dumps({
            "report_id": "X1", "date": "2026-08-16",
            "verdicts": [{"acceptance_point": "7-1", "verdict": "pass", "quote": "q"}]}),
            encoding="utf-8")
        out = tmp / "evidence"
        self.assertEqual(k3parse.parse_reports(tmp / "audit", out), 0)
        rec = json.loads((out / "k3-X1.json").read_text(encoding="utf-8"))
        self.assertEqual(rec["verdicts"][0]["verdict"], "pass")

    def test_parse_k3_degraded_paths(self):
        tmp = Path(tempfile.mkdtemp())
        # 无 JSON → 显式降级 exit 2（不是静默当没有判定）
        self.assertEqual(k3parse.parse_reports(tmp / "empty", tmp / "ev"), 2)
        # 损坏 JSON → exit 2
        bad = tmp / "bad"
        bad.mkdir()
        (bad / "x.json").write_text("{broken", encoding="utf-8")
        self.assertEqual(k3parse.parse_reports(bad, tmp / "ev"), 2)

    def test_gen_k3_task_pending_gate(self):
        tmp = Path(tempfile.mkdtemp())
        progress = {"lines": [{"id": 7, "name": "持续监测", "progress_pct": 99,
                               "verified": 8, "k3_gate": "pending", "done_definition": "d",
                               "points": [{"id": "7-1", "desc": "x", "status": "verified",
                                           "evidence_files": ["evidence/k3.json"]}]}]}
        (tmp / "p.json").write_text(json.dumps(progress), encoding="utf-8")
        written = k3task.generate(tmp / "p.json", tmp)
        self.assertEqual(len(written), 1)
        content = (tmp / written[0]).read_text(encoding="utf-8")
        self.assertIn("材料与问题清单", content)
        self.assertIn("审计员定夺", content, "不替审计员写标准")

    def test_gen_k3_task_no_candidates(self):
        tmp = Path(tempfile.mkdtemp())
        progress = {"lines": [{"id": 7, "name": "x", "progress_pct": 10, "verified": 0,
                               "k3_gate": "", "points": []}]}
        (tmp / "p.json").write_text(json.dumps(progress), encoding="utf-8")
        self.assertEqual(k3task.generate(tmp / "p.json", tmp), [])


class TestRefreshAll(unittest.TestCase):
    """8. refresh-all.sh 端到端（真实路由，铁律 12）"""

    def test_end_to_end(self):
        proc = subprocess.run(["bash", str(PL_DIR / "refresh-all.sh")],
                              cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=300)
        self.assertEqual(proc.returncode, 0, "refresh-all exit 0: %s" % proc.stderr[-400:])
        for f in ("todos.yaml", "product-progress.json", "product-progress.html"):
            self.assertTrue((DOC_DIR / f).is_file(), f)


if __name__ == "__main__":
    unittest.main(verbosity=2)
