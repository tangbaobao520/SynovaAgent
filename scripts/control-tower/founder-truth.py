#!/usr/bin/env python3
"""
founder-truth.py — 创始人真相采集器（零信任控制台 L1 物理层 MVP，D419）

一句话：对每个任务，用 git/CI 物理事实核验"agent 声称的完成"是否属实——
        不信任任何 agent 自报，只信 git 提交 / 分支合并 / CI 状态。

契约 (铁律 47):
  @input  — 无参（读 task-state/ + git + 可选 CI API）；
            --offline 跳过 CI 网络调用（纯 git 物理事实）
  @output — 创始人可读的"任务真相"对照（stdout + 可写文件）；
            每任务: 声称状态 vs 物理验证（提交/合并/CI）→ 红绿灯判定
  @exit   — 0 = 全部声称与物理一致；1 = 有"声称但物理不支撑"（疑似忽悠）；
            2 = 采集失败/降级
  @degraded — git/CI 不可用 → 对应维度标 degraded（不静默当真）
设计公理 (零信任): 数据源只有 git log / git merge-base / CI API——物理事实。
        task-state.json 的人工 status 字段只是"待验证的声称"，不作为真相。
"""
import json
import re
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent.parent
TASK_STATE = REPO / "task-state"


def sh(cmd):
    """跑 shell，返回 (rc, stdout)。失败不抛（降级由调用方处理）。"""
    try:
        r = subprocess.run(cmd, capture_output=True, text=True, cwd=REPO, timeout=30)
        return r.returncode, r.stdout
    except Exception:
        return -1, ""


def git_committed_dns():
    """物理事实: 全部提交标题里出现的 D#（impl 证据）+ 已进 origin/main 的 D#（合并证据）。"""
    rc, log = sh(["git", "log", "--all", "--format=%s"])
    if rc != 0:
        return None, None  # git 不可用 → degraded
    committed = set()
    for line in log.splitlines():
        m = re.search(r"\(D(\d{3})\)", line)
        if m:
            committed.add(int(m.group(1)))
    rc2, mainlog = sh(["git", "log", "origin/main", "--format=%s"])
    merged = set()
    if rc2 == 0:
        for line in mainlog.splitlines():
            m = re.search(r"\(D(\d{3})\)", line)
            if m:
                merged.add(int(m.group(1)))
    return committed, merged


def collect(offline=False):
    """采集每个任务的 声称 status vs 物理验证。返回 (rows, git_ok)。"""
    committed, merged = git_committed_dns()
    git_ok = committed is not None
    rows = []
    if not TASK_STATE.exists():
        return rows, git_ok
    for p in sorted(TASK_STATE.glob("*.json")):
        if p.name == "TEMPLATE.json":
            continue
        try:
            d = json.loads(p.read_text(encoding="utf-8", errors="replace"))
        except Exception:
            continue
        tid = d.get("task_id", p.stem)
        m = re.search(r"D(\d{3})", tid)
        num = int(m.group(1)) if m else None
        claimed = d.get("status", "?")
        # 物理验证
        if not git_ok:
            phys = "degraded"
        elif num in merged:
            phys = "已提交且进 main"
        elif num in committed:
            phys = "已提交未进 main"
        else:
            phys = "无提交记录"
        rows.append({"id": tid, "title": (d.get("title") or "")[:20],
                     "claimed": claimed, "phys": phys})
    return rows, git_ok


def judge(claimed, phys):
    """判定红绿灯: 声称状态 vs 物理证据是否支撑。"""
    if phys == "degraded":
        return "🟡", "物理核验降级（git 不可用），待复核"
    if claimed in ("impl_done", "audited"):
        if phys == "已提交且进 main":
            return "🟢", "声称与物理一致"
        if phys == "已提交未进 main":
            return "🟡", "提交了但还没合并进 main"
        return "🔴", "声称完成但 git 里查不到提交——疑似虚报"
    if claimed == "spec_done":
        return "🟢", "规格已交付"
    # claimed 状态: 物理上已提交进 main → 活干完了但状态没更新（滞后）
    if phys == "已提交且进 main":
        return "🟡", "物理已完成但状态未更新（task-state 滞后）"
    if phys == "已提交未进 main":
        return "🟡", "提交了但未合并进 main"
    return "⚪", "进行中"


