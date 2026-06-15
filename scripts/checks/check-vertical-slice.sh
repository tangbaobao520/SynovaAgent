#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# pre-commit 硬阻断: 垂直切片完整性检查
#
# 铁律 4: 入口 → 交互 → 结果，三环节缺一不可交付。
# 铁律 5: 后端能力 ≠ 用户可用的功能。
# 铁律 7: Done 标准 = 入口可触达 + 完整链路走通 + 结果可见。
#
# 挂在: pre-commit (物理阻断 — 切片不完整不准提交)
# 原则: 增量阻断 (本次新增 export)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

# ── 1. 找本次新增的生产文件中的 export ──
NEW_FILES=$(git diff --cached --name-only --diff-filter=A 2>/dev/null \
  | grep '^src/.*\.ts$' | grep -v '\.test\.' | grep -v '\.d\.ts' \
  | grep -v 'types\.ts$\|index\.ts$\|helpers\.ts$\|builtins\.ts$' || true)

if [ -z "$NEW_FILES" ]; then
  echo -e "  ${GREEN}✅ 垂直切片: 无新增生产文件${RESET}"
  exit 0
fi

HAD_FAIL=0
SLICE_FAILS=""

while IFS= read -r file; do
  [ -z "$file" ] && continue
  [ ! -f "$file" ] && continue

  EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
  [ -z "$EXPORTS" ] && continue

  while IFS= read -r name; do
    [ -z "$name" ] && continue

    # 跳过内部/类型符号
    if echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated\|^[A-Z].*Props$\|^[A-Z].*Config$\|^[A-Z].*State$\|^[A-Z].*Type$\|^[A-Z].*Schema$'; then
      continue
    fi

    # ── 2. 环节一: 入口可触达 ──
    # 必须在 route / server / agent / cli 中有调用 (非 import)
    ENTRY=$(grep -rn "\b${name}\b" src/routes/ src/server.ts src/index.ts src/cli.ts src/agent/ src/sentinel/builtins.ts --include="*.ts" 2>/dev/null \
      | grep -v "export.*${name}" | grep -v "import.*${name}" | grep -v "\.test\." | grep -v "$file" | head -3 || true)

    if [ -z "$ENTRY" ]; then
      SLICE_FAILS="${SLICE_FAILS}  ${file}: export ${name}"$'\n'
      SLICE_FAILS="${SLICE_FAILS}    ❌ 入口缺失 — 未在 routes/server.ts/agent/ 中发现调用"$'\n'
      HAD_FAIL=1
      continue
    fi

    # ── 3. 环节二: 交互完整 (调用链不经过 stub) ──
    # 检查新函数本身是否是 stub
    STUB_PATTERNS="return \[\]\|return null\|return \[]\|throw new Error\|TODO.*implement\|待激活\|not implemented\|placeholder"
    if grep -A5 "export.*function ${name}\|export.*class ${name}" "$file" 2>/dev/null | grep -q "${STUB_PATTERNS}"; then
      SLICE_FAILS="${SLICE_FAILS}  ${file}: export ${name}"$'\n'
      STUB_LINE=$(grep -n "${STUB_PATTERNS}" "$file" 2>/dev/null | head -1 | cut -d: -f1 || echo "?")
      SLICE_FAILS="${SLICE_FAILS}    ❌ 交互断裂 — 函数本身是 stub (line ${STUB_LINE}): return [] / throw / 待激活"$'\n'
      HAD_FAIL=1
      continue
    fi

    # 检查调用方是否丢弃了返回值 (结果不可见)
    # 找到调用点, 检查返回值是否被使用
    CALL_SITES=$(echo "$ENTRY" | grep -v "import " || true)
    if [ -n "$CALL_SITES" ]; then
      while IFS= read -r call_line; do
        [ -z "$call_line" ] && continue
        call_file=$(echo "$call_line" | cut -d: -f1)
        call_linenum=$(echo "$call_line" | cut -d: -f2)

        # 检查: 调用是否作为独立语句 (const x = fn() / return fn() / res.json(fn()) / await fn())
        # 如果是裸调用 fn() 且不是 await / .then() → 返回值被丢弃
        ctx_start=$((call_linenum - 1))
        [ "$ctx_start" -lt 1 ] && ctx_start=1
        ctx=$(sed -n "${ctx_start},${call_linenum}p" "$call_file" 2>/dev/null || echo "")

        # 排除 const/let/var/return/res.json/await/.then/if/switch/for/while
        # 如果匹配的是裸调用 fn() 不带赋值和消费 → 结果丢弃
        if echo "$ctx" | grep -q "\b${name}("; then
          if ! echo "$ctx" | grep -qE "const |let |var |return |\.json\(|\.send\(|await |\.then\(|= |\.push\(|\.set\(|\.assign\(|if \(|switch \(|for \(|while \(|&& |\|\| "; then
            SLICE_FAILS="${SLICE_FAILS}  ${call_file}:${call_linenum}: ${name}()"$'\n'
            SLICE_FAILS="${SLICE_FAILS}    ⚠️  结果丢弃 — 调用返回值未被赋值/返回/序列化, 可能不可见"$'\n'
            # 仅警告, 不阻断 — 有些函数确实只需要副作用
          fi
        fi
      done <<< "$CALL_SITES"
    fi

    # ── 4. 环节三: 检查函数调用的下游是否经过 stub ──
    # 在函数体内找它调用的其他函数, 检查那些函数是否是 stub
    FUNC_BODY_START=$(grep -n "export.*function ${name}\|export.*class ${name}" "$file" 2>/dev/null | head -1 | cut -d: -f1 || echo "")
    if [ -n "$FUNC_BODY_START" ]; then
      FUNC_BODY_END=$((FUNC_BODY_START + 50))  # 读 50 行
      FUNC_BODY=$(sed -n "${FUNC_BODY_START},${FUNC_BODY_END}p" "$file" 2>/dev/null || echo "")

      # 提取导入的其他模块中的函数调用
      CALLED_IMPORTS=$(grep -oP "import \{([^}]+)\}" "$file" 2>/dev/null | grep -oP '\w+' | grep -v "import\|type\|from" | sort -u || true)

      for callee in $CALLED_IMPORTS; do
        [ -z "$callee" ] && continue
        # 检查被调方是否是 stub
        if echo "$FUNC_BODY" | grep -q "\b${callee}("; then
          # 在整个 src/ 中找到该函数的定义并检查是否是 stub
          CALLEE_DEF=$(grep -rn "export.*function ${callee}\b\|export.*class ${callee}\b" src/ --include="*.ts" 2>/dev/null \
            | grep -v "\.test\." | grep -v "$file" | head -1 || true)
          if [ -n "$CALLEE_DEF" ]; then
            callee_file=$(echo "$CALLEE_DEF" | cut -d: -f1)
            callee_line=$(echo "$CALLEE_DEF" | cut -d: -f2)
            callee_end=$((callee_line + 10))
            if sed -n "${callee_line},${callee_end}p" "$callee_file" 2>/dev/null | grep -q "${STUB_PATTERNS}"; then
              SLICE_FAILS="${SLICE_FAILS}  ${file}: ${name}() → ${callee}()"$'\n'
              SLICE_FAILS="${SLICE_FAILS}    ❌ 下游 stub — ${callee_file}:${callee_line} 是 stub/mock/空实现"$'\n'
              HAD_FAIL=1
            fi
          fi
        fi
      done
    fi

  done <<< "$EXPORTS"
done <<< "$NEW_FILES"

# ── 5. 输出 ──
if [ "$HAD_FAIL" -eq 0 ]; then
  echo -e "  ${GREEN}✅ 垂直切片: 入口 → 交互 → 结果 三环节完整${RESET}"
  exit 0
else
  echo -e "  ${RED}❌ 垂直切片不完整 (硬阻断):${RESET}"
  echo -e "$SLICE_FAILS"
  echo ""
  echo "  铁律 4: 入口 → 交互 → 结果, 三环节缺一不可交付。"
  echo "  铁律 5: 后端能力 ≠ 用户可用的功能。追踪调用链。"
  echo "  ❌ 入口缺失: 新增 export 必须在 routes/server.ts/agent/ 中有调用点"
  echo "  ❌ 交互断裂: 函数本身或下游不能是 stub (return [])"
  echo "  ⚠️  结果丢弃: 返回值应被赋值/返回/序列化"
  exit 1
fi
