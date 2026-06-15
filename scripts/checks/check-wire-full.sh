#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# pre-commit: 全量接线审计 (快速版, <2s)
#
# 1. 增量: 新 export 是否在生产入口被引用 (硬阻断)
# 2. 桥接: *-bridge.ts 的 export 是否在 index.ts 中导出 (警告)
#
# 挂在: pre-commit (硬阻断增量接线缺失)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

HAD_FAIL=0

# ── 1. 增量接线审计 ──
NEW_FILES=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)

if [ -n "$NEW_FILES" ]; then
  UNWIRED=""
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      if echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated\|^[A-Z].*Props$\|^[A-Z].*Config$\|^[A-Z].*State$'; then continue; fi
      WIRED=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/cli.ts src/agent/ src/routes/ src/sentinel/builtins.ts --include="*.ts" 2>/dev/null \
        | grep -v "export.*${name}" | grep -v "import.*${name}" | grep -v "$file" | head -1 || true)
      if [ -z "$WIRED" ]; then
        UNWIRED="${UNWIRED}  ${file}: export ${name} — 未在生产入口中接线"$'\n'
      fi
    done
  done <<< "$NEW_FILES"

  if [ -n "$UNWIRED" ]; then
    echo -e "${RED}[FAIL] 接线审计 — 新 export 未接线:${RESET}"
    echo -e "$UNWIRED"
    echo "  修复: 在 src/server.ts / src/routes/ / src/agent/ 中 import 并调用"
    HAD_FAIL=1
  else
    echo -e "${GREEN}  新增接线: 全部通过${RESET}"
  fi
else
  echo -e "${GREEN}  新增接线: 无新增文件${RESET}"
fi

# ── 2. 桥接激活检查 (增量 — 只检查本次改动的 bridge 文件) ──
BRIDGE_CHANGED=$(git diff --cached --name-only 2>/dev/null | grep 'bridge\.ts$' || true)
if [ -n "$BRIDGE_CHANGED" ]; then
  BRIDGE_GAP=""
  while IFS= read -r bridge_file; do
    [ -z "$bridge_file" ] && continue
    dir=$(dirname "$bridge_file")
    index_file="${dir}/index.ts"
    BRIDGE_EXPORTS=$(grep -oP 'export (async )?(function|class|const) \K\w+' "$bridge_file" 2>/dev/null || true)
    for name in $BRIDGE_EXPORTS; do
      [ -z "$name" ] && continue
      if [ -f "$index_file" ]; then
        if ! grep -q "\b${name}\b" "$index_file" 2>/dev/null; then
          DIRECT_USE=$(grep -rn "from.*$(basename "$bridge_file" .ts)\|import.*${name}" src/ --include="*.ts" 2>/dev/null \
            | grep -v "\.test\." | grep -v "$bridge_file" | head -1 || true)
          if [ -z "$DIRECT_USE" ]; then
            BRIDGE_GAP="${BRIDGE_GAP}  ${bridge_file}: export ${name} — 未在 index.ts 导出且无直接引用"$'\n'
          fi
        fi
      fi
    done
  done <<< "$BRIDGE_CHANGED"

  if [ -n "$BRIDGE_GAP" ]; then
    echo -e "${YELLOW}[WARN] 桥接未激活:${RESET}"
    echo -e "$BRIDGE_GAP"
    echo "  这些 bridge 函数已实现但未被接线。建议从 index.ts 导出或删除。"
  else
    echo -e "${GREEN}  桥接激活: 全部通过${RESET}"
  fi
else
  echo -e "${GREEN}  桥接激活: 无 bridge 文件改动${RESET}"
fi

# ── 结果 ──
if [ "$HAD_FAIL" -eq 0 ]; then
  echo -e "${GREEN}[PASS] 接线审计: 通过${RESET}"
  exit 0
else
  exit 1
fi
