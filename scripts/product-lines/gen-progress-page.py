#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-progress-page.py — 产品进度页生成器（设计 v1.4 §五；A5 页面生成 + A8 待裁决置顶区）

一句话: product-progress.json + todos.yaml → 一页 HTML 产品进度页（创始人的产品仪表盘）。

契约:
  @input  — docs/synova/product-lines/product-progress.json（calc-progress.py 产物；D850 起含顶层
            `buckets` 三档 + 线级 `buckets`；旧顶层进度字段已删除）
            docs/synova/product-lines/todos.yaml（aggregate-todos.py 产物）
            docs/synova/product-lines/todo-line-map.yaml（线→场景链接）
  @output — docs/synova/product-lines/product-progress.html（自包含单文件，无外部依赖）
            D850：面板**零百分比** —— 头部渲染「N 条产品线 + 三档离散计数 + 每档可复现命令」，
            线级卡片改行级三档 chips，「无法判定」的档显示原因（禁显示 0 冒充）。
  @degraded — 输入缺失/解析失败 → log.error + exit 2（fail-closed：不出假页面）；
              页面底部渲染 product-progress.json 的 degraded 清单（铁律 24/31 可见降级）；
              缺 `buckets` 段 → 头部渲染显式缺失提示（不静默留白）。
  @exit   — 0 成功；2 降级/失败

语言红线（创始人驾驶舱）:
  - 页面自有文案零术语: 不出现 D#、P0/P1/P2、git hash、门禁组号；
    D# → "任务编号 N"；P0→严重问题 / P1→优先改进 / P2→可选；审计报告→审计员结论。
  - 来自数据源的待办标题做轻度术语映射（sentinel→监测项、manifest→配置表等），
    映射不改变证据含义，来源字段保留原文可追溯。
