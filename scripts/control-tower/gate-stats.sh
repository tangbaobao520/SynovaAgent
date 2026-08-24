#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# gate-stats.sh — D515 项4: 门禁命中统计汇总（月度清理数据地基）
#
# 契约 (铁律 47):
#   @input  — .claude/gate-hits.log（JSONL: {"time","gate","result","branch"}，
#             由 pre-commit-check.sh 的 hard_check/soft_check/log_gate 每次触发追加）
#   @output — stdout: Markdown 表（每检查点: 触发次数/命中/通过/误报代理指标）
#   @degraded — 日志不存在/为空 → 输出空表头 + exit 0（无数据≠错误）
#   @error    — JSON 行损坏 → 跳过该行并在表尾注明（不中断汇总）
# 用法: bash scripts/control-tower/gate-stats.sh [天数，默认 30]
# 误报代理指标: 同 branch 上某 gate 命中(hit)后 5 分钟内直接通过(miss)
#   ——大概率是"重跑就过"的误报或零成本绕过，进删除候选清单（spec §1 项4）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOG="${SYNO_GATE_HITS_LOG:-$ROOT/.claude/gate-hits.log}"
DAYS="${1:-30}"

python3 - "$LOG" "$DAYS" <<'PYEOF'
import json, sys
from datetime import datetime, timedelta, timezone

log_path, days = sys.argv[1], int(sys.argv[2])
cutoff = datetime.now(timezone.utc) - timedelta(days=days)
rows, bad = [], 0
try:
    with open(log_path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                d = json.loads(line)
                t = datetime.fromisoformat(d["time"].replace("Z", "+00:00"))
                if t >= cutoff:
                    rows.append((t, d.get("gate", "?"), d.get("result", "?"), d.get("branch", "?")))
            except (ValueError, KeyError, json.JSONDecodeError):
                bad += 1
except OSError:
    rows = []

# 按时间排序，计算误报代理: 同 branch+gate 的 hit 之后 5 分钟内出现 miss
rows.sort(key=lambda r: r[0])
last_hit = {}
suspects = {}
for t, g, r, b in rows:
    key = (g, b)
    if r == "hit":
        last_hit[key] = t
    elif r == "miss" and key in last_hit:
        if (t - last_hit[key]).total_seconds() <= 300:
            suspects[g] = suspects.get(g, 0) + 1
        del last_hit[key]

stats = {}
for _, g, r, _ in rows:
    s = stats.setdefault(g, {"hit": 0, "miss": 0})
    if r in s:
        s[r] += 1

print(f"# 门禁命中统计（近 {days} 天，{len(rows)} 次触发）")
print("")
print("| 检查点 | 触发 | 命中(拦/提示) | 通过 | 误报代理(5min内hit→miss) |")
print("|---|---|---|---|---|")
for g in sorted(stats, key=lambda k: -(stats[k]["hit"] + stats[k]["miss"])):
    s = stats[g]
    print(f"| {g} | {s['hit'] + s['miss']} | {s['hit']} | {s['miss']} | {suspects.get(g, 0)} |")
print("")
if bad:
    print(f"⚠ {bad} 行损坏 JSON 已跳过")
zero = [g for g in stats if stats[g]["hit"] == 0]
if zero:
    print(f"💡 零命中的检查点（删除候选，spec §1 项4）: {', '.join(sorted(zero))}")
hi_fp = [g for g in stats if stats[g]["hit"] > 0 and suspects.get(g, 0) * 2 > stats[g]["hit"]]
if hi_fp:
    print(f"💡 误报代理 >50% 的检查点（删除候选）: {', '.join(sorted(hi_fp))}")
sys.exit(0)
PYEOF
