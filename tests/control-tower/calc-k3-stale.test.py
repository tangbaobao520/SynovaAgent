"""Tests for D579 — calc-progress.py k3 verdict stale/TTL 机制（CT-55，spec §7 A1-A8）

依据: SYNOVA-IMPL-DSH-D579-k3-verdict-stale-20260905.md §5.2 契约 + §7 测试矩阵。
      D572 K3 审计 P1-1: k3 pass 对失效检查永久免疫（L149/L156 在 L166 之前 return verified）。
      修复契约: freshness_gate(evidence_date, line_modules, git_cmd, today, pid, problems)
      → "fresh"(verified) / "stale"(stale) / "unknown"(pending_k3 + problems 显式)。

覆盖矩阵（铁律 48 三路径）:
  正常:   A3 新鲜+零触及→verified（19-2/22-1 机制化）; A5b k3_only 新鲜→verified;
          A8 superseded 不拖累/不抢救 latest 判定
  stale:  A1 TTL 过期; A2 modules 触及（D556 机制化）; A5a k3_only TTL 过期;
          A7 配对夹具（变更前一 stale/变更后一 verified）
  降级:   A6a 日期非法 / A6b git 失败 / A6c modules 映射缺失 → 全部 pending_k3 + problems 显式
  边界:   A4 k3 fail 短路 rejected 不受 TTL/git 影响; A8 superseded_by 边界

注入模式（D576 mini yaml 教训——测试不依赖墙钟漂移）:
  - mini yaml（自有 D579_YAML，含 k3_only 点与 modules 可替换变体）
  - 假 git 可执行注入（--git-cmd 同款，含"边界日期"假 git 仿真 modules 变更时点）
  - 日期一律 datetime.now() 相对生成

运行: python3 tests/control-tower/calc-k3-stale.test.py
"""
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
PL_DIR = REPO_ROOT / "scripts" / "product-lines"


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, str(path))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


pl_yaml = _load("productline_yaml", PL_DIR / "productline_yaml.py")
# 先注册共享解析器模块，再加载 SUT——让 SUT 内的 `import productline_yaml`
# 命中同一模块实例（否则 YamlSubsetError 类身份不一致）
sys.modules.setdefault("productline_yaml", pl_yaml)

calc = _load("calc_progress_d579", PL_DIR / "calc-progress.py")


def write(tmp, name: str, content: str) -> Path:
    p = Path(tmp) / name
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content, encoding="utf-8")
    return p


D579_YAML = """version: 1.0
lines:
  - id: 1
    name: "D579 测试线"
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
        desc: "k3_only 复核点"
        evidence: ["k3:test"]
        status: uncommitted
        k3_only: true
        note: ""
      - id: "1-4"
        desc: "k3 日期非法点"
        evidence: ["k3:test"]
        status: uncommitted
        note: ""
      - id: "1-5"
        desc: "k3 git 失败点"
        evidence: ["k3:test"]
        status: uncommitted
        note: ""
      - id: "1-6"
        desc: "k3 映射缺失点"
        evidence: ["k3:test"]
        status: uncommitted
        note: ""
"""

# 映射缺失变体: 线 modules 为空（A6c）
D579_YAML_NO_MODULES = D579_YAML.replace('modules: ["src/l4/"]', 'modules: []')

# 配对夹具用: 变更发生在 2026-09-01（A7）
D579_YAML_PAIR = D579_YAML

FAKE_GIT_ALWAYS_TOUCH = "#!/usr/bin/env bash\necho src/l4/graph-bridge.ts\nexit 0\n"
FAKE_GIT_ZERO_TOUCH = "#!/usr/bin/env bash\nexit 0\n"
FAKE_GIT_FAIL = "#!/usr/bin/env bash\nexit 1\n"
# 边界假 git: --since 日期早于 2026-09-01 → 报告触及; 晚于 → 零触及（仿真"变更时点"）
FAKE_GIT_BOUNDARY = (
    "#!/usr/bin/env bash\n"
    'd=""\n'
    'for a in "$@"; do\n'
    '  case "$a" in\n'
    "    --since=*) d=${a#--since=}; d=${d%%T*} ;;\n"
    "  esac\n"
    "done\n"
    'if [ -n "$d" ] && [ "$d" \\< "2026-09-01" ]; then\n'
    '  echo "src/l4/graph-bridge.ts"\n'
    "fi\n"
    "exit 0\n"
)


