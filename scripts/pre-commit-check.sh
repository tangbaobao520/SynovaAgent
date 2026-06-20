#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering v3.3 — pre-commit 物理阻断 (5 项, 全部 <1s)
#
# 设计原则:
#   - 只阻断 agent 确实会偷懒的项（有历史事故支撑）
#   - 不重复 PostToolUse 已做的事（tsc/vitest/oxlint）
#   - bash 做 agent 做不到的事（grep 模式匹配）
#   - agent 自检做 bash 做不到的事（语义理解、架构边界、接线完整性）
#
# 5 项硬阻断:
#   1. as any = 0          (历史: 47 次)
#   2. empty catch → log   (历史: 静默吞异常)
#   3. secrets 扫描        (历史: API key 暴露)
#   4. 新文件 → 有测试     (历史: 4 次接线失败)
#   5. 新 export → 有调用方 (历史: 4 次接线失败)
#
# 删除的 33 项去哪了:
#   架构/测试质量/空壳/切片 → agent 自检 5 问 (CLAUDE.md)
#   手册漂移/诚实门禁 → 删除 (脆弱检查, 误报 > 价值)
#   tsc/vitest → PostToolUse verify-incremental.sh 已跑
#   TUI 铁律 → CLAUDE.md 冻结注释已足够
# ═══════════════════════════════════════════════════════════════════════════════
set +e

HARD_FAIL=0
RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

hard_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    echo "$matches" | while read -r line; do echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
  fi
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
STAGED=$(git diff --cached --name-only --diff-filter=ACMR 2>/dev/null | grep '\.ts$' | grep -v node_modules || true)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering v3.3 — pre-commit (5 项)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 1. as any = 0 ═══
M=$(grep -rn 'as any\b' src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "\.d\.ts" || true)
hard_check "铁律 38: as any 零容忍" "$M"

