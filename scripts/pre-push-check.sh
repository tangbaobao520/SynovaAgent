#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Pre-Push 硬阻断 — 集成验证
#
# 三阶段门禁模型:
#   Stage 0: 任务开始 → task brief 强制 (pre-commit 门禁 ⓪ 间接强制)
#   Stage 1: pre-commit → 代码质量 (33 个硬阻断, 每次 commit)
#   Stage 2: pre-push → 集成验证 (本脚本, 所有 commits 合并后)
#
# Pre-push 6 道门:
#   1. Anthropic 决策树 (最终裁决)
#   2. tsc --noEmit src/ 零错误
#   3. vitest run 全绿
#   4. 铁律门禁 (同 pre-commit, 二次验证)
#   5. 接线审计 (新函数名出现在生产入口)
#   6. 架构边界 (6 条全部检查)
#
# 任一步失败 → 拒绝 push。没有例外。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)"
FAIL=0

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Pre-Push 集成验证 — 6 道门"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 1. Anthropic 决策树 — 最终裁决 ═══
echo -e "${CYAN}── 1/6 Anthropic 决策树 (最终裁决) ──────────────────${RESET}"
bash "$SCRIPT_DIR/anthropic-decide.sh" || { echo -e "  ${RED}❌ 未通过${RESET}"; FAIL=1; }

# ═══ 2. tsc --noEmit — src/ 零错误 ═══
echo ""
echo -e "${CYAN}── 2/6 tsc --noEmit (src/ 零错误) ────────────────────${RESET}"
TSC_OWN=$(npx tsc --noEmit 2>&1 | grep "^src/" || true)
if [ -n "$TSC_OWN" ]; then
  echo -e "  ${RED}❌ src/ tsc 错误: $(echo "$TSC_OWN" | grep -c .) 处${RESET}"
  echo "$TSC_OWN" | head -10; FAIL=1
else
  echo -e "  ${GREEN}✅ src/ tsc 零错误${RESET}"
fi

# ═══ 3. vitest run — 零失败 ═══
echo ""
echo -e "${CYAN}── 3/6 vitest run (全量测试) ─────────────────────────${RESET}"
VITEST_OUT=$(npx vitest run 2>&1 || true)
VITEST_FAILS=$(echo "$VITEST_OUT" | grep -c "× " 2>/dev/null) || VITEST_FAILS=0
VITEST_PASS=$(echo "$VITEST_OUT" | grep -c "✓ " 2>/dev/null) || VITEST_PASS=0
if [ "${VITEST_FAILS:-0}" -gt 0 ]; then
  echo -e "  ${RED}❌ ${VITEST_FAILS} tests failed — 零失败才允许 push${RESET}"; FAIL=1
else
  echo -e "  ${GREEN}✅ ${VITEST_PASS} tests passing${RESET}"
fi

# ═══ 4. 铁律门禁 (同 pre-commit, 二次验证) ═══
echo ""
echo -e "${CYAN}── 4/6 铁律门禁 (二次验证) ──────────────────────────${RESET}"
bash "$SCRIPT_DIR/pre-commit-check.sh" || { FAIL=1; }

# ═══ 5. 接线审计 — 新函数/类必须出现在生产入口 ═══
echo ""
echo -e "${CYAN}── 5/6 接线审计 (Wire Check) ─────────────────────────${RESET}"
WIRE_FAIL=0
# 找出从 origin/main 分支点以来的所有新 export
git fetch origin main 2>/dev/null || true
DIFF_COMMITS=$(git log --oneline origin/main..HEAD 2>/dev/null | cut -d' ' -f1 || true)
if [ -n "$DIFF_COMMITS" ]; then
  while IFS= read -r commit; do
    [ -z "$commit" ] && continue
    NEW_EXPORTS=$(git show "$commit" -- "src/*.ts" 2>/dev/null \
      | grep "^+export \(function\|class\|const\)" \
      | sed 's/^+export \(function\|class\|const\) //' \
      | sed 's/(.*//' | sed 's/:.*//' | sed 's/=.*//' \
      | grep -v "type\|interface\|_" | grep -v "^$" | sort -u || true)
    for name in $NEW_EXPORTS; do
      [ -z "$name" ] && continue
      # 在生产入口文件中搜索 (排除自身定义行)
      WIRED=$(grep -rn "\b${name}\b" "$ROOT/src/server.ts" "$ROOT/src/index.ts" "$ROOT/src/cli.ts" "$ROOT/src/agent/" "$ROOT/src/sentinel/builtins.ts" "$ROOT/src/routes/" --include="*.ts" 2>/dev/null | grep -v "export.*${name}" | grep -v "\.test\." | head -1 || true)
      if [ -z "$WIRED" ]; then
        echo -e "  ${RED}❌ ${name} — 未接线${RESET}"; WIRE_FAIL=$((WIRE_FAIL + 1))
      fi
    done
  done <<< "$DIFF_COMMITS"
fi
if [ "$WIRE_FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}✅ 接线审计: 通过${RESET}"
else
  echo -e "  ${RED}❌ 接线审计: ${WIRE_FAIL} 处未接线 — 铁律 0-2 Step 5${RESET}"; FAIL=1
fi

# ═══ 6. 架构边界 (完整版 6 条) ═══
echo ""
echo -e "${CYAN}── 6/6 架构边界 ──────────────────────────────────────${RESET}"
bash "$SCRIPT_DIR/check-architecture.sh" || { FAIL=1; }

# ═══ 7. ArchitectureAuditor (可选深度审计) ═══
# ArchitectureAuditor 默认启用。设置 RUN_ARCH_AUDIT=0 跳过。
if [ "${RUN_ARCH_AUDIT:-1}" = "1" ]; then
  echo ""
  echo -e "${CYAN}── 7/7 ArchitectureAuditor ─────────────────────────${RESET}"
  bash "$SCRIPT_DIR/workflow/run-auditor.sh" || { FAIL=1; }
fi

# ═══ 结果 ═══
echo ""
echo "───────────────────────────────────────────────────────────"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}Pre-Push 6/6 全部通过 ✅ — 允许推送${RESET}"
  exit 0
else
  echo -e "  ${RED}Pre-Push ${FAIL} 道门未通过 — 推送已拒绝${RESET}"
  echo ""
  echo "  三阶段门禁模型:"
  echo "    Stage 0: 任务开始 → task brief (pre-commit 门禁 ⓪)"
  echo "    Stage 1: 每次 commit → 33 硬阻断"
  echo "    Stage 2: push → 决策树 + tsc + vitest + iron-laws + 接线审计 + 架构"
  exit 1
fi