def render_html(rows, green, yellow, red, git_ok):
    """自包含 HTML（创始人双击即开, 内联 CSS 零外部依赖, 大白话 + 红绿灯 + 可复核）。"""
    colors = {"🟢": "#16a34a", "🟡": "#d97706", "🔴": "#dc2626", "⚪": "#9ca3af"}

    def row_html(r):
        emoji, note = judge(r["claimed"], r["phys"])
        return ('<tr><td><b>%s</b> %s</td><td>%s</td><td>%s</td>'
                '<td style="color:%s;font-weight:600">%s %s</td></tr>'
                % (r["id"], r["title"], r["claimed"], r["phys"], colors[emoji], emoji, note))

    rows_html = "".join(row_html(r) for r in rows)
    ok = red == 0
    status_bg = "#16a34a" if ok else "#dc2626"
    status_txt = "全部声称与物理一致 ✅" if ok else "⚠️ 发现 %d 个疑似虚报（点下方任务看证据）" % red
    degraded = "" if git_ok else '<p style="color:#d97706">⚠️ git 不可用，本次物理核验降级</p>'
    css = ("body{font-family:-apple-system,'PingFang SC',sans-serif;max-width:960px;margin:24px auto;padding:0 16px;background:#f9fafb;color:#111}"
           "h1{font-size:22px}.cards{display:flex;gap:12px;margin:16px 0}"
           ".card{flex:1;background:#fff;border-radius:12px;padding:16px;box-shadow:0 1px 3px rgba(0,0,0,.08);text-align:center}"
           ".card .n{font-size:32px;font-weight:700}table{width:100%;background:#fff;border-radius:12px;border-collapse:collapse;box-shadow:0 1px 3px rgba(0,0,0,.08)}"
           "td,th{padding:10px 12px;text-align:left;border-bottom:1px solid #eee;font-size:14px}th{background:#f3f4f6}"
           ".status{padding:12px 16px;border-radius:12px;color:#fff;font-weight:600;background:" + status_bg + "}")
    return ("<!DOCTYPE html>\n<html lang=\"zh\"><head><meta charset=\"utf-8\"><title>创始人控制台 · 任务真相</title><style>" + css + "</style></head><body>\n"
            "<h1>🧭 创始人控制台 · 任务真相</h1>\n"
            "<p style=\"color:#666\">物理核验（git/CI 事实），不是 agent 自报。</p>\n"
            "<div class=\"status\">" + status_txt + "</div>\n"
            "<div class=\"cards\">"
            "<div class=\"card\"><div class=\"n\" style=\"color:#16a34a\">" + str(green) + "</div>🟢 真实</div>"
            "<div class=\"card\"><div class=\"n\" style=\"color:#d97706\">" + str(yellow) + "</div>🟡 待复核</div>"
            "<div class=\"card\"><div class=\"n\" style=\"color:#dc2626\">" + str(red) + "</div>🔴 疑似虚报</div>"
            "</div>\n" + degraded + "\n"
            "<table><tr><th>任务</th><th>它说</th><th>物理核验</th><th>判定</th></tr>" + rows_html + "</table>\n"
            "<p style=\"color:#999;font-size:12px\">每个判定都可复核：git log --all --format=%s | grep \"(D#)\" 验证提交；git merge-base 验证是否进 main。</p>\n"
            "</body></html>")


def main():
    offline = "--offline" in sys.argv
    rows, git_ok = collect(offline)
    if not git_ok:
        print("⚠ degraded: git 不可用，物理核验降级", file=sys.stderr)
    green = sum(1 for r in rows if judge(r["claimed"], r["phys"])[0] == "🟢")
    red = sum(1 for r in rows if judge(r["claimed"], r["phys"])[0] == "🔴")
    yellow = sum(1 for r in rows if judge(r["claimed"], r["phys"])[0] == "🟡")

    if "--html" in sys.argv:
        out = REPO / "docs" / "synova" / "founder-console.html"
        out.write_text(render_html(rows, green, yellow, red, git_ok), encoding="utf-8")
        print(f"已生成: {out}")
        return 1 if red > 0 else (2 if not git_ok else 0)

    print("# 任务真相（物理核验，非 agent 自报）\n")
    print("| 任务 | 它说 | 物理核验 | 判定 |")
    print("|------|------|----------|------|")
    for r in rows:
        emoji, note = judge(r["claimed"], r["phys"])
        print(f"| {r['id']} {r['title']} | {r['claimed']} | {r['phys']} | {emoji} {note} |")
    print(f"\n**小结：🟢 真实 {green} · 🟡 待复核 {yellow} · 🔴 疑似虚报 {red}**")
    # 有"声称完成但物理不支撑" → exit 1（供门禁/告警）
    return 1 if red > 0 else (2 if not git_ok else 0)


if __name__ == "__main__":
    sys.exit(main())
