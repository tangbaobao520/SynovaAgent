#!/usr/bin/env python3
# D7xx 计划状态生成器 —— 《整体推进计划》任务区块从真相源重生成
#
# 背景（创始人指令 2026-09-13）: 「前一个对话让你写的文档都要盯住这些任务的执行情况，任务看板也要盯着」
# 机制: 计划文档里的任务区块包在 <!-- PLAN-STATUS:BEGIN --> / END 之间，
#       本脚本用 task-state/D*.json（真相源）+ audit.verdict 重写该区块 →
#       **计划文档无法与事实漂移**（人写不进去，只有生成器能改）。
#
# 契约:
#   输入 = 计划文档路径；读取 task-state/*.json；不联网、不写除该文档外的任何文件
#   输出 = 原地更新标记区块；打印更新行数
#   退出码 = 0 已更新/无需更新 | 1 读写失败 | 2 契约不满足（文档缺标记 / task-state 不可读）
#   降级 = 任务无 task-state 时写「未登记」而非静默跳过
import json, pathlib, re, sys

def main() -> int:
    if len(sys.argv) < 2:
        print("用法: gen-plan-status.py <计划文档路径>"); return 2
    doc = pathlib.Path(sys.argv[1]); ts = pathlib.Path("task-state")
    if not doc.exists(): print(f"❌ 计划文档不存在: {doc}"); return 2
    if not ts.is_dir(): print("❌ task-state 目录不可读"); return 2
    text = doc.read_text(encoding="utf-8")
    b, e = "<!-- PLAN-STATUS:BEGIN -->", "<!-- PLAN-STATUS:END -->"
    if b not in text or e not in text:
        print("❌ 文档缺 PLAN-STATUS 标记区块"); return 2
    head, tail = text[:text.index(b)], text[text.index(e) + len(e):]
    block = text[text.index(b):text.index(e)]
    ids = sorted(set(re.findall(r"D\d{3}", block)))
    rows = []
    for i in ids:
        f = ts / f"{i}.json"
        if not f.exists():
            rows.append((i, "未登记", "", "")); continue
        try: d = json.loads(f.read_text(encoding="utf-8"))
        except Exception: rows.append((i, "读取失败", "", "")); continue
        a = d.get("audit") if isinstance(d.get("audit"), dict) else {}
        rows.append((i, d.get("status") or "", a.get("verdict") or "", (d.get("title") or "")[:36]))
    new = (b + "\n| 任务 | 状态 | 审计裁决 | 标题 |\n|---|---|---|---|\n"
           + "\n".join(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]} |" for r in rows) + "\n" + e)
    out = head + new + tail
    if out == text: print(f"✅ 无变化（{len(rows)} 行已是真相源状态）"); return 0
    try: doc.write_text(out, encoding="utf-8")
    except Exception as ex: print(f"❌ 写入失败: {ex}"); return 1
    print(f"✅ 已从真相源重生成 {len(rows)} 行"); return 0

if __name__ == "__main__": sys.exit(main())
