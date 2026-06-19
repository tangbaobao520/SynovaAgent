#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering v3.2 — PreToolUse: task brief 质量检查
#
# 挂在 PreToolUse → Edit|Write 上，在 hook-check-memory.sh 之后运行。
# 7 项字段质量检查 + 接口真实性反向验证 + 层级确认。
#
# 例外：允许写 .claude/ 和 scripts/workflow/hook- 目录（避免鸡生蛋死锁）
# 从 stdin JSON 读取 tool_input.file_path 判断目标文件
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

INPUT=$(cat 2>/dev/null || echo '{}')
FILE=$(echo "$INPUT" | python3 -c "
import json,sys
try:
    data = json.load(sys.stdin)
    ti = data.get('tool_input', data)
    fp = ti.get('file_path', '') if isinstance(ti, dict) else ''
    print(fp)
except:
    print('')
" 2>/dev/null)

# 例外：允许写入 .claude/ 和 task-briefs 和 settings 和 plans 和 worktrees
if echo "$FILE" | grep -qE '\.claude/(task-briefs|settings|plans|specs|worktrees)/'; then
  exit 0
fi

# 例外：允许写入 hooks 和 workflow 脚本本身
if echo "$FILE" | grep -qE 'scripts/workflow/hook-'; then
  exit 0
fi

TODAY=$(date +%Y-%m-%d)
BRIEF=$(find .claude/task-briefs/ -name "${TODAY}*" 2>/dev/null | head -1)
if [ -z "$BRIEF" ]; then
  echo "⛔ 写代码前物理阻断 — 无今日 task brief"
  echo "   必须先运行: bash scripts/workflow/task-start.sh \"你的任务描述\""
  echo "   然后填写全部 6 个必填字段"
  echo "   被阻止的文件: ${FILE}"
  exit 1
fi

# ═══ 7 个质量检查 (全部非空 = 全部硬阻断) ═══
FAIL=0

# 1. 项目身份：必须含 "增长导航"（确保重读了核心定位）
if ! grep -qi "增长导航" "$BRIEF" 2>/dev/null; then
  echo "⛔ Task Brief 质量 — 缺少 '项目身份' 或未重读核心定位（必须含 '增长导航'）"
  FAIL=1
fi

# 2. Q1 调研：非空，证明思考了业界/顶级团队/历史教训
Q1=$(grep -A10 "^## Q1" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d '[:space:]' || true)
if [ -z "$Q1" ] || [ ${#Q1} -lt 10 ]; then
  echo "⛔ Task Brief 质量 — 'Q1: 调研' 未填写"
  echo "   必须回答: a) 业界最佳实践 b) 顶级团队怎么做 c) memory/ 里我们犯过的错"
  FAIL=1
fi

# 3. Q2 范围：非空，证明思考了 MVP 边界
Q2=$(grep -A5 "^## Q2" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d '[:space:]' || true)
if [ -z "$Q2" ] || [ ${#Q2} -lt 5 ]; then
  echo "⛔ Task Brief 质量 — 'Q2: 范围' 未填写"
  echo "   必须回答: 最简实现是什么？什么可以不做？MVP 边界在哪？"
  FAIL=1
fi

# 4. Q3 验收：非空，证明定义了入口→交互→结果
Q3=$(grep -A5 "^## Q3" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d '[:space:]' || true)
if [ -z "$Q3" ] || [ ${#Q3} -lt 5 ]; then
  echo "⛔ Task Brief 质量 — 'Q3: 验收' 未填写"
  echo "   必须回答: 入口→交互→结果，三环节各是什么？"
  FAIL=1
fi

# 5. 架构层级：必须含 L1/L2/L3/L4/L5 之一
CONTENT=$(sed 's/<!--.*-->//g' "$BRIEF" | tr -d '[:space:]')
if ! echo "$CONTENT" | grep -qE 'L[1-5]' 2>/dev/null; then
  echo "⛔ Task Brief 质量 — '本任务在哪一层' 未填写（必须含 L1-L5 层级标注）"
  FAIL=1
fi

# 6. 文档引用：非纯注释，有实际内容
DOC_REF=$(grep -A5 "文档引用" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d '[:space:]' || true)
if [ -z "$DOC_REF" ] || [ ${#DOC_REF} -lt 5 ]; then
  echo "⛔ Task Brief 质量 — '文档引用' 未填写（必须引用全量对齐手册具体章节）"
  FAIL=1
fi

# 7. 接口审计：必须含 "文件名:" 格式的行（证明 grep 了代码）
IFACE=$(grep -A10 "接口审计" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d '[:space:]' || true)
if [ -z "$IFACE" ] || [ ${#IFACE} -lt 5 ]; then
  echo "⛔ Task Brief 质量 — '接口审计' 未填写（必须从代码 grep 函数签名，格式: 文件名:函数名）"
  FAIL=1
fi

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  文件: ${BRIEF}"
  echo "  被阻止的文件: ${FILE}"
  echo "  必填: 项目身份 / Q1调研 / Q2范围 / Q3验收 / 本任务在哪一层 / 文档引用 / 接口审计"
  exit 1
fi

# ═══ 7. 接口真实性反向验证 (增强正则) ═══
# 解析"接口审计"区域中的 文件名:函数名 行，grep 确认函数真实存在
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
IFACE_SECTION=$(grep -A30 "接口审计" "$BRIEF" 2>/dev/null | grep -oP '\S+\.(ts|tsx):\s*\w+(\.\w+)?' || true)

if [ -n "$IFACE_SECTION" ]; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # 跳过注释行中的示例
    if echo "$line" | grep -q '^<!--'; then continue; fi

    FILE_PART=$(echo "$line" | cut -d: -f1 | tr -d ' ')
    FUNC_PART=$(echo "$line" | cut -d: -f2- | tr -d ' ')
    FULL_PATH="$ROOT/$FILE_PART"

    # 检查文件是否存在
    if [ ! -f "$FULL_PATH" ]; then
      echo "⛔ 虚假接口: 文件 ${FILE_PART} 不存在"
      echo "   请重新 grep 代码确认文件路径后更新 task brief"
      exit 1
    fi

    # 多模式匹配: function / const / class method / export / 箭头函数
    FUNC_NAME="${FUNC_PART##*.}"  # 取最后一段 (类名.方法名 → 方法名)
    if ! grep -qE "(function ${FUNC_NAME}\b|export (const|function) ${FUNC_NAME}\b|${FUNC_NAME}\s*[=(]|${FUNC_NAME}\s*:\s*\()" "$FULL_PATH" 2>/dev/null; then
      # 如果是类方法 (ClassName.methodName)，验证类是否存在
      if [ "$FUNC_NAME" != "$FUNC_PART" ]; then
        CLASS_NAME="${FUNC_PART%.*}"
        if grep -qE "class ${CLASS_NAME}\b" "$FULL_PATH" 2>/dev/null; then
          # 类存在，方法可能在类内部，放行（grep 无法精确匹配类方法）
          continue
        fi
        echo "⛔ 虚假接口: 类 ${CLASS_NAME} 在 ${FILE_PART} 中不存在"
        exit 1
      fi
      echo "⛔ 虚假接口: ${FUNC_NAME} 在 ${FILE_PART} 中不存在"
      echo "   请重新 grep 代码确认函数签名后更新 task brief"
      exit 1
    fi
  done <<< "$IFACE_SECTION"
  echo "  接口真实性验证: $(echo "$IFACE_SECTION" | grep -c .) 个接口全部通过"
fi

# ═══ 8. 层级确认 (文件路径 vs task brief 声明的层级) ═══
TASK_LAYER=$(grep -A5 "本任务在哪一层" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | grep -oP 'L[1-5]' | head -1 || true)
if [ -n "$TASK_LAYER" ] && ! echo "$FILE" | grep -qE '\.claude/|scripts/workflow/'; then
  case "$FILE" in
    src/routes/*|src/tui/*|src/l1*/*) ACTUAL_LAYER="L1" ;;
    src/agent/*|src/orchestrator/*|src/l2*/*) ACTUAL_LAYER="L2" ;;
    src/l3/*|src/sentinel/*|src/expert-platform/*) ACTUAL_LAYER="L3" ;;
    src/l4/*|src/evidence/*) ACTUAL_LAYER="L4" ;;
    src/store/*|src/cron/*|src/services/*|src/l5*/*) ACTUAL_LAYER="L5" ;;
    *) ACTUAL_LAYER="" ;;
  esac
  if [ -n "$ACTUAL_LAYER" ] && [ "$ACTUAL_LAYER" != "$TASK_LAYER" ]; then
    # 允许相邻层（L2 写 L3 适配器等）
    case "${TASK_LAYER}-${ACTUAL_LAYER}" in
      L1-L2|L2-L1|L2-L3|L3-L2|L3-L4|L4-L3|L4-L5|L5-L4) ;;  # 相邻层允许
      *)
        echo "⛔ 层级不匹配: task brief 声明 ${TASK_LAYER}，但文件 ${FILE} 属于 ${ACTUAL_LAYER}"
        echo "   如果确实需要跨层修改，请更新 task brief 的'本任务在哪一层'字段"
        exit 1
        ;;
    esac
  fi
fi

exit 0