def k3_record(date, verdicts):
    return json.dumps({"schema": 1, "record_type": "k3", "source": "s",
                       "date": date, "verdicts": verdicts}, ensure_ascii=False)


def statuses(data):
    return {p["id"]: p["status"] for p in data["lines"][0]["points"]}


def problems(data):
    return data["degraded"]["problems"]


class TestCalcK3Stale(unittest.TestCase):
    """D579 A 项: 两个 k3→verified 出口接入 freshness_gate（red→green 见 evidence）。"""

    def _run(self, evidence_files, git_cmd="git", mini_yaml=D579_YAML):
        tmp = tempfile.mkdtemp()
        ypath = write(tmp, "y.yaml", mini_yaml)
        evdir = Path(tmp) / "evidence"
        evdir.mkdir()
        for name, content in evidence_files.items():
            (evdir / name).write_text(content, encoding="utf-8")
        ovr = write(tmp, "override.yaml", "version: 1.0\npending_decisions: []\n")
        out = Path(tmp) / "out.json"
        result = calc.compute(ypath, evdir, ovr, git_cmd, out)
        data = json.loads(out.read_text(encoding="utf-8"))
        return result, data

    def _fake_git(self, content):
        fake = write(tempfile.mkdtemp(), "git.sh", content)
        os.chmod(fake, 0o755)
        return str(fake)

    # ── A1: k3 pass + TTL 过期 → stale（真实数据 7-1 组的机制化）──

    def test_a1_k3_pass_ttl_expired_stale(self):
        old = (datetime.now() - timedelta(days=15)).strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(old, [{"acceptance_point": "1-1", "verdict": "pass"}])}
        _, data = self._run(ev)
        self.assertEqual(statuses(data)["1-1"], "stale",
                         "k3 pass 超 14 天 TTL 必须落 stale（与 machine 类同语义，CT-55）")

    # ── A2: k3 pass 新鲜 + modules 触及 → stale（D556 场景机制化）──

    def test_a2_k3_pass_modules_touched_stale(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(fresh, [{"acceptance_point": "1-1", "verdict": "pass"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ALWAYS_TOUCH))
        self.assertEqual(statuses(data)["1-1"], "stale",
                         "证据日期后绑定 modules 有变更 → stale（D572 G2 修复建议机制化）")

    # ── A3: k3 pass 新鲜 + 零触及 → verified（19-2/22-1 不误伤机制化）──

    def test_a3_k3_pass_fresh_untouched_verified(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(fresh, [{"acceptance_point": "1-1", "verdict": "pass"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ZERO_TOUCH))
        self.assertEqual(statuses(data)["1-1"], "verified",
                         "新鲜 + modules 无变更 → verified 保持（不误伤）")
        self.assertFalse([p for p in problems(data) if "1-1" in p],
                         "正常路径不得产生降级 problem")

    # ── A4: k3 fail → rejected，且不受 TTL/git 影响（负向短路保持在前）──

    def test_a4_k3_fail_rejected_short_circuit(self):
        old = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(old, [{"acceptance_point": "1-2", "verdict": "fail"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ALWAYS_TOUCH))
        self.assertEqual(statuses(data)["1-2"], "rejected",
                         "fail 短路在 freshness_gate 之前——负向裁决不被 TTL/git 改写")
        self.assertFalse([p for p in problems(data) if "1-2" in p],
                         "rejected 短路不得触发失效检测 problem")

    # ── A5: k3_only 点（1-8 型真 k3 复核点）──

    def test_a5a_k3_only_pass_ttl_expired_stale(self):
        old = (datetime.now() - timedelta(days=15)).strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(old, [{"acceptance_point": "1-3", "verdict": "pass"}])}
        _, data = self._run(ev)
        self.assertEqual(statuses(data)["1-3"], "stale",
                         "k3_only 点的 pass 同样过 freshness_gate（k3_only 出口接线证明）")

    def test_a5b_k3_only_pass_fresh_untouched_verified(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(fresh, [{"acceptance_point": "1-3", "verdict": "pass"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ZERO_TOUCH))
        self.assertEqual(statuses(data)["1-3"], "verified",
                         "k3_only 新鲜 pass → verified（接线不改变正常路径）")

    def test_a5c_k3_only_no_pass_pending(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(fresh, [{"acceptance_point": "1-1", "verdict": "pass"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ZERO_TOUCH))
        self.assertEqual(statuses(data)["1-3"], "pending_k3",
                         "k3_only 点无 k3 pass → 仍 pending_k3（D576 CT-53 语义保持）")

    # ── A6: 降级三连（铁律 24/31——全部显式 problems，不静默）──

    def test_a6a_invalid_date_pending_with_problem(self):
        ev = {"k3.json": k3_record("2026-13-99", [{"acceptance_point": "1-4", "verdict": "pass"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ZERO_TOUCH))
        self.assertEqual(statuses(data)["1-4"], "pending_k3",
                         "日期非法 → 无法判定新鲜 → pending_k3（不假绿不假黄）")
        self.assertTrue(any("1-4" in p and "日期格式非法" in p for p in problems(data)),
                         "日期非法必须显式登记 problems")

    def test_a6b_git_failure_pending_with_problem(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(fresh, [{"acceptance_point": "1-5", "verdict": "pass"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_FAIL))
        self.assertEqual(statuses(data)["1-5"], "pending_k3",
                         "git 失败 → 无法判定新鲜 → pending_k3（查不了 ≠ 没变过）")
        self.assertTrue(any("1-5" in p and "失效检测降级" in p for p in problems(data)),
                         "git 失败必须显式登记 problems")

    def test_a6c_missing_mapping_pending_with_problem(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        ev = {"k3.json": k3_record(fresh, [{"acceptance_point": "1-6", "verdict": "pass"}])}
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ZERO_TOUCH),
                            mini_yaml=D579_YAML_NO_MODULES)
        self.assertEqual(statuses(data)["1-6"], "pending_k3",
                         "映射缺失 → git 子检查无法执行 → pending_k3（spec §5.2 契约; "
                         "§7 A6③ 的 verified 表述与契约矛盾，CTO 2026-09-06 裁决按契约）")
        self.assertTrue(any("1-6" in p and "git 失效子检查未执行" in p for p in problems(data)),
                         "映射缺失必须显式登记 problems（不静默跳过）")

    # ── A7: 配对夹具——同一 yaml/假 git，变更前一 stale、变更后一 verified ──

    def test_a7_pairing_boundary_change(self):
        ev = {
            "k3old.json": k3_record("2026-08-30", [{"acceptance_point": "1-1", "verdict": "pass"}]),
            "k3new.json": k3_record("2026-09-02", [{"acceptance_point": "1-2", "verdict": "pass"}]),
        }
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_BOUNDARY),
                            mini_yaml=D579_YAML_PAIR)
        st = statuses(data)
        self.assertEqual(st["1-1"], "stale", "变更前的 k3 pass → stale")
        self.assertEqual(st["1-2"], "verified", "变更后的 k3 pass → verified")
        self.assertNotEqual(st["1-1"], st["1-2"], "配对证明: 同一机制只打早者")

    # ── A8: superseded_by 旧 pass 不参与 latest 判定（L139 语义 × freshness_gate）──

    def test_a8a_superseded_pass_does_not_drag_down(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        old = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        ev = {
            "k3live.json": k3_record(fresh, [{"acceptance_point": "1-1", "verdict": "pass"}]),
            "k3sup.json": k3_record(old, [{"acceptance_point": "1-1", "verdict": "pass",
                                           "superseded_by": "k3live"}]),
        }
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ZERO_TOUCH))
        self.assertEqual(statuses(data)["1-1"], "verified",
                         "被接替的旧 pass 不参与判定——新 pass 新鲜 → verified")

    def test_a8b_superseded_pass_does_not_rescue(self):
        fresh = datetime.now().strftime("%Y-%m-%d")
        old = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        ev = {
            "k3live.json": k3_record(old, [{"acceptance_point": "1-2", "verdict": "pass"}]),
            "k3sup.json": k3_record(fresh, [{"acceptance_point": "1-2", "verdict": "pass",
                                             "superseded_by": "later-record"}]),
        }
        _, data = self._run(ev, git_cmd=self._fake_git(FAKE_GIT_ZERO_TOUCH))
        self.assertEqual(statuses(data)["1-2"], "stale",
                         "在世的最新 pass（TTL 过期） governs——被接替的新记录不抢救")


if __name__ == "__main__":
    unittest.main(verbosity=2)
