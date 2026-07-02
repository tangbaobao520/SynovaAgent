#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.2.8 — check-plan-integrity.sh
# 统一验证 plan.json 的 Q1/Q2 产出是否被物理执行。
# pre-commit 组 6 调用。全部 <1s。
#
# Anthropic 原则 5: 物理强制，零 AI 自律。
# Anthropic 原则 1: 一个机制防一类错 — 这个脚本验证整个 Q1/Q2 承诺链。
# ═══════════════════════════════════════════════════════════════════════════════
set +e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
HARD_FAIL=0

PLAN_FILE="$ROOT/.claude/plan.json"
TODAY=$(date +%Y-%m-%d)
CUR_BRIEF="$ROOT/.claude/current-brief"
BRIEF=""
if [ -f "$CUR_BRIEF" ]; then
  BNAME=$(cat "$CUR_BRIEF" 2>/dev/null | tr -d '[:space:]')
  [ -n "$BNAME" ] && BRIEF="$ROOT/.claude/task-briefs/$BNAME"
fi
if [ -z "$BRIEF" ] || [ ! -f "$BRIEF" ]; then
  BRIEF=$(find "$ROOT/.claude/task-briefs/" -type f -name "*.md" 2>/dev/null | xargs ls -t 2>/dev/null | head -1)
fi

if [ ! -f "$PLAN_FILE" ]; then
  echo -e "  ${GREEN}✅ plan-integrity (无 plan.json)${RESET}"
  exit 0
fi