"""
from __future__ import annotations

import argparse
import html
import json
import logging
import re
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

try:
    import productline_yaml  # noqa: E402
except ImportError:  # pragma: no cover
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import productline_yaml  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger("gen-progress-page")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# ─── 六态 → 大白话标签与颜色 ─────────────────────────────────────────────
STATE_UI = {
    "verified":    ("🟢 已验证", "#2e7d32"),
    "pending_k3":  ("🟡 待审计员确认", "#f9a825"),
    "stale":       ("🟡 待重跑", "#f9a825"),
    "failed":      ("🔴 有问题", "#c62828"),
    "rejected":    ("🔴 被审计员否决", "#c62828"),
    "uncommitted": ("⚪ 未开始", "#9e9e9e"),
}

PRIORITY_UI = {"P0": ("严重问题", "#c62828"), "P1": ("优先改进", "#ef6c00"), "P2": ("可选", "#6d4c41")}

# ─── 术语映射（设计 v1.4 §3.4 术语映射表 + 常见技术词 → 大白话） ────────
JARGON_MAP = [
    ("sentinel", "监测项"),
    ("compute", "计算"),
    ("ontology", "企业画像"),
    ("manifest", "配置表"),
    ("fail-open", "静默放行"),
    ("cron", "定时任务"),
    ("cash-runway", "现金流跑道"),
    ("direction-monitor", "方向监测"),
    ("feedback-collector", "反馈收集"),
    ("middle-evolution", "进化中间层"),
    ("AgentMemoryStore", "记忆库"),
    ("aggregate", "聚合"),
    ("degraded", "降级"),
    ("critical", "严重告警"),
]


def scrub(text: str) -> str:
    """轻度术语映射（不改证据含义；来源字段保留原文）。"""
    out = text
    for src, dst in JARGON_MAP:
        out = out.replace(src, dst)
    out = re.sub(r"\bD(\d{3})\b", r"任务编号 \1", out)
    out = re.sub(r"\bGS-(\d{2})\b", r"实测场景 \1", out)
    out = re.sub(r"\bK3\b", "审计员", out)
    out = re.sub(r"\bP0\b", "严重问题", out)
    out = re.sub(r"\bP1\b", "优先改进", out)
    out = re.sub(r"\bP2\b", "可选", out)
    return out


def evidence_label(files):
    """证据文件 → 证据类型标签（大白话）。"""
    labels = []
    for f in files:
        name = Path(f).name
        if "k3" in name or "audit" in name:
            labels.append("审计员结论")
        elif "founder" in name or "demo" in name:
            labels.append("创始人核验")
        elif "ci" in name:
            labels.append("自动测试")
        elif "scenario" in name or "GS-" in name:
            labels.append("场景实测")
        else:
            labels.append("证据记录")
    return sorted(set(labels))


# ─── D850: 离散三档渲染（面板零百分比）────────────────────────────────────
# 权威: `docs/authority/产品完成度定义与推进总纲-20260918.md` §1.2（v1，2026-09-18）
#       「N 个健康 / M 个写了没接 / K 个缺 —— 离散计数，不是百分比」
#       + `方案-项目度量-从声明驱动到事实驱动.md` §四（每个数字必须带一条可复现的命令）
# 三档中文标签（创始人驾驶舱零术语：不出现 D# / P0/P1/P2 / 门禁组号）
BUCKET_UI = [
    ("healthy", "健康", "#2e7d32"),
    ("written_not_wired", "写了没接", "#ef6c00"),
    ("missing", "缺", "#c62828"),
]
OTHER_STATE_UI = [
    ("live_unverified", "能跑未验证"),
    ("wired_broken", "接了跑不通"),
    ("stale", "曾通过待重跑"),
    ("state_unknown", "归属待定"),
]


def fmt_bucket_count(entry):
    """档计数 → 大白话（null 显示「无法判定」，**禁止显示 0** 冒充；原因单独成行渲染）。"""
    if not isinstance(entry, dict):
        return "—"
    c = entry.get("count")
    if c is None:
        return "无法判定"
    return str(c)


def bucket_chips(buckets):
    """线级三档一行摘要（离散计数，零百分比）。"""
    if not isinstance(buckets, dict):
        return ""
    chips = []
    for key, label, color in BUCKET_UI:
        e = buckets.get(key) or {}
        c = e.get("count")
        txt = "无法判定" if c is None else "%d" % c
        chips.append("<span class='chip' style='color:%s'>%s %s</span>"
                     % (color, label, txt))
    return "　·　".join(chips)


def render_buckets(buckets):
    """全局三档表：每档 = 计数 + 口径定义 + **可复现命令**（页面即真相：数字与命令同屏）。"""
    if not isinstance(buckets, dict) or not buckets:
        return ('<div class="degraded"><b>⚠️ 三档数据缺失：</b>'
                'product-progress.json 无 buckets 段（先跑 calc-progress.py）</div>')
    rows = []
    for key, label, color in BUCKET_UI:
        e = buckets.get(key) or {}
        cmd = html.escape(e.get("evidence_cmd") or "")
        why = e.get("reason")
        probe = e.get("source_probe_cmd")
        probe_html = ("<div class='bkt-why'>「无判定源」这一步的复现依据（点开可跑）：</div>"
                      "<pre class='bkt-cmd'>%s</pre>" % html.escape(probe)) if probe else ""
        why_html = ("<div class='bkt-why'>为什么「无法判定」：%s</div>"
                    % html.escape(scrub(why))) if why else ""
        self_cmd = e.get("artifact_selfcheck_cmd")
        self_html = ("<div class='bkt-why'>快速自查（读<u>已提交</u>文件，毫秒级；"
                     "<b>不承担可证伪职责</b>）：</div><pre class='bkt-cmd'>%s</pre>"
                     % html.escape(self_cmd)) if self_cmd else ""
        rows.append(
            "<div class='bkt'>"
            "<div class='bkt-head'><b style='color:%s'>%s</b> "
            "<span class='bkt-cnt'>%s</span></div>"
            "<div class='bkt-def'>%s</div>%s%s"
            "<div class='bkt-why'>复现该数字（<b>源侧重算</b>并与提交件逐档比对；"
            "需先跑下方「整件重生成命令」）：</div>"
            "<pre class='bkt-cmd'>%s</pre>%s"
            "</div>" % (color, label, html.escape(fmt_bucket_count(e)),
                        html.escape(scrub(e.get("definition") or "")), why_html, probe_html,
                        cmd, self_html))
    other = buckets.get("other_states") or {}
    others = []
    for key, label in OTHER_STATE_UI:
        e = other.get(key) or {}
        c = e.get("count")
        others.append("<span class='chip'>%s %s</span>"
                      % (label, "无法判定" if c is None else c))
    ident = buckets.get("identity") or {}
    denom = buckets.get("denominator")
    note = buckets.get("denominator_note") or ""
    regen = buckets.get("regenerate_cmd") or ""
    sem = buckets.get("cmd_semantics") or {}
    sem_html = ""
    if sem:
        strength = sem.get("reproducibility_strength") or {}
        strength_txt = "；".join("%s：%s" % (k, v) for k, v in strength.items())
        sem_html = ("<div class='bkt-sum'><b>命令语义（词义不可互顶）：</b>"
                    "① <b>源侧重算</b> = 每个数字那条命令；② <b>读回自查</b> = 毫秒级核对，"
                    "<b>不承担可证伪职责</b>；③ <b>判定源探针</b> = 只服务「无法判定」的档。"
                    "复现强度：%s</div>" % html.escape(scrub(strength_txt)))
    regen_html = ("<div class='bkt-sum'>整件重生成命令（源侧一次派生，上面每档的数字都由它产出）："
                  "<pre class='bkt-cmd'>%s</pre></div>" % html.escape(regen)) if regen else ""
    return (
        "<div class='buckets'>%s"
        "<div class='bkt-others'><b>其它状态（显式列出，不并进「健康」、不丢点）：</b>%s</div>"
        "<div class='bkt-sum'>各档之和 + 显式其它状态 = 验收点总数 %s（恒等式%s）。%s</div>%s"
        "</div>" % ("".join(rows), "　·　".join(others),
                    html.escape(str(denom)),
                    "成立" if ident.get("holds") else "**未成立——数据源异常，请勿采信**",
                    html.escape(scrub(note)), regen_html + sem_html))


def render_line_card(line, todos_by_line):
    pid = line["id"]
    verified = line["verified"]
    total = line["total"]
    # D850: 面板不再渲染任何百分比（含线级）——改离散三档（每档带可复现命令）
    lb = line.get("buckets") or {}
    gate_html = ""
    if line["k3_gate"] == "pending":
        gate_html = ('<div class="gate">⚠️ 差最后一关：这条线全部验收点已通过，'
                     '但必须由审计员全量复核后才算 100%（防烂尾）</div>')
    elif line["k3_gate"] == "passed":
        gate_html = '<div class="gate ok">✅ 审计员全量复核通过</div>'

    points_rows = []
    for p in line["points"]:
        label, color = STATE_UI.get(p["status"], (p["status"], "#9e9e9e"))
        ev = evidence_label(p["evidence_files"])
        ev_html = ("<span class='ev'>证据：%s</span>" % "、".join(ev)) if ev else ""
        note_html = ("<span class='note'>%s</span>" % html.escape(scrub(p["note"]))) if p["note"] else ""
        points_rows.append(
            "<tr><td>%s</td><td>%s</td><td><b style='color:%s'>%s</b> %s%s</td></tr>" % (
                p["id"], html.escape(scrub(p["desc"])), color, label, ev_html, note_html))

    todos = todos_by_line.get(pid, [])
    todo_html = ""
    if todos:
        items = []
        for t in todos:
            plabel, pcolor = PRIORITY_UI.get(t.get("priority", "P1"), (t.get("priority", ""), "#6d4c41"))
            items.append(
                "<li><b style='color:%s'>%s</b> · %s <span class='who'>（%s · 来自%s）</span>"
                "<div class='accept'>做完标准：%s</div></li>" % (
                    pcolor, plabel, html.escape(scrub(t.get("title", ""))),
                    html.escape(t.get("owner", "")), html.escape(scrub(t.get("source", ""))),
                    html.escape(scrub(t.get("acceptance", "")))))
        todo_html = ("<div class='todos'><b>还差 %d 件事：</b><ul>%s</ul></div>"
                     % (len(todos), "".join(items)))
    else:
        todo_html = "<div class='todos none'>暂无待办（好事）</div>"

    buckets_html = ('<div class="line-buckets">%s</div>' % bucket_chips(lb)) if lb else ""
    return """
