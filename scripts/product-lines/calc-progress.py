#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
calc-progress.py — 产品进度计算器（设计 v1.4 §三/§五；A1 证据失效检测 + A4 进度重算）

一句话: 读 product-lines.yaml + 证据记录 → 按 §3.4 六态状态机算每条线进度 → product-progress.json。

契约:
  @input  — docs/synova/product-lines/product-lines.yaml（单一事实源）
            docs/synova/product-lines/evidence/*.json（证据记录，schema=1）
            docs/synova/product-lines/cockpit-override.yaml（待裁决清单，A8 源；缺失→degraded）
            docs/synova/project/26线-V1验收标准*.md（D850 新增，**只读一处**：取「证据」列
              = pending_wiring 的撤回标记，用于三档中的「写了没接」档；见文件头 D850 段。
              缺文件 → 该档 count=null + reason + degraded 登记，绝不猜 0）
            git 事实: git log --since=<证据日期> --name-only -- <线 modules>（A1 惰性失效）
  @output — docs/synova/product-lines/product-progress.json
            { generated_at, version, total_lines, lines_v1, lines_v2,
              buckets:{...},  # D850 顶层三档（每档带可复现命令；**无任何百分比字段**）
              deprecated_fields:{progress_pct: 原因},
              lines:[{id,name,progress_pct,progress_pct_deprecated,buckets,verified,total,
              baseline_pct, status_counts:{...}, k3_gate, points:[{id,desc,status,evidence_files,
              stale_reason}] }], decisions:[...], degraded:{...} }
  @degraded — yaml 解析失败 → log.error + exit 2（fail-closed，绝不静默猜）；
              单条证据记录损坏 → log.warn + 跳过该记录 + degraded.sources 登记（铁律 24/31）；
              V1 断言表缺失/不可读 → log.warn + 「写了没接」档置 null + degraded.sources 登记；
              git 不可用 → log.warn + 跳过失效检测 + degraded.git=true；
              ENOENT（证据目录尚不存在）= 正常默认（铁律 24），不告警不 degraded。
  @exit   — 0 成功；2 降级/失败（calc 本身不可用）

D850 口径变更（创始人 2026-09-20 裁定；权威 `docs/authority/产品完成度定义与推进总纲-20260918.md` §1.2
+ `docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md` §二 + `方案-项目度量-从声明驱动到事实驱动.md`
§四/§六）：**取消顶层百分数口径**（旧顶层进度字段已删除），改**三档离散计数**
（healthy / written_not_wired / missing + 显式其它态），每档带可复现命令；无法判定的档显式
`count: null` + 原因（禁猜 0）。线级 `progress_pct` **仅因兼容 win 域消费方**（`dsh/plugins/
synova-dashboards`、`dsh/plugins/task-board-adapter`）而保留，已标 deprecated，新消费方一律读 `buckets`。

六态状态机（§3.4）:
  uncommitted  ⚪ 未开始（git 无 / 无证据 / yaml 种子 uncommitted）
  failed       🔴 机器验证红（场景/测试证据 fail，或 yaml 种子 failed）
  pending_k3   🟡 待裁判（场景/测试绿但审计员未审——不计分）
  verified     🟢 已验证（审计员 pass 或创始人演示核验——计分）
  rejected     🔴 存疑/否决（审计员 fail——不计分，git 全绿也不算）
  stale        🟡 待重跑（证据过期 >14 天，或证据日期后相关代码有变更，A1）

诚实规则（§3.3 硬逻辑）:
  1. 无证据 = 未验证 = 不计分（yaml 里 status: verified 若无对应证据记录 → 降为 uncommitted 并告警）
  2. 场景/测试类证据: 日期后该线 modules 有 git 变更 → stale（自动失效，不继承旧绿）
  3. 线 100% 门槛: verified==total 且无 k3 线级复核（record_type=k3, acceptance_point="line:<id>", pass）
     → 进度封顶 99 + k3_gate="待审计员全量复核"（防最后 10% 烂尾）
     【D850 说明】该门槛仍生效，但只影响已 deprecated 的线级 `progress_pct`；三档口径下线级
     `k3_gate` 只作为 `buckets.healthy` 的旁注（健康数本身不依赖它）
  4. 百分比只显整数
     【D850 说明】第 4 条**已废止**：顶层百分比字段删除；线级 `progress_pct` 为兼容 win 域消费方
     保留并标 deprecated（见文件头 D850 段）。
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

# 兼容: 直接运行时从仓库任意目录也能定位；测试可 sys.path.insert 本目录后 import
try:
    import productline_yaml  # noqa: E402
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import productline_yaml  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("calc-progress")

# 兼容: 直接运行时从仓库任意目录也能定位
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

EVIDENCE_TTL_DAYS = 14  # 场景/测试类证据有效期（§3.2）

SIX_STATES = ("uncommitted", "failed", "pending_k3", "verified", "rejected", "stale")

# ── D850: 离散三档（取消顶层百分数口径）────────────────────────────
# 权威（引用必须全名 + 版本）:
#   ① `docs/authority/产品完成度定义与推进总纲-20260918.md` §1.2（v1，2026-09-18）
#      「共同报告方式：`N 个健康 / M 个写了没接 / K 个缺` —— **离散计数，不是百分比**」
#   ② `docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md` §二（v1.1，2026-09-19）
#   ③ `/Users/wane/山河研究院/99-综合/方案-项目度量-从声明驱动到事实驱动.md` §四（「每个数字必须带
#      一条可复现的命令。不能复现的数字，不上看板」）+ §六（静态检测实测 3/5=60%，不能当判定源）
# 创始人签字: `docs/synova/coordination/创始人裁定表-§6五项-20260920.md`（D850 = 离散健康计数）
BUCKETS_SCHEMA = "discrete-health-buckets/1"
BUCKETS_AUTHORITY = (
    "docs/authority/产品完成度定义与推进总纲-20260918.md §1.2（v1，2026-09-18）"
    " + docs/synova/coordination/验收标准-穿真实入口-v1-20260918.md §二（v1.1，2026-09-19）"
    " + 方案-项目度量-从声明驱动到事实驱动.md §四/§六（创始人授权引用）"
)

# D809 撤回标记（不是证据类型，是「点亮已撤回、等接线」的显式声明）——三档中「写了没接」的唯一源
WITHDRAWAL_KIND = "pending_wiring"
V1_DOD_GLOB = "docs/synova/project/26线-V1验收标准*.md"

# 「写了没接」档的 evidence_cmd = **独立源侧扫描**（不重跑本器、不读派生物）
_WITHDRAWN_CMD = """python3 - written_not_wired <<'PY'
import glob, re, sys
rows = [[c.strip() for c in l.strip().strip('|').split('|')]
        for l in open(sorted(glob.glob('docs/synova/project/26线-V1验收标准*.md'))[-1], encoding='utf-8')
        if re.match(r'^\\|\\s*\\d+-\\d+\\s*\\|', l)]
print('written_not_wired=%d' % sum(1 for r in rows if len(r) >= 5 and r[3] == 'pending_wiring'))
PY"""

# 「缺」档的判定源存在性探针（证明 null 的根据 = 无 implemented 机器可读源）
_MISSING_PROBE_CMD = """python3 - implemented <<'PY'
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


def rerun_evidence_cmd(json_path, field):
    """其余档的 evidence_cmd = **重跑本器**（源 = yaml + 证据记录 + V1 表撤回标记）后抽取该档。

    @input  — json_path:str（`buckets` 内的点分路径，如 'other_states.live_unverified'）
              field:str（档名，命令输出 `<field>=<count>`）
    @output — str（可直接交给 bash -c 的可复现命令）
    @contract — 重跑即「从权威输入重新派生」，**不读回派生物**（读回自己的输出不构成证据）。
    """
    return ("python3 scripts/product-lines/calc-progress.py --out /tmp/pp-evidence.json >/dev/null 2>&1 && "
            "python3 -c \"import json;d=json.load(open('/tmp/pp-evidence.json',encoding='utf-8'));"
            "v=d['buckets']['%s']['count'];print('%s=%%s' %% v)\"" % (json_path, field))


_MISSING_REASON = ("本仓无「implemented」机器可读源（yaml 与证据记录均无；而总纲 §1.2「缺」的"
                   "判定手段 = 代码检索，本口径禁用 grep 型静态判据）→ 显式 null，禁猜 0。"
                   "可复现依据 = 本档可复现命令输出 SOURCE_ABSENT")

_BUCKET_DEFS = {
    "healthy": ("总纲 §1.2「健康」（live && testedThroughEntry）的可判定代理：验收点六态 = verified"
                "（审计员 PASS 或创始人演示核验；机器绿但未审 ≠ 此档）"),
    "written_not_wired": ("总纲 §1.2「写了没接」（implemented=true, wired=false）：V1 断言表「证据」列"
                          "= pending_wiring 撤回标记（D809；显式声明，非 grep 静态判定）"),
    "missing": ("总纲 §1.2「缺」（implemented=false）：判定手段 = 代码检索；本口径禁用 grep 型静态判据"
                "（事实驱动 §六 实测 3/5=60%），且「无证据」≠「无实现」（诚实规则）"),
    "wired_broken": ("总纲 §1.2「接了跑不通」（wired=true, live=false）的可判定代理：六态 = failed"
                     "（机器验证红）或 rejected（审计员否决）——即该点被判定不成立"),
    "live_unverified": ("总纲 §1.2「能跑未验证」（live=true, testedThroughEntry=false）：六态 = pending_k3"
                        "（场景/测试绿但审计员未审）——单独成态，绝不并进健康"),
    "stale": ("六态 = stale（曾点亮但证据过期 >14 天，或证据日期后该线 modules 有代码变更）"
              "——五态之外的显式态，单列不并入任何档"),
    "state_unknown": ("残余：六态 = uncommitted（无证据 → 五态归属不可判定：缺 / 写了没接 / 接了跑不通"
                      "三选一，无机器可读源）；显式列出以闭合恒等式，不丢点"),
}


def build_buckets(status_counts, withdrawn_count, withdrawn_known, denominator, nested=False):
    """D850: 六态状态机 → **离散三档**（+ 显式其它态），每档带可复现命令；无法判定者 null + 原因。

    @input  — status_counts:dict[str,int]（六态计数，SIX_STATES 全键）
              withdrawn_count:int|None（本分母内的 D809 撤回点数；None = V1 断言表不可用）
              withdrawn_known:bool（撤回源是否可读）
              denominator:int|None（本口径的分母 = 验收点数；None = 未知）
              nested:bool（True = 线级 buckets，evidence_cmd 指 `lines[i].buckets.*`）
    @output — dict（schema discrete-health-buckets/1）：
                healthy / written_not_wired / missing（三档，互斥）
                + other_states{wired_broken, live_unverified, stale, state_unknown}
                + identity{expr, terms, null_terms, denominator, known_terms_sum, holds, note}
    @contract — 口径（照抄权威，不得自创）:
              healthy           ← 六态 verified
              written_not_wired ← V1 表撤回标记 ∩ 本分母的点（**优先级高于六态**：撤回是显式声明，
                                  比"无证据"更具体 → 从 state_unknown 中扣除，避免双计）
              missing           ← 判定手段 = 代码检索 → **null + 原因**（禁猜 0）
              wired_broken      ← failed + rejected
              live_unverified   ← pending_k3（能跑未验证；不得并进 healthy）
              stale             ← stale（显式单列）
              state_unknown     ← uncommitted − 撤回数
    @degraded — withdrawn_source 不可读 → written_not_wired/state_unknown = null + reason（禁猜 0）
    """
    verified = status_counts.get("verified", 0)
    failed = status_counts.get("failed", 0)
    rejected = status_counts.get("rejected", 0)
    pending = status_counts.get("pending_k3", 0)
    stale = status_counts.get("stale", 0)
    uncommitted = status_counts.get("uncommitted", 0)

    if not withdrawn_known:
        n_written = None
        n_unknown = None
        w_reason = ("撤回源不可读：D809 撤回标记只存在于 V1 断言表「证据」列"
                    "（docs/synova/project/26线-V1验收标准*.md）；该文件缺失/不可读 → "
                    "「写了没接」与残余均不可判定，显式 null，禁猜 0")
    else:
        n_written = withdrawn_count
        n_unknown = uncommitted - withdrawn_count
        w_reason = None

    def entry(count, definition, source, cmd, reason=None):
        return {"count": count, "evidence_cmd": cmd, "definition": definition,
                "source": source, "reason": reason}

    pre = "lines[].buckets." if nested else ""
    buckets = {
        "schema": BUCKETS_SCHEMA,
        "authority": BUCKETS_AUTHORITY,
        "granularity": "acceptance_point(product-lines.yaml)",
        "denominator": denominator,
        "denominator_note": ("与 `docs/synova/project/ledger.json` 的 totals.buckets 分母不同"
                             "（此处 = product-lines.yaml 验收点数；账本 = V1 断言表条数）——"
                             "同名档不可跨件混读，各档自带 denominator"),
        "healthy": entry(
            verified, _BUCKET_DEFS["healthy"],
            "证据记录（六态状态机出口 verified）", rerun_evidence_cmd(pre + "healthy", "healthy")),
        "written_not_wired": entry(
            n_written, _BUCKET_DEFS["written_not_wired"],
            "V1 断言表「证据」列 = pending_wiring（D809 撤回标记）",
            _WITHDRAWN_CMD, reason=w_reason),
        "missing": entry(
            None, _BUCKET_DEFS["missing"],
            "判定手段 = 代码检索（本口径禁用；事实驱动 §六 实测静态检测 3/5=60%）",
            _MISSING_PROBE_CMD,
            reason=_MISSING_REASON,
        ),
        "other_states": {
            "wired_broken": entry(
                failed + rejected, _BUCKET_DEFS["wired_broken"],
                "证据记录（六态 failed + rejected）",
                rerun_evidence_cmd(pre + "other_states.wired_broken", "wired_broken")),
            "live_unverified": entry(
                pending, _BUCKET_DEFS["live_unverified"],
                "证据记录（六态 pending_k3）",
                rerun_evidence_cmd(pre + "other_states.live_unverified", "live_unverified")),
            "stale": entry(
                stale, _BUCKET_DEFS["stale"],
                "证据记录 + git（六态 stale）",
                rerun_evidence_cmd(pre + "other_states.stale", "stale")),
            "state_unknown": entry(
                n_unknown, _BUCKET_DEFS["state_unknown"],
                "product-lines.yaml 验收点 − 撤回集（六态 uncommitted）",
                rerun_evidence_cmd(pre + "other_states.state_unknown", "state_unknown"),
                reason=w_reason),
        },
    }
    terms = {
        "healthy": buckets["healthy"]["count"],
        "written_not_wired": buckets["written_not_wired"]["count"],
        "missing": buckets["missing"]["count"],
        "wired_broken": buckets["other_states"]["wired_broken"]["count"],
        "live_unverified": buckets["other_states"]["live_unverified"]["count"],
        "stale": buckets["other_states"]["stale"]["count"],
        "state_unknown": buckets["other_states"]["state_unknown"]["count"],
    }
    known_sum = sum(v for v in terms.values() if v is not None)
    buckets["identity"] = {
        "expr": ("healthy + written_not_wired + missing + wired_broken + live_unverified "
                 "+ stale + state_unknown = 验收点总数（denominator）"),
        "terms": sorted(terms),
        "null_terms": sorted(k for k, v in terms.items() if v is None),
        "known_terms_sum": known_sum,
        "holds": (denominator is not None and known_sum == denominator),
        "note": ("null 档不参与求和（归属不可判定，禁猜 0）；state_unknown 是显式残余，"
                 "故恒等式永远闭合——任何验收点都不会被静默丢弃"),
    }
    buckets["strict_source_absent"] = {
        "field": "testedThroughEntry / live / wired / implemented",
        "reason": ("总纲 §1.2 的**严格**五态（live && testedThroughEntry）无机器可读源（e2e 不在 CI，"
                   "第 0 项 P-3 未立项）。故 buckets.healthy 报的是六态 verified 口径的可判定代理，"
                   "不冒充严格健康数——数字与口径同时给出，读者可自行判定可信度"),
    }
    return buckets


def load_withdrawn_points(v1_dod_path):
    """D850: 读 V1 断言表「证据」列 = pending_wiring 的点集（D809 撤回标记）。

    @input  — v1_dod_path:Path|None（None = 未显式指定；调用方用 V1_DOD_GLOB 解析）
    @output — (points:set[str], error:str|None)
    @degraded — 文件缺失 / 不可读 / 零行解析 → (set(), 原因)；调用方置该档 null（**禁猜 0**）
    @contract — **只取一个字段**（撤回标记），不做任何交付度判定——判定仍归 gen-project-board.py；
                故本函数不构成「第二真相源」，只是把已冻结的 D809 标记接到看板上。
    """
    import glob as _glob
    path = Path(v1_dod_path) if v1_dod_path else None
    if path is None:
        found = sorted(_glob.glob(str(PROJECT_ROOT / V1_DOD_GLOB)))
        if not found:
            return set(), "V1 断言表缺失（未匹配 %s）" % V1_DOD_GLOB
        path = Path(found[-1])
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return set(), "V1 断言表缺失: %s" % path
    except OSError as e:
        return set(), "V1 断言表不可读: %s (%s)" % (path, e)
    points = set()
    rows = 0
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            continue
        cells = [c.strip() for c in stripped.strip("|").split("|")]
        if len(cells) < 5 or not re.match(r"^\d+-\d+$", cells[0]):
            continue
        rows += 1
        if cells[3] == WITHDRAWAL_KIND:
            points.add(cells[0])
    if rows == 0:
        return set(), "V1 断言表零行解析（格式变更？）: %s" % path
    return points, None



def load_yaml(path: Path):
    """解析 yaml；失败抛 YamlSubsetError（调用方决定 exit 2 fail-closed）。"""
    return productline_yaml.load_file(str(path))


def load_evidence_records(evidence_dir: Path):
    """读取证据记录。返回 (records, degraded_sources)。ENOENT=正常默认。"""
    records = []
    degraded = []
    if not evidence_dir.is_dir():
        return records, degraded
    for f in sorted(evidence_dir.glob("*.json")):
        if f.name == ".gitkeep":
            continue
        try:
            with open(f, "r", encoding="utf-8") as fh:
                rec = json.load(fh)
            if rec.get("schema") != 1:
                raise ValueError("schema != 1")
            if "record_type" not in rec or "date" not in rec or "verdicts" not in rec:
                raise ValueError("缺 record_type/date/verdicts 字段")
            # D576（CT-53）: 存量降级——redeem-progress 曾把任务闭环兑换冒充 record_type=k3
            # （一票翻绿假绿，K3 D572 实证 1-2）。识别特征 = note 含「自动兑换（redeem-progress.py）」，
            # 降级为 task_redeem（走 machine 路径），不改历史文件（加载时修正）。
            if rec.get("record_type") == "k3" and "自动兑换（redeem-progress.py）" in str(rec.get("note", "")):
                rec["record_type"] = "task_redeem"
                degraded.append("%s: 存量自动兑换证据降级 k3→task_redeem（假 k3 冒充修正，CT-53）" % f.name)
            records.append((f, rec))
        except (OSError, ValueError, json.JSONDecodeError) as e:
            log.warning("证据记录损坏，跳过: %s (%s)", f, e)
            degraded.append("证据记录损坏: %s (%s)" % (f.name, e))
    return records, degraded


def git_touched_after(modules, since_date: str, git_cmd: str):
    """证据日期之后，该线 modules 是否有提交（A1 惰性失效）。

    @input  — modules: 路径列表; since_date: YYYY-MM-DD; git_cmd: git 可执行（测试可注入）
    @output — (touched: bool, error: str|None)。git 失败 → touched=False + error 显式返回
              （绝不把"查不了"当"没变过"——fail-closed，调用方转 degraded）
    """
    if not modules:
        return False, None
    # CT-62: 证据时间戳粒度——at 全量 ISO datetime 直接用（同日验证不被当日提交误杀）；
    # date-only（YYYY-MM-DD）保持旧语义 T00:00:00（保守：当日提交算 touched）
    since = since_date if "T" in since_date else since_date + "T00:00:00"
    cmd = [git_cmd, "log", "--since=%s" % since, "--name-only", "--format=", "--"] + list(modules)
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30,
                              cwd=str(PROJECT_ROOT))
    except (OSError, subprocess.SubprocessError) as e:
        return False, "git 调用失败: %s" % e
    if proc.returncode != 0:
        return False, "git exit=%s: %s" % (proc.returncode, proc.stderr.strip()[:120])
    touched_files = {line.strip() for line in proc.stdout.splitlines() if line.strip()}
    if touched_files:
        return True, None
    return False, None


def freshness_gate(evidence_date, line_modules, git_cmd, today, pid, problems, evidence_at=None):
    """CT-55（D579）: 证据新鲜度门——k3 pass 与 machine 绿共用的失效判定。

    @input  — evidence_date: str YYYY-MM-DD（被检裁决/证据的日期）
              line_modules: list[str]（yaml 线级 modules，可空=映射缺失）
              git_cmd: str（测试可注入）; today: datetime
              pid: str（验收点 id，降级留痕用）; problems: list[str]（显式降级登记）
    @output — "fresh"   → 调用方落 verified（TTL 内 且 modules 无变更）
              "stale"  → 调用方落 stale（TTL 过期 或 证据日期后 modules 有变更）
              "unknown" → 调用方落 pending_k3 + 已登记 problem（日期非法 / git 不可用 /
                          modules 映射缺失——"无法判定新鲜" ≠ "判定过时"，不计分不假黄）
    @degraded — 日期非法 / git 调用失败 / 映射缺失 → problems 显式登记（铁律 24/31，不静默）
    @contract — TTL 复用 EVIDENCE_TTL_DAYS（L67）与 machine 路径同一比较语义（> N 天）；
                git 检测复用 git_touched_after（L106）；D572 G2 修复建议原文的机制化。
    """
    try:
        date_dt = datetime.strptime(evidence_date, "%Y-%m-%d")
    except ValueError:
        problems.append("点 %s 证据日期格式非法: %r" % (pid, evidence_date))
        return "unknown"
    if (today - date_dt).days > EVIDENCE_TTL_DAYS:
        return "stale"
    if not line_modules:
        problems.append("点 %s 线 modules 映射缺失，git 失效子检查未执行" % pid)
        return "unknown"
    # CT-62: at 时间戳优先（同日验证语义），缺省回退 date-only
    touched, err = git_touched_after(line_modules, evidence_at or evidence_date, git_cmd)
    if err:
        problems.append("点 %s 失效检测降级: %s" % (pid, err))
        return "unknown"
    if touched:
        return "stale"
    return "fresh"


def status_for_point(point, verdicts_by_point, line_modules, git_cmd, today, problems):
    """按六态状态机计算单个验收点的最终状态。"""
    pid = point["id"]
    verdicts = verdicts_by_point.get(pid, [])
    seed = point.get("status", "uncommitted")
    if seed not in SIX_STATES:
        problems.append("点 %s 非法 status 种子: %r" % (pid, seed))
        seed = "uncommitted"

    k3 = [v for v in verdicts if v["record_type"] == "k3" and not v.get("superseded_by")]
    demo = [v for v in verdicts if v["record_type"] == "founder_demo"]
    machine = [v for v in verdicts if v["record_type"] in ("scenario", "test", "ci", "task_redeem")]

    # D576（CT-53）: k3_only 点（desc 含「审计员复核」的每线收尾点）只有 k3 裁决能 verified——
    # 任务兑换/演示核验最高到 pending_k3（自我指认禁止，1-8 型，K3 D572 实证）。
    if point.get("k3_only"):
        if any(v["verdict"] == "fail" for v in k3):
            return "rejected"
        # D579（CT-55）: k3 pass 不再永久免疫失效检查——与 machine 类同语义。
        passes = [v for v in k3 if v["verdict"] == "pass"]
        if passes:
            latest = max(passes, key=lambda v: (v["date"], v.get("at") or ""))  # 最新 pass 裁决 governs 新鲜度
            gate = freshness_gate(latest["date"], line_modules, git_cmd, today, pid, problems, evidence_at=latest.get("at"))
            if gate == "stale":
                return "stale"
            if gate == "unknown":
                return "pending_k3"  # 降级语义见 spec §3.6 必答 1（自愈: git 恢复/映射补齐后回 verified）
            return "verified"
        return "pending_k3"

    # 审计员裁决最高优先（一票否决/一票通过）
    if any(v["verdict"] == "fail" for v in k3):
        return "rejected"
    # D579（CT-55）: 通用 k3 出口同构接线——pass 翻绿前必须过新鲜度门（D572 P1-1 闭环）。
    passes = [v for v in k3 if v["verdict"] == "pass"]
    if passes:
        latest = max(passes, key=lambda v: (v["date"], v.get("at") or ""))  # 最新 pass 裁决 governs 新鲜度
        gate = freshness_gate(latest["date"], line_modules, git_cmd, today, pid, problems, evidence_at=latest.get("at"))
        if gate == "stale":
            return "stale"
        if gate == "unknown":
            return "pending_k3"  # 降级语义见 spec §3.6 必答 1
        return "verified"

    # 创始人演示核验 = 里程碑证据
    if any(v["verdict"] == "pass" for v in demo):
        return "verified"

    if machine:
        latest = max(machine, key=lambda v: v["date"])
        if latest["verdict"] == "fail":
            return "failed"
        # 机器验证绿 → 待裁判；但先查失效（A1 + 14 天 TTL）
        try:
            date_dt = datetime.strptime(latest["date"], "%Y-%m-%d")
            if (today - date_dt).days > EVIDENCE_TTL_DAYS:
                return "stale"
        except ValueError:
            problems.append("点 %s 证据日期格式非法: %r" % (pid, latest["date"]))
            return "pending_k3"
        touched, err = git_touched_after(line_modules, latest["date"], git_cmd)
        if err:
            problems.append("点 %s 失效检测降级: %s" % (pid, err))
        if touched:
            return "stale"
        return "pending_k3"

    # 无证据: yaml 种子只允许 failed/rejected/uncommitted；verified 种子无证据 → 降级 + 告警
    if seed == "verified":
        problems.append("点 %s yaml 标 verified 但无证据记录——按诚实规则降为 uncommitted" % pid)
        return "uncommitted"
    if seed in ("failed", "rejected"):
        return seed
    return "uncommitted"


def compute(yaml_path, evidence_dir, override_path, git_cmd, out_path, v1_dod_path=None):
    spec = load_yaml(yaml_path)
    records, degraded_sources = load_evidence_records(evidence_dir)
    problems = []
    today = datetime.now()

    # D850: 撤回标记源（D809）——只读一处字段，用于三档中的「写了没接」档。
    # 缺失/不可读 → withdrawn_known=False → 该档与残余显式 null（**禁猜 0**）+ degraded 登记。
    withdrawn_points, withdrawn_err = load_withdrawn_points(v1_dod_path)
    withdrawn_known = withdrawn_err is None
    if withdrawn_err:
        log.warning("D850 撤回源不可读，「写了没接」档置 null（不静默）: %s", withdrawn_err)
        degraded_sources.append("D850 撤回标记源: %s" % withdrawn_err)

    # 证据索引: point id → verdict 列表
    verdicts_by_point = {}
    line_reviews = {}

    def _rel(f: Path) -> str:
        try:
            return str(f.relative_to(PROJECT_ROOT))
        except ValueError:
            return str(f)

    for f, rec in records:
        for v in rec.get("verdicts", []):
            ap = v.get("acceptance_point", "")
            if ap.startswith("line:"):
                line_reviews[ap.split(":", 1)[1]] = v
                continue
            verdicts_by_point.setdefault(ap, []).append({
                "record_type": rec["record_type"],
                "verdict": v.get("verdict"),
                "date": rec["date"],
                "record_path": _rel(f),
                "quote": v.get("quote", ""),
                "superseded_by": v.get("superseded_by"),
                "at": rec.get("at"),
            })

    # 待裁决清单（A8）
    decisions = []
    if override_path.is_file():
        try:
            ov = productline_yaml.load_file(str(override_path))
            decisions = ov.get("pending_decisions", []) or []
        except productline_yaml.YamlSubsetError as e:
            log.warning("cockpit-override.yaml 解析失败: %s", e)
            degraded_sources.append("cockpit-override.yaml 解析失败: %s" % e)
    else:
        degraded_sources.append("cockpit-override.yaml 不存在（待裁决区为空）")

    lines_out = []
    for line in spec.get("lines", []):
        points = line.get("acceptance_points", [])
        modules = line.get("modules", []) or []
        counts = {s: 0 for s in SIX_STATES}
        points_out = []
        for p in points:
            st = status_for_point(p, verdicts_by_point, modules, git_cmd, today, problems)
            counts[st] += 1
            evidence_files = [v["record_path"] for v in verdicts_by_point.get(p["id"], [])]
            points_out.append({
                "id": p["id"],
                "desc": p.get("desc", ""),
                "status": st,
                "evidence_files": evidence_files,
                "note": p.get("note", ""),
            })
        total = len(points)
        verified = counts["verified"]
        progress = round(verified / total * 100) if total else 0
        k3_gate = ""
        line_id = str(line["id"])
        if total and verified == total:
            review = line_reviews.get(line_id)
            if review and review.get("verdict") == "pass":
                k3_gate = "passed"
            else:
                progress = min(progress, 99)  # 线 100% 门槛（§3.3 规则 3）
                k3_gate = "pending"
        # D850: 线级三档（撤回标记按**本线点集**取交，故线级恒等式亦闭合）
        line_withdrawn = (len([p for p in points_out if p["id"] in withdrawn_points])
                          if withdrawn_known else 0)
        lines_out.append({
            "id": line["id"],
            "name": line.get("name", ""),
            "value": line.get("value", ""),
            "weight": float(line.get("weight", 1.0)),
            "baseline_pct": int(line.get("baseline_pct", 0)),
            "baseline_note": line.get("baseline_note", ""),
            "done_definition": line.get("done_definition", ""),
            "total": total,
            "verified": verified,
            # D850: 百分比口径已取消；本字段仅为兼容 win 域消费方而保留，**已 deprecated**
            "progress_pct": progress,
            "buckets": build_buckets(counts, line_withdrawn, withdrawn_known, total, nested=True),
            "k3_gate": k3_gate,
            "status_counts": counts,
            "points": points_out,
        })

    # D850: 顶层三档（取代旧顶层加权百分数；分母 = 全部验收点数）
    status_totals = {s: 0 for s in SIX_STATES}
    for l in lines_out:
        for s in SIX_STATES:
            status_totals[s] += l["status_counts"][s]
    line_point_ids = {p["id"] for l in lines_out for p in l["points"]}
    withdrawn_total = (len(line_point_ids & withdrawn_points) if withdrawn_known else 0)
    points_total = sum(l["total"] for l in lines_out)
    top_buckets = build_buckets(status_totals, withdrawn_total, withdrawn_known, points_total)

    # 面板线数（D850 追平）: yaml `lines` 条数 + `v2_lines` 条数（v2 线定义在同文件顶层，
    # 不在 lines 列表内，故必须显式计入——否则面板停在 28 而总纲口径是 29）
    v2_lines = [n for n in (spec.get("v2_lines") or []) if isinstance(n, str)]

    result = {
        "generated_at": today.strftime("%Y-%m-%d %H:%M:%S"),
        "version": "1.1",
        "total_lines": len(lines_out) + len(v2_lines),
        "lines_v1": len(lines_out),
        "lines_v2": v2_lines,
        "buckets": top_buckets,
        "deprecated_fields": {
            "lines[].progress_pct": ("D850 取消百分比口径（创始人 2026-09-20 裁定）。保留仅为兼容 "
                                     "win 域消费方 dsh/plugins/synova-dashboards 与 "
                                     "dsh/plugins/task-board-adapter；新消费方一律读 buckets。"
                                     "旧顶层进度字段已删除（破坏性变更，见 PR 遗留清单）"),
        },
        "lines": lines_out,
        "decisions": decisions,
        "degraded": {
            "sources": degraded_sources,
            "problems": problems,
            "git_check": "ok",
        },
    }
    if problems:
        result["degraded"]["git_check"] = "partial"

    # 幂等: 仅 generated_at 变化 → 不重写（防 CI 每跑一次就产生一条噪音提交/bot PR）
    payload = json.dumps(result, ensure_ascii=False, indent=2)
    if out_path.is_file():
        try:
            old = json.loads(out_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            old = None
        if isinstance(old, dict):
            old_norm = dict(old)
            old_norm["generated_at"] = result["generated_at"]
            if json.dumps(old_norm, ensure_ascii=False, indent=2) == payload:
                log.info("进度无变化（仅时间戳），不重写（幂等）")
                return result

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(payload + "\n")
    return result


def main():
    ap = argparse.ArgumentParser(description="产品进度计算（A1+A4）")
    ap.add_argument("--yaml", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-lines.yaml"))
    ap.add_argument("--evidence-dir", default=str(PROJECT_ROOT / "docs/synova/product-lines/evidence"))
    ap.add_argument("--override", default=str(PROJECT_ROOT / "docs/synova/product-lines/cockpit-override.yaml"))
    ap.add_argument("--out", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-progress.json"))
    ap.add_argument("--git-cmd", default="git", help="测试注入: 指向伪造 git 脚本")
    # D850: 撤回标记源（D809）——只读「证据」列，供三档中的「写了没接」档
    ap.add_argument("--v1-dod", default=None,
                    help="V1 断言表（默认 glob %s；缺失 → 该档 null + degraded）" % V1_DOD_GLOB)
    args = ap.parse_args()

    try:
        result = compute(Path(args.yaml), Path(args.evidence_dir), Path(args.override),
                         args.git_cmd, Path(args.out),
                         Path(args.v1_dod) if args.v1_dod else None)
    except productline_yaml.YamlSubsetError as e:
        log.error("YAML 解析失败: %s (retryable=%s) → exit 2（fail-closed，绝不静默）",
                  e, e.retryable)
        sys.exit(2)

    b = result["buckets"]
    log.info("三档离散（**无百分比**）: healthy=%s written_not_wired=%s missing=%s | "
             "live_unverified=%s wired_broken=%s stale=%s state_unknown=%s | "
             "线数 %s（v1 %s + v2 %s）| 待重跑 %s | 审计否决 %s",
             b["healthy"]["count"], b["written_not_wired"]["count"], b["missing"]["count"],
             b["other_states"]["live_unverified"]["count"],
             b["other_states"]["wired_broken"]["count"],
             b["other_states"]["stale"]["count"],
             b["other_states"]["state_unknown"]["count"],
             result["total_lines"], result["lines_v1"], len(result["lines_v2"]),
             b["other_states"]["stale"]["count"],
             sum(l["status_counts"]["rejected"] for l in result["lines"]))
    if result["degraded"]["sources"]:
        log.warning("degraded: %d 个数据源降级: %s", len(result["degraded"]["sources"]),
                    "; ".join(result["degraded"]["sources"][:3]))
    if result["degraded"]["problems"]:
        log.warning("degraded: 状态机问题 %d 处（详见 product-progress.json）",
                    len(result["degraded"]["problems"]))
    sys.exit(0)


if __name__ == "__main__":
    main()