# ═══ 2. empty catch → log ═══
EMPTY=""
if [ -n "$STAGED" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    CATCHES=$(grep -n "catch\s*{" "$file" 2>/dev/null || true)
    if [ -n "$CATCHES" ]; then
      while IFS= read -r cline; do
        linenum=$(echo "$cline" | cut -d: -f1)
        [ -z "$linenum" ] && continue
        ctx=$(sed -n "${linenum},$((linenum + 2))p" "$file" 2>/dev/null || echo "")
        if ! echo "$ctx" | grep -qE "log\.|logger\.|console\.|/\*|//"; then
          EMPTY="${EMPTY}${file}:${linenum}: 空 catch (无 log)\n"
        fi
      done <<< "$CATCHES"
    fi
  done <<< "$STAGED"
fi
hard_check "铁律 24+31: empty catch 无 log" "${EMPTY:-}"

# ═══ 3. secrets 扫描 ═══
bash "$ROOT/scripts/check-secrets.sh"
[ $? -ne 0 ] && HARD_FAIL=$((HARD_FAIL + 1))

# ═══ 4. 新文件 → 有测试 ═══
NEW_IMPL=$(git diff --cached --name-only --diff-filter=A 2>/dev/null \
  | grep "^src/" | grep "\.ts$" | grep -v "\.test\." | grep -v "\.d\.ts" \
  | grep -v "types\.ts$\|index\.ts$\|helpers\.ts$" || true)
MISSING_TEST=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r impl; do
    [ -z "$impl" ] && continue
    test_path=$(echo "$impl" | sed 's|^src/|tests/|; s|\.ts$|.test.ts|')
    if ! git diff --cached --name-only 2>/dev/null | grep -q "^${test_path}$"; then
      if [ ! -f "$test_path" ]; then
        MISSING_TEST="${MISSING_TEST}${impl} → 缺少 ${test_path}\n"
      fi
    fi
  done <<< "$NEW_IMPL"
fi
hard_check "新文件配对: impl 必须同 commit 有 test" "${MISSING_TEST:-}"

# ═══ 5. 新 export → 有调用方 ═══
UNWIRED=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue
    [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated' && continue
      WIRED=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/agent/ src/routes/ src/sentinel/builtins.ts --include="*.ts" 2>/dev/null \
        | grep -v "export.*${name}" | grep -v "$file" | head -1 || true)
      if [ -z "$WIRED" ]; then
        UNWIRED="${UNWIRED}${file}: export ${name} — 未在生产入口中接线\n"
      fi
    done
  done <<< "$NEW_IMPL"
fi
hard_check "接线审计: 新 export 必须有调用方" "${UNWIRED:-}"

# ═══ 6. 禁止新 DiagnosticModule 注册 (Sentinel 替代) ═══
# 排除本脚本自身的 self-match (注释/标题/hard_check) + import type
NEW_DIAG_REG=$(git diff --cached -- "*.ts" "*.js" 2>/dev/null | grep "^+.*DiagnosticModule" | grep -Ev "scripts/pre-commit-check.sh|.md|.html|//|@deprecated|import type|^+++|hard_check|禁止新 DiagnosticModule|不要再使用 DiagnosticModule" || true)
hard_check "禁止 DiagnosticModule: 新模块必须实现 Sentinel 接口" "${NEW_DIAG_REG:-}"

# ═══ 7. Task Brief 强制: 11 字段全部物理阻断 ═══
TODAY=$(date +%Y-%m-%d)
STAGED_SRC=$(git diff --cached --name-only 2>/dev/null | grep -E '^src/|^tests/|^packages/|^scripts/' | grep -v 'scripts/pre-commit-check.sh\|scripts/check-secrets.sh\|scripts/workflow/' || true)
TASK_BRIEF_MISSING=""
TASK_BRIEF_EMPTY=""
if [ -n "$STAGED_SRC" ]; then
  BRIEF=$(find "$ROOT/.claude/task-briefs/" -type f -name "${TODAY}*" 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
  if [ -z "$BRIEF" ]; then
    TASK_BRIEF_MISSING="今日无 task brief。请先运行: bash scripts/workflow/task-start.sh \"任务描述\""
  else
    # ── 检查所有 11 个字段 (非空且非纯注释) ──
    for q in "Q1:" "Q2:" "Q3:" "本任务在哪一层" "文档引用" "接口审计" "数据流" "Done 标准"; do
      SECTION=$(awk "/^## $q/{found=1; next} /^## /{if(found) exit} found" "$BRIEF" 2>/dev/null)
      FILLED=$(echo "$SECTION" | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)
      if [ -z "$FILLED" ] || [ ${#FILLED} -lt 3 ]; then
        TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  $q 未填写\n"
      fi
    done
    # ── 接口审计专项: 必须含至少一行 "文件名:函数名" 格式 ──
    API_SECTION=$(awk "/^## 接口审计/,/^## /" "$BRIEF" 2>/dev/null)
    API_LINES=$(echo "$API_SECTION" | grep -cE '^[a-zA-Z0-9_/\-]+\.(ts|js):[a-zA-Z0-9_]+' || true)
    if [ "${API_LINES:-0}" -eq 0 ]; then
      TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  接口审计: 缺少 '文件名:函数名' 格式\n"
    fi
    # ── Done 标准专项: 必须至少填了一项 ──
    DONE_SECTION=$(awk "/^## Done 标准/,/^## /" "$BRIEF" 2>/dev/null)
    DONE_CHECKED=$(echo "$DONE_SECTION" | grep -cE '^\s*- \[x\]' || true)
    DONE_EMPTY=$(echo "$DONE_SECTION" | grep -v "^##\|^<!--\|^$" | wc -l)
    if [ "${DONE_CHECKED:-0}" -eq 0 ] && [ "${DONE_EMPTY:-0}" -le 1 ]; then
      TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  Done 标准: 至少需定义一条完成标准\n"
    fi
  fi
fi
hard_check "Task Brief: 编码变更必须有今日 task brief" "${TASK_BRIEF_MISSING:-}"
hard_check "Task Brief: 11 字段必须全部填写 (含接口审计+Done标准)" "${TASK_BRIEF_EMPTY:-}"

# ═══ 8. 跨层引用检测 (铁律 39) ═══
# L1(routes/l1) 不得直接 import L4/L5; L2(agent) 不得直接 import L5
CROSS_LAYER=""
if [ -n "$STAGED_SRC" ]; then
  # L1(routes/l1/l1-interaction) → L4(l4) or L5(store/init)
  L1_TO_L4=$(echo "$STAGED_SRC" | grep -E '^src/(routes/|l1/|l1-interaction/)' | xargs grep -l "from '\.\./l4/\|from '\.\./\.\./l4/\|from '\.\./store/\|from '\.\./\.\./store/" 2>/dev/null | grep -v "knowledge-bridge-service\|\.test\." || true)
  if [ -n "$L1_TO_L4" ]; then CROSS_LAYER="${CROSS_LAYER}L1→L4/L5: ${L1_TO_L4}\n"; fi

  # L2(agent) → L5(store/init) — 排除动态 import + type-only
  L2_TO_L5=$(echo "$STAGED_SRC" | grep -E '^src/agent/' | xargs grep -l "from '\.\./store/\|from '\.\./init/" 2>/dev/null | grep -v "knowledge-bridge-service\|\.test\.\|import type" || true)
  if [ -n "$L2_TO_L5" ]; then CROSS_LAYER="${CROSS_LAYER}L2→L5: ${L2_TO_L5}\n"; fi

  # 哨兵(L3/sentinel) → engine-core 包 (违规)
  L3_TO_ENGINE=$(echo "$STAGED_SRC" | grep -E '^src/sentinel/' | xargs grep -l "from '\.\./\.\./\.\./packages/engine-core/" 2>/dev/null | grep -v "import type\|\.test\." || true)
  if [ -n "$L3_TO_ENGINE" ]; then CROSS_LAYER="${CROSS_LAYER}L3→engine-core: ${L3_TO_ENGINE}\n"; fi
fi
hard_check "架构边界: 禁止跨层引用 (铁律 39)" "${CROSS_LAYER:-}"

# ═══ 结果 ═══
echo ""
if [ "$HARD_FAIL" -gt 0 ]; then
  echo -e "  ${RED}❌ ${HARD_FAIL} 项未通过 — 提交已拒绝${RESET}"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}✅ 全部通过 (含 task brief 强制)${RESET}"
  echo ""
  exit 0
fi
