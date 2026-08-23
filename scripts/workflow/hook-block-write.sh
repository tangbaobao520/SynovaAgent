#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.5.1 — PreToolUse: task brief 质量检查
#
# D258: 包含原 hook-block-no-q0.sh 全部功能（Q0 存在性 + Q0a/b 内容检查合并至此）。
# 原 scripts/hook-block-no-q0.sh 已删除，功能被本文件完全覆盖。
#
# 挂在 PreToolUse → Edit|Write 上，在 hook-check-memory.sh 之后运行。
# 7 项字段质量检查 + 接口真实性反向验证 + 层级确认。
#
# 例外：允许写 .claude/ 和 scripts/workflow/hook- 目录（避免鸡生蛋死锁）
# 从 stdin JSON 读取 tool_input.file_path 判断目标文件
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

# D312 M2: git 操作写窗口守卫 — git stash/checkout/reset 等命令执行期间
# 跳过仓库内写文件（防 08-02 stash/pop 冲突事故）
source "$(cd "$(dirname "$0")" && pwd)/../hooks/hook-git-guard.sh" 2>/dev/null || true
SKIP_HOOK_WRITES=0
if git_op_window_active 2>/dev/null; then SKIP_HOOK_WRITES=1; fi

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
  # v3.5: task brief 被编辑时自动标记 brief-filled
  if echo "$FILE" | grep -qE "\.claude/task-briefs/"; then
    ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
    # D284-FIX: rm -f session-locked 不依赖 workflow-state.json 存在
    # workflow-state.json 非必需文件, 不存在时不应阻止解锁
    WF_STATE="$ROOT/.claude/workflow-state.json"
    if [ -z "${SKIP_HOOK_WRITES:-}" ] && [ -f "$WF_STATE" ]; then
      python3 -c "import json; d=json.load(open('$WF_STATE')); d['step']='brief-filled'; json.dump(d, open('$WF_STATE','w'))" 2>/dev/null
    fi
    if [ -z "${SKIP_HOOK_WRITES:-}" ]; then
      rm -f "$ROOT/.claude/session-locked" 2>/dev/null
    fi
  fi
  exit 0
fi

# 例外：允许写入 hooks 和 workflow 脚本本身
if echo "$FILE" | grep -qE 'scripts/workflow/hook-|scripts/hooks/'; then
  exit 0
fi

# ═══ V4.5.1: SessionStart 流程锁 — 硬阻断 ═══
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
LOCK_FILE="$ROOT/.claude/session-locked"
if [ -f "$LOCK_FILE" ]; then
  # 只允许 task-start/scope-check/Read 操作
  if echo "$FILE" | grep -qE 'scripts/workflow/task-start|scripts/workflow/scope-check|\.claude/task-briefs/|\.claude/settings'; then
    # 这些操作在锁定时允许——它们用于解锁
    :
  else
    echo "⛔ V4.5.1 Session Lock — 请先运行 task-start 完成 Q0-Q3"
    echo "   bash scripts/workflow/task-start.sh \"你的任务描述\""
    echo "   被阻止: ${FILE}"
    exit 1
  fi
fi

# ═══ v3.5: 工作流状态物理强制 (task-start→scope-check→brief-filled 不可跳过) ═══
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
WORKFLOW_STATE="$ROOT/.claude/workflow-state.json"

if [ ! -f "$WORKFLOW_STATE" ]; then
  echo "⛔ 写代码前物理阻断 — 未启动 Loop Engineering 工作流"
  echo "   必须先运行: bash scripts/workflow/task-start.sh \"你的任务描述\""
  echo "   被阻止的文件: ${FILE}"
  exit 1
fi

WF_STEP=$(python3 -c "import json; print(json.load(open("$WORKFLOW_STATE")).get("step",""))" 2>/dev/null || echo "unknown")
WF_TS=$(python3 -c "import json; print(json.load(open("$WORKFLOW_STATE")).get("ts",""))" 2>/dev/null || echo "")

if [ "$WF_STEP" = "task-started" ]; then
  echo "⛔ 写代码前物理阻断 — 工作流未完成 (当前: task-started)"
  echo "   必须先完成: bash scripts/workflow/scope-check.sh → 回答 Q1-Q4 → 填写 brief"
  echo "   被阻止的文件: ${FILE}"
  exit 1
fi

if [ "$WF_STEP" = "scope-checked" ]; then
  echo "⛔ 写代码前物理阻断 — 工作流未完成 (当前: scope-checked)"
  echo "   task brief 已生成但 Q1/Q2/Q3/Q4 尚未填写完毕"
  echo "   被阻止的文件: ${FILE}"
  exit 1
fi

