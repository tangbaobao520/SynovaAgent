#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# pre-commit 硬阻断: 空壳模块检测
#
# 检测 engine-core 中 compute() 返回 null/空对象/throw 的模块。
# 空壳 = 从未产出过数据的代码 — 不是资产，是债务。
#
# 挂在: pre-commit (物理阻断 — 有空壳不准提交)
# 原则: 存量 warn (不阻断)，增量 hard-block (阻断)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

# ── 1. 扫描空壳模式 ──
# 模式 A: compute: async (_teamId) => { return null / return [] / throw }
# 模式 B: compute: (_teamId) => null
# 模式 C: compute: async () => ({ ...空对象 }) — 需人工判断, warn
EMPTY_SHELLS=$(grep -rn "compute.*=>.*{\s*$" packages/engine-core/src/pipeline/diagnosis/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "__tests__" || true)

# 检查返回 null 的
NULL_RETURNS=$(grep -rn "return\s*null;\|return\s*\[\];" packages/engine-core/src/pipeline/diagnosis/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "__tests__" | grep -v "module-registry\|types\|index" || true)

# 合并: 有 compute 签名 + 返回 null 的文件
EMPTY_FILES=""
if [ -n "$EMPTY_SHELLS" ] && [ -n "$NULL_RETURNS" ]; then
  while IFS= read -r shell_line; do
    [ -z "$shell_line" ] && continue
    file=$(echo "$shell_line" | cut -d: -f1)
    if echo "$NULL_RETURNS" | grep -q "^${file}:"; then
      EMPTY_FILES="${EMPTY_FILES}${file}"$'\n'
    fi
  done <<< "$EMPTY_SHELLS"
fi

EMPTY_FILES=$(echo "$EMPTY_FILES" | sort -u | grep -v '^$' || true)

if [ -z "$EMPTY_FILES" ]; then
  echo -e "  ${GREEN}✅ 空壳模块: 无${RESET}"
  exit 0
fi

# ── 2. 区分增量和存量 ──
NEW_EMPTY=""
OLD_EMPTY=""

while IFS= read -r file; do
  [ -z "$file" ] && continue
  if git diff --cached --name-only 2>/dev/null | grep -q "^${file}$"; then
    # 本次 commit 有改动
    if git diff --cached --name-only --diff-filter=A 2>/dev/null | grep -q "^${file}$"; then
      NEW_EMPTY="${NEW_EMPTY}  ${file} (新增空壳 — 硬阻断)"$'\n'
    else
      # 存量文件被修改但仍为空壳
      NEW_EMPTY="${NEW_EMPTY}  ${file} (修改后仍为空壳 — 硬阻断)"$'\n'
    fi
  else
    OLD_EMPTY="${OLD_EMPTY}  ${file}"$'\n'
  fi
done <<< "$EMPTY_FILES"

# ── 3. 输出 ──
HAD_FAIL=0

if [ -n "$NEW_EMPTY" ]; then
  echo -e "  ${RED}❌ 空壳模块 (硬阻断):${RESET}"
  echo -e "$NEW_EMPTY"
  echo "  → 空壳不是资产是债务。删除或实现真正的 compute()。"
  echo "  → 删除: git rm <file> && git commit -m 'chore: 删除空壳模块 <name>'"
  HAD_FAIL=1
fi

if [ -n "$OLD_EMPTY" ]; then
  OLD_COUNT=$(echo "$OLD_EMPTY" | grep -c . 2>/dev/null) || OLD_COUNT=0
  echo -e "  ${YELLOW}⚠  存量空壳: ${OLD_COUNT} 个 (不阻断, 建议删除)${RESET}"
  echo -e "$OLD_EMPTY"
fi

if [ "$HAD_FAIL" -eq 1 ]; then
  exit 1
fi

exit 0
