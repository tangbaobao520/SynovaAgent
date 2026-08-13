#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.5.1 — PreToolUse: 文件 vs task brief scope 一致性检查
#
# 读取当前 task brief 的 Q2 范围，检查正在写入的文件是否在范围内。
# 防止多任务文件混入同一 commit（例如 D281 commit 混入 D284 文件）。
#
# 设计哲学:
#   task brief 的 Q2 "做什么" 定义了本次任务的物理文件边界。
#   任何不在这个边界内的代码文件写入，都是 scope violation。
#
# 判定规则:
#   - 写入的文件路径（相对于项目根）与 Q2 中任一文件路径匹配 → 放行
#   - 匹配规则: 文件路径的末尾段匹配（支持 basename 和全路径两种写法）
#     "enterprise.ts" 匹配 "src/routes/enterprise.ts"
#     "src/routes/enterprise.ts" 精确匹配
#   - 不匹配且不是例外路径 → 硬阻断
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# ── 0. 从 stdin 读取 tool_input.file_path ──
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

if [ -z "$FILE" ]; then
  exit 0
fi

# ── 1. 只检查代码文件 ──
if ! echo "$FILE" | grep -qE '\.(ts|tsx|js|jsx|json)$'; then
  exit 0
fi

# ── 2. 例外路径（允许不受 Q2 限制的写入） ──
if echo "$FILE" | grep -qE '\.claude/|scripts/workflow/|\.codex/|memory/|docs/|\.github/'; then
  exit 0
fi

# ── 3. 查找当前 task brief 列表 ──
TODAY=$(date +%Y-%m-%d)

# 先尝试 current-brief 指针文件（仅当日有效）
CUR_BRIEF_PATH=""
CURRENT_BRIEF="$ROOT/.claude/current-brief"
if [ -f "$CURRENT_BRIEF" ]; then
  CB=$(cat "$CURRENT_BRIEF" 2>/dev/null | tr -d '[:space:]')
  # 检查 current-brief 是否陈旧（文件名含日期且不是今天）
  CB_DATE=$(echo "$CB" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1 || true)
  if [ -n "$CB_DATE" ] && [ "$CB_DATE" != "$TODAY" ]; then
    :  # 陈旧的 current-brief，忽略它
  elif [ -f "$ROOT/.claude/task-briefs/$CB" ]; then
    CUR_BRIEF_PATH="$ROOT/.claude/task-briefs/$CB"
  fi
fi

# D296 跨 session 污染根治 (认领制):
#   范围 (做什么) 取今日全部 brief 的并集 — 并发 session 的文件由自己的 brief 认领
#   排除 (不做什么) 仅取 current-brief — 他人 brief 的排除不阻断本 session 写入
# 没有 current-brief 指针或指针陈旧时，搜索今日修改过的所有 brief
ALL_TODAY_BRIEFS=$(find "$ROOT/.claude/task-briefs/" -maxdepth 1 -name "*.md" -newermt "$TODAY 00:00:00" 2>/dev/null | sort || true)
[ -z "$ALL_TODAY_BRIEFS" ] && [ -n "$CUR_BRIEF_PATH" ] && ALL_TODAY_BRIEFS="$CUR_BRIEF_PATH"
EXCLUDE_BRIEFS="${CUR_BRIEF_PATH:-$ALL_TODAY_BRIEFS}"

if [ -z "$ALL_TODAY_BRIEFS" ]; then
  exit 0  # 无 task brief — hook-block-write.sh 会阻断更早
fi

# ── 4. 获取相对路径 ──
REL_FILE="${FILE#$ROOT/}"

