#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# simulate-ci.sh — D521/工具2: push 前 CI 等价模拟（本地能抓的错不送 CI）
#
# 契约 (铁律 47):
#   @input  — 无参（读当前仓库状态）；测试注入: SYNO_SIM_PRECOMMIT（替代 pre-commit 路径）
#   @output — 与 CI 一致的失败报告（Iron Laws + 密封 gate 测试清单）
#   @exit   — 0=模拟通过 / 1=模拟失败（业务，同 CI 红）/ 2=模拟执行失败（降级，D328 三态）
#   @degraded — pre-commit 缺失 → exit 2 显式降级（不静默当真）
# 用法: bash scripts/control-tower/simulate-ci.sh
# 模拟内容（与 ci.yml 同源）:
#   ① Iron Laws: GITHUB_ACTIONS=true SYNO_CI=1 SYNO_DIFF_BASE=origin/main
#   ② 密封 gate 测试: 从 ci.yml control-tower-tests job 提取清单（单源，不散列）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
PRE_COMMIT="${SYNO_SIM_PRECOMMIT:-$ROOT/scripts/pre-commit-check.sh}"
FAIL=0

echo "═══════════════════════════════════════════════════════════"
echo "  simulate-ci — push 前 CI 等价模拟 (D521)"
echo "═══════════════════════════════════════════════════════════"

if [ ! -f "$PRE_COMMIT" ]; then
  echo -e "${RED}degraded: pre-commit 不存在: ${PRE_COMMIT}（不当作通过，D328 fail-closed）${RESET}" >&2
  exit 2
fi

# ① Iron Laws 等价
echo ""
echo -e "${CYAN}── 1/2: Iron Laws（CI strict: SYNO_CI=1, SYNO_DIFF_BASE=origin/main）──${RESET}"
if ! git rev-parse --verify origin/main >/dev/null 2>&1; then
  echo -e "${YELLOW}⚠ origin/main 不可解析 — Iron Laws 段降级跳过（离线语义，铁律 11 显式）${RESET}"
else
  GITHUB_ACTIONS=true SYNO_CI=1 SYNO_DIFF_BASE=origin/main SYNO_GATEKEEPER_ACK=1 \
    bash "$PRE_COMMIT"
  [ $? -ne 0 ] && FAIL=1
fi

# ② 密封 gate 测试（清单从 ci.yml 单源提取——不散列、不漂移）
echo ""
echo -e "${CYAN}── 2/2: 密封 gate 测试（ci.yml CT job 同款清单）──${RESET}"
# 防递归: 清单必须排除 simulate-ci.test.sh 自身——它调用本脚本，进清单则无限递归
# （D521-3 实证: ct-test-gate 跑它 → 它跑本脚本 → 本脚本跑它 → 提交挂死 600s 超时）
TESTS=$(grep -oE 'tests/control-tower/[a-z0-9-]+\.test\.sh' "$ROOT/.github/workflows/ci.yml" 2>/dev/null | grep -v 'simulate-ci\.test\.sh' | sort -u || true)
if [ -z "$TESTS" ]; then
  echo -e "${YELLOW}⚠ ci.yml 未提取到测试清单 — 段降级跳过${RESET}"
else
  while IFS= read -r t; do
    [ -z "$t" ] && continue
    if [ ! -f "$ROOT/$t" ]; then
      echo -e "  ${RED}❌ $t — 文件缺失${RESET}"; FAIL=1; continue
    fi
    if GITHUB_ACTIONS=true bash "$ROOT/$t" > /dev/null 2>&1; then
      echo -e "  ${GREEN}✅ $t${RESET}"
    else
      echo -e "  ${RED}❌ $t — 模拟红（与 CI 一致）${RESET}"
      FAIL=1
    fi
  done <<< "$TESTS"
fi

echo ""
if [ "$FAIL" -ne 0 ]; then
  echo -e "${RED}❌ 模拟失败 — 本地能抓的错别送 CI（修复后重跑本脚本再 push）${RESET}"
  exit 1
fi
echo -e "${GREEN}✅ CI 等价模拟通过 — 可以 push${RESET}"
exit 0
