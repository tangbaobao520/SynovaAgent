#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 节点 ③: 实现完成检查点 (Post-Implementation)
#
# 触发: CLAUDE.md 指令 — 声称"完成"之前必须运行
# 用法: bash scripts/workflow/checkpoint-impl.sh <新函数名或类名>
#
# 这是 Antropic 工作流中最重要的节点。
# 历史: 4 次接线失败 + 61 处空 catch + 47 次 as any — 全部可在此节点拦截。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

FUNC_NAME="${1:-}"
FAIL=0

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Anthropic 实现完成检查 — 声称"完成"之前${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""

# ═══ Q1: 接线验证 ═══
echo -e "${CYAN}🔌 Q1: 接线验证 (铁律 0-2 Step 5)${RESET}"
echo ""
if [ -n "$FUNC_NAME" ]; then
  if bash "$SCRIPT_DIR/wire-check.sh" "$FUNC_NAME" 2>/dev/null; then
    echo ""
  else
    FAIL=1
  fi
else
  echo -e "  ${YELLOW}⚠ 未提供函数名，跳过接线检查${RESET}"
  echo "  用法: checkpoint-impl.sh <新函数名>"
  echo ""
fi

# ═══ Q2: 测试 ═══
echo -e "${CYAN}🧪 Q2: 测试状态 (铁律 0-2 Step 4)${RESET}"
echo ""
cd "$ROOT"
TEST_OUTPUT=$(npx vitest run --reporter=verbose 2>&1 || true)
FAILED=$(echo "$TEST_OUTPUT" | grep -c "× " 2>/dev/null | tr -d '[:space:]' || echo "0")
PASSED=$(echo "$TEST_OUTPUT" | grep -c "✓ " 2>/dev/null | tr -d '[:space:]' || echo "0")
echo "  通过: ${PASSED} | 失败: ${FAILED}"
if [ "${FAILED:-0}" -gt 0 ]; then
  echo -e "  ${RED}❌ 有 ${FAILED} 个测试失败 — 修复后再运行${RESET}"
  echo "$TEST_OUTPUT" | grep "× " | head -10
  FAIL=1
else
  echo -e "  ${GREEN}✅ 全绿${RESET}"
fi

# 检查新测试文件
NEW_TESTS=$(git diff --cached --name-only 2>/dev/null | grep "\.test\." || git diff --name-only 2>/dev/null | grep "\.test\." || echo "")
if [ -n "$NEW_TESTS" ]; then
  echo "  新增测试: $(echo "$NEW_TESTS" | wc -l | tr -d '[:space:]') 个文件"
else
  echo -e "  ${YELLOW}⚠ 未检测到新增测试文件 — 确认是否需要补测试${RESET}"
fi
echo ""

# ═══ Q3: 类型检查 ═══
echo -e "${CYAN}📝 Q3: TypeScript 编译${RESET}"
echo ""
TSC_OUT=$(npx tsc --noEmit 2>&1 || true)
TSC_NEW=$(echo "$TSC_OUT" | grep "error TS" | grep -v "server/vendor/" | grep -v "packages/" | grep -v "node_modules" | wc -l | tr -d '[:space:]') || true
if [ "${TSC_NEW:-0}" -gt 0 ]; then
  echo -e "  ${RED}❌ ${TSC_NEW} 个 src/ 类型错误${RESET}"
  echo "$TSC_OUT" | grep "error TS" | grep -v "server/vendor/" | grep -v "packages/" | head -5
  FAIL=1
else
  echo -e "  ${GREEN}✅ tsc 零错误${RESET}"
fi
echo ""

# ═══ Q4: 铁律门禁 ═══
echo -e "${CYAN}🛡️ Q4: 铁律门禁${RESET}"
echo ""
IRON_OUT=$(bash "$ROOT/scripts/pre-commit-check.sh" 2>&1 || true)
AS_ANY=$(echo "$IRON_OUT" | grep "as any" | grep -o "[0-9]* 处" | grep -o "[0-9]*" || echo "0")
MOCK=$(echo "$IRON_OUT" | grep "Mock/TODO" | grep -o "[0-9]* 处" | grep -o "[0-9]*" || echo "0")
if [ "$AS_ANY" != "0" ] 2>/dev/null; then
  echo -e "  ${RED}❌ as any: ${AS_ANY} 处${RESET}"
  FAIL=1
else
  echo -e "  ${GREEN}✅ as any: 0${RESET}"
fi
if [ "$MOCK" != "0" ] 2>/dev/null; then
  echo -e "  ${RED}❌ Mock/TODO: ${MOCK} 处${RESET}"
  FAIL=1
else
  echo -e "  ${GREEN}✅ Mock/TODO: 0${RESET}"
fi
echo ""

# ═══ Q5: 变更统计 ═══
echo -e "${CYAN}📁 Q5: 变更清单${RESET}"
echo ""
ADDED=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | wc -l | tr -d '[:space:]') || ADDED=0
MODIFIED=$(git diff --cached --name-only --diff-filter=M 2>/dev/null | wc -l | tr -d '[:space:]') || MODIFIED=0
DELETED=$(git diff --cached --name-only --diff-filter=D 2>/dev/null | wc -l | tr -d '[:space:]') || DELETED=0
echo "  新增: ${ADDED} | 修改: ${MODIFIED} | 删除: ${DELETED}"
# 提醒: 如果是替换重构, 检查旧文件是否删除
if [ "$ADDED" -gt 0 ] && [ "$DELETED" -eq 0 ]; then
  echo -e "  ${YELLOW}⚠ 新增 ${ADDED} 个文件但未删除旧文件 — 检查铁律 26/37${RESET}"
fi
echo ""

# ═══ 结果 ═══
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
if [ "$FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}✅ 全部通过 — 可以 commit${RESET}"
  echo ""
  echo "  下一步: git add -A && git commit -m 'feat: ...'"
  echo "           git push origin \$(git branch --show-current)"
else
  echo -e "  ${RED}❌ 检查未通过 — 修复后重新运行${RESET}"
  echo ""
  echo "  修复方向:"
  echo "    1. 接线: bash scripts/workflow/wire-check.sh <函数名>"
  echo "    2. 测试: npx vitest run --reporter=verbose"
  echo "    3. 类型: npx tsc --noEmit"
  echo "    4. 铁律: bash scripts/pre-commit-check.sh"
fi
echo -e "${CYAN}────────────────────────────────────────────────────────────${RESET}"
echo ""

exit $FAIL