<div class="line" id="line-%s">
  <div class="line-head">
    <span class="line-name">%s. %s</span>
    <span class="line-value">%s</span>
  </div>
  %s
  <div class="meta">验收点 %d 个，其中经独立核验通过 %d 个</div>
  %s
  <details><summary>验收点清单（点击展开）</summary>
    <table class="points"><tr><th>#</th><th>什么叫做完</th><th>状态</th></tr>%s</table>
  </details>
  %s
</div>""" % (pid, pid, html.escape(line["name"]), html.escape(line["value"]),
           buckets_html, total, verified, gate_html, "".join(points_rows), todo_html)


def render_decisions(decisions):
    # 只渲染仍待裁决的项（status == open）。已裁决项保留在 cockpit-override.yaml 作历史，
    # 但不得再出现在「需要创始人拍板」置顶区——否则创始人会看到已经拍过板的问题（2026-09-12
    # 实证：D-1/D-2 标 resolved 后页面仍显示，CTO 交付复核抓出）。
    decisions = [d for d in (decisions or []) if (d.get("status") or "open") == "open"]
    if not decisions:
        return ""
    cards = []
    for d in decisions:
        options = []
        sug = d.get("suggestion") or {}
        sug_label = sug.get("label", "")
        for o in d.get("options", []):
            mark = " <b class='sug'>建议</b>" if o.get("label") == sug_label else ""
            options.append("<li>○ %s — %s%s</li>" % (html.escape(o.get("label", "")),
                                                     html.escape(o.get("note", "")), mark))
        sug_html = ""
        if sug:
            sug_html = "<div class='suggestion'>建议：<b>%s</b>。理由：%s</div>" % (
                html.escape(sug_label), html.escape(sug.get("reason", "")))
        ctx = d.get("context", "")
        cards.append("""
