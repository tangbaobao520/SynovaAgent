#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""gen-project-board.py — D795 项目账本派生器（四视图数据源）

把 git 真相（task-state 卡片 + product-lines 定义 + 证据记录）派生为单一 JSON 账本，
供 D794「项目总览」插件渲染。**派生物，禁手工编辑**；真相永远在 git。

契约（铁律 47 — 先定义再实现）:
@input   — CLI 参数（全部只读，不写除 --out 外任何路径）:
             --repo-root      仓库根；默认 = 本脚本上两级目录
             --out            输出路径；默认 <repo-root>/docs/synova/project/ledger.json
             --today          覆盖"今天" YYYY-MM-DD；默认系统日期（测试注入缝，保确定性）
             --v1-dod         V1 断言表；默认 <root>/docs/synova/project/26线-V1验收标准*.md（取最新）
             --yaml           product-lines.yaml；默认 <root>/docs/synova/product-lines/product-lines.yaml
             --evidence-dirs  证据目录（可多次）；默认 产品证据 + golden-scenarios 证据**两处都算**
             --task-state-dir 任务卡目录；默认 <root>/task-state
             --pr-queue       D811 未合 PR 队列快照；默认 <root>/docs/synova/project/pr-queue.json
             --strict         降级时退出码非零（默认 0）
             --compact        单行 JSON（默认缩进 2）
@output  — <out> 处的 JSON 文件，schema "project-ledger/1"：
             schema / generated_by / generated_at / git_head / sources / degraded /
             degraded_sources / skipped_sources / totals / pr_queue / lines / tasks / blocked / timeline
             pr_queue（D811 旁路段）= 未合 PR 队列机械指标 + 超限告警 + 可关清单号码；
                                    快照缺失/损坏 → null + skipped_sources 登记（**不计 degraded**：
                                    旁路诊断物，不参与交付度分子分母；缺失不静默也不淹没真降级）。
                                    主提交路径**不读它、不跑它**——本器未被 pre-commit/pre-push 调用。
           totals（D850 口径变更，创始人 2026-09-20 裁定）**不含任何百分比字段**：
           v1_total / v1_passed / v1_verified / pending_k3 / backlog_points /
           freshness / blocked_count +
           buckets = **离散三档**（schema "discrete-health-buckets/1"）:
                     healthy / written_not_wired / missing + other_states{wired_broken,
                     live_unverified, state_unknown} + identity{...}，**每档带 evidence_cmd**
                     （源侧复算的可复现命令，不读本派生物）。无法从现有证据源判定的档
                     显式 `count: null` + `reason`（**禁猜 0**；恒等式由显式残余闭合，不丢点）。
           标准输出: 一行摘要（**离散计数，零百分比**）；诊断信息走 stderr（logging）
@exit    — 0  正常
             0  降级（默认）—— 文件**仍完整写出**，降级在带内（degraded:true），
                使 D794 永远拿得到可渲染的 JSON 而非 404
             1  --strict 且 degraded
             2  参数非法 / 输出不可写
@degraded— 两级显式，均不静默（铁律 24/31）:
             ① 输入级故障 → degraded_sources[] + degraded:true：
                文件/目录缺失、不可读、JSON 解析失败 —— 会让数字偏小且不可解释
             ② 记录级非证据 → skipped_sources[]，**不计 degraded**：
                JSON 合法但不含 verdicts（如 D524 自述式校验记录 record_type=d524-verify）。
                它本就不携带逐点裁决，没有可丢失的数字；若也标 degraded，真实仓库将永久红灯，
                真降级被淹没（告警疲劳）。skipped_sources 显式列出，不静默。
            受影响字段置 null，**禁止静默填 0**；ENOENT 与解析失败分别登记（不混为一谈）。
            git 不可用**不计降级**（git_head/timeline 属溯源信息，非 §B.2 声明的数据输入），
            但显式 log.warning，不静默。
@contract— 口径（派单 §B.3 + D850 口径变更，照抄不得自创）:
             交付度   = **已取消**（D850，创始人 2026-09-20 裁定：改「N 个健康 / M 个写了没接 /
                        K 个缺」离散计数，见文件头 D850 段与 totals.buckets）。
                        此前口径 = v1_passed / v1_total。分母仍 = V1 断言表条数（冻结 128，
                        变更走变更单）。**不得再加回任何 *_pct 字段。**
             断言通过 = ① 有证据（record_type 与断言声明的证据类型**匹配**）
                        ② 证据龄**不影响**通过判定 —— 保鲜只计数不扣交付度（09-17 口径）
                        多份匹配证据取主证据：最新日期优先，同日按优先级
                        k3 > test > scenario > founder-demo，再按路径稳定排序
             verified = 通过的断言中，另有 record_type=k3 的 PASS 裁决（K3 独立复核，禁自我审计）
             三档     = healthy（点亮且另有 k3 独立 PASS）/ written_not_wired（V1 表证据列
                        pending_wiring 撤回标记）/ missing（缺，判定手段=代码检索 → null + 原因）
                        + 显式其它态（live_unverified = 能跑未验证 / wired_broken / state_unknown）
                        互斥且完备；无法判定 → count:null + reason（禁猜 0）；恒等式由残余闭合
             保鲜     = 证据龄 ≤7🟢 / 8–14🟡 / >14🔴；只对"已通过"的断言分桶计数
             阻塞     = 仅当 blocked{reason,since,needs} 三要素齐全才计入；days = today - since
             backlog  = product-lines.yaml 验收点总数 - V1 断言数（V1 外不参与交付度）
             pending_wiring（D809 · 假绿回退，依据 K3 D808 审计 P0 B-02/B-05/B-06 未接线）:
               断言表「证据」列写 `pending_wiring` = 该点的点亮**已撤回，等接线完成**。
               判据（四条，缺一不可）:
                 ① fail-closed —— 永不与任何证据配对：即便仓库里存在 record_type=pending_wiring
                    的证据记录也**不点亮**（它不是证据类型，是撤回标记）
                 ② 不计入 v1_passed / v1_verified，也不进保鲜分桶（未点亮 = 无保鲜可言）
                 ③ 显式归类并计数 —— 断言级 status="pending_k3"，lines[].pending_k3 与
                    totals.pending_k3 记数（撤回要看得见，不能沉进「无证据」里）
                 ④ 反向可复原 —— 接线完成后把证据列改回真实证据类型（如 test），
                    下一轮派生自动恢复计分（撤回不是删除，判据源可回滚）
             断言 status 三态: passed（点亮）/ pending_k3（撤回待接线）/ pending（未点亮，无匹配证据）
