#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# incident-loop.test.sh — D314 学习闭环测试
#
# 覆盖（铁律 48：正常/降级/边界）:
#   1. record 合成 incident → incident.log 追加且 schema 字段齐全
#   2. suggest --root-cause R2 → 推荐机制非空
#   3. 已知 pattern 命中 → record 输出"已存在相似 pattern"
#   4. verify --case INC-20260802-stash → 运行 hook-git-detect 于合成 stash → 被拦
#   4b. 受限 PATH 下 verify 仍 closed（_find_bash 平台候选兜底，D316/D561）
#   4c. SYNO_PYTHON 注入下 hook 拦 stash（PATH 无 python3，D564 Windows 根因回归）
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
assert_contains() { if echo "$1" | grep -qF "$2"; then pass "$3"; else fail "$3 — 未找到: $2${4:+ — 诊断: $4}"; fi; }
# 第4轮: 失败诊断输出（CI ::error annotation tail-8 可捕获）——压单行 + 去 % 防 annotation 注入
diag_out() { printf '%s' "$1" | tr '\n' '|' | tr -d '%' | cut -c1-260; }

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

echo "── 4b. verify 受限 PATH（平台适配构造）──"
# D316: _find_bash 显式候选；D561: POSIX 候选（/bin/bash 等 4 路）。
# 第4轮（真 Win CI 实证 4b 红）: 原硬编码 PATH="/c/Windows/system32:/c/Windows" 在
# Windows 原生 python 的 which() 下会命中 System32 的 WSL bash（若存在）→ 错误 bash
# 跑 hook → 无「禁止」→ open。修法 = 按平台构造受限 PATH（断言目标不变: 受限 PATH
# 下闭环仍工作）:
#   mac/linux: bash 不在 PATH → _find_bash POSIX 候选兜底（D561，macOS 语义零变化）
#   windows: Git usr/bin（bash 可达、python3 不在）→ which 命中正确 Git bash
if grep -qiE 'MINGW|MSYS|CYGWIN' <<< "$(uname -s)"; then
  RESTRICTED_PATH="$(dirname "$(command -v bash)")"
else
  RESTRICTED_PATH="/c/Windows/system32:/c/Windows"
fi
PYBIN=$(command -v python3)
OUT=$(SYNO_CT_DIR="$CT_DIR" env PATH="$RESTRICTED_PATH" "$PYBIN" "$TOOL" verify --case "INC-20260802-stash" 2>&1) || true
assert_contains "$OUT" '"closed"' "受限 PATH 下 verify 仍 closed（平台受限 PATH 构造）" "RESTRICTED_PATH[$RESTRICTED_PATH] $(diag_out "$OUT")"
echo ""

echo "── 4c. SYNO_PYTHON 注入（D564 Windows 根因回归）──"
# D564: PR #305 Windows gate 实测 6/8（run 33257792825 annotations 物理证据，双失败 =
# 断言 6 + 4b 两条 verify）——根因: hook-git-detect.sh 的 python3 依赖在 _bash_env
# 重建的 PATH 下解析到 WindowsApps Store 占位 stub（非真 python）→ hook 静默 exit 0
# （fail-open 设计）→ 输出无「禁止」→ verify 返回 open。
# 治法: 工具侧注入确定可用解释器（SYNO_PYTHON=sys.executable）+ hook 优先消费。
# 本断言在「PATH 无 python3（仅 cat/grep）」下锁定该契约，双平台确定性。
if grep -qiE 'MINGW|MSYS|CYGWIN' <<< "$(uname -s)"; then
  NO_PY3_BIN="$(dirname "$(command -v cat)")"   # Git usr/bin: cat/grep/dirname 有、python3 无（bash 由绝对路径调用，不受 PATH 影响）
else
  NO_PY3_BIN="$CT_DIR/fakebin"
  mkdir -p "$NO_PY3_BIN"
  ln -sf "$(command -v cat)" "$NO_PY3_BIN/cat"
  ln -sf "$(command -v grep)" "$NO_PY3_BIN/grep"
  ln -sf "$(command -v dirname)" "$NO_PY3_BIN/dirname"   # 主 hook L25 顶层调用（set -e 硬依赖）
fi
OUT=$(printf '{"tool_input":{"command":"git stash"}}' | SYNO_CT_DIR="$CT_DIR" env PATH="$NO_PY3_BIN" SYNO_PYTHON="$PYBIN" "$(command -v bash)" "$DETECT" 2>&1) || true
assert_contains "$OUT" "禁止" "SYNO_PYTHON 注入: hook 在 PATH 无 python3 下仍拦 stash" "NO_PY3_BIN[$NO_PY3_BIN] PYBIN[$PYBIN] bash[$(command -v bash)] $(diag_out "$OUT")"
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
