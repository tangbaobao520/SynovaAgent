#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# context-injector.sh — Task Brief 上下文注射器 (D200)
#
# 权威文档 #17 §9：作为 task brief 生成后的后处理步骤运行。
# 读取 task brief → 解析权威文档引用 → 提取关键片段 → 注入 Q1c。
#
# 用法:
#   bash scripts/control-tower/context-injector.sh --task-id <TASK_ID>
#   bash scripts/control-tower/context-injector.sh --task-id <TASK_ID> --verify
#
# 依赖:
#   - Python 3.8+
#   - scripts/control-tower/inject-context.py
#   - scripts/control-tower/doc-registry.json
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PYTHON="${PYTHON:-python3}"

# ═══ 参数解析 ═══

TASK_ID=""
VERIFY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-id)
      TASK_ID="$2"
      shift 2
      ;;
    --verify)
      VERIFY="--verify"
      shift
      ;;
    *)
      echo "用法: $0 --task-id <TASK_ID> [--verify]"
      exit 1
      ;;
  esac
done

if [[ -z "$TASK_ID" ]]; then
  echo "❌ 用法: $0 --task-id <TASK_ID>"
  exit 1
fi

# ═══ 定位 brief 文件 ═══

BRIEF_FILE="$PROJECT_ROOT/.claude/task-briefs/$TASK_ID"

# 支持 .md 后缀或自动补全
if [[ ! -f "$BRIEF_FILE" ]]; then
  if [[ ! "$BRIEF_FILE" == *.md ]]; then
    BRIEF_FILE="${BRIEF_FILE}.md"
  fi
fi

if [[ ! -f "$BRIEF_FILE" ]]; then
  echo "❌ Task brief 文件未找到: $BRIEF_FILE"
  exit 1
fi

echo "📋 上下文注射器"
echo "   Brief: $BRIEF_FILE"
echo "   模式: ${VERIFY:-注射}"
echo ""

# ═══ 调用 Python 注射核心 ═══

"$PYTHON" "$SCRIPT_DIR/inject-context.py" "$BRIEF_FILE" $VERIFY

EXIT_CODE=$?

if [[ $EXIT_CODE -eq 0 ]]; then
  echo ""
  echo "✅ 上下文注射完成"
else
  echo ""
  echo "⚠️  上下文注射完成（有降级）"
fi

exit $EXIT_CODE
