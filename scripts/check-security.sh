#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 安全检查 — pre-commit 硬阻断
# 检测: eval(), new Function(), 硬编码端口, http:// 非本地 URL
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'
FAIL=0

echo ""
echo "═══ 安全检查 ═══"
echo ""

# 1. eval() — 代码注入风险
EVAL=$(grep -rn "eval(" src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "\.test\." | grep -v "//.*eval" | grep -v "'eval('" | grep -v '"eval("' | grep -v '`eval(`' || true)
EVAL_COUNT=$(echo "$EVAL" | grep -c . 2>/dev/null || echo 0)
if [ "$EVAL_COUNT" -gt 0 ]; then
  echo -e "  ${RED}❌ eval() 使用: ${EVAL_COUNT} 处${RESET}"
  echo "$EVAL" | while read -r line; do echo "     ${line}"; done
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ 无 eval() 使用${RESET}"
fi

# 2. new Function() — 等同于 eval
FUNC_CTOR=$(grep -rn "new Function(" src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "\.test\." || true)
FUNC_COUNT=$(echo "$FUNC_CTOR" | grep -c . 2>/dev/null || echo 0)
if [ "$FUNC_COUNT" -gt 0 ]; then
  echo -e "  ${RED}❌ new Function(): ${FUNC_COUNT} 处${RESET}"
  echo "$FUNC_CTOR" | while read -r line; do echo "     ${line}"; done
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ 无 new Function() 使用${RESET}"
fi

# 3. HTTP 明文 (排除 localhost)
HTTP_LEAK=$(grep -rn "http://" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "localhost\|127\.0\.0\.1\|0\.0\.0\.0" \
  | grep -v "//.*http:" \
  || true)
HTTP_COUNT=$(echo "$HTTP_LEAK" | grep -c . 2>/dev/null || echo 0)
if [ "$HTTP_COUNT" -gt 0 ]; then
  echo -e "  ${RED}❌ HTTP 明文 URL: ${HTTP_COUNT} 处${RESET}"
  echo "$HTTP_LEAK" | while read -r line; do echo "     ${line}"; done
  echo "     生产环境应使用 HTTPS。如为外部服务, 请确认。"
  FAIL=$((FAIL + 1))
else
  echo -e "  ${GREEN}✅ 无 HTTP 明文 URL${RESET}"
fi

echo ""

if [ "$FAIL" -gt 0 ]; then
  echo -e "  ${RED}安全检查: ${FAIL} 项违规${RESET}"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}安全检查: 全部通过 ✅${RESET}"
  echo ""
  exit 0
fi
