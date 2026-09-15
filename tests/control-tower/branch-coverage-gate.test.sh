#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# branch-coverage-gate.test.sh — D704 单测: scripts/ci/branch-coverage-gate.sh
# （K3 W-3 改动文件 branch 覆盖准出闸门）
#
# RED 基准 (spec §4): 门禁脚本不存在时测试必须红 — W1/W4 的真实事故形态是
#   「分支漏测却全绿合并」，本测试锁死四个失败模式全部 fail-closed:
#   1) 改动文件 branches < 阈值 → exit 1 且点名文件
#   2) branches ≥ 阈值 → exit 0
#   3) coverage 报告缺失 / JSON 损坏 → exit 1（绝不静默放行）
#   4) 改动文件不在报告中（未被任何测试加载）→ 按 0% 判定 exit 1
#   5) branch-coverage-exempt: <理由> 注释 → 跳过且打印理由（不静默）
#   6) 非 src 文件 / coverage.exclude 六组镜像路径 → 不判定
#   7) BRANCH_COVERAGE_MIN 覆盖生效（收紧与放宽双向）
#   8) 零分支文件 pct=100 放行（无分支可测 ≠ 缺口）
#   9) 已删除文件（显式清单含但工作区无）→ 跳过不误判
#
# 测试策略: mktemp 沙箱构造合成 json-summary + 改动清单文件，经
#   BRANCH_COVERAGE_ROOT 注入沙箱根，不依赖真实 git/coverage 运行（密封）。
#   json-summary key 用 Win 反斜杠与 POSIX 两种绝对路径形态——生产实证
#   （clone 全量 --coverage 实跑）key 为平台相关绝对路径，门禁必须归一化后缀匹配。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

TEST_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$TEST_ROOT/scripts/ci/branch-coverage-gate.sh"
PASS=0
FAIL=0

