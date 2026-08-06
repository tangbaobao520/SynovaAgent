#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# incident-loop.test.sh — D314 学习闭环测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. record 合成 incident → incident.log 追加且 schema 字段齐全
#   2. suggest --root-cause R2 → 推荐机制非空
#   3. 已知 pattern 命中 → record 输出"已存在相似 pattern"
#   4. verify --case INC-20260802-stash → 运行 hook-git-detect 于合成 stash → 被拦
#   5. record 幂等：同 id 重复不重复追加
#
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/incident-loop.py"
DETECT="$REPO_DIR/scripts/hooks/hook-git-detect.sh"
TMP_DIR="$REPO_DIR/.codex/control-tower/tmp"
CT_DIR=".codex/control-tower/tmp/il-ct"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }

rm -rf "$CT_DIR"; mkdir -p "$CT_DIR"

echo "═══════════════════════════════════════════════════════════"
echo "  D314 incident-loop 测试 — 学习闭环"
echo "═══════════════════════════════════════════════════════════"
echo ""

echo "── 1. record 合成 incident ──"
OUT=$(SYNO_CT_DIR="$CT_DIR" python3 "$TOOL" record --id "INC-TEST-001" --symptom "测试事故" --root-cause "R2" --sessions "TEST" --fix "测试修复" --version "4.6.0" 2>&1) || true
if [ -f "$CT_DIR/logs/incident.log" ]; then
  N=$(wc -l < "$CT_DIR/logs/incident.log")
  if [ "$N" -ge 1 ]; then pass "incident.log 已追加 ($N 行)"; else fail "incident.log 空"; fi
  FIELD_OK=$(python3 -c "
import json
line = open('$CT_DIR/logs/incident.log', encoding='utf-8').readline()
d = json.loads(line)
need = ['id','time','symptom','rootCause','sessions','fix','version']
print('OK' if all(k in d for k in need) else 'MISSING')
" 2>/dev/null || echo "PARSE_ERR")
  if [ "$FIELD_OK" = "OK" ]; then pass "incident schema 字段齐全"; else fail "schema 缺字段 ($FIELD_OK)"; fi
else
  fail "incident.log 未生成"
fi
echo ""

echo "── 2. suggest R2 ──"
OUT=$(SYNO_CT_DIR="$CT_DIR" python3 "$TOOL" suggest --root-cause "R2" 2>&1) || true
assert_contains "$OUT" '"mechanism"' "suggest 输出含 mechanism 字段"
assert_contains "$OUT" '"tools"' "suggest 输出含 tools 列表"
echo ""

echo "── 3. 已知 pattern 命中 ──"
OUT=$(SYNO_CT_DIR="$CT_DIR" python3 "$TOOL" record --id "INC-TEST-002" --symptom "空构造函数 new X([])" --root-cause "R2" --sessions "X" --fix "修复" --version "4.6.0" 2>&1) || true
assert_contains "$OUT" "known_patterns" "已知 pattern 命中提示（known_patterns 字段）"
echo ""

echo "── 4. verify stash 案例（D312 真实闭环）──"
OUT=$(SYNO_CT_DIR="$CT_DIR" python3 "$TOOL" verify --case "INC-20260802-stash" 2>&1) || true
assert_contains "$OUT" '"closed"' "verify 输出 closed"
echo ""

echo "── 4b. verify 受限 PATH（bash 不在 PATH → _find_bash 显式 fallback）──"
# D316: 修复前硬编码 ["bash", 在受限 PATH 下 FileNotFoundError → degraded（本断言 FAIL = red）
#       修复后 _find_bash 显式查找 Git 安装路径 → closed（本断言 PASS = green）
PYBIN=$(command -v python3)
OUT=$(SYNO_CT_DIR="$CT_DIR" env PATH="/c/Windows/system32:/c/Windows" "$PYBIN" "$TOOL" verify --case "INC-20260802-stash" 2>&1) || true
assert_contains "$OUT" '"closed"' "受限 PATH 下 verify 仍 closed（_find_bash 显式 fallback）"
echo ""

echo "── 5. record 幂等 ──"
SYNO_CT_DIR="$CT_DIR" python3 "$TOOL" record --id "INC-TEST-001" --symptom "重复" --root-cause "R2" --sessions "T" --fix "f" --version "4.6.0" > /dev/null 2>&1 || true
N=$(wc -l < "$CT_DIR/logs/incident.log")
if [ "$N" -eq 2 ]; then pass "同 id 重复 record 不重复追加（保持 2 行: 001+002）"; else fail "重复追加（当前 $N 行, 期望 2）"; fi
echo ""

echo "═══════════════════════════════════════════════════════════"
echo "  结果: $PASS 通过, $FAIL 失败"
if [ "$FAIL" -gt 0 ]; then
  echo "  Status: ❌ incident-loop 测试未通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
echo "  Status: ✅ incident-loop 测试全部通过"
echo "═══════════════════════════════════════════════════════════"
exit 0