# ── 5. 范围认领 — 收集认领该文件的 brief (D296 认领制 v2) ──
CLAIMANTS=""
while IFS= read -r BRIEF; do
  [ -z "$BRIEF" ] && continue

  SCOPE_PATHS=$(awk '
/^## Q2:/ { in_q2=1; in_include=0; in_exclude=0 }
in_q2 && /^## / && !/^## Q2/ { exit }
in_q2 && /^不做什么/ { in_exclude=1; in_include=0 }
in_q2 && /^做什么/ { in_include=1; in_exclude=0; next }
in_q2 && in_include && /^- / {
    line = $0
    sub(/^- /, "", line)
    path = line
    gsub(/:.*$/, "", path)
    gsub(/：.*$/, "", path)
    gsub(/ — .*$/, "", path)
    gsub(/^ +| +$/, "", path)
    if (length(path) > 0) print path
}
' "$BRIEF" 2>/dev/null || true)

  if [ -z "$SCOPE_PATHS" ]; then
    continue  # 此 brief 无法解析，试下一个
  fi

  while IFS= read -r scope_path; do
    [ -z "$scope_path" ] && continue
    SCOPE_ESCAPED=$(echo "$scope_path" | sed 's/[.[\*^$()+?{|\\]/\\&/g')
    # 后缀匹配: "enterprise.ts" 匹配 "src/routes/enterprise.ts"
    if echo "$REL_FILE" | grep -qE "(^|/)$SCOPE_ESCAPED$"; then
      CLAIMANTS="${CLAIMANTS}$(basename "$BRIEF")\n"
      break
    fi
  done <<< "$SCOPE_PATHS"
done <<< "$ALL_TODAY_BRIEFS"

if [ -z "$CLAIMANTS" ]; then
  echo "⛔ 文件不在任何今日 task brief 的 Q2 范围内: $REL_FILE"
  echo ""
  echo "   今日活跃的 task brief:"
  while IFS= read -r br; do
    [ -z "$br" ] && continue
    BR_NAME=$(basename "$br")
    BR_TITLE=$(grep "^## Q0:" "$br" 2>/dev/null | head -1 | sed 's/## Q0: *//')
    echo "     - $BR_NAME${BR_TITLE:+ ($BR_TITLE)}"
  done <<< "$ALL_TODAY_BRIEFS"
  echo ""
  echo "   这个文件不属于当前任何活跃任务的范围。请选择:"
  echo "   1) 如果属于另一个任务 → 先完成当前任务，新开 session 处理"
  echo "   2) 如果确实需要在此任务中修改 → 更新 task brief 的 Q2 范围"
  echo ""
  echo "   被阻止: $REL_FILE"
  exit 1
fi

# ── 6. 排除检查 — 只检查认领该文件的 brief (D296 跨 session 根治) ──
while IFS= read -r BRIEF; do
  [ -z "$BRIEF" ] && continue
  if ! echo -e "$CLAIMANTS" | grep -qF "$(basename "$BRIEF")"; then
    continue  # 非认领者 — 其排除项不适用于本文件
  fi
  BRIEF_NAME=$(basename "$BRIEF")

  EXCLUDE_PATHS=$(awk '
/^## Q2:/ { in_q2=1; in_include=0; in_exclude=0 }
in_q2 && /^## / && !/^## Q2/ { exit }
in_q2 && /^不做什么/ { in_exclude=1; in_include=0 }
in_q2 && in_exclude && /^- / {
    line = $0
    sub(/^- /, "", line)
    sub(/不修改/, "", line)
    sub(/不改/, "", line)
    sub(/不涉及/, "", line)
    sub(/不包括/, "", line)
    path = line
    gsub(/:.*$/, "", path)
    gsub(/（.*$/, "", path)
    gsub(/\(.*$/, "", path)
    gsub(/^ +| +$/, "", path)
    if (length(path) > 0) print path
}
' "$BRIEF" 2>/dev/null || true)

  if [ -n "$EXCLUDE_PATHS" ]; then
    while IFS= read -r ex_path; do
      [ -z "$ex_path" ] && continue
      EX_ESCAPED=$(echo "$ex_path" | sed 's/[.[\*^$()+?{|\\]/\\&/g')
      if echo "$REL_FILE" | grep -qE "(^|/)$EX_ESCAPED$"; then
        echo "⛔ Q2 排除项禁止修改: $ex_path (来自认领 brief $BRIEF_NAME)"
        echo "   task brief 声明本任务不修改此文件: $REL_FILE"
        echo "   如需修改，请先更新 task brief 的 Q2 范围。"
        exit 1
      fi
    done <<< "$EXCLUDE_PATHS"
  fi
done <<< "$ALL_TODAY_BRIEFS"

exit 0
