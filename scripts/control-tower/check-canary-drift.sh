#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-canary-drift.sh — D526: CI canary 密封清单漂移告警
#
# 问题: CI canary 只覆盖密封清单 N 项，仓库测试文件 M 个——M-N 漂移零感知
#   （D525 的 synova-commit.test.sh 红态漏网即此因）。
#
# 契约 (铁律 47):
#   @input  — 无参；注入缝: SYNO_TESTS_DIR（测试目录，默认 tests/）、
#             SYNO_CI_YML（canary 清单来源，默认 .github/workflows/ci.yml）
#   @output — 漂移报告（在清单外的测试逐个点名 + ::warning 注解[CI 可见]）
#   @exit   — 恒 0（告警不阻断——派单明确防误伤；漂移由 K3/人工月度清理）
#   @degraded — ci.yml/测试目录缺失 → 显式提示跳过（铁律 11）
# 范围: tests/ 下全部 *.test.*（.sh/.ts/.py），与 CI canary 清单（for t in 列表）对账。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TESTS_DIR="${SYNO_TESTS_DIR:-$ROOT/tests}"
CI_YML="${SYNO_CI_YML:-$ROOT/.github/workflows/ci.yml}"
YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RESET='\033[0m'

if [ ! -f "$CI_YML" ]; then
  echo -e "${YELLOW}⚠ canary 清单来源缺失: ${CI_YML} — 漂移检查跳过（铁律 11 显式）${RESET}"
  exit 0
fi
if [ ! -d "$TESTS_DIR" ]; then
  echo -e "${YELLOW}⚠ 测试目录缺失: ${TESTS_DIR} — 漂移检查跳过（铁律 11 显式）${RESET}"
  exit 0
fi

# CI canary 清单（ci.yml control-tower-tests job 的 for t in 列表）
LISTED=$(grep -oE 'tests/[A-Za-z0-9_/.-]+\.test\.sh' "$CI_YML" | sort -u)
# 全部测试文件（.test.sh/.test.ts/.test.py，排除 node_modules）
# 路径规约: 相对 TESTS_DIR 的父目录（默认即仓库根 → "tests/..."，与清单同形；
#   注入缝下同样成立——前缀取 dirname(TESTS_DIR) 而非 git ROOT）
_BASE="$(dirname "${TESTS_DIR%/}")"
ALL=$(find "$TESTS_DIR" -name '*.test.*' -not -path '*/node_modules/*' 2>/dev/null | sed "s|^$_BASE/||" | sort -u)

LIST_N=$(echo "$LISTED" | grep -c . || true)
ALL_N=$(echo "$ALL" | grep -c . || true)

# 漂移 = 在仓库但不在清单（只对 .test.sh 报——.ts/.py 走 vitest/pytest 不属 canary 语义）
DRIFT=""
while IFS= read -r t; do
  [ -z "$t" ] && continue
  case "$t" in
    *.test.sh)
      echo "$LISTED" | grep -qxF "$t" || DRIFT="${DRIFT}  $t\n" ;;
    *) : ;;  # .ts/.py 由各自 runner 覆盖，不计 canary 漂移
  esac
done <<< "$ALL"

# 反向漂移 = 清单里有但文件已删/改名（防幽灵清单项）
GHOST=""
while IFS= read -r t; do
  [ -z "$t" ] && continue
  [ -f "$_BASE/$t" ] || GHOST="${GHOST}  $t\n"   # 注入缝下同样以 _BASE 为根
done <<< "$LISTED"

echo ""
echo "── canary 漂移对账 (D526) ──"
echo "  测试文件总数: $ALL_N | canary 清单: $LIST_N 项"
if [ -n "$DRIFT" ]; then
  # DRIFT 以字面 \n 拼接——printf %b 展开后再计数/取首行
  N=$(printf '%b' "$DRIFT" | grep -c . || true)
  echo -e "${YELLOW}⚠ 漂移: $N 个 .test.sh 不在 CI canary 清单（红态无防线感知——评估纳入或确认排除）:${RESET}"
  printf '%b' "$DRIFT"
  # CI 上进 GitHub warnings 面板（本地输出无害）
  FIRST=$(printf '%b' "$DRIFT" | head -3 | tr '\n' ',' | tr -d '%' | cut -c1-250)
  echo "::warning title=canary-drift::${N} 个测试不在 CI canary 清单: ${FIRST}"
fi
if [ -n "$GHOST" ]; then
  echo -e "${YELLOW}⚠ 幽灵清单项（清单有、文件无——改删）:${RESET}"
  printf '%b' "$GHOST"
  echo "::warning title=canary-ghost::CI 清单含不存在文件"
fi
if [ -z "$DRIFT" ] && [ -z "$GHOST" ]; then
  echo -e "${GREEN}✅ canary 清单零漂移（.test.sh 全覆盖或显式排除）${RESET}"
fi
exit 0