@determinism — 同输入连续两次运行，除 generated_at / git_head 外逐键相等（测试组 ⑤）

红线: 不修改 calc-progress.py；不写回 product-lines.yaml；不碰 scripts/audit/**；零三方依赖。
"""

from __future__ import annotations

import argparse
import glob
import json
import logging
import re
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

LOG = logging.getLogger("gen-project-board")

SCHEMA = "project-ledger/1"
GENERATED_BY = "gen-project-board.py"

# 证据类型优先级（派单 §B.3）: k3 > test > scenario > founder-demo
EVIDENCE_PRIORITY = ("k3", "test", "scenario", "founder-demo")

# D809: 未接线撤回标记 —— 不是证据类型，是「点亮已撤回、等接线」的显式状态
# （依据 K3 D808 审计 P0 B-02/B-05/B-06 未接线；语义见文件头 @contract）
PENDING_WIRING_KIND = "pending_wiring"
PENDING_WIRING_STATUS = "pending_k3"

# 断言 status 三态（互斥，全量覆盖）
STATUS_PASSED = "passed"
STATUS_PENDING = "pending"

# 保鲜分桶边界（派单 §B.3）: ≤7 🟢 / 8–14 🟡 / >14 🔴
FRESH_GREEN_MAX_DAYS = 7
FRESH_YELLOW_MAX_DAYS = 14

# 冻结分母（v0.2 §三 变更单：125 → 128 = +2 由 backlog 提入 V1（20-5/25-6）+1 线26 新增（26-7），
# 依据 `docs/synova/project/26线-V1验收标准-v0.2-20260917.md` §三；元断言 M1–M5 不计入）。
# 仅作漂移告警，**不覆盖**从断言表解析出的实测值。
FROZEN_V1_TOTAL = 128

DEFAULT_EVIDENCE_RELS = (
    "docs/synova/product-lines/evidence",
    "scripts/golden-scenarios/evidence",
)

# ── D850: 离散三档（取消整体完成度百分数口径）─────────────────────────────
# 权威（引用必须全名 + 版本）:
#   ① `docs/authority/产品完成度定义与推进总纲-20260918.md` §1.2（v1，2026-09-18）
#      五态定义 + 「共同报告方式：`N 个健康 / M 个写了没接 / K 个缺` —— **离散计数，不是百分比**」
#   ② `docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md` §二（v1.1，2026-09-19）
#      五态的**判定手段**（缺 = 代码检索 / 写了没接 = 运行时不变量 / 接了跑不通 = 冒烟启动 /
#      能跑未验证 = e2e / 健康 = live && testedThroughEntry）
#   ③ `/Users/wane/山河研究院/99-综合/方案-项目度量-从声明驱动到事实驱动.md` §四
#      （「每个数字必须带一条可复现的命令。不能复现的数字，不上看板」）
#      + §六（L3 静态 grep 检测实测准确率 3/5 = 60% → 静态检测只能粗筛，**不能当判定源**）
# 创始人签字: `docs/synova/coordination/创始人裁定表-§6五项-20260920.md`（D850 = 离散健康计数）
BUCKETS_SCHEMA = "discrete-health-buckets/1"
BUCKETS_AUTHORITY = (
    "docs/authority/产品完成度定义与推进总纲-20260918.md §1.2（v1，2026-09-18）"
    " + docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md §二（v1.1，2026-09-19）"
    " + 方案-项目度量-从声明驱动到事实驱动.md §四/§六（创始人授权引用）"
)

# 源侧复算命令模板（`{field}` = 档名）——**不读派生物**，直接从权威源（V1 断言表 + 两处证据目录）
# 重算，故它是独立于本脚本实现的**可复现证据**（读回自己的输出不算证据）。
_EVIDENCE_RECOMPUTE = """python3 - {field} <<'PY'
import glob, json, re, sys
rows = [[c.strip() for c in l.strip().strip('|').split('|')]
        for l in open(sorted(glob.glob('docs/synova/project/26线-V1验收标准*.md'))[-1], encoding='utf-8')
        if re.match(r'^\\|\\s*\\d+-\\d+\\s*\\|', l)]
kinds = {r[0]: r[3] for r in rows if len(r) >= 5}
verdicts = {}
for d in ('docs/synova/product-lines/evidence', 'scripts/golden-scenarios/evidence'):
    for f in sorted(glob.glob(d + '/*.json')):
        try:
            rec = json.load(open(f, encoding='utf-8'))
        except (OSError, ValueError):
            continue
        if not isinstance(rec, dict):
            continue
        for v in rec.get('verdicts') or []:
            if isinstance(v, dict) and str(v.get('verdict', '')).lower() == 'pass' and v.get('acceptance_point'):
                verdicts.setdefault(str(v['acceptance_point']), set()).add(rec.get('record_type'))
lit = set(i for i, k in kinds.items() if k != 'pending_wiring' and k in verdicts.get(i, set()))
counts = {}
counts['healthy'] = sum(1 for i in lit if 'k3' in verdicts.get(i, set()))
counts['written_not_wired'] = sum(1 for k in kinds.values() if k == 'pending_wiring')
counts['live_unverified'] = sum(1 for i in lit if 'k3' not in verdicts.get(i, set()))
counts['v1_total'] = len(kinds)
counts['state_unknown'] = (counts['v1_total'] - counts['healthy']
                           - counts['written_not_wired'] - counts['live_unverified'])
print('%s=%s' % (sys.argv[1], counts[sys.argv[1]]))
PY"""

# 判定源存在性探针（`{field}` = 被判定的机器可读字段名）——用于**无法判定的档**：
# 它的输出是该档 `count: null` 的**可复现依据**（证明判定源缺席），而不是把 null 静默成 0。
_EVIDENCE_SOURCE_PROBE = """python3 - {field} <<'PY'
import glob, re, sys
name = sys.argv[1]
hits = []
for f in (sorted(glob.glob('docs/synova/product-lines/*.yaml'))
          + sorted(glob.glob('docs/synova/product-lines/evidence/*.json'))):
    try:
        txt = open(f, encoding='utf-8').read()
    except OSError:
        continue
    if re.search(r'(?m)^\\s*"?%s"?\\s*:' % name, txt):
        hits.append(f)
print('%s=%s' % (name, 'SOURCE_PRESENT' if hits else 'SOURCE_ABSENT'))
PY"""

# 档位定义文案（照抄权威语义，不自由发挥）
_DEF_HEALTHY = ("总纲 §1.2「健康」（live && testedThroughEntry）的可判定代理：断言已点亮，"
                "且另有 record_type=k3 的独立 PASS 裁决（K3 独立复核，禁自我审计）")
_DEF_WRITTEN = ("总纲 §1.2「写了没接」（implemented=true, wired=false）：V1 断言表「证据」列"
                "= pending_wiring 撤回标记（D809；显式声明，非 grep 静态判定）")
_DEF_MISSING = ("总纲 §1.2「缺」（implemented=false）：判定手段 = 代码检索；本口径禁用 grep 型"
                "静态判据（事实驱动 §六 实测 3/5=60%），且「无匹配证据」≠「无实现」（诚实规则）")
_DEF_WIRED_BROKEN = "总纲 §1.2「接了跑不通」（wired=true, live=false）：判定手段 = 冒烟启动"
_DEF_LIVE_UNVERIFIED = ("总纲 §1.2「能跑未验证」（live=true, testedThroughEntry=false）："
                        "断言已点亮但无独立 k3 复核——**单独成态，绝不并进健康**")
_DEF_STATE_UNKNOWN = ("残余：断言既未点亮、也非撤回标记 → 其五态归属不可判定"
                      "（缺 / 写了没接 / 接了跑不通 三选一，无机器可读源）；显式列出以闭合恒等式")


# ⓓ-4 命令语义（件内 schema 级说明，不只写在 docstring）：与 product-progress 件并列披露，
# 「复现强度不同」不得沉默偏离。
LEDGER_CMD_SEMANTICS = {
    "evidence_cmd": ("**源侧重算**（本档「那条命令」）：直接读权威输入（V1 断言表「证据」列 + 两处"
                     "证据目录的 record_type/verdict）重算该档同一个值，**不读 ledger.json**"
                     "（读回自己的输出不构成证据）。单档毫秒级，无需中间件。"),
    "artifact_selfcheck_cmd": ("本件**不提供**：ledger.json 各档 evidence_cmd 已是源侧重算，"
                               "不需要「读回派生物」的自查形态（宁缺勿造）。"),
    "regenerate_cmd": "**件级一次源侧重生成** → docs/synova/project/ledger.json。",
    "source_probe_cmd": "只服务 null 档：复现「为什么没有数字」（判定源缺席 = SOURCE_ABSENT）。",
    "independent_check_cmd": ("本件**不单列**：evidence_cmd 本身即不读派生件的独立判据"
                              "（同一形态承担两职，不是省略）。"),
    "reproducibility_strength": {
        "本件": "源侧重算、单档毫秒级、无中间件；与 product-progress 件的比对形态不同（那边因六态"
                "状态机无法内联表达，走「一次重算 + 逐档比对」）。",
    },
}


def _reason_no_source(what, how):
    """不可判定档的显式原因（**禁猜 0**：null 必须带可核原因）。"""
    return ("无机器可读判定源：总纲 §1.2 判定手段 = %s（%s），本仓无承载该判定的字段"
            "（yaml 与证据记录均无；可复现依据 = 本档 evidence_cmd 输出 SOURCE_ABSENT）" % (how, what))


# ── 通用工具 ──────────────────────────────────────────────────────────────

def parse_date(value):
    """把 'YYYY-MM-DD' 或 ISO 时间戳解析为 date；不可解析 → None（调用方决定降级）。"""
    if value is None:
        return None
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", str(value).strip())
    if not m:
        return None
    try:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None


def freshness_bucket(age_days):
    """证据龄 → 保鲜桶。@input age_days:int|None @output 'green'|'yellow'|'red'|None"""
    if age_days is None:
        return None
    if age_days <= FRESH_GREEN_MAX_DAYS:
        return "green"
    if age_days <= FRESH_YELLOW_MAX_DAYS:
        return "yellow"
    return "red"


def rel_to(path, root):
    """路径相对 root 展示（越界则原样），保证 sources 可读且幂等。"""
    try:
        return str(Path(path).resolve().relative_to(Path(root).resolve()))
    except (ValueError, OSError):
        return str(path)


def evidence_priority(kind):
    """优先级序号，越小越优先；未知类型排最后。"""
    return EVIDENCE_PRIORITY.index(kind) if kind in EVIDENCE_PRIORITY else len(EVIDENCE_PRIORITY)


# ── 输入解析（每块独立失败 → 独立降级，铁律 31）────────────────────────────

def resolve_v1_dod(root, explicit):
    """定位 V1 断言表。@return (Path|None, error:str|None)"""
    if explicit:
        p = Path(explicit)
        return (p, None) if p.is_file() else (None, "V1 断言表缺失: %s" % p)
    pattern = str(Path(root) / "docs" / "synova" / "project" / "26线-V1验收标准*.md")
    found = sorted(glob.glob(pattern))
    if not found:
        return None, "V1 断言表缺失（未匹配 %s）" % pattern
    return Path(found[-1]), None


def parse_v1_dod(path):
    """解析 V1 断言表。

    @input  — path:Path；格式 = '### 线N 名称' 分节 + '| ID | 断言 | verify | 证据 | fail_when |' 表
    @output — (lines:list[dict], total:int, error:str|None)；lines 按文档出现顺序
    @degraded — 文件缺失/不可读 → (lines, total, 原因)；调用方置 v1_total=null
    """
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return [], 0, "V1 断言表缺失: %s" % path
    except OSError as exc:
        return [], 0, "V1 断言表不可读: %s (%s)" % (path, exc)

    lines = []
    current = None
    for raw in text.splitlines():
        line = raw.rstrip()
        header = re.match(r"^###\s*线\s*(\d+)\s*(.*)$", line)
        if header:
            current = {"id": int(header.group(1)), "name": header.group(2).strip(), "assertions": []}
            lines.append(current)
            continue
        if current is None or not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 5:
            continue
        aid = cells[0]
        # 只认 'N-M' 形态的断言 ID——自动跳过表头/分隔行/总览表
        if not re.match(r"^\d+-\d+$", aid):
            continue
        kind = cells[3] if cells[3] in EVIDENCE_PRIORITY else (cells[3] or None)
        current["assertions"].append({
            "id": aid,
            "text": cells[1],
            "verify": cells[2],
            "kind": kind,
            "fail_when": cells[4],
        })

    if not lines:
        return [], 0, "V1 断言表解析为空（格式变更？）: %s" % path
    total = sum(len(ln["assertions"]) for ln in lines)
    if total == 0:
        return lines, 0, "V1 断言表零条断言（格式变更？）: %s" % path
    return lines, total, None


def load_product_lines(yaml_path):
    """解析 product-lines.yaml（复用仓内纯 Python 子集解析器，零三方依赖）。

    @input  — yaml_path:Path
    @output — (by_id:dict[int,dict], total_points:int, error:str|None)
    @degraded — 文件缺失 / YamlSubsetError → (by_id, 0, 原因)
    """
    if not yaml_path.is_file():
        return {}, 0, "product-lines.yaml 缺失: %s" % yaml_path
    product_lines_dir = Path(__file__).resolve().parent.parent / "product-lines"
    if str(product_lines_dir) not in sys.path:
        sys.path.insert(0, str(product_lines_dir))
    try:
        import productline_yaml  # noqa: E402  (复用仓内解析器，PyYAML 非可用依赖)
    except ImportError as exc:
        return {}, 0, "productline_yaml 不可导入: %s" % exc
    try:
        data = productline_yaml.load_file(str(yaml_path))
    except (OSError, ValueError) as exc:  # YamlSubsetError 继承 ValueError
        return {}, 0, "product-lines.yaml 解析失败: %s" % exc
    if not isinstance(data, dict) or not isinstance(data.get("lines"), list):
        return {}, 0, "product-lines.yaml 结构异常（缺 lines）: %s" % yaml_path

    by_id = {}
    total_points = 0
    for ln in data["lines"]:
        if not isinstance(ln, dict) or ln.get("id") is None:
            continue
        try:
            lid = int(ln["id"])
        except (TypeError, ValueError):
            continue
        points = ln.get("acceptance_points") or []
        total_points += len(points)
        by_id[lid] = {
            "name": ln.get("name"),
            "done_definition": ln.get("done_definition"),
            "points_total": len(points),
            "modules": [m for m in (ln.get("modules") or []) if isinstance(m, str)],
        }
    return by_id, total_points, None


def load_evidence(dirs):
    """读取两处证据目录。

    @input  — dirs:list[Path]
    @output — (records:list[(Path,dict)], degraded:list[str], skipped:list[str])
    @degraded — 目录缺失 / 文件不可读 / 坏 JSON → degraded（输入级故障，数字会偏小）
    @skipped  — JSON 合法但非 verdicts 记录 → skipped（记录级，不计 degraded；见文件头契约）
    """
    records = []
    degraded = []
    skipped = []
    for d in dirs:
        if not d.is_dir():
            degraded.append("证据目录缺失: %s" % d)
            continue
        for f in sorted(d.glob("*.json")):
            try:
                rec = json.loads(f.read_text(encoding="utf-8"))
            except FileNotFoundError:
                continue  # 扫描间隙被删 = 正常，不降级
            except OSError as exc:
                LOG.warning("证据文件不可读，跳过: %s (%s)", f, exc)
                degraded.append("证据文件不可读: %s (%s)" % (f.name, exc))
                continue
            except ValueError as exc:
                LOG.warning("证据文件坏 JSON，跳过: %s (%s)", f, exc)
                degraded.append("证据记录损坏(JSON): %s (%s)" % (f.name, exc))
                continue
            if not isinstance(rec, dict) or "verdicts" not in rec:
                LOG.warning("非 verdicts 证据记录（不计降级，已登记 skipped）: %s", f)
                skipped.append("非 verdicts 证据记录: %s (record_type=%s)"
                               % (f.name, (rec or {}).get("record_type") if isinstance(rec, dict) else "?"))
                continue
            records.append((f, rec))
    return records, degraded, skipped


def index_evidence(records):
    """把证据记录索引为 acceptance_point → 通过裁决列表。

    @input  — records:list[(Path,dict)]
    @output — dict[str, list[dict]]；每条 = {kind, date, path}
    """
    index = {}
    for path, rec in records:
        kind = rec.get("record_type")
        rec_date = parse_date(rec.get("date")) or parse_date(rec.get("at"))
        for verdict in rec.get("verdicts") or []:
            if not isinstance(verdict, dict):
                continue
            if str(verdict.get("verdict", "")).lower() != "pass":
                continue
            ap = verdict.get("acceptance_point")
            if not ap:
                continue
            index.setdefault(str(ap), []).append({
                "kind": kind,
                "date": rec_date,
                "path": str(path),
            })
    return index


def pick_primary(cands):
    """选主证据: 最新日期优先 → 同日按优先级 → 再按路径稳定排序（幂等）。"""
    return max(
        cands,
        key=lambda c: (
            c["date"] or date.min,
            -evidence_priority(c["kind"]),
            c["path"],
        ),
    )


def load_task_state(task_dir, today):
    """读取任务卡。@return (tasks:list[dict], blocked:list[dict], degraded:list[str])"""
    tasks = []
    blocked = []
    degraded = []
    if not Path(task_dir).is_dir():
        return [], [], ["task-state 目录缺失: %s" % task_dir]
    for f in sorted(Path(task_dir).glob("D*.json")):
        try:
            rec = json.loads(f.read_text(encoding="utf-8"))
        except FileNotFoundError:
            continue
        except OSError as exc:
            LOG.warning("任务卡不可读，跳过: %s (%s)", f, exc)
            degraded.append("任务卡不可读: %s (%s)" % (f.name, exc))
            continue
        except ValueError as exc:
            LOG.warning("任务卡坏 JSON，跳过: %s (%s)", f, exc)
            degraded.append("任务卡坏 JSON: %s (%s)" % (f.name, exc))
            continue
        if not isinstance(rec, dict):
            degraded.append("任务卡结构异常: %s" % f.name)
            continue

        blk = rec.get("blocked")
        blocked_obj = None
        if isinstance(blk, dict):
            reason = (blk.get("reason") or "").strip()
            since_raw = blk.get("since")
            needs = (blk.get("needs") or "").strip()
            since = parse_date(since_raw)
            # 三要素齐全才计入（派单 §B.3）——缺一即视为未申报，不静默补
            if reason and needs and since:
                blocked_obj = {
                    "reason": reason,
                    "since": since.isoformat(),
                    "needs": needs,
                    "days": (today - since).days,
                }
        updated = parse_date(rec.get("updated_at"))
        # 可选 line 绑定（口径外扩展字段）: 任务卡显式声明属于哪条线时，
        # 其阻塞才会进入 lines[].blocked —— 缺绑定则不臆测归属（宁缺勿造）
        line_raw = rec.get("line")
        try:
            line_id = int(line_raw) if line_raw is not None else None
        except (TypeError, ValueError):
            line_id = None
        task = {
            "id": rec.get("task_id") or f.stem,
            "title": rec.get("title"),
            "status": rec.get("status"),
            "owner": rec.get("owner"),
            "domain": rec.get("domain"),
            "depends_on": rec.get("depends_on") or [],
            "blocked": blocked_obj,
            "stale_days": (today - updated).days if updated else None,
            "updated_at": updated.isoformat() if updated else None,
            "_line": line_id,
        }
        tasks.append(task)
        if blocked_obj:
            entry = {"id": task["id"]}
            entry.update(blocked_obj)
            blocked.append(entry)

    tasks.sort(key=lambda t: str(t["id"]))
    blocked.sort(key=lambda b: str(b["id"]))
    return tasks, blocked, degraded


def git_head_sha(root):
    """当前 HEAD sha；git 不可用 → (None, 原因)。不计入 degraded（溯源信息，非数据输入）。"""
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=20,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return None, str(exc)
    if proc.returncode != 0:
        return None, (proc.stderr or "").strip() or "git exit %d" % proc.returncode
    sha = (proc.stdout or "").strip()
    return (sha, None) if sha else (None, "git rev-parse 返回空")


def git_first_commit(root, modules):
    """该线 modules 最早一次提交日期（timeline.actual.first_commit）；取不到 → None。"""
    if not modules:
        return None
    try:
        proc = subprocess.run(
            ["git", "-C", str(root), "log", "--format=%as", "--"] + [str(m) for m in modules],
            capture_output=True, text=True, timeout=60,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        LOG.debug("git log 失败（modules=%s）: %s", modules, exc)
        return None
    if proc.returncode != 0:
        LOG.debug("git log 非零退出（modules=%s）: %s", modules, (proc.stderr or "").strip())
        return None
    dates = [d.strip() for d in (proc.stdout or "").splitlines() if d.strip()]
    return dates[-1] if dates else None


# ── 派生主逻辑 ────────────────────────────────────────────────────────────

def load_pr_queue(path):
    """D811: 读未合 PR 队列快照（pr-queue-scan.py 产出）→ 账本旁路段。

    @return (pr_queue:dict|None, status:str)
             status ∈ "ok" / "missing" / "corrupt"
    @contract — 只做**瘦身投影**（指标 + 超限告警 + 可关清单号码），不把 46 条原始记录
                搬进账本（账本是渲染源，不是数据堆场）。
                快照缺失/损坏 → pr_queue=null + 显式进 skipped_sources，**不计 degraded**：
                它是**旁路诊断物**，不参与交付度分母/分子，缺了不会让任何数字偏小——
                若算 degraded，真实仓库会因"没跑过扫描"永久红灯（告警疲劳，铁律：不静默也不淹没）。
                字段缺失一律 None，**禁止静默填 0**。
    """
    p = Path(path)
    if not p.is_file():
        return None, "missing"
    try:
        raw = json.loads(p.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        LOG.warning("pr-queue 快照解析失败（旁路指标置空，不静默）: %s (%s)", p, exc)
        return None, "corrupt"
    m = raw.get("metrics") or {}
    if raw.get("schema") != "pr-queue-snapshot/1" or not isinstance(m, dict):
        LOG.warning("pr-queue 快照 schema 非法: %r（旁路指标置空）", raw.get("schema"))
        return None, "corrupt"
    closeable = [
        {"number": r.get("number"), "age_days": r.get("age_days"),
         "behind": r.get("behind"), "reasons": r.get("close_reasons") or []}
        for r in (raw.get("records") or []) if r.get("closeable")
    ]
    return {
        "source": rel_to(p, Path(path).parent.parent.parent),
        "generated_at": raw.get("generated_at"),
        "limit": raw.get("limit"),
        "queue_length": m.get("queue_length"),
        "over_limit": m.get("over_limit"),
        "oldest": m.get("oldest"),
        "behind_distribution": m.get("behind_distribution"),
        "behind_unknown": m.get("behind_unknown"),
        "ci_distribution": m.get("ci_distribution"),
        "closeable_count": m.get("closeable_count"),
        "closeable": closeable,
        "orphan_count": m.get("orphan_count"),
        "owner_conflicts": m.get("owner_conflicts"),
        "by_reason": m.get("by_reason"),
        "warning": raw.get("warning"),
        "scanner_degraded": bool(raw.get("degraded")),
    }, "ok"


def build_buckets(v1_total, v1_passed, v1_verified, v1_pending_k3):
    """D850: 把逐点判定折叠为**离散三档**（取代整体完成度百分数），每档自带可复现命令。

    @input  — v1_total:int|None（分母 = V1 断言表条数）
              v1_passed:int|None（已点亮 = 有匹配声明类型的 PASS 证据）
              v1_verified:int|None（其中另有 record_type=k3 独立 PASS 裁决者）
              v1_pending_k3:int|None（V1 表「证据」列 = pending_wiring 的撤回标记数）
    @output — dict，schema = "discrete-health-buckets/1":
                healthy / written_not_wired / missing            ← 三档（互斥）
                other_states{wired_broken, live_unverified, state_unknown} ← 显式列出，不丢点
                identity{expr, terms, null_terms, holds, denominator}      ← 恒等式（可机检）
                每档 = {count, evidence_cmd, definition, source, reason}
    @contract — 口径**照抄权威，不得自创**（见文件头 D850 段）:
                healthy           = 点亮 且 另有 k3 独立 PASS 裁决
                written_not_wired = V1 表证据列 pending_wiring（D809 撤回标记）
                missing           = 总纲「缺」→ 判定手段 = 代码检索 → **null + 原因**（禁猜 0）
                live_unverified   = 点亮但无独立核验 = 总纲「能跑未验证」（**不得并进 healthy**）
                wired_broken      = 总纲「接了跑不通」→ 判定手段 = 冒烟启动 → **null + 原因**
                state_unknown     = 残余（未点亮且非撤回）；显式列出 → 恒等式闭合，不丢点
    @degraded — v1_total 为 None（V1 断言表降级）→ 全部 count = None + reason（**绝不猜 0**）
    """
    if v1_total is None or v1_passed is None or v1_verified is None or v1_pending_k3 is None:
        degraded_reason = "上游降级：V1 断言表不可用 → 分母未知（不得静默猜 0，见文件头 @degraded）"
        n_healthy = n_written = n_live = n_unknown = None
        null_reason = {k: degraded_reason for k in
                       ("healthy", "written_not_wired", "missing",
                        "wired_broken", "live_unverified", "state_unknown")}
    else:
        n_healthy = v1_verified
        n_written = v1_pending_k3
        n_live = v1_passed - v1_verified
        n_unknown = v1_total - n_healthy - n_written - n_live
        null_reason = {
            "missing": _reason_no_source("缺（implemented=false）", "代码检索"),
            "wired_broken": _reason_no_source("接了跑不通（wired=true, live=false）", "冒烟启动"),
        }

    def entry(count, definition, source, cmd_field, probe=False, reason=None):
        tpl = _EVIDENCE_SOURCE_PROBE if probe else _EVIDENCE_RECOMPUTE
        return {
            "count": count,
            "evidence_cmd": tpl.replace("{field}", cmd_field),
            "definition": definition,
            "source": source,
            "reason": reason,
        }

    buckets = {
        "schema": BUCKETS_SCHEMA,
        "authority": BUCKETS_AUTHORITY,
        "granularity": "acceptance_point",
        "regenerate_cmd": ("python3 scripts/project/gen-project-board.py --out "
                           "docs/synova/project/ledger.json"),
        "cmd_semantics": LEDGER_CMD_SEMANTICS,
        "denominator": v1_total,
        "denominator_note": ("与 `docs/synova/product-lines/product-progress.json` 的顶层 buckets "
                             "分母不同（此处 = V1 断言表条数；该件 = product-lines.yaml 验收点数）——"
                             "同名档不可跨件混读，各档自带 denominator"),
        "healthy": entry(
            n_healthy, _DEF_HEALTHY,
            "V1 断言表（声明类型）+ 两处证据目录（record_type=k3 的 PASS 裁决）",
            "healthy", reason=null_reason.get("healthy")),
        "written_not_wired": entry(
            n_written, _DEF_WRITTEN,
            "V1 断言表「证据」列 = pending_wiring（D809 撤回标记）",
            "written_not_wired", reason=null_reason.get("written_not_wired")),
        "missing": entry(
            None, _DEF_MISSING,
            "判定手段 = 代码检索（本口径禁用；事实驱动 §六 实测静态检测 3/5=60%）",
            "implemented", probe=True, reason=null_reason["missing"]),
        "other_states": {
            "live_unverified": entry(
                n_live, _DEF_LIVE_UNVERIFIED,
                "V1 断言表 + 证据目录（点亮但无 k3 独立 PASS）",
                "live_unverified", reason=null_reason.get("live_unverified")),
            "wired_broken": entry(
                None, _DEF_WIRED_BROKEN,
                "判定手段 = 冒烟启动（本仓无该判定的机器可读源）",
                "wired", probe=True, reason=null_reason["wired_broken"]),
            "state_unknown": entry(
                n_unknown, _DEF_STATE_UNKNOWN,
                "V1 断言表 + 证据目录（既未点亮、也非撤回标记）",
                "state_unknown", reason=null_reason.get("state_unknown")),
        },
    }
    terms = {
        "healthy": buckets["healthy"]["count"],
        "written_not_wired": buckets["written_not_wired"]["count"],
        "missing": buckets["missing"]["count"],
        "wired_broken": buckets["other_states"]["wired_broken"]["count"],
        "live_unverified": buckets["other_states"]["live_unverified"]["count"],
        "state_unknown": buckets["other_states"]["state_unknown"]["count"],
    }
    known_sum = sum(v for v in terms.values() if v is not None)
    buckets["identity"] = {
        "expr": ("healthy + written_not_wired + missing + wired_broken + live_unverified "
                 "+ state_unknown = v1_total"),
        "terms": sorted(terms),
        "null_terms": sorted(k for k, v in terms.items() if v is None),
        "denominator": v1_total,
        "known_terms_sum": known_sum,
        "holds": (v1_total is not None and known_sum == v1_total),
        "note": ("null 档不参与求和（其归属不可判定，禁猜 0）；state_unknown 是显式残余，"
                 "故恒等式永远闭合——任何点都不会被静默丢弃。"
                 "边界（队长 2026-09-20 裁定）：本恒等式**只保证完备性**"
                 "（丢点会显形为 state_unknown），**不保证各档归类正确**——归类正确性由"
                 "tests/project/*.test.sh 与各档 evidence_cmd/判定源探针负责；"
                 "它是自洽性检查，不是正确性证据"),
    }
    buckets["strict_source_absent"] = {
        "field": "testedThroughEntry / live / wired / implemented",
        "reason": ("总纲 §1.2 的**严格**五态（live && testedThroughEntry）无机器可读源：e2e 不在 CI"
                   "（第 0 项 P-3 未立项）。故 buckets.healthy 报的是「独立核验通过」口径的可判定代理，"
                   "不冒充严格健康数——数字与口径同时给出，读者可自行判定可信度"),
    }
    return buckets


def build_ledger(args):
    """组装账本 dict。@return (ledger:dict, degraded:bool)"""
    root = Path(args.repo_root).resolve()
    today = parse_date(args.today) if args.today else date.today()
    degraded_sources = []

    # ① V1 断言表（分母来源）
    v1_path, v1_err = resolve_v1_dod(root, args.v1_dod)
    if v1_err:
        degraded_sources.append(v1_err)
        v1_lines, v1_total = [], None
    else:
        v1_lines, v1_total, v1_err = parse_v1_dod(v1_path)
        if v1_err:
            degraded_sources.append(v1_err)
            v1_total = None
        elif v1_total != FROZEN_V1_TOTAL:
            # 分母冻结（派单 §B.3）: 只告警不覆盖实测值——冻结是治理属性，不是隐藏数字
            LOG.warning("V1 分母漂移: 实测 %d ≠ 冻结 %d（改动需走变更单）", v1_total, FROZEN_V1_TOTAL)

    # ② product-lines.yaml（线名 / done_definition / backlog 底数）
    yaml_path = Path(args.yaml) if args.yaml else root / "docs/synova/product-lines/product-lines.yaml"
    pl_by_id, pl_total_points, pl_err = load_product_lines(yaml_path)
    if pl_err:
        degraded_sources.append(pl_err)
        pl_total_points = None

    # ③ 任务卡
    task_dir = Path(args.task_state_dir) if args.task_state_dir else root / "task-state"
    tasks, blocked, ts_degraded = load_task_state(task_dir, today)
    degraded_sources.extend(ts_degraded)

    # ④ 证据（两处都算）
    ev_dirs = [Path(d) for d in args.evidence_dirs] if args.evidence_dirs \
        else [root / r for r in DEFAULT_EVIDENCE_RELS]
    records, ev_degraded, ev_skipped = load_evidence(ev_dirs)
    degraded_sources.extend(ev_degraded)
    ev_index = index_evidence(records)

    # ④-b D811: 未合 PR 队列旁路指标（读扫描器快照；缺/坏 → skipped_sources，不计 degraded）
    pq_path = Path(args.pr_queue) if args.pr_queue else root / "docs/synova/project/pr-queue.json"
    pr_queue, pq_status = load_pr_queue(pq_path)
    if pq_status != "ok":
        ev_skipped.append("pr_queue 快照%s: %s（旁路指标置空，不影响交付度）"
                          % ("缺失" if pq_status == "missing" else "损坏", rel_to(pq_path, root)))

    # ⑤ git 溯源（非数据输入 → 不降级，但显式告警）
    head_sha, head_err = git_head_sha(root)
    if head_err:
        LOG.warning("git 不可用，git_head/timeline 置空（不计 degraded）: %s", head_err)

    # ⑥ 逐线逐断言判定
    totals_fresh = {"green": 0, "yellow": 0, "red": 0}
    v1_passed = 0
    v1_verified = 0
    v1_pending_k3 = 0
    out_lines = []

    for ln in v1_lines:
        lid = ln["id"]
        meta = pl_by_id.get(lid, {})
        line_fresh = {"green": 0, "yellow": 0, "red": 0}
        assertions = []
        line_passed = 0
        line_verified = 0
        line_pending_k3 = 0

        for a in ln["assertions"]:
            # D809: pending_wiring = 撤回标记，不是证据类型 → 短路配对（fail-closed，见文件头 @contract）
            pending_wiring = a["kind"] == PENDING_WIRING_KIND
            cands = [] if pending_wiring else ev_index.get(a["id"], [])
            matched = [] if pending_wiring else (
                [c for c in cands if c["kind"] == a["kind"]] if a["kind"] else [])
            ok = bool(matched)
            primary = pick_primary(matched) if matched else None
            age_days = (today - primary["date"]).days if (primary and primary["date"]) else None
            bucket = freshness_bucket(age_days) if ok else None
            # verified = 通过 且 另有 k3 独立复核 PASS（禁自我审计）
            verified = bool(ok and any(c["kind"] == "k3" for c in cands))
            status = PENDING_WIRING_STATUS if pending_wiring else (STATUS_PASSED if ok else STATUS_PENDING)

            if ok:
                line_passed += 1
                v1_passed += 1
                if bucket:
                    line_fresh[bucket] += 1
                    totals_fresh[bucket] += 1
            if verified:
                line_verified += 1
                v1_verified += 1
            if pending_wiring:
                line_pending_k3 += 1
                v1_pending_k3 += 1

            assertions.append({
                "id": a["id"],
                "text": a["text"],
                "verify": a["verify"],
                "kind": a["kind"],
                "ok": ok,
                "status": status,
                "evidence": [rel_to(c["path"], root) for c in matched],
                "age_days": age_days,
                "freshness": bucket,
                "fail_when": a["fail_when"],
            })

        # 线级阻塞: 任务卡显式绑定 line 且三要素齐全（缺绑定 = 不臆测归属）
        line_blocked = []
        for t in tasks:
            if t["blocked"] and t.get("_line") == lid:
                line_blocked.append(dict(t["blocked"]))

        out_lines.append({
            "id": lid,
            "name": meta.get("name") or ln["name"],
            "done_definition": meta.get("done_definition"),
            "v1_total": len(ln["assertions"]),
            "v1_passed": line_passed,
            "v1_verified": line_verified,
            "pending_k3": line_pending_k3,
            "points_total": meta.get("points_total"),
            "freshness": line_fresh,
            "blocked": line_blocked,
            "assertions": assertions,
        })

    # ⑦ timeline（每线 modules 最早提交日；git 不可用 → 全 null，D794 显示"待数据"）
    timeline = []
    for ln in v1_lines:
        modules = pl_by_id.get(ln["id"], {}).get("modules") or []
        timeline.append({
            "line": ln["id"],
            "milestone": None,
            "planned_week": None,
            "actual": {
                "dispatched": None,
                "first_commit": git_first_commit(root, modules) if head_sha else None,
                "merged": None,
                "audited": None,
            },
        })

    # 剥离内部字段 `_line`——它只用于线级阻塞归属，不进输出 schema
    for t in tasks:
        t.pop("_line", None)

    totals = {
        "v1_total": v1_total,
        "v1_passed": v1_passed if v1_total is not None else None,
        "v1_verified": v1_verified if v1_total is not None else None,
        # D809: 撤回待接线点数（不计 passed；撤回要看得见，见文件头 @contract）
        "pending_k3": v1_pending_k3 if v1_total is not None else None,
        # D850: 百分比口径已取消（旧的两个顶层百分比字段已删除）——创始人 2026-09-20 裁定，
        #       改三档离散计数（每档带可复现命令）。**不得再加回任何 *_pct 字段。**
        "buckets": build_buckets(
            v1_total,
            v1_passed if v1_total is not None else None,
            v1_verified if v1_total is not None else None,
            v1_pending_k3 if v1_total is not None else None,
        ),
        "freshness": totals_fresh,
        "blocked_count": len(blocked),
        "backlog_points": (pl_total_points - v1_total)
                          if (pl_total_points is not None and v1_total is not None) else None,
    }

    ledger = {
        "schema": SCHEMA,
        "generated_by": GENERATED_BY,
        "generated_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "git_head": head_sha,
        "sources": {
            "yaml": rel_to(yaml_path, root) if yaml_path.is_file() else None,
            "v1_dod": rel_to(v1_path, root) if v1_path else None,
            "evidence_dirs": [rel_to(d, root) for d in ev_dirs],
        },
        "degraded": bool(degraded_sources),
        "degraded_sources": degraded_sources,
        "skipped_sources": ev_skipped,
        "totals": totals,
        "pr_queue": pr_queue,
        "lines": out_lines,
        "tasks": tasks,
        "blocked": blocked,
        "timeline": timeline,
    }
    return ledger, bool(degraded_sources)


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="D795 项目账本派生器 — 把 git 真相派生为 ledger.json（禁手工编辑）")
    parser.add_argument("--repo-root", default=str(Path(__file__).resolve().parent.parent.parent))
    parser.add_argument("--out")
    parser.add_argument("--today")
    parser.add_argument("--v1-dod")
    parser.add_argument("--yaml")
    parser.add_argument("--task-state-dir")
    parser.add_argument("--pr-queue")
    parser.add_argument("--evidence-dirs", nargs="*")
    parser.add_argument("--strict", action="store_true")
    parser.add_argument("--compact", action="store_true")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s", stream=sys.stderr)

    if args.today and not parse_date(args.today):
        LOG.error("--today 非法（需 YYYY-MM-DD）: %s", args.today)
        return 2

    root = Path(args.repo_root).resolve()
    out_path = Path(args.out) if args.out else root / "docs/synova/project/ledger.json"

    try:
        ledger, degraded = build_ledger(args)
    except Exception as exc:  # 兜底: 绝不让宿主拿到半截账本而不自知（铁律 11/24）
        LOG.error("派生失败（未捕获异常）: %s", exc, exc_info=True)
        return 2

    try:
        out_path.parent.mkdir(parents=True, exist_ok=True)
        payload = json.dumps(ledger, ensure_ascii=False, sort_keys=False,
                             indent=None if args.compact else 2)
        out_path.write_text(payload + ("\n" if not args.compact else ""), encoding="utf-8")
    except OSError as exc:
        LOG.error("输出不可写: %s (%s)", out_path, exc)
        return 2

    if not args.quiet:
        t = ledger["totals"]
        b = t["buckets"]
        # D850: 摘要行改**离散三档**（零百分比）——口径单源，不留百分比后门
        print("ledger.json → %s | v1_total=%s v1_passed=%s v1_verified=%s | "
              "healthy=%s written_not_wired=%s missing=%s | "
              "live_unverified=%s wired_broken=%s state_unknown=%s | "
              "freshness=%s blocked=%s degraded=%s"
              % (out_path, t["v1_total"], t["v1_passed"], t["v1_verified"],
                 b["healthy"]["count"], b["written_not_wired"]["count"], b["missing"]["count"],
                 b["other_states"]["live_unverified"]["count"],
                 b["other_states"]["wired_broken"]["count"],
                 b["other_states"]["state_unknown"]["count"],
                 t["freshness"], t["blocked_count"], ledger["degraded"]))
        for reason in ledger["degraded_sources"]:
            print("  ⚠ degraded: %s" % reason, file=sys.stderr)
        # D811: 队列超限是**告警不是阻断**（DSH 决策镜头原则⑤：诊断旁路，不拦主路径）
        pq = ledger.get("pr_queue")
        if pq and pq.get("warning"):
            print(pq["warning"])
        elif pq and pq.get("over_limit"):
            print("⚠️ 未合 PR 队列超限：%s > %s —— 先退役再开新 PR"
                  % (pq.get("queue_length"), pq.get("limit")))

    if degraded and args.strict:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