<div class="decision">
  <div class="d-title">⚖️ %s</div>
  %s
  <ul class="d-options">%s</ul>
  %s
</div>""" % (html.escape(d.get("title", "")), ("<div class='d-ctx'>%s</div>" % html.escape(ctx)) if ctx else "",
           "".join(options), sug_html))
    return "<div class='decisions'><h2>需要创始人拍板（今天只做这些，每项 30 秒）</h2>%s</div>" % "".join(cards)


def render_degraded(degraded):
    warnings = []
    for s in degraded.get("sources", [])[:5]:
        # 术语零泄漏（创始人驾驶舱红线）：降级来源会带 task-D396.json 这类文件名 →
        # 必须与其它区块同样过 scrub（2026-09-12 复核发现本区漏 scrub，页面泄漏 5 处内部编号）
        warnings.append("<li>%s</li>" % html.escape(scrub(s)))
    if degraded.get("problems"):
        warnings.append("<li>状态判定异常 %d 处（详见 product-progress.json）</li>" % len(degraded["problems"]))
    if not warnings:
        return ""
    return ("<div class='degraded'><b>⚠️ 数据源降级（页面据此标注，不静默）：</b><ul>%s</ul></div>"
            % "".join(warnings))


def render_page(progress, todos, generated_at):
    todos_by_line = {}
    for t in todos:
        todos_by_line.setdefault(t.get("line"), []).append(t)

    lines_html = "".join(render_line_card(l, todos_by_line) for l in progress["lines"])
    decisions_html = render_decisions(progress.get("decisions", []))
    degraded_html = render_degraded(progress.get("degraded", {}))

    page = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Synova 产品进度 — 创始人驾驶舱</title>
<style>
body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
       max-width: 960px; margin: 0 auto; padding: 16px; color: #222; background: #fafafa; }
h1 { font-size: 22px; margin: 8px 0; }
.sub { color: #666; font-size: 13px; margin-bottom: 16px; }
.header-box { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px;
              padding: 14px 16px; margin-bottom: 16px; }
.big { font-size: 20px; font-weight: 700; color: #1976d2; }
.buckets { margin-top: 10px; }
.bkt { border-top: 1px solid #eee; padding: 8px 0; }
.bkt-head { font-size: 15px; }
.bkt-cnt { font-weight: 700; font-size: 18px; margin-left: 8px; }
.bkt-def { color: #666; font-size: 12px; margin: 3px 0; }
.bkt-why { color: #8d6e63; font-size: 12px; margin: 3px 0; }
.bkt-cmd { background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 4px;
           padding: 6px 8px; margin: 4px 0; font-size: 11px; line-height: 1.35;
           max-height: 96px; overflow: auto; white-space: pre-wrap; word-break: break-all; }
.bkt-others { margin-top: 8px; font-size: 13px; color: #555; }
.bkt-sum { margin-top: 6px; font-size: 12px; color: #777; }
.chip { font-size: 12px; color: #555; }
.line-buckets { margin: 6px 0 2px; font-size: 13px; }
.decisions { background: #fff8e1; border: 1px solid #ffe082; border-radius: 8px;
             padding: 12px 16px; margin-bottom: 16px; }
.decisions h2 { font-size: 16px; margin: 4px 0 8px; }
.decision { margin: 10px 0; padding: 8px; background: #fffde7; border-radius: 6px; }
.d-title { font-weight: 700; }
.d-ctx { color: #666; font-size: 13px; margin: 4px 0; }
.d-options { margin: 4px 0 2px 18px; padding: 0; }
.suggestion { color: #2e7d32; font-size: 13px; margin-top: 4px; }
.sug { color: #2e7d32; }
.line { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px;
        padding: 12px 16px; margin-bottom: 12px; }
.line-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.line-name { font-weight: 700; font-size: 16px; }
.line-value { color: #555; font-size: 13px; flex: 1; }
.meta { color: #777; font-size: 12px; }
.gate { background: #fff3e0; border-left: 4px solid #ef6c00; padding: 6px 8px;
        margin: 8px 0; font-size: 13px; }
.gate.ok { background: #e8f5e9; border-left-color: #2e7d32; }
details { margin-top: 8px; }
summary { cursor: pointer; color: #1976d2; font-size: 13px; }
table.points { width: 100%%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
table.points td, table.points th { border: 1px solid #eee; padding: 4px 6px; text-align: left; vertical-align: top; }
.ev { color: #2e7d32; font-size: 11px; }
.note { color: #888; font-size: 11px; display: block; margin-top: 2px; }
.todos { margin-top: 8px; font-size: 13px; }
.todos ul { margin: 4px 0 0 18px; padding: 0; }
.todos li { margin-bottom: 6px; }
.todos .none { color: #2e7d32; }
.who { color: #999; font-size: 11px; }
.accept { color: #666; font-size: 12px; margin-top: 2px; }
.degraded { background: #ffebee; border: 1px solid #ef9a9a; border-radius: 8px;
            padding: 10px 16px; margin-bottom: 16px; font-size: 13px; }
.footer { color: #999; font-size: 12px; margin-top: 20px; line-height: 1.6; }
</style>
</head>
<body>
<h1>Synova 产品完成度</h1>
<div class="sub">页面即真相：不推送、不摘要，打开即见最新。本页由脚本自动生成，人工不手改。</div>
<div class="header-box">
  <b class="big">%d 条产品线</b>　·　<b>离散计数，不是百分比</b>
  <span class="sub">（口径：产品完成度定义与推进总纲-20260918.md §1.2 —— 「N 个健康 / M 个写了没接 / K 个缺」）</span><br>
  %s
  <span class="sub">每个数字都带一条可复现命令：命令跑出来是什么，就是什么。不能复现的数字，不上看板。
  每个"绿"都有证据可查：审计员结论 / 创始人核验 / 场景实测 / 自动测试。没有证据 = 不算数。</span>
</div>
%s
%s
<div class="lines">%s</div>
<div class="footer">
  生成时间：%s（北京时间）<br>
  数字怎么算：每条线写死了"做完的定义"（验收点清单）。看板**不用百分数** —— 改报离散三档：
  N 个健康 / M 个写了没接 / K 个缺，每档都附一条可复现命令（页面头部，可自行跑一遍）。
  无法从现有证据判定的档，页面显示「无法判定」并写明原因，**不猜 0**；
  其余状态（能跑未验证 / 接了跑不通 / 曾通过待重跑 / 归属待定）单独列出，既不并进"健康"，也不丢点。
  代码一变，相关证据自动变黄要求重跑；任何线要判为整线通过，必须审计员全量复核。<br>
  待办从哪来：审计发现台账、权威偏差登记、C线差距清单、任务看板、场景实测，五个现成来源自动聚合，零新增维护。<br>
  数据文件：docs/synova/product-lines/product-lines.yaml（线定义）· todos.yaml（待办）· product-progress.json（机器状态）
</div>
</body>
</html>""" % (progress["total_lines"], render_buckets(progress.get("buckets") or {}),
       decisions_html, degraded_html, lines_html, generated_at)
    return page


