#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Secrets 扫描 — pre-commit 硬阻断
# 检测: API Key / Token / Password 硬编码在源码中
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

echo ""
echo "═══ Secrets 扫描 ═══"
echo ""

# 扫描 staged 文件中的敏感模式
# 排除: .env (已 gitignored), 测试文件, node_modules, 注释
STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep '\.ts$\|\.js$\|\.json$\|\.yaml$\|\.yml$' | grep -v node_modules | grep -v '\.test\.' || true)

LEAKS=""
if [ -n "$STAGED" ]; then
  # 模式: API Key (sk-), token=, password=, secret= (非示例值)
  LEAKS=$(echo "$STAGED" | xargs grep -n "sk-[a-zA-Z0-9]\{20,\}\|ApiKey['\"]\s*:\s*['\"][a-zA-Z0-9]\|token['\"]\s*:\s*['\"][a-zA-Z0-9]\{16,\}\|password['\"]\s*:\s*['\"][^'\"]\{4,\}\|secret['\"]\s*:\s*['\"][a-zA-Z0-9]\{8,\}" 2>/dev/null \
    | grep -v "your-\|example\|placeholder\|demo\|test-\|xxx\|TODO\|CHANGE" \
    || true)
fi

if [ -n "$LEAKS" ]; then
  COUNT=$(echo "$LEAKS" | wc -l | tr -d ' ')
  echo -e "  ${RED}❌ Secrets 泄漏: ${COUNT} 处${RESET}"
  echo "$LEAKS" | while read -r line; do echo "     ${line}"; done
  echo ""
  echo "  禁止在源码中硬编码 API Key / Token / Password。"
  echo "  使用环境变量或 .env (已 gitignored)。"
  echo ""
  exit 1
fi

echo -e "  ${GREEN}✅ 无 Secrets 泄漏${RESET}"
echo ""
exit 0
