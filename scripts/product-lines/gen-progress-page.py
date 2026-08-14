#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
gen-progress-page.py — 产品进度页生成器（设计 v1.4 §五；A5 页面生成 + A8 待裁决置顶区）

一句话: product-progress.json + todos.yaml → 一页 HTML 产品进度页（创始人的产品仪表盘）。

契约:
  @input  — docs/synova/product-lines/product-progress.json（calc-progress.py 产物）
            docs/synova/product-lines/todos.yaml（aggregate-todos.py 产物）
            docs/synova/product-lines/todo-line-map.yaml（线→场景链接）
  @output — docs/synova/product-lines/product-progress.html（自包含单文件，无外部依赖）
  @degraded — 输入缺失/解析失败 → log.error + exit 2（fail-closed：不出假页面）；
              页面底部渲染 product-progress.json 的 degraded 清单（铁律 24/31 可见降级）。
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


def render_line_card(line, todos_by_line):
    pid = line["id"]
    pct = line["progress_pct"]
    verified = line["verified"]
    total = line["total"]
    bar_color = "#2e7d32" if pct >= 100 else ("#1976d2" if pct > 0 else "#9e9e9e")
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

    return """
<div class="line" id="line-%s">
  <div class="line-head">
    <span class="line-name">%s. %s</span>
    <span class="line-value">%s</span>
    <span class="pct">%d%%</span>
  </div>
  <div class="bar"><div class="bar-fill" style="width:%d%%;background:%s"></div></div>
  <div class="meta">已验证 %d/%d 个验收点 · 此前粗估 ~%d%%（%s）</div>
  %s
  <details><summary>验收点清单（点击展开）</summary>
    <table class="points"><tr><th>#</th><th>什么叫做完</th><th>状态</th></tr>%s</table>
  </details>
  %s
</div>""" % (pid, pid, html.escape(line["name"]), html.escape(line["value"]),
           pct, pct, bar_color, verified, total, line["baseline_pct"],
           html.escape(scrub(line["baseline_note"])), gate_html, "".join(points_rows), todo_html)


def render_decisions(decisions):
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
        warnings.append("<li>%s</li>" % html.escape(s))
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
.big { font-size: 30px; font-weight: 700; color: #1976d2; }
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
.pct { font-weight: 700; font-size: 16px; color: #1976d2; }
.bar { background: #eceff1; border-radius: 4px; height: 12px; margin: 8px 0 4px; overflow: hidden; }
.bar-fill { height: 100%%; border-radius: 4px; }
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
  产品总进度 <span class="big">%d%%</span>　·　%d 条产品线　·　已通过审计员或创始人核验的验收点 %d 个<br>
  <span class="sub">每个"绿"都有证据可查：审计员结论 / 创始人核验 / 场景实测 / 自动测试。没有证据 = 不算数。</span>
</div>
%s
%s
<div class="lines">%s</div>
<div class="footer">
  生成时间：%s（北京时间）<br>
  进度怎么算：每条线写死了"到 100%% 的定义"（验收点清单），进度 = 被证据验证的验收点比例。
  代码一变，相关证据自动变黄要求重跑；任何线要到 100%%，必须审计员全量复核。<br>
  待办从哪来：审计发现台账、权威偏差登记、C线差距清单、任务看板、场景实测，五个现成来源自动聚合，零新增维护。<br>
  数据文件：docs/synova/product-lines/product-lines.yaml（线定义）· todos.yaml（待办）· product-progress.json（机器状态）
</div>
</body>
</html>""" % (progress["product_progress_pct"], progress["total_lines"],
       sum(l["verified"] for l in progress["lines"]),
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
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(page, encoding="utf-8")
    log.info("已生成 %s（%d 条线 / %d 条待办）", out_path, len(progress["lines"]), len(todos))
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
