#!/bin/bash
# verify-incremental.sh — PostToolUse 增量验证
# vitest(--related) + 接线审计 + 循环计数
# tsc --noEmit 留给 pre-commit (全量太慢)
# exit 0 = 全部通过 (清除循环计数)
# exit 1 = 验证失败 (AI 在同一会话内看到输出并修正)
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

# ═══ 1. 循环计数 ═══
STATE_FILE="$ROOT/.claude/loop-state.json"
MAX=5
if [ -f "$STATE_FILE" ]; then
  ITER=$(python3 -c "import json; print(json.load(open('$STATE_FILE')).get('iteration',0))" 2>/dev/null || echo 0)
  ITER=$((ITER + 1))
else
  ITER=1
fi

if [ "$ITER" -gt "$MAX" ]; then
  echo -e "${RED}[LOOP] 已达最大循环次数 $MAX，停止自动修正。请人工介入。${RESET}"
  rm -f "$STATE_FILE"
  exit 0
fi

python3 -c "
import json
json.dump({'iteration': $ITER, 'maxIterations': $MAX}, open('$STATE_FILE', 'w'))
" 2>/dev/null

echo -e "${CYAN}[VERIFY $ITER/$MAX] 增量验证开始...${RESET}"

# ═══ 2. vitest --related (增量测试, 含类型检查) ═══
# tsc --noEmit 全量太慢 (30s+) → 留给 pre-commit
# vitest: 查找改动文件对应的测试文件
CHANGED_SRC=$(git diff --name-only 2>/dev/null | grep '\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
if [ -n "$CHANGED_SRC" ]; then
  # 映射 src/xxx.ts → tests/xxx.test.ts
  TEST_FILES=""
  while IFS= read -r src; do
    [ -z "$src" ] && continue
    test_file=$(echo "$src" | sed 's|^src/|tests/|; s|\.ts$|.test.ts|')
    if [ -f "$test_file" ]; then
      TEST_FILES="$TEST_FILES $test_file"
    fi
  done <<< "$CHANGED_SRC"

  if [ -n "$TEST_FILES" ]; then
    echo -e "${CYAN}[VERIFY $ITER/$MAX] vitest ($(echo $TEST_FILES | wc -w) test files)...${RESET}"
    if npx vitest run $TEST_FILES 2>&1; then
      echo -e "${GREEN}  相关测试: 通过${RESET}"
    else
      echo -e "${RED}[FAIL] 相关测试失败 — 请修正后重新保存文件${RESET}"
      exit 1
    fi
  else
    echo -e "${CYAN}[VERIFY $ITER/$MAX] 无对应测试文件，跳过测试${RESET}"
  fi
else
  echo -e "${CYAN}[VERIFY $ITER/$MAX] 无 .ts 文件改动，跳过测试${RESET}"
fi

# ═══ 4. 接线审计 (新文件 export 验证) ═══
NEW_FILES=$(git diff --cached --name-only --diff-filter=A 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
if [ -n "$NEW_FILES" ]; then
  echo -e "${CYAN}[VERIFY $ITER/$MAX] 接线审计...${RESET}"
  UNWIRED=""
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      if echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated'; then continue; fi
      WIRED=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/cli.ts src/agent/ src/routes/ src/sentinel/builtins.ts --include="*.ts" 2>/dev/null | grep -v "export.*${name}" | grep -v "import.*${name}" | grep -v "$file" | head -1 || true)
      if [ -z "$WIRED" ]; then
        UNWIRED="${UNWIRED}  ${file}: export ${name} — 未在生产入口中接线\n"
      fi
    done
  done <<< "$NEW_FILES"
  if [ -n "$UNWIRED" ]; then
    echo -e "${RED}[FAIL] 接线审计失败:${RESET}"
    echo -e "$UNWIRED"
    echo "请在入口文件 (server.ts/routes/agent/) 中 import 并调用。"
    exit 1
  fi
  echo -e "${GREEN}  接线审计: 通过${RESET}"
else
  echo -e "${CYAN}[VERIFY $ITER/$MAX] 无新增文件，跳过接线审计${RESET}"
fi

# ═══ 5. 增量架构边界 (跨层引用) ═══
CHANGED_SRC=$(git diff --name-only 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
if [ -n "$CHANGED_SRC" ]; then
  echo -e "${CYAN}[VERIFY $ITER/$MAX] 增量架构边界...${RESET}"
  if bash "$ROOT/scripts/workflow/check-boundaries-incremental.sh" 2>&1; then
    echo -e "${GREEN}  架构边界: 通过${RESET}"
  else
    echo -e "${RED}[FAIL] 架构边界违规 — 请重构为 L2 桥接服务${RESET}"
    exit 1
  fi
fi

# ═══ 6. 暗默失败检查 (新增/修改的 .ts 文件 catch 无 log) ═══
TS_DIFF=$(git diff -- '*.ts' '*.tsx' 2>/dev/null || true)
if [ -n "$TS_DIFF" ]; then
  NEW_CATCHES=$(echo "$TS_DIFF" | grep "^\+.*catch\s*(" 2>/dev/null || true)
  # 排除: catch 后紧跟 log / throw / degraded / 注释说明
  NEW_CATCHES=$(echo "$NEW_CATCHES" | grep -v "catch.*log\.\|catch.*logger\|catch.*//.*log\|catch.*/\*.*log\|catch.*throw\|catch.*degraded" || true)
  if [ -n "$NEW_CATCHES" ]; then
    echo -e "${CYAN}[VERIFY $ITER/$MAX] 暗默失败检查...${RESET}"
    SILENT=""
    while IFS= read -r catch_line; do
      [ -z "$catch_line" ] && continue
      # 在 diff 中找这个 catch 后面的上下文
      AFTER=$(echo "$TS_DIFF" | grep -A3 "$catch_line" | tail -3)
      if ! echo "$AFTER" | grep -qE "log\.|logger\.|console\.|throw |return.*degraded"; then
        SILENT="${SILENT}  ${catch_line}\n"
      fi
    done <<< "$NEW_CATCHES"
    if [ -n "$SILENT" ]; then
      echo -e "${RED}[FAIL] 暗默失败: 新增 catch 无 log:${RESET}"
      echo -e "$SILENT"
      echo "请在 catch 块中添加 log.warn/log.error"
      exit 1
    fi
    echo -e "${GREEN}  暗默失败: 通过${RESET}"
  fi
fi

# ═══ 7. 用户可见缺口检查 (新增 export 无对应 API 变更) ═══
NEW_EXPORTS_ALL=$(git diff --name-only 2>/dev/null | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
ROUTE_CHANGED=$(git diff --name-only 2>/dev/null | grep '^src/routes/' || true)
if [ -n "$NEW_EXPORTS_ALL" ] && [ -z "$ROUTE_CHANGED" ]; then
  # 有 src 文件改动但没有 route 文件改动 → 可能遗漏用户入口
  NEW_FUNCS=$(git diff 2>/dev/null | grep "^\+export \(function\|class\|const\)" | grep -oP 'export (function|class|const) \K\w+' || true)
  if [ -n "$NEW_FUNCS" ]; then
    echo -e "${CYAN}[VERIFY $ITER/$MAX] 用户可见缺口...${RESET}"
    # 检查这些新函数是否被现有路由引用
    GAP=""
    for func in $NEW_FUNCS; do
      if ! grep -rn "\b${func}\b" src/routes/ --include="*.ts" 2>/dev/null | grep -qv "import.*${func}"; then
        GAP="${GAP}  export ${func} — 未在 src/routes/ 中发现引用\n"
      fi
    done
    if [ -n "$GAP" ]; then
      echo -e "${YELLOW}[WARN] 可能缺少用户入口:${RESET}"
      echo -e "$GAP"
      echo -e "${YELLOW}  新增了导出但未更新 API 路由。如果这是内部函数请忽略。${RESET}"
      # 不阻断，仅警告
    fi
  fi
fi

# ═══ 全部通过 → 清除循环状态 ═══
rm -f "$STATE_FILE"
echo -e "${GREEN}[PASS] 增量验证全部通过 — 循环计数已重置${RESET}"
echo ""
echo "如果修改了接口签名，请更新 task brief 的接口审计字段。"
exit 0
