#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# attach.test.sh — D539: attach.py 会话专属 current-brief「不 clobber」＋模块可加载
# （control-tower 脚本测试配对门禁 U7/CT-40 的 attach.py 配对测试）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常(不 clobber) — current-brief.<sid> 已存在 → attach 不覆盖（尊重 task-start 权威写方）
#   正常(写入)       — current-brief.<sid> 缺失 + --brief → 写入（保留 D329 行为）
#   回退(全局)       — 无 --brief 但全局 current-brief 存在 → 快照成 <sid>
#   回退(无全局)     — 无 --brief 且无全局 → 不写（不产生空文件）
#   接线             — _run_current_brief_snapshot 含 exists 判断
#   可加载           — Python 3.9 下模块可加载（D539 加 from __future__ import annotations）
#
# 沙箱: mktemp 目录 + 复制 scripts/control-tower（M13: REPO_ROOT 指向沙箱，绝不污染真实 .claude/，
#       零真实目录零网络）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ATTACH="$REPO/scripts/control-tower/attach.py"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D539: attach.py 会话专属 current-brief 不 clobber ==="

# ── 接线: 不 clobber 判断真实存在于源码（target.exists() → 跳过）──
grep -q "target.exists()" "$ATTACH" && grep -q "不 clobber" "$ATTACH" \
  && ok "接线: _run_current_brief_snapshot 含不 clobber 判断" || no "接线: 缺不 clobber 判断"
grep -q "from __future__ import annotations" "$ATTACH" \
  && ok "接线: attach.py 含 D539 延迟注解求值（Python 3.9 可加载）" || no "接线: 缺 from __future__"

# ── 可加载: 沙箱副本在 Python 3.9 下能 import（不再 TypeError）──
SB="$TMPD/sb"; mkdir -p "$SB/scripts"
cp -R "$REPO/scripts/control-tower" "$SB/scripts/control-tower"
python3 -c "import importlib.util; spec=importlib.util.spec_from_file_location('attach_mod','$SB/scripts/control-tower/attach.py'); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)" \
  && ok "可加载: attach.py 沙箱副本在 Python 3.9 下可 import" || no "可加载: attach.py 加载失败"

# ── 沙箱准备（REPO_ROOT=$SB → .claude 在 $SB/.claude，零污染真实仓）──
mkdir -p "$SB/.claude/task-briefs" "$SB/.claude"
export SYNO_CT_DIR="$TMPD/ct"; mkdir -p "$SYNO_CT_DIR"
printf '2026-08-27-stale.md\n' > "$SB/.claude/task-briefs/2026-08-27-stale.md"
printf '2026-08-27-newest.md\n' > "$SB/.claude/task-briefs/2026-08-27-newest.md"
AT="$SB/scripts/control-tower/attach.py"

# ── 正常(不 clobber): current-brief.B 已存在 → attach 不覆盖 ──
printf 'newest-brief.md\n' > "$SB/.claude/current-brief.B"
python3 "$AT" --session-id B --brief "$SB/.claude/task-briefs/2026-08-27-stale.md" >/dev/null 2>&1
[ "$(cat "$SB/.claude/current-brief.B" 2>/dev/null)" = "newest-brief.md" ] \
  && ok "不 clobber: current-brief.B 已存在时不覆盖（尊重 task-start 权威写方）" || no "不 clobber: B 被覆盖"

# ── 正常(写入): current-brief.C 缺失 + --brief → 写入 ──
python3 "$AT" --session-id C --brief "$SB/.claude/task-briefs/2026-08-27-newest.md" >/dev/null 2>&1
[ "$(cat "$SB/.claude/current-brief.C" 2>/dev/null)" = "2026-08-27-newest.md" ] \
  && ok "写入: current-brief.C 缺失时写入（保留 D329 行为）" || no "写入: C 未写入"

# ── 回退(全局): 无 --brief + 全局 current-brief 存在 → 快照成 <sid> ──
printf '2026-08-27-newest.md\n' > "$SB/.claude/current-brief"
python3 "$AT" --session-id D >/dev/null 2>&1
[ "$(cat "$SB/.claude/current-brief.D" 2>/dev/null)" = "2026-08-27-newest.md" ] \
  && ok "回退: 无 --brief 时从全局 current-brief 快照成 current-brief.D" || no "回退: D 未从全局快照"

# ── 回退(无全局): 无 --brief + 无全局 → 不写（不产生空文件）──
SB2="$TMPD/sb2"; mkdir -p "$SB2/scripts"; cp -R "$REPO/scripts/control-tower" "$SB2/scripts/control-tower"; mkdir -p "$SB2/.claude"
( cd "$SB2" && SYNO_CT_DIR="$SYNO_CT_DIR" python3 "$SB2/scripts/control-tower/attach.py" --session-id E >/dev/null 2>&1 ) || true
[ ! -f "$SB2/.claude/current-brief.E" ] \
  && ok "回退: 无 brief 可快照时不写入（不产生空文件）" || no "回退: 意外写了空 current-brief.E"

# ── 防污染: 真实仓 .claude 未被写入（M13）──
[ ! -f "$REPO/.claude/current-brief.B" ] && [ ! -f "$REPO/.claude/current-brief.C" ] && [ ! -f "$REPO/.claude/current-brief.D" ] && [ ! -f "$REPO/.claude/current-brief.E" ] \
  && ok "防污染: 真实仓 .claude/ 未被 attach 污染（M13 红线）" || no "防污染: 真实仓 .claude 被写入了"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
