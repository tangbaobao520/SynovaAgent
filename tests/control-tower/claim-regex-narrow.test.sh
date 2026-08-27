#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# claim-regex-narrow.test.sh — D541 铁律47 声称完成正则收窄配对测试
#
# 背景 (D541, CI 红根治): L750 旧正则 `拆分\|迁移\|清理.*完成\|已拆\|已迁移\|已清理`
#   把 bare 词「拆分/迁移」也当完成声称 → brief 里"verify-parallel 迁移改三处"
#   （工作描述，非完成声称）误触发铁律47 → CI strict 硬阻断。本任务收窄为只认完成语义。
#
# 覆盖矩阵（铁律 48 正常/降级/边界 + 接线）:
#   T1 接线: L750 正则为收窄后的完成语义（不含 bare 拆分/迁移）
#   T2 接线: 旧 bare 词正则已移除（不再误伤工作描述）
#   T3 正常: "verify-parallel 迁移改三处"（工作描述）→ 不触发
#   T4 降级: "已完成迁移" → 触发; "迁移完成" → 触发; "已拆" → 触发
#   T5 边界: 空 brief 内容 → 不触发; 无 brief 文件 → 不触发（检查有 guard）
#
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
PCC="$REPO/scripts/pre-commit-check.sh"

PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D541 claim-regex-narrow: 铁律47 正则收窄 ==="

# ── 接线: L750 收窄后正则 present；旧 bare 词正则 absent ──
NEW_RE='已拆\|已迁移\|已清理\|拆分\.\*完成\|迁移\.\*完成\|清理\.\*完成\|完成\.\*拆分\|完成\.\*迁移\|完成\.\*清理'
if grep -qF '已拆\|已迁移\|已清理\|拆分.*完成\|迁移.*完成\|清理.*完成\|完成.*拆分\|完成.*迁移\|完成.*清理' "$PCC"; then
  ok "T1 接线: 收窄后完成语义正则 present"
else
  no "T1 收窄后正则缺失"
fi
if grep -qF 'grep -qi "拆分\|迁移\|清理.*完成\|已拆\|已迁移\|已清理"' "$PCC"; then
  no "T2 旧 bare 词正则仍存在（会误伤工作描述）"
else
  ok "T2 旧 bare 词正则已移除"
fi

# ── 提取 L750 的正则（忠于实际实现，避免双副本漂移）──
LINE=$(grep -n 'if grep -qi ' "$PCC" | grep -F '"$BRIEF"' | head -1 | cut -d: -f1)
if [ -z "$LINE" ]; then
  no "提取 L750 正则失败"
  echo "结果: $PASS 通过, $FAIL 失败"; [ "$FAIL" -eq 0 ] && exit 0 || exit 1
fi
PATTERN=$(sed -n "${LINE}p" "$PCC" | sed -E 's/.*grep -qi "([^"]*)".*/\1/')
[ -n "$PATTERN" ] && echo "  提取正则: $PATTERN" || { no "正则提取为空"; exit 1; }

TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD" 2>/dev/null || true' EXIT
# 帮助: 用真实 grep（BRE，与 pre-commit L750 相同语义）判 content 是否触发
triggers() { local content="$1"; echo "$content" > "$TMPD/b.txt"; grep -qi "$PATTERN" "$TMPD/b.txt"; }

# ── T3 正常: 工作描述（如 D540 brief）不触发 ──
triggers "verify-parallel 迁移改三处（pre-push + ci.yml + verify-parallel.sh）" && no "T3 工作描述误触发" || ok "T3 正常: 'verify-parallel 迁移改三处' 不触发"

# ── T4 降级: 完成声称触发 ──
triggers "已完成迁移" && ok "T4a 降级: '已完成迁移' 触发" || no "T4a '已完成迁移' 未触发"
triggers "迁移完成" && ok "T4b 降级: '迁移完成' 触发" || no "T4b '迁移完成' 未触发"
triggers "已拆" && ok "T4c 降级: '已拆' 触发" || no "T4c '已拆' 未触发"
triggers "engine-core 拆分已完成，旧引用清零" && ok "T4d 降级: '拆分...完成' 触发" || no "T4d '拆分...完成' 未触发"

# ── T5 边界: 空 brief / 无 brief 不触发 ──
triggers "" && no "T5a 空 brief 误触发" || ok "T5a 边界: 空 brief 不触发"
# 无 brief 文件 → pre-commit L749 guard `[ -n "$BRIEF" ] && [ -f "$BRIEF" ]` 直接跳过 grep（不触发）
if sed -n '749p' "$PCC" | grep -qF '[ -f "$BRIEF" ]'; then
  ok "T5b 边界: 无 brief 文件 guard 存在（跳过 grep → 不触发）"
else
  no "T5b 无 brief guard 缺失"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
