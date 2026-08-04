#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-brief-parseable.sh — D313 M3 brief 契约检查
#
# 填完 task brief 立即用同源解析器（brief_parser.py）验证，格式问题提交前 5 秒暴露。
#
# 检查项:
#   ① Q2 可解析（include/exclude 提取有结果或明确空态）
#   ② #CRITERIA 必填 A-D
#   ③ 架构层 L1-5 标注
#   ④ Done 标准 ≥1 条
#   ⑤ 模板-解析器同源自检（generate-task-brief.py 输出 → 同源解析 → 通过）
#
# 退出码: 0 = 通过 / 1 = 失败（含具体缺失项）/ 0+degraded（brief 不存在 → skip，fail-open）
#
# 用法: check-brief-parseable.sh [brief-path]   （缺省 = resolve-commit-brief.sh 结果）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PARSER="$REPO_DIR/scripts/control-tower/brief_parser.py"
DEGRADED_LOG="$REPO_DIR/.codex/control-tower/logs/degraded-events.log"

BRIEF="${1:-}"
if [ -z "$BRIEF" ]; then
  BRIEF=$(bash "$REPO_DIR/scripts/workflow/resolve-commit-brief.sh" "" 2>/dev/null | head -1 || true)
fi

if [ -z "$BRIEF" ] || [ ! -f "$BRIEF" ]; then
  # fail-open: brief 不存在 → skip + degraded 记录（绝不静默）
  mkdir -p "$(dirname "$DEGRADED_LOG")"
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)\", \"component\": \"check-brief-parseable\", \"reason\": \"brief 不存在: ${BRIEF:-none}\"}" >> "$DEGRADED_LOG" 2>/dev/null || true
  echo "[check-brief-parseable] ⚠️  brief 不存在 — 跳过 (fail-open)"
  exit 0
fi

FAILURES=""

# ① Q2 可解析
Q2_OUT=$(python3 "$PARSER" --all "$BRIEF" 2>/dev/null || echo '{"parseable": false}')
if echo "$Q2_OUT" | grep -q '"parseable": false'; then
  FAILURES="${FAILURES}  Q2 不可解析（brief_parser 失败）\n"
else
  INCLUDE_N=$(echo "$Q2_OUT" | python3 -c "import json,sys; print(len(json.load(sys.stdin).get('q2_include', [])))" 2>/dev/null || echo 0)
  if [ "${INCLUDE_N:-0}" -eq 0 ]; then
    FAILURES="${FAILURES}  Q2 做什么 无路径条目（至少 1 条）\n"
  fi
fi

# ② #CRITERIA 必填
CRITERIA=$(echo "$Q2_OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('criteria') or '')" 2>/dev/null || echo "")
if [ -z "$CRITERIA" ]; then
  FAILURES="${FAILURES}  #CRITERIA 缺失（必填 A-D）\n"
fi

# ③ 架构层（有值即通过 — 基础设施类任务无 L1-5；代码任务应标 L1-5）
LAYER=$(echo "$Q2_OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('layer') or '')" 2>/dev/null || echo "")
if [ -z "$LAYER" ]; then
  FAILURES="${FAILURES}  架构层未标注（当前: 空）\n"
fi

# ④ Done ≥1
DONE_N=$(echo "$Q2_OUT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('done_count', 0))" 2>/dev/null || echo 0)
if [ "${DONE_N:-0}" -eq 0 ]; then
  FAILURES="${FAILURES}  Done 标准无条目（至少 1 条）\n"
fi

# ⑤ 模板同源自检（模板输出应能被同源解析）
TMP_BRIEF="$REPO_DIR/.codex/control-tower/tmp/bp-template-check.md"
if BRIEF_FILE="$TMP_BRIEF" TASK_DESC="self-check" python3 "$REPO_DIR/scripts/workflow/generate-task-brief.py" > /dev/null 2>&1; then
  TMP_OUT=$(python3 "$PARSER" --all "$TMP_BRIEF" 2>/dev/null || echo '{"parseable": false}')
  if echo "$TMP_OUT" | grep -q '"parseable": false'; then
    FAILURES="${FAILURES}  模板输出不可被同源解析器解析（模板-解析器漂移）\n"
  fi
  rm -f "$TMP_BRIEF"
fi

if [ -n "$FAILURES" ]; then
  echo "[check-brief-parseable] ❌ brief 不可解析: $BRIEF"
  echo -e "$FAILURES"
  exit 1
fi

echo "[check-brief-parseable] ✅ brief 可解析: $BRIEF (Q2 ✓ #CRITERIA=$CRITERIA 架构层=$LAYER Done=$DONE_N)"
exit 0