def generate(progress_path, todos_path, map_path, out_path):
    if not progress_path.is_file():
        log.error("product-progress.json 不存在: %s（先跑 calc-progress.py）", progress_path)
        sys.exit(2)
    try:
        progress = json.loads(progress_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as e:
        log.error("product-progress.json 解析失败: %s → exit 2", e)
        sys.exit(2)

    todos = []
    if todos_path.is_file():
        try:
            data = productline_yaml.load_file(str(todos_path))
            todos = data.get("todos", []) or []
            manual = data.get("manual") or []
            # 人工微调覆盖: 同 id 以 manual 为准
            manual_by_id = {t.get("id"): t for t in manual if isinstance(t, dict)}
            merged = []
            for t in todos:
                mid = t.get("id")
                if mid in manual_by_id:
                    merged.append(manual_by_id.pop(mid))
                else:
                    merged.append(t)
            merged.extend(manual_by_id.values())
            todos = merged
        except productline_yaml.YamlSubsetError as e:
            log.warning("todos.yaml 解析失败: %s（页面待办区为空）", e)
    else:
        log.warning("todos.yaml 不存在（页面待办区为空）")

    page = render_page(progress, todos, progress.get("generated_at", ""))
    if out_path.is_file() and out_path.read_text(encoding="utf-8") == page:
        log.info("页面无变化，不重写（幂等）")
        return page
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(page, encoding="utf-8")
    log.info("已生成 %s（%s 条产品线 / %d 条待办；零百分比）",
             out_path, progress.get("total_lines", len(progress["lines"])), len(todos))
    return page


def main():
    ap = argparse.ArgumentParser(description="产品进度页生成（A5+A8）")
    ap.add_argument("--progress", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-progress.json"))
    ap.add_argument("--todos", default=str(PROJECT_ROOT / "docs/synova/product-lines/todos.yaml"))
    ap.add_argument("--map", default=str(PROJECT_ROOT / "docs/synova/product-lines/todo-line-map.yaml"))
    ap.add_argument("--out", default=str(PROJECT_ROOT / "docs/synova/product-lines/product-progress.html"))
    args = ap.parse_args()
    generate(Path(args.progress), Path(args.todos), Path(args.map), Path(args.out))
    sys.exit(0)


if __name__ == "__main__":
    main()
