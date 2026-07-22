#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-bridge-files.sh — 桥接文件欺诈检测 (铁律 46, V4.5.0 全面加固)
#
# 检测 src/ + packages/ 下所有通过 import 引用 engine-core 的文件。
# 涵盖三种绕过模式:
#   1. 包名路径引用 (packages/engine-core/) — 旧检测
#   2. 相对路径引用 (../../engine-core/) — V4.5.0 新增
#   3. 壳包: packages/*/ 下只有 index.ts 且全部是 export from engine-core — V4.5.0 新增
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

# ═══ 检查 1: src/ + packages/ 全仓库 engine-core 引用扫描 ═══
# 匹配两种模式: 包名路径 "packages/engine-core" + 相对路径 "../../engine-core/"
ENGINE_CORE_REFS=$(grep -rlE "packages/engine-core|\.\./\.\./engine-core|\.\./engine-core" src/ packages/ --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v "\.test\." | grep -v "node_modules" || true)

VIOLATIONS=""
BRIDGE_FILES=""

for file in $ENGINE_CORE_REFS; do
  # 跳过 node_modules 及非文件路径
  echo "$file" | grep -q "node_modules" && continue

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

  # 不在白名单 → 检查文件内容——是否只有 import/re-export (无原创代码)
  non_import_lines=$(grep -v "^import\|^export\|^\/\/\|^\/\*\|\*\/\|^\s*\*\|^$\|^}" "$file" 2>/dev/null | grep -v "^\s*$" | wc -l | tr -d ' ')

  if [ "${non_import_lines:-0}" -eq 0 ]; then
    BRIDGE_FILES="${BRIDGE_FILES}  ${file} (纯桥接——零原创代码)\n"
    VIOLATIONS="${VIOLATIONS}  ${file}\n"
  else
    VIOLATIONS="${VIOLATIONS}  ${file} (${non_import_lines} 行非import代码 — 部分桥接)\n"
  fi
done

# ═══ 检查 2: 壳包检测 — packages/*/ 下只有 index.ts 且全部是 export from engine-core ═══
for pkg_dir in packages/*/; do
  [ ! -d "$pkg_dir/src" ] && continue
  pkg_src_files=$(find "$pkg_dir/src" -name "*.ts" 2>/dev/null)
  src_count=$(echo "$pkg_src_files" | grep -c . 2>/dev/null || echo 0)
  if [ "$src_count" -eq 1 ] && [ -f "${pkg_dir}src/index.ts" ]; then
    reexport_lines=$(grep -c "^export.*from" "${pkg_dir}src/index.ts" 2>/dev/null || echo 0)
    total_lines=$(wc -l < "${pkg_dir}src/index.ts" 2>/dev/null || echo 0)
    if [ "$reexport_lines" -gt 0 ] && [ "$total_lines" -lt 50 ]; then
      if grep -q "engine-core" "${pkg_dir}src/index.ts" 2>/dev/null; then
        BRIDGE_FILES="${BRIDGE_FILES}  ${pkg_dir}src/index.ts (壳包 — ${total_lines} 行, 全部 export from engine-core)\n"
        VIOLATIONS="${VIOLATIONS}  ${pkg_dir}src/index.ts\n"
      fi
    fi
  fi
done

if [ -n "$VIOLATIONS" ]; then
  echo -e "${RED}════════════════════════════════════════════════════════${RESET}"
  echo -e "${RED}  铁律 46 违规: 桥接文件欺诈检测 (V4.5.0)${RESET}"
  echo -e "${RED}════════════════════════════════════════════════════════${RESET}"
  echo ""
  echo -e "${RED}以下文件直接/间接引用 engine-core:${RESET}"
  echo -e "$VIOLATIONS"
  echo ""
  echo -e "${YELLOW}修复方式:${RESET}"
  echo -e "  1. 将 engine-core 中的代码真正迁移到 src/ 或 packages/*/ 中"
  echo -e "  2. 在目标位置重写实现, 不 import engine-core (含相对路径)"
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
    echo -e "${RED}═══ 纯桥接/壳包文件 (零原创代码 — 严重欺诈) ═══${RESET}"
    echo -e "$BRIDGE_FILES"
    echo -e "${RED}以上文件必须物理删除或重写为真实实现。${RESET}"
  fi

  exit 1
else
  echo -e "${GREEN}✅ 铁律 46: 无桥接文件欺诈 (src + packages 全仓库扫描)${RESET}"
  exit 0
fi
