"""Tests for D579 B 项 — gen-cto-health.py 批次审计报告派生修正（CT-58 机制侧，spec §7 B1-B5）

依据: SYNOVA-IMPL-DSH-D579-k3-verdict-stale-20260905.md §5.2 契约 + §7 测试矩阵。
      D572 P1-3: gen-cto-health 按文件名首个 D# 派生 + glob 要求文件名以 D{num}.md 结尾
      → 批次报告 2026-08-25-D517-D519.md 只让 D517 进索引，D518/D519 audit 列显示 "—"。
      修复契约: resolve_audit_report(num, audit_dict, audit_dir, is_committed)
      → (report_path|None, "state"|"filename"|None)——task-state audit.report 显式字段
        优先（过 D412 _committed 口径），文件名 glob 兜底（同样过 _committed）。

覆盖矩阵（铁律 48 三路径）:
  正常:   B1 state 字段命中批次报告（D517/518/519 场景）; B2 仪表盘效果 CONDITIONAL_PASS+audited;
          B5 单报告文件名派生回归（含 D395a [a-z] 变体）
  降级:   B3 state 指向不存在文件 → 回落 filename
  边界:   B4 未提交不采信（state 与 filename 兜底双分支，D412 口径）

夹具模式: mktemp 沙箱 + 真实 git init 仓（_committed/head_files 走真实 git，不 mock 管线，
铁律 12）+ gen.REPO/gen.TASK_STATE_DIR 注入 + setUp/tearDown 还原。不依赖真实仓库数据。

运行: python3 tests/control-tower/gen-cto-health-batch-report.test.py
"""
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
CT_DIR = REPO_ROOT / "scripts" / "control-tower"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


gen = _load("gen_cto_health_d579", CT_DIR / "gen-cto-health.py")

BATCH_REPORT_NAME = "2026-08-25-D517-D519.md"
BATCH_REPORT_TXT = (
    "# K3 独立审计报告 — D517/D518/D519 切片 A\n\n"
    "## 结论: **CONDITIONAL PASS**（切片级，覆盖 D517/D518/D519）\n"
)
SINGLE_542_TXT = "# K3 独立审计报告 — D542\n\n## 结论: **PASS**\n"
SINGLE_543A_TXT = "# K3 独立审计报告 — D543a\n\n## 结论: **PASS**\n"


def audit_state(report_rel):
    """构造 task-state audit 块（D517/518/519 真实形态: auditor/verdict/report）。"""
    return {"auditor": "k3", "date": "2026-08-25", "verdict": "CONDITIONAL PASS",
            "report": report_rel}


