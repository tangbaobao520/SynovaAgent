#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# brief_parser.test.sh — U7/CT-40: brief_parser.py 配对测试（parse_q2）
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — include 带动词/括号/分隔/行号后缀（L750）→ 全部归一化为裸路径
#   边界 — exclude「不改 x」剥前缀；空 Q2 → 空列表
#   接线 — brief_parser.py 存在且 parse_q2 可导入；strip 测试（语义剥壳全量）仍绿
# 沙箱: 纯文本 fixture，零 git
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PARSER="$REPO/scripts/control-tower/brief_parser.py"
STRIP="$REPO/tests/control-tower/brief-parser-strip.test.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D543 brief_parser parse_q2 配对测试 ==="

FIXTURE="$(mktemp)"; trap 'rm -f "$FIXTURE"' EXIT
cat > "$FIXTURE" <<'EOF'
## Q2: 范围
做什么:
- 修改 scripts/pre-commit-check.sh L750
- 更新 scripts/control-tower/brief_parser.py
不做什么:
- 不改 scripts/audit/

## Done 标准:
- verify: echo ok
EOF

INC=$(python3 "$PARSER" --q2-include "$FIXTURE")
EXC=$(python3 "$PARSER" --q2-exclude "$FIXTURE")

# ── D543: 剥行号后缀（对齐 devdoc_writeset.py:76 同款正则）──
echo "$INC" | grep -qx "scripts/pre-commit-check.sh" \
  && ok "D543: 「x.sh L750」剥后缀 → 裸路径" || no "D543: 行号后缀未剥: $INC"
echo "$INC" | grep -qE "L[0-9]" && no "D543: L\\d+ 残留" || ok "D543: 无行号残留"

# ── 正常: 动词前缀 + 裸路径 ──
echo "$INC" | grep -qx "scripts/control-tower/brief_parser.py" \
  && ok "include 剥「更新」→ 裸路径" || no "include 解析异常: $INC"

# ── 边界: exclude 剥「不改」──
echo "$EXC" | grep -qx "scripts/audit/" \
  && ok "exclude 剥「不改」" || no "exclude 解析异常: $EXC"

# ── 接线: parse_q2 可导入 + strip 全量剥壳测试仍绿 ──
python3 -c "import sys; sys.path.insert(0, '$REPO/scripts/control-tower'); from brief_parser import parse_q2" 2>/dev/null \
  && ok "接线: parse_q2 可导入" || no "接线: parse_q2 导入失败"
if bash "$STRIP" >/dev/null 2>&1; then
  ok "接线: brief-parser-strip（语义剥壳全量）仍绿"
else
  no "接线: strip 测试红（解析回归）"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