# 会话过期检查: brief 超过 30 分钟未完成 → 要求重新 task-start
if [ -n "$WF_TS" ] && [ "$WF_STEP" != "brief-filled" ]; then
  WF_EPOCH=$(date -d "$WF_TS" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  ELAPSED=$((NOW_EPOCH - WF_EPOCH))
  if [ "${ELAPSED:-0}" -gt 1800 ]; then
    echo "⛔ 写代码前物理阻断 — 工作流会话已过期 (${ELAPSED}s > 30min)"
    echo "   请重新运行: bash scripts/workflow/task-start.sh \"你的任务\""
    rm -f "$WORKFLOW_STATE"
    exit 1
  fi
fi

TODAY=$(date +%Y-%m-%d)
# D513/⑥: ls -t 取最新 mtime —— find|head -1 按文件系统序，多 brief 时挑错证据对象（Win 8f33e82a）
BRIEF=$(ls -t .claude/task-briefs/${TODAY}*.md 2>/dev/null | head -1)  # swallow-ok: 无今日 brief → 空 → 走既有阻断分支
if [ -z "$BRIEF" ]; then
  echo "⛔ 写代码前物理阻断 — 无今日 task brief"
  echo "   必须先运行: bash scripts/workflow/task-start.sh \"你的任务描述\""
  echo "   然后填写全部 6 个必填字段"
  echo "   被阻止的文件: ${FILE}"
  exit 1
fi

# ═══ 7 个质量检查 (全部非空 = 全部硬阻断) ═══
FAIL=0

# 0. Q0 审计：项目拼图 + 文件审计（V3.8 — 写代码前必须想清楚）
Q0A=$(awk '/^### a\)/{found=1; next} /^### b\)/{if(found) exit} found' "$BRIEF" 2>/dev/null | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)
Q0B=$(awk '/^### b\)/{found=1; next} /^### c\)/{if(found) exit} found' "$BRIEF" 2>/dev/null | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)
if [ -z "$Q0A" ] || [ ${#Q0A} -lt 10 ]; then
  echo "⛔ Task Brief 质量 — 'Q0a: 项目拼图' 未填写"
  echo "   必须回答: 本任务在产品的哪一块？触及哪层？该层现有模块？新增/替换/扩展？"
  echo "   重读 CLAUDE.md §项目身份 全部内容后再回答。"
  FAIL=1
fi
if [ -z "$Q0B" ] || [ ${#Q0B} -lt 10 ]; then
  echo "⛔ Task Brief 质量 — 'Q0b: 文件审计' 未填写"
  echo "   必须: grep 关键词在 expert/ sentinel/ extensions/ → 列出已有模块 → 复用/扩展/新建/冲突"
  FAIL=1
fi

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

# ═══ v3.5: 语义质量检查（不只检查长度，检查内容） ═══

# 8. Q1 必须引用至少 1 个来源
Q1_FULL=$(grep -A20 "^## Q1" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' || true)
if ! echo "$Q1_FULL" | grep -qiE '(https?://|[a-zA-Z0-9_]+\.(md|ts|js|py|sh)|memory/|packages/|src/)' 2>/dev/null; then
  echo "⛔ Task Brief 质量 — Q1 未引用任何来源（URL/文件路径/memory/）"
  echo "   必须引用至少 1 个：业界实践链接、参考文件路径、memory/相关记录"
  FAIL=1
fi

# 9. Q2 必须包含至少 1 个排除项（明确不做什么）
Q2_FULL=$(grep -A10 "^## Q2" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' || true)
if ! echo "$Q2_FULL" | grep -qiE '(不做|排除|不包括|不涉及|不在.*范围|本任务不|MVP.*边界)' 2>/dev/null; then
  echo "⛔ Task Brief 质量 — Q2 未列出排除项（必须明确本任务不做什么）"
  echo "   请写明: 本任务不做什么（至少 1 项明确的排除）"
  FAIL=1
fi

# 10. Q3 必须描述用户旅程（入口→处理→结果）
Q3_FULL=$(grep -A10 "^## Q3" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' || true)
if ! echo "$Q3_FULL" | grep -qiE '(入口|触发|展示|→|->|结果.*呈现|用户.*看到|API.*响应)' 2>/dev/null; then
  echo "⛔ Task Brief 质量 — Q3 未描述用户旅程（入口→处理→结果）"
  echo "   请写明: 从哪触发 → 中间经过什么 → 最终在哪看到结果"
  FAIL=1
fi

# 11. 反敷衍检测——禁止"已研究无需补充""略过"等空洞填充词
CONTENT_FULL=$(sed 's/<!--.*-->//g' "$BRIEF" | tr -d '[:space:]')
if echo "$CONTENT_FULL" | grep -qiE '(已研究.*无需.*补充|略过|不适用.*跳过|无需.*额外.*调研|没有.*犯过.*错|没有.*相关.*经验)' 2>/dev/null; then
  echo "⛔ Task Brief 质量 — 检测到敷衍填充词（'已研究无需补充'/'略过'等）"
  echo "   请填写实质内容。如果确实没有问题，请具体说明原因（而非用一句话跳过）"
  FAIL=1
fi

# 12. Q4 历史教训检查——如果 scope-check 匹配到 memory/ 但 brief 未引用
SCOPE_MEMORY_MATCHES=$(grep -c "📋" "$ROOT/.claude/.scope-check-last" 2>/dev/null || echo 0)
if [ "${SCOPE_MEMORY_MATCHES:-0}" -gt 0 ]; then
  Q4_FULL=$(grep -A10 "^## Q4\|### c)" "$BRIEF" 2>/dev/null | sed 's/<!--.*-->//g' | tr -d '[:space:]' || true)
  if [ -z "$Q4_FULL" ] || [ ${#Q4_FULL} -lt 10 ]; then
    echo "⛔ Task Brief 质量 — scope-check 匹配到 ${SCOPE_MEMORY_MATCHES} 条历史教训，但 Q4 未填写"
    echo "   请检查 scope-check 输出的 memory/ 匹配结果，在 Q4 中说明如何避免重复犯错"
    FAIL=1
  fi
fi

if [ "$FAIL" -gt 0 ]; then
  echo ""
  echo "  文件: ${BRIEF}"
  echo "  被阻止的文件: ${FILE}"
  echo "  必填: 项目身份 / Q1调研(含来源引用) / Q2范围(含排除项) / Q3验收(含用户旅程) / 本任务在哪一层 / 文档引用 / 接口审计"
  echo "  禁止: Q1空洞敷衍 / Q2无排除项 / Q3无用户旅程 / 敷衍填充词 / Q4无视历史教训"
  # V4.5.1: PreToolUse exit code 在 VSCode Extension 中被忽略（不阻断 Write）。
  # 但脚本仍然执行——记录证据到 /tmp/（git 无法 checkout 抹掉）。
  # pre-commit 组 6 检查此文件，存在则硬阻断。
  EVI_FILE="/tmp/.synova-before-brief"
  echo "$(date -Iseconds) | FILE=${FILE} | BRIEF=${BRIEF} | 代码在 brief 填写前写入" >> "$EVI_FILE"
  echo "  ⚠️  证据已记录: ${EVI_FILE}"
  echo "  ⚠️  提交时 pre-commit 组 6 将硬阻断，直到你 rm 此文件并重新 task-start。"
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

# ═══ V3 CP1: 条件归属验证 (#CRITERIA) ═══
CRITERIA=$(grep -oP '#CRITERIA\s*[:=]\s*\K[A-D]' "$BRIEF" 2>/dev/null || true)
if [ -z "$CRITERIA" ]; then
  echo "[V3-CP1] 缺少 #CRITERIA 条件归属(A/B/C/D) — 标记为 pending（不阻断）"
else
  echo "[V3-CP1] 条件归属: $CRITERIA"
fi

# V3: 写检查点文件（D312 M2: git 操作窗口内跳过 — 防 stash/pop 冲突）
if [ -z "${SKIP_HOOK_WRITES:-}" ]; then
  mkdir -p "$ROOT/.codex/checkpoints"
  cat > "$ROOT/.codex/checkpoints/cp1-criteria.json" <<CP1EOF
{
  "name": "CP1: 条件归属",
  "status": "$([ -z "$CRITERIA" ] && echo 'warn' || echo 'pass')",
  "reason": "$([ -z "$CRITERIA" ] && echo '缺少 #CRITERIA' || echo "条件: $CRITERIA")",
  "checkedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
CP1EOF
fi

# ═══ V4.5.1: 改前先 grep 全仓库引用 — 物理阻断 ═══
# 写代码前必须运行 grep-refs.sh 生成引用地图，否则拒绝 Write/Edit
GATE="$ROOT/.claude/grep-verified"
# 只检查代码文件（.ts/.tsx/.json），不检查文档/配置/memory
if echo "$FILE" | grep -qE '.(ts|tsx|json)$' && 
   echo "$FILE" | grep -qE '/(src|extensions|tests|packages)/'; then
  if [ ! -f "$GATE" ]; then
    echo "⛔ 改前先 grep — 未运行 grep-refs.sh"
    echo "   在修改代码前，必须 grep 你要改的符号在全仓库的引用:"
    echo "   bash scripts/workflow/grep-refs.sh "你要改的符号1" "符号2" ..."
    echo "   然后在 .claude/reference-map.md 中逐项确认所有引用处"
    echo "   被阻止: ${FILE}"
    exit 1
  fi
fi

exit 0