class TestGenCtoHealthBatchReport(unittest.TestCase):
    """D579 B 项: resolve_audit_report 契约 + analyze_task_state 仪表盘效果。"""

    def setUp(self):
        self._orig_repo = gen.REPO
        self._orig_tsdir = gen.TASK_STATE_DIR

    def tearDown(self):
        gen.REPO = self._orig_repo
        gen.TASK_STATE_DIR = self._orig_tsdir

    # ── 夹具: tmp 真实 git 仓 ──

    def _init_repo(self, tmp: Path):
        subprocess.run(["git", "init", "-q"], cwd=tmp, check=True, capture_output=True)
        subprocess.run(["git", "config", "user.email", "t@example.com"], cwd=tmp,
                       check=True, capture_output=True)
        subprocess.run(["git", "config", "user.name", "t"], cwd=tmp,
                       check=True, capture_output=True)

    def _commit_all(self, tmp: Path, msg="setup"):
        subprocess.run(["git", "add", "-A"], cwd=tmp, check=True, capture_output=True)
        subprocess.run(["git", "commit", "-q", "-m", msg, "--allow-empty"], cwd=tmp,
                       check=True, capture_output=True)

    def _write_task(self, tmp: Path, num: int, audit):
        d = {"task_id": "D%03d" % num, "title": "t%d" % num}
        if audit is not None:
            d["audit"] = audit
        (tmp / "task-state" / ("D%03d.json" % num)).write_text(
            json.dumps(d, ensure_ascii=False), encoding="utf-8")

    def _repo(self, files_committed, files_uncommitted=(), tasks=()):
        """files_*: 相对路径 → 文本; tasks: (num, audit 块或 None)。返回 (tmp, audit_dir)。"""
        tmp = Path(tempfile.mkdtemp())
        (tmp / "docs" / "synova" / "audit-reports").mkdir(parents=True)
        (tmp / "task-state").mkdir()
        for rel, txt in files_committed:
            p = tmp / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(txt, encoding="utf-8")
        for num, audit in tasks:
            self._write_task(tmp, num, audit)
        self._init_repo(tmp)
        self._commit_all(tmp)
        for rel, txt in files_uncommitted:
            p = tmp / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(txt, encoding="utf-8")
        gen.REPO = tmp
        gen.TASK_STATE_DIR = tmp / "task-state"
        return tmp, tmp / "docs" / "synova" / "audit-reports"

    def _by_id(self, tasks):
        return {t["task_id"]: t for t in tasks}

    # ── B1: state 字段命中批次报告（D517/518/519 三编号同源）──

    def test_b1_state_field_resolves_batch_report(self):
        batch_rel = "docs/synova/audit-reports/" + BATCH_REPORT_NAME
        tmp, audit_dir = self._repo([(batch_rel, BATCH_REPORT_TXT)])
        audit_dict = audit_state(batch_rel)
        for num in (517, 518, 519):
            rep, src = gen.resolve_audit_report(num, audit_dict, audit_dir,
                                                lambda p: True)
            self.assertIsNotNone(rep, "D%d 应经 state 字段命中批次报告" % num)
            self.assertEqual(src, "state")
            self.assertEqual(rep.name, BATCH_REPORT_NAME)

    # ── B2: 仪表盘效果——CONDITIONAL_PASS + audited（中间 D# 不再隐形）──

    def test_b2_dashboard_shows_conditional_pass(self):
        batch_rel = "docs/synova/audit-reports/" + BATCH_REPORT_NAME
        tmp, _ = self._repo(
            [(batch_rel, BATCH_REPORT_TXT)],
            tasks=[(517, audit_state(batch_rel)), (518, audit_state(batch_rel)),
                   (519, audit_state(batch_rel))])
        tasks, _meta = gen.analyze_task_state()
        by_id = self._by_id(tasks)
        for tid in ("D517", "D518", "D519"):
            self.assertEqual(by_id[tid]["audit"], "CONDITIONAL_PASS",
                             "%s audit 列必须可见（修复前为 '—'，verdict 滞留）" % tid)
            self.assertEqual(by_id[tid]["status"], "audited",
                             "%s 状态必须派生为 audited（修复前 impl_done）" % tid)

    # ── B3: state 指向不存在文件 → 回落 filename（单报告回归不变）──

    def test_b3_state_missing_file_falls_back_to_filename(self):
        single_rel = "docs/synova/audit-reports/2026-09-01-D542.md"
        tmp, audit_dir = self._repo(
            [(single_rel, SINGLE_542_TXT)],
            tasks=[(542, audit_state("docs/synova/audit-reports/2026-09-01-D542-moved.md"))])
        d = json.loads((tmp / "task-state" / "D542.json").read_text(encoding="utf-8"))
        rep, src = gen.resolve_audit_report(542, d.get("audit"), audit_dir,
                                            lambda p: True)
        self.assertIsNotNone(rep, "state 文件缺失必须回落文件名派生")
        self.assertEqual(src, "filename")
        self.assertEqual(rep.name, "2026-09-01-D542.md")
        tasks, _meta = gen.analyze_task_state()
        by_id = self._by_id(tasks)
        self.assertEqual(by_id["D542"]["audit"], "PASS")
        self.assertEqual(by_id["D542"]["status"], "audited")

    # ── B4: 未提交不采信（D412 口径——state 与 filename 兜底双分支）──

    def test_b4_uncommitted_not_trusted(self):
        batch_rel = "docs/synova/audit-reports/" + BATCH_REPORT_NAME
        single_rel = "docs/synova/audit-reports/2026-09-01-D542.md"
        # 报告在盘但未提交（files_uncommitted），task-state 已提交
        tmp, audit_dir = self._repo(
            [],
            files_uncommitted=[(batch_rel, BATCH_REPORT_TXT), (single_rel, SINGLE_542_TXT)],
            tasks=[(518, audit_state(batch_rel)), (542, None)])
        d518 = json.loads((tmp / "task-state" / "D518.json").read_text(encoding="utf-8"))
        # state 分支: 文件未提交 → 不采信
        rep, src = gen.resolve_audit_report(518, d518.get("audit"), audit_dir,
                                            lambda p: False)
        self.assertIsNone(rep, "未提交的 state 报告不得采信（D412）")
        self.assertIsNone(src)
        # 同一夹具换已提交口径 → 权威采信
        rep_ok, src_ok = gen.resolve_audit_report(518, d518.get("audit"), audit_dir,
                                                  lambda p: True)
        self.assertEqual((src_ok, rep_ok.name), ("state", BATCH_REPORT_NAME))
        # filename 兜底分支: 未提交的单报告同样不采信
        rep542, src542 = gen.resolve_audit_report(542, None, audit_dir, lambda p: False)
        self.assertIsNone(rep542, "未提交的文件名兜底候选不得采信（D412）")
        self.assertIsNone(src542)
        rep542c, src542c = gen.resolve_audit_report(542, None, audit_dir, lambda p: True)
        self.assertEqual((src542c, rep542c.name), ("filename", "2026-09-01-D542.md"))

    # ── B5: 单报告文件名派生回归（无 audit.report 场景语义零变化）──

    def test_b5_filename_derivation_regression(self):
        tmp, audit_dir = self._repo(
            [("docs/synova/audit-reports/2026-09-01-D542.md", SINGLE_542_TXT),
             ("docs/synova/audit-reports/2026-09-01-D543a.md", SINGLE_543A_TXT)],
            tasks=[(542, None), (543, {})])
        d542 = json.loads((tmp / "task-state" / "D542.json").read_text(encoding="utf-8"))
        rep, src = gen.resolve_audit_report(542, d542.get("audit"), audit_dir,
                                            lambda p: True)
        self.assertEqual((src, rep.name), ("filename", "2026-09-01-D542.md"),
                         "精确 *D{num}.md 优先（D395a 语义保持）")
        # D395a 变体: *D{num}[a-z].md
        rep543, src543 = gen.resolve_audit_report(543, {}, audit_dir, lambda p: True)
        self.assertEqual((src543, rep543.name), ("filename", "2026-09-01-D543a.md"),
                         "[a-z] 变体 glob 兜底保持")
        # 仪表盘回归: 无 state 字段任务仍按文件名派生
        tasks, _meta = gen.analyze_task_state()
        by_id = self._by_id(tasks)
        self.assertEqual(by_id["D542"]["audit"], "PASS")
        self.assertEqual(by_id["D542"]["status"], "audited")
        self.assertEqual(by_id["D543"]["audit"], "PASS")


if __name__ == "__main__":
    unittest.main(verbosity=2)
