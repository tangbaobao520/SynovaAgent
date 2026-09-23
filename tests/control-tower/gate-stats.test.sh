#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# gate-stats.test.sh — D515 项4: 门禁命中统计（gate-hits.log JSONL → Markdown 汇总）
#
# 覆盖矩阵:
#   正常 — 已知数据 → 表行/hit/miss 计数正确（D918: 夹具相对 now 生成，杜绝日期边界定时炸弹）
#   误报代理 — 同 branch hit→miss <5min → suspects ≥1
#   边界 — 日志不存在 → exit 0 空表; 损坏行跳过并注明; 窗口外数据被排除（D918 新增显式断言）
#   接线 — pre-commit-check.sh 含 log_gate/GATE_HITS_LOG; .gitignore 含 gate-hits.log
# 沙箱: SYNO_GATE_HITS_LOG 注入临时文件
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GS="$REPO/scripts/control-tower/gate-stats.sh"
PC="$REPO/scripts/pre-commit-check.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D515 项4: gate-stats 门禁命中统计 ==="

# ── 接线 ──
grep -q "log_gate()" "$PC" && grep -q "GATE_HITS_LOG" "$PC" && ok "接线: pre-commit log_gate + GATE_HITS_LOG 存在" || no "pre-commit 命中统计未接线"
grep -q "gate-hits.log" "$REPO/.gitignore" && ok "接线: .gitignore 含 gate-hits.log（运行态不入库）" || no ".gitignore 缺 gate-hits.log"

# ── 正常: 已知数据 → 计数正确 ──
# D918 修复（日期边界定时炸弹）: 夹具原为**写死绝对时间**（2026-08-24T01:00:00Z）+ 调用端 30 天滚动窗口
#   → 2026-09-23T01:56Z 起该行被挤出窗口 → "as any 行计数"/"误报代理"两断言恒红；
#      实测 main 与全部分支同红 → 整个合并队列的 CI 无法转绿（队列堵死的真因之一）。
#   修复 = 夹具时间**相对 now 生成**（10 天前 / 40 天前），任何日历日跑语义等价、结果稳定。
LOG="$TMPD/gate-hits.log"
python3 - "$LOG" <<'PY'
import datetime, json, sys
now = datetime.datetime.now(datetime.timezone.utc)
def iso(days_ago, minutes=0):
    t = now - datetime.timedelta(days=days_ago) + datetime.timedelta(minutes=minutes)
    return t.isoformat().replace("+00:00", "Z")
rows = [
    {"time": iso(10),    "gate": "as any 零容忍（新增，铁律 38；存量独立清理）", "result": "hit",  "branch": "feat/a"},
    {"time": iso(10, 2), "gate": "as any 零容忍（新增，铁律 38；存量独立清理）", "result": "miss", "branch": "feat/a"},
    {"time": iso(9),     "gate": "契约门禁: 声明产出须在暂存区",                "result": "miss", "branch": "feat/a"},
    {"time": iso(40),    "gate": "旧数据应被过滤",                            "result": "hit",  "branch": "feat/b"},
]
with open(sys.argv[1], "w", encoding="utf-8") as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + "\n")
PY
OUT=$(SYNO_GATE_HITS_LOG="$LOG" bash "$GS" 30 2>&1); rc=$?
[ "$rc" -eq 0 ] && ok "正常: exit 0" || no "应 exit 0, 实际 $rc"
echo "$OUT" | grep -q "| 检查点 |" && ok "输出含 Markdown 表头" || no "缺 Markdown 表头"
echo "$OUT" | grep -q "as any 零容忍（新增" && echo "$OUT" | grep -q "| 2 | 1 | 1 |" && ok "as any 行计数 hit=1 miss=1 正确" || no "as any 行计数错误"
echo "$OUT" | grep -q "误报代理(5min内hit→miss)" && echo "$OUT" | grep -q "| 1 |$" && ok "误报代理列存在且 as any 行=1（hit→miss 2min）" || no "误报代理计算错误"
# D918: 窗口过滤显式断言（原仅间接依赖计数——窗口失效曾是静默的）
echo "$OUT" | grep -q "旧数据应被过滤" && no "窗口过滤失效（40 天前行未被排除）" || ok "窗口: 30 天外数据被排除"

# ── 边界: 日志不存在 → exit 0 空表 ──
OUT2=$(SYNO_GATE_HITS_LOG="$TMPD/nonexistent.log" bash "$GS" 2>&1); rc2=$?
[ "$rc2" -eq 0 ] && echo "$OUT2" | grep -q "0 次触发" && ok "边界: 日志不存在 → exit 0 + 空表" || no "空日志应 exit 0, 实际 $rc2"

# ── 边界: 损坏 JSON 行跳过 ──
echo "not-json" >> "$LOG"
OUT3=$(SYNO_GATE_HITS_LOG="$LOG" bash "$GS" 2>&1)
echo "$OUT3" | grep -q "1 行损坏" && ok "边界: 损坏行跳过并注明" || no "损坏行未注明"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