ok() { PASS=$((PASS + 1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ✗ $1"; }

SANDBOX=$(mktemp -d)
trap 'rm -rf "$SANDBOX"' EXIT
mkdir -p "$SANDBOX/src" "$SANDBOX/src/tui"

# mk_summary <输出路径> <entries JSON 字典字面量> — 构造合成 json-summary
#   （total 伪条目 + 指定文件条目；key 由调用方给出，可含 Win/POSIX 绝对路径形态）
mk_summary() {
  python - "$1" "$2" <<'PYEOF'
import json, sys
path, entries = sys.argv[1], json.loads(sys.argv[2])
doc = {"total": {"lines": {"total": 100, "covered": 50, "skipped": 0, "pct": 50.0},
                  "branches": {"total": 100, "covered": 50, "skipped": 0, "pct": 50.0}}}
doc.update(entries)
with open(path, "w", encoding="utf-8") as f:
    json.dump(doc, f, ensure_ascii=False)
PYEOF
}

# run_gate <报告路径> <清单路径> [额外 env 赋值串] — 跑闸门并捕获 exit/输出
#   set -e 下不吞非零退出: 用 set +e 包裹
OUT=""; RC=0
run_gate() {
  local report="$1" list="$2" extra="${3:-}"
  set +e
  if [ -n "$extra" ]; then
    OUT=$(env "$extra" BRANCH_COVERAGE_ROOT="$SANDBOX" bash "$GATE" "$report" "$list" 2>&1)
  else
    OUT=$(BRANCH_COVERAGE_ROOT="$SANDBOX" bash "$GATE" "$report" "$list" 2>&1)
  fi
  RC=$?
  set -e
}

# mkfile <相对路径> [内容] — 在沙箱创建改动文件实体（删除文件用例不创建）
mkfile() {
  local rel="$1" content="${2:-export function placeholder() { return 1; }}"
  printf '%s\n' "$content" > "$SANDBOX/$rel"
}

# mklist <清单路径> <行...>
mklist() {
  local dst="$1"; shift
  : > "$dst"
  local p
  for p in "$@"; do printf '%s\n' "$p" >> "$dst"; done
}

# ═══════════════════════════════════════════════════════════════════════════════
echo "── 0. RED 基准: 门禁脚本存在性"
if [ -f "$GATE" ]; then ok "scripts/ci/branch-coverage-gate.sh 存在"; else
  fail "scripts/ci/branch-coverage-gate.sh 不存在 (RED: spec §4 测试优先)"
  echo ""
  echo "RED: 门禁脚本尚未实现 — 先实现 scripts/ci/branch-coverage-gate.sh (spec §3.1)"
  echo "结果: 通过 $PASS / 失败 $FAIL"
  exit 1
fi

echo ""
echo "── 1. 低于阈值 fail-closed: branches 60% (<80) → exit 1 且点名文件"
mk_summary "$SANDBOX/r60.json" '{"D:\\fake\\root\\src\\low.ts": {"branches": {"total": 10, "covered": 6, "skipped": 0, "pct": 60.0}}}'
mkfile "src/low.ts"
mklist "$SANDBOX/list60.txt" "src/low.ts"
run_gate "$SANDBOX/r60.json" "$SANDBOX/list60.txt"
if [ "$RC" -eq 1 ]; then ok "60% < 80 → exit 1 (实测 $RC)"; else fail "60% 应 exit 1 (实测 $RC)"; fi
if printf '%s' "$OUT" | grep -qF "src/low.ts"; then ok "输出点名 src/low.ts"; else fail "输出未点名 src/low.ts (输出: $OUT)"; fi
if printf '%s' "$OUT" | grep -qF "60% < 阈值"; then ok "失败原因是阈值判定（非「不在报告」误判→ Win 反斜杠绝对路径 key 归一化实证）"; else fail "失败原因非阈值判定 (输出: $OUT)"; fi

echo ""
echo "── 2. 达标放行: branches 90% (≥80) → exit 0"
mk_summary "$SANDBOX/r90.json" '{"/home/ci/repo/src/high.ts": {"branches": {"total": 10, "covered": 9, "skipped": 0, "pct": 90.0}}}'
mkfile "src/high.ts"
mklist "$SANDBOX/list90.txt" "src/high.ts"
run_gate "$SANDBOX/r90.json" "$SANDBOX/list90.txt"
if [ "$RC" -eq 0 ]; then ok "90% ≥ 80 → exit 0 (实测 $RC)"; else fail "90% 应 exit 0 (实测 $RC) (输出: $OUT)"; fi

echo ""
echo "── 3. 报告缺失 → fail-closed exit 1"
mklist "$SANDBOX/list3.txt" "src/high.ts"
run_gate "$SANDBOX/no-such-report.json" "$SANDBOX/list3.txt"
if [ "$RC" -eq 1 ]; then ok "报告缺失 → exit 1 (实测 $RC)"; else fail "报告缺失应 exit 1 (实测 $RC)"; fi
if printf '%s' "$OUT" | grep -qF "缺失"; then ok "输出说明报告缺失"; else fail "输出未说明报告缺失 (输出: $OUT)"; fi

echo ""
echo "── 4. 报告 JSON 损坏 → fail-closed exit 1"
printf 'not-json {{{\n' > "$SANDBOX/broken.json"
run_gate "$SANDBOX/broken.json" "$SANDBOX/list3.txt"
if [ "$RC" -eq 1 ]; then ok "JSON 损坏 → exit 1 (实测 $RC)"; else fail "JSON 损坏应 exit 1 (实测 $RC)"; fi

echo ""
echo "── 5. 改动文件不在报告（未被任何测试加载）→ 按 0% 判定 exit 1 且点名"
mk_summary "$SANDBOX/r5.json" '{"D:\\fake\\root\\src\\other.ts": {"branches": {"total": 4, "covered": 4, "skipped": 0, "pct": 100.0}}}'
mkfile "src/ghost.ts"
mklist "$SANDBOX/list5.txt" "src/ghost.ts"
run_gate "$SANDBOX/r5.json" "$SANDBOX/list5.txt"
if [ "$RC" -eq 1 ]; then ok "不在报告 → exit 1 (实测 $RC)"; else fail "不在报告应 exit 1 (实测 $RC)"; fi
if printf '%s' "$OUT" | grep -qF "src/ghost.ts"; then ok "输出点名 src/ghost.ts"; else fail "输出未点名 src/ghost.ts (输出: $OUT)"; fi

echo ""
echo "── 6. 豁免注释: branch-coverage-exempt: <理由> → 跳过且打印理由（不静默）"
mkfile "src/exempt.ts" "// branch-coverage-exempt: 遗留回调重构中，跟踪卡 WT-123"
mklist "$SANDBOX/list6.txt" "src/exempt.ts"
run_gate "$SANDBOX/r5.json" "$SANDBOX/list6.txt"
if [ "$RC" -eq 0 ]; then ok "豁免文件跳过 → exit 0 (实测 $RC)"; else fail "豁免应 exit 0 (实测 $RC) (输出: $OUT)"; fi
if printf '%s' "$OUT" | grep -qF "遗留回调重构中"; then ok "豁免理由已打印（不静默）"; else fail "豁免理由未打印 (输出: $OUT)"; fi

echo ""
echo "── 7. 非 src 改动不判定（docs/*.md）"
mklist "$SANDBOX/list7.txt" "docs/some-note.md" "README.md"
run_gate "$SANDBOX/r5.json" "$SANDBOX/list7.txt"
if [ "$RC" -eq 0 ]; then ok "非 src/**/*.ts 清单 → exit 0 (实测 $RC)"; else fail "非 src 清单应 exit 0 (实测 $RC) (输出: $OUT)"; fi

echo ""
echo "── 8. coverage.exclude 六组镜像: src/tui/** 不判定"
mklist "$SANDBOX/list8.txt" "src/tui/widget.ts"
run_gate "$SANDBOX/r5.json" "$SANDBOX/list8.txt"
if [ "$RC" -eq 0 ]; then ok "src/tui/** 改动 → 跳过 exit 0 (实测 $RC)"; else fail "src/tui/** 应跳过 (实测 $RC) (输出: $OUT)"; fi

echo ""
echo "── 9. BRANCH_COVERAGE_MIN 覆盖: 放宽(50)与收紧(90)双向生效"
mklist "$SANDBOX/list9.txt" "src/low.ts"
run_gate "$SANDBOX/r60.json" "$SANDBOX/list9.txt" "BRANCH_COVERAGE_MIN=50"
if [ "$RC" -eq 0 ]; then ok "MIN=50 时 60% → exit 0 (实测 $RC)"; else fail "MIN=50 时 60% 应 exit 0 (实测 $RC) (输出: $OUT)"; fi
run_gate "$SANDBOX/r60.json" "$SANDBOX/list9.txt" "BRANCH_COVERAGE_MIN=90"
if [ "$RC" -eq 1 ]; then ok "MIN=90 时 60% → exit 1 (实测 $RC)"; else fail "MIN=90 时 60% 应 exit 1 (实测 $RC) (输出: $OUT)"; fi

echo ""
echo "── 10. 边界: 阈值恰等 (80 vs 80) 与零分支文件 (pct=100) 放行"
mk_summary "$SANDBOX/r80.json" '{"D:\\fake\\root\\src\\edge.ts": {"branches": {"total": 10, "covered": 8, "skipped": 0, "pct": 80.0}},
"/home/ci/repo/src/nobranch.ts": {"branches": {"total": 0, "covered": 0, "skipped": 0, "pct": 100.0}}}'
mkfile "src/edge.ts"
mkfile "src/nobranch.ts"
mklist "$SANDBOX/list10.txt" "src/edge.ts" "src/nobranch.ts"
run_gate "$SANDBOX/r80.json" "$SANDBOX/list10.txt"
if [ "$RC" -eq 0 ]; then ok "80=阈值 与 零分支 pct=100 → exit 0 (实测 $RC)"; else fail "边界用例应 exit 0 (实测 $RC) (输出: $OUT)"; fi

echo ""
echo "── 11. 非法阈值 env → fail-closed exit 1（不静默回退默认）"
run_gate "$SANDBOX/r90.json" "$SANDBOX/list90.txt" "BRANCH_COVERAGE_MIN=abc"
if [ "$RC" -eq 1 ]; then ok "非法 MIN=abc → exit 1 (实测 $RC)"; else fail "非法 MIN 应 exit 1 (实测 $RC) (输出: $OUT)"; fi

echo ""
echo "── 12. 已删除文件（清单含但工作区无）→ 跳过不误判"
mklist "$SANDBOX/list12.txt" "src/deleted-long-ago.ts"
run_gate "$SANDBOX/r5.json" "$SANDBOX/list12.txt"
if [ "$RC" -eq 0 ]; then ok "工作区不存在的改动文件 → 跳过 exit 0 (实测 $RC)"; else fail "已删除文件应跳过 (实测 $RC) (输出: $OUT)"; fi

echo ""
echo "── 13. 生产接线 (DS2): ci.yml 密封清单 + coverage 步骤"
CIYML="$TEST_ROOT/.github/workflows/ci.yml"
if grep -qF "tests/control-tower/branch-coverage-gate.test.sh" "$CIYML"; then
  ok "ci.yml 密封清单已入列 branch-coverage-gate.test.sh"
else
  fail "ci.yml 密封清单未含 branch-coverage-gate.test.sh (W-1 形态: 不入列 = 永不执行)"
fi
if grep -qF "scripts/ci/branch-coverage-gate.sh" "$CIYML"; then
  ok "ci.yml 已接线 branch-coverage-gate.sh 调用"
else
  fail "ci.yml 未调用 branch-coverage-gate.sh (铁律 5: 不接线 = 不存在)"
fi

echo ""
echo "结果: 通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
