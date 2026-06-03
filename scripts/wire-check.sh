#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 铁律 0-2 Step 5: 接线验证 — 新 export 必须有生产入口 import
#
# 检查 git diff 中新增的 export function/class/const，
# 是否在 src/ 的生产代码中至少被 import 一次。
# 排除测试文件和自身文件。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

echo ""
echo "═══ 接线审计 (Wire Check) — 铁律 0-2 Step 5 ═══"
echo ""

# 获取相对于 main 的新增 export
NEW_EXPORTS=$(git diff main...HEAD -- src/ -- "*.ts" 2>/dev/null \
  | grep "^\+export \(function\|class\|const\|interface\|type\|enum\)" \
  | sed 's/^+export \(function\|class\|const\|interface\|type\|enum\) \([a-zA-Z0-9_]*\).*/\2/' \
  | sort -u || true)

if [ -z "$NEW_EXPORTS" ]; then
  echo -e "  ${GREEN}✅ 无新增 export — 跳过接线审计${RESET}"
  echo ""
  exit 0
fi

UNWIRED=""
while read -r name; do
  [ -z "$name" ] && continue
  # 排除常见非接线模式: 类型导出、接口导出、测试工具
  # 查找: 生产代码中 import 或引用此名称（排除自身文件和测试文件）
  REFS=$(grep -rn "$name" src/ --include="*.ts" 2>/dev/null \
    | grep -v "\.test\." | grep -v "\.spec\." \
    | grep -v "export.*$name" \
    || true)
  if [ -z "$REFS" ]; then
    UNWIRED="${UNWIRED}${name}\n"
    echo -e "  ${RED}❌ ${name} — 零处生产 import 引用${RESET}"
  else
    COUNT=$(echo "$REFS" | wc -l | tr -d ' ')
    echo -e "  ${GREEN}✅ ${name} — ${COUNT} 处引用${RESET}"
  fi
done <<< "$NEW_EXPORTS"

echo ""

if [ -n "$UNWIRED" ]; then
  COUNT=$(echo -e "$UNWIRED" | grep -c . || echo 0)
  echo -e "  ${RED}接线失败: ${COUNT} 个新导出无生产引用${RESET}"
  echo "  ⚠ 铁律 0-2 Step 5: 组件未接线 ≠ 功能完成"
  echo "  在生产代码中 import 并使用以上导出，或确认是纯类型导出。"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}✅ 接线审计通过 — 所有新导出至少一处生产引用${RESET}"
  echo ""
  exit 0
fi
