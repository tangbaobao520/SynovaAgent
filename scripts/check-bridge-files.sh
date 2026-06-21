#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-bridge-files.sh — 桥接文件欺诈检测 (铁律 46)
#
# 检测 src/ 下所有通过 import 引用 packages/engine-core/ 的文件。
# 如果文件只包含 import/re-export 而无原创代码 → 桥接文件欺诈。
#
# 规则:
#   1. src/ 下任何文件不得直接 import from packages/engine-core/
#   2. 例外: src/adapters/engine-core-adapter.ts (官方适配器, 唯一通道)
#   3. 例外: src/init/engine-context.ts (引擎初始化注入)
#   4. 例外: src/types/engine-core-types.ts (类型重导出)
#
# 铁律 46: 禁止桥接代理文件。src/ 文件必须是真实实现, 不能是 engine-core 的 import 代理。
#
# exit 0 = 无欺诈桥接
# exit 1 = 发现欺诈桥接文件
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

# 允许的白名单——这些文件是合法的 engine-core 引用
ALLOWED=(
  "src/adapters/engine-core-adapter.ts"
  "src/init/engine-context.ts"
  "src/types/engine-core-types.ts"
  "src/agent/orchestrator-adapter.ts"
  "src/l4/graph-bridge.ts"
  "src/l4/entity-resolver-l2.ts"
  "src/l4/engine-graph-store.ts"
  "src/l4/diagnosis-graph-query.ts"
)

# 找到所有引用 engine-core 的 src/ 文件
ENGINE_CORE_REFS=$(grep -rl "packages/engine-core" src/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" || true)

VIOLATIONS=""
BRIDGE_FILES=""

for file in $ENGINE_CORE_REFS; do
  # 检查是否在白名单
  is_allowed=0
  for allowed in "${ALLOWED[@]}"; do
    if [ "$file" = "$allowed" ]; then
      is_allowed=1
      break
    fi
  done

  if [ "$is_allowed" -eq 1 ]; then
    continue
  fi

  # 不在白名单 → 可能是欺诈桥接文件
  # 检查文件内容——是否只有 import/re-export (无原创代码)
  non_import_lines=$(grep -v "^import\|^export\|^\/\/\|^\/\*\|\*\/\|^\s*\*\|^$\|^}" "$file" 2>/dev/null | grep -v "^\s*$" | wc -l | tr -d ' ')

  if [ "${non_import_lines:-0}" -eq 0 ]; then
    # 纯桥接文件——只有 import/export, 零原创代码
    BRIDGE_FILES="${BRIDGE_FILES}  ${file} (纯桥接——零原创代码)\n"
    VIOLATIONS="${VIOLATIONS}  ${file}\n"
  else
    # 有原创代码但引用了 engine-core —— 部分桥接
    VIOLATIONS="${VIOLATIONS}  ${file} (${non_import_lines} 行非import代码 — 部分桥接)\n"
  fi
done

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}════════════════════════════════════════════════════════${RESET}"
  echo -e "${RED}  铁律 46 违规: 桥接文件欺诈检测${RESET}"
  echo -e "${RED}════════════════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "${RED}以下 src/ 文件直接引用 packages/engine-core/:${RESET}"
  echo -e "$VIOLATIONS"
  echo ""
  echo -e "${YELLOW}这些文件绕过五层架构, 直接依赖 engine-core 内部实现。${RESET}"
  echo -e "${YELLOW}修复方式:${RESET}"
  echo -e "  1. 将 engine-core 中的代码真正迁移到 src/pipeline/ / src/sentinel/compute/ / src/l4/"
  echo -e "  2. 在 src/ 中重写实现, 不 import engine-core"
  echo -e "  3. 更新调用方 import, 指向新位置"
  echo -e "  4. 删除旧 engine-core 代码"
  echo -e "  5. 重新运行本脚本确认零引用"
  echo ""
  echo -e "${YELLOW}白名单文件 (允许引用):${RESET}"
  for allowed in "${ALLOWED[@]}"; do
    echo -e "  ${GREEN}✓${RESET} $allowed"
  done

  if [ -n "$BRIDGE_FILES" ]; then
    echo ""
    echo -e "${RED}═══ 纯桥接文件 (零原创代码 — 严重欺诈) ═══${RESET}"
    echo -e "$BRIDGE_FILES"
    echo -e "${RED}以上文件必须物理删除或重写为真实实现。${RESET}"
  fi

  exit 1
else
  echo -e "${GREEN}✅ 铁律 46: 无桥接文件欺诈${RESET}"
  exit 0
fi
