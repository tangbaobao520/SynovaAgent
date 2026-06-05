#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 接线审计 (Iron Law 0-2 Step 5 — HARD GATE)
#
# 用法: bash scripts/workflow/wire-check.sh <新函数名或类名>
#
# 验证新函数/类名出现在生产入口文件中 (server.ts, routes/, agent/, cli.ts)。
# 零结果 = 未接线 = 禁止进入下一步。
#
# 历史: 4 次接线失败 (ViewAdapter, Phase0Engine, ModuleRunner, GraphBridge)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; YELLOW='\033[1;33m'; RESET='\033[0m'

FUNC_NAME="${1:-}"

if [ -z "$FUNC_NAME" ]; then
  echo -e "${YELLOW}用法: wire-check.sh <函数名或类名>${RESET}"
  echo "示例: wire-check.sh collectActivity"
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  接线审计 — 铁律 0-2 Step 5 (HARD GATE)${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""
echo "  目标: ${FUNC_NAME}"
echo ""

# 搜索生产入口文件
SEARCH_DIRS=("$ROOT/src/server.ts" "$ROOT/src/routes/" "$ROOT/src/agent/" "$ROOT/src/cli.ts" "$ROOT/src/index.ts")

# 排除 import 语句和测试文件 (只看实际调用/使用)
RESULTS=$(grep -rn "$FUNC_NAME" "${SEARCH_DIRS[@]}" --include="*.ts" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" || true)

if [ -z "$RESULTS" ]; then
  echo -e "  ${RED}❌ ${FUNC_NAME} — 未接线!${RESET}"
  echo ""
  echo "  在以下位置未找到任何引用:"
  echo "    - src/server.ts (路由挂载)"
  echo "    - src/routes/ (路由定义)"
  echo "    - src/agent/ (Agent 逻辑)"
  echo "    - src/cli.ts (CLI 入口)"
  echo "    - src/index.ts (主入口)"
  echo ""
  echo "  ${RED}铁律 0-2: 未接线 = 未完成。禁止 commit/push。${RESET}"
  echo ""
  echo "  修复方向:"
  echo "    1. 路由: 在 src/routes/ 中创建路由文件 + 在 src/server.ts 中 app.use()"
  echo "    2. Agent: 在 src/agent/ 中 import 并调用"
  echo "    3. CLI: 在 src/cli.ts 中注册命令"
  exit 1
fi

# 检查是否仅仅被 import (可能未实际调用)
IMPORT_ONLY=$(echo "$RESULTS" | grep -c "import.*from" || true)
CALL_COUNT=$(echo "$RESULTS" | grep -cv "import.*from" || true)

echo -e "  ${GREEN}✅ ${FUNC_NAME} 已接线${RESET}"
echo ""
echo "  引用位置 (${CALL_COUNT} 处调用 + ${IMPORT_ONLY} 处导入):"
echo "$RESULTS" | while read -r line; do
  echo "    $line"
done
echo ""

if [ "$CALL_COUNT" -eq 0 ] && [ "$IMPORT_ONLY" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠ 仅被 import, 未被实际调用 — 可能是死代码${RESET}"
  echo "  请确认在 import 之后确实有调用 (如 app.use(), new Xxx(), xxx.yyy())"
fi

echo -e "${GREEN}  接线审计通过 ✅${RESET}"
echo ""
exit 0