# ═══ 1. principles 非空 — Q1b 是否回答了 ═══
PRINCIPLES=$(python3 -c "
import json
p = json.load(open('$PLAN_FILE', encoding='utf-8'))
principles = p.get('principles', [])
print(len(principles))
for pp in principles: print(pp)
" 2>/dev/null)
PRIN_COUNT=$(echo "$PRINCIPLES" | head -1 | tr -d '[:space:]')
if [ "${PRIN_COUNT:-0}" -eq 0 ]; then
  echo -e "  ${RED}❌ plan.principles 为空 — Q1b 未回答 Anthropic 决策链路  [硬阻断]${RESET}"
  HARD_FAIL=$((HARD_FAIL + 1))
else
  # 检查每条原则是否对应至少一个 Done verify 命令
  if [ -n "$BRIEF" ]; then
    DONE_CMDS=$(grep -c 'verify:' "$BRIEF" 2>/dev/null || echo 0)
    if [ "${DONE_CMDS:-0}" -lt "${PRIN_COUNT:-1}" ]; then
      echo -e "  ${YELLOW}⚠️  plan.principles 有 ${PRIN_COUNT} 条，但 Done 仅有 ${DONE_CMDS} 个 verify  [警告]${RESET}"
      echo "     每条原则应对应至少一个可验证的 Done 标准。"
    else
      echo -e "  ${GREEN}✅ plan.principles (${PRIN_COUNT} 条, Done verify: ${DONE_CMDS})${RESET}"
    fi
  else
    echo -e "  ${GREEN}✅ plan.principles (${PRIN_COUNT} 条)${RESET}"
  fi
fi

# ═══ 2. approach = rewrite/reuse — Q2 是否回答了 ═══
APPROACH=$(python3 -c "import json; print(json.load(open('$PLAN_FILE', encoding='utf-8')).get('approach',''))" 2>/dev/null)
if [ -z "$APPROACH" ] || [ "$APPROACH" = "None" ]; then
  echo -e "  ${RED}❌ plan.approach 为空 — Q2 未回答重写还是复用  [硬阻断]${RESET}"
  HARD_FAIL=$((HARD_FAIL + 1))
elif [ "$APPROACH" = "rewrite" ]; then
  # 选了 rewrite → 检查是否仍有新 engine-core import
  NEW_ENGINE_CORE=$(git diff --cached 2>/dev/null | grep "^+.*import.*engine-core" | grep -E "^src/.*\.ts:|^src/.*\.js:" | grep -v "\.test\." | head -3 || true)
  if [ -n "$NEW_ENGINE_CORE" ]; then
    echo -e "  ${RED}❌ approach=rewrite 但代码中有新 engine-core import — 铁律 46  [硬阻断]${RESET}"
    echo "$NEW_ENGINE_CORE"
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ plan.approach = rewrite (无新 engine-core import)${RESET}"
  fi
else
  echo -e "  ${GREEN}✅ plan.approach = ${APPROACH}${RESET}"
fi

# ═══ 3. memory_refs 的每个文件存在 — Q1a 是否真实 ═══
MEMORY_REFS=$(python3 -c "
import json, os
p = json.load(open('$PLAN_FILE', encoding='utf-8'))
refs = p.get('memory_refs', [])
for r in refs:
  path = os.path.join('$ROOT', r)
  print(f'{r}:{\"OK\" if os.path.exists(path) else \"MISSING\"}')
" 2>/dev/null)
MISSING_REFS=$(echo "$MEMORY_REFS" | grep "MISSING" || true)
if [ -n "$MISSING_REFS" ]; then
  echo -e "  ${RED}❌ plan.memory_refs 引用不存在的文件  [硬阻断]${RESET}"
  echo "$MISSING_REFS"
  HARD_FAIL=$((HARD_FAIL + 1))
elif [ -n "$MEMORY_REFS" ]; then
  COUNT=$(echo "$MEMORY_REFS" | grep -c .)
  echo -e "  ${GREEN}✅ plan.memory_refs (${COUNT} 文件, 全部存在)${RESET}"
else
  echo -e "  ${YELLOW}⚠️  plan.memory_refs 为空 — Q1a 未引用 memory/ 文件  [警告]${RESET}"
fi

# ═══ 4. 模板残留检查 — brief 是否认真填了 ═══
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  TEMPLATE_RESIDUE=$(grep -c '<!--' "$BRIEF" 2>/dev/null | tr -d '\r' || echo 0)
  if [ "${TEMPLATE_RESIDUE:-0}" -gt 0 ]; then
    echo -e "  ${RED}❌ brief 模板残留: 发现 ${TEMPLATE_RESIDUE} 处未填注释 (<!--)  [硬阻断]${RESET}"
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ brief 模板已清理 (无 <!-- 残留)${RESET}"
  fi
fi

# ═══ 5. Q2 排除项必须含文件路径 ═══
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  Q2_SEC=$(awk '/^## Q2:/{found=1; next} /^## /{if(found) exit} found' "$BRIEF" 2>/dev/null)
  if [ -n "$Q2_SEC" ]; then
    EXCLUDED=$(echo "$Q2_SEC" | grep -oiE '(不改|不修改|不动)\s+\S+' || true)
    if [ -n "$EXCLUDED" ]; then
      BAD=""
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        # 排除项必须包含文件扩展名（.ts/.sh/.json/.py/.md）或完整路径
        if ! echo "$line" | grep -qiE '(\.ts|\.sh|\.json|\.py|\.md|\.yaml|/\S+)' 2>/dev/null; then
          BAD="${BAD}  ${line}\n"
        fi
      done <<< "$EXCLUDED"
      if [ -n "$BAD" ]; then
        echo -e "  ${RED}❌ Q2 排除项缺少文件路径: 必须引用具体文件名 (如 sentinel-loader.ts)  [硬阻断]${RESET}"
        echo -e "$BAD"
        HARD_FAIL=$((HARD_FAIL + 1))
      else
        echo -e "  ${GREEN}✅ Q2 排除项均含文件路径${RESET}"
      fi
    fi
  fi
fi

# ═══ 6. Q2 排除项 —「不改 X」git diff 验证 ═══
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  Q2_SEC=$(awk '/^## Q2:/{found=1; next} /^## /{if(found) exit} found' "$BRIEF" 2>/dev/null)
  if [ -n "$Q2_SEC" ]; then
    EXCLUDED_FILES=$(echo "$Q2_SEC" | grep -oiE '(不改|不修改|不动)\s+\S+' | sed 's/^[^ ]* //' | tr -d '[:space:]' | grep -v "^$" || true)
    if [ -n "$EXCLUDED_FILES" ]; then
      STAGED=$(git diff --cached --name-only 2>/dev/null || true)
      VIOLATIONS=""
      while IFS= read -r excl; do
        [ -z "$excl" ] && continue
        if echo "$STAGED" | grep -qiE "(^|/)${excl}(/|$)" 2>/dev/null; then
          VIOLATIONS="${VIOLATIONS}  Q2 排除项 '${excl}' 在本次提交中被修改\n"
        fi
      done <<< "$EXCLUDED_FILES"
      if [ -n "$VIOLATIONS" ]; then
        echo -e "  ${RED}❌ Q2 排除项验证: 声明不改的文件被修改了  [硬阻断]${RESET}"
        echo -e "$VIOLATIONS"
        HARD_FAIL=$((HARD_FAIL + 1))
      else
        echo -e "  ${GREEN}✅ Q2 排除项: 声明不改的文件未在本次提交中出现${RESET}"
      fi
    fi
  fi
fi

# === 5. Execute verify commands from Done section ===
VERIFY_FAIL=0
DONE_SEC=""
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  # 仅从 Done 标准段提取 verify:（避免 Q1b 模板示例被误提取）
  DONE_SEC=$(awk '/^## Done 标准/{found=1; next} found && /^## /{exit} found' "$BRIEF" 2>/dev/null)
fi
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  Q2_SEC=$(awk '/^## Q2:/{found=1; next} /^## /{if(found) exit} found' "$BRIEF" 2>/dev/null)
  if [ -n "$Q2_SEC" ]; then
    EXCLUDED_FILES=$(echo "$Q2_SEC" | grep -oiE '(不改|不修改|不动|unmodify|dont.modify|not.change|keep.untouched)[[:space:]]+[^ ]+' | sed 's/^[^ ]* //' | tr -d '[:space:]' | grep -v "^$" || true)
    if [ -n "$EXCLUDED_FILES" ]; then
      STAGED=$(git diff --cached --name-only 2>/dev/null || true)
      VIOLATIONS=""
      while IFS= read -r excl; do
        [ -z "$excl" ] && continue
        if echo "$STAGED" | grep -qiE "(^|/)${excl}(/|$)" 2>/dev/null; then
          VIOLATIONS="${VIOLATIONS}  Q2 exclude '${excl}' modified in this commit\n"
        fi
      done <<< "$EXCLUDED_FILES"
      if [ -n "$VIOLATIONS" ]; then
        echo -e "  ${RED}[FAIL] Q2 exclusion: declared files should not be modified  [HARD_BLOCK]${RESET}"
        echo -e "$VIOLATIONS"
        HARD_FAIL=$((HARD_FAIL + 1))
      else
        echo -e "  ${GREEN}[OK] Q2 exclusion: none of the excluded files were changed${RESET}"
      fi
    fi
  fi
fi

# === 5. Execute verify commands from Done section ===
VERIFY_FAIL=0
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  VERIFY_CMDS=$(echo "$DONE_SEC" | grep -E '^\s*- \[x\].*verify:|^\s+verify:' 2>/dev/null | sed 's/.*verify:[[:space:]]*//' | sed 's/^"//;s/"$//' || true)
  if [ -n "$VERIFY_CMDS" ]; then
    while IFS= read -r cmd; do
      [ -z "$cmd" ] && continue
      cmd_trimmed=$(echo "$cmd" | xargs)
      if echo "$cmd_trimmed" | grep -qiE '(entry|path|link|result|reachable|pass|display)' 2>/dev/null; then
        continue
      fi
      # 禁止 trivially passing 命令（永远 exit 0，不验证任何东西）
      if echo "$cmd_trimmed" | grep -qiE '^(echo|true|:)\b' 2>/dev/null; then
        echo -e "  ${RED}    ❌ verify 命令不可执行: '$cmd_trimmed' 永远通过，不验证任何东西  [硬阻断]${RESET}"
        VERIFY_FAIL=1
        continue
      fi
      echo "    verify: $cmd_trimmed"
      if ! bash -c "$cmd_trimmed" 2>/dev/null; then
        echo -e "  ${RED}    [FAIL] verify failed: $cmd_trimmed${RESET}"
        VERIFY_FAIL=1
      fi
    done <<< "$VERIFY_CMDS"
  fi
fi
if [ "$VERIFY_FAIL" -gt 0 ]; then
  echo -e "  ${RED}[FAIL] verify commands: some verifications did not pass  [HARD_BLOCK]${RESET}"
  HARD_FAIL=$((HARD_FAIL + 1))
fi

if [ "$HARD_FAIL" -gt 0 ]; then
  echo ""
  echo -e "  ${RED}plan-integrity: ${HARD_FAIL} items failed - commit rejected${RESET}"
  exit 1
fi
exit 0
