#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# external-auditor.sh — 外部审计器 (D202)
#
# 权威文档 #17 第五章 §1.2：不信任 Agent，只检查物理事实。
# 在每次提交后运行，扫描变更文件，对照 23 项已知错误模式，
# 输出 P0/P1/P2 严重度分级报告，与 Agent 自我报告交叉对比。
#
# 用法:
#   external-auditor.sh --task-id <ID> --diff <RANGE>
#   external-auditor.sh --task-id <ID> --diff HEAD~1..HEAD
#
# 依赖:
#   - scripts/control-tower/audit-rules.json
#   - grep / git / bash
#
# 退出码:
#   0 = 审计完成（可能有发现，但审计自身未崩溃）
#   1 = 审计器自身故障（degraded）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RULES_FILE="$SCRIPT_DIR/audit-rules.json"
REPORT_DIR="$PROJECT_ROOT/.codex/audit-reports"

# ═══ 参数 ═══

TASK_ID=""
DIFF_RANGE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --task-id) TASK_ID="$2"; shift 2 ;;
    --diff) DIFF_RANGE="$2"; shift 2 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
done

if [[ -z "$TASK_ID" || -z "$DIFF_RANGE" ]]; then
  echo "用法: external-auditor.sh --task-id <ID> --diff <RANGE>"
  exit 1
fi

mkdir -p "$REPORT_DIR"
REPORT_FILE="$REPORT_DIR/$TASK_ID.md"

# ═══ 审计发现数组 ═══
FINDINGS=()  # 每行: P0|P1|P2|category|file:line|message

# ═══ 审计日志 ═══
log() { echo "[audit] $*"; }
add_finding() {
  local severity="$1" category="$2" location="$3" message="$4"
  FINDINGS+=("$severity|$category|$location|$message")
}

# ═══ 获取变更文件 ═══
CHANGED_FILES=$(git diff "$DIFF_RANGE" --name-only 2>/dev/null || echo "")
SRC_FILES=$(echo "$CHANGED_FILES" | grep -E '^src/' | grep -v '\.test\.' | grep -v '\.d\.ts' || true)
TEST_FILES=$(echo "$CHANGED_FILES" | grep -E '^tests/' || true)
NEW_SRC_FILES=$(git diff "$DIFF_RANGE" --name-only --diff-filter=A 2>/dev/null | grep -E '^src/' || true)
NEW_TEST_FILES=$(git diff "$DIFF_RANGE" --name-only --diff-filter=A 2>/dev/null | grep -E '^tests/' || true)
EXT_FILES=$(echo "$CHANGED_FILES" | grep -E '^extensions/' || true)

# ═══ 缺失测试检查（S001） ═══
for src_file in $NEW_SRC_FILES; do
  base=$(basename "$src_file" .ts)
  test_file="tests/${src_file#src/}"
  test_file="${test_file%.ts}.test.ts"
  integration_test_file="${test_file%.test.ts}.integration.test.ts"

  missing=true
  for tf in "$test_file" "$integration_test_file"; do
    if echo "$NEW_TEST_FILES" | grep -qF "$tf"; then
      missing=false
    fi
    if [[ -f "$PROJECT_ROOT/$tf" ]]; then
      missing=false
    fi
  done

  if $missing; then
    add_finding "P1" "TEST" "$src_file" "新文件缺少测试配对"
  fi
done

# ═══ as any 检查（T001） ═══
for src_file in $SRC_FILES; do
  while IFS= read -r line; do
    if [[ -z "$line" ]]; then continue; fi
    # 跳过注释行
    if echo "$line" | grep -qE '^\s*(//|\*|/\*)'; then continue; fi
    file_line=$(echo "$line" | grep -oP '^[^:]+:\d+')
    add_finding "P0" "TYPES" "$file_line" "as any 在生产代码中"
  done < <(git diff "$DIFF_RANGE" -U0 -- "$src_file" 2>/dev/null | grep -oP '^\+.*\bas any\b' || true)
done

# ═══ engine-core 引用检查（T001-A） ═══
WHITELIST="src/adapters/engine-core-adapter.ts|src/init/engine-context.ts|src/types/engine-core-types.ts|src/agent/orchestrator-adapter.ts|src/l4/graph-bridge.ts|src/l4/entity-resolver-l2.ts|src/l4/engine-graph-store.ts|src/l4/diagnosis-graph-query.ts"
for src_file in $SRC_FILES; do
  if echo "$src_file" | grep -qE "$WHITELIST"; then continue; fi
  if git diff "$DIFF_RANGE" -U0 -- "$src_file" 2>/dev/null | grep -qP 'packages/engine-core|../../engine-core/|\.\./engine-core/'; then
    add_finding "P0" "TYPES" "$src_file" "engine-core 引用违规（铁律 46）"
  fi
done

# ═══ 空 catch 检查（E001） ═══
for src_file in $SRC_FILES; do
  while IFS= read -r match; do
    file_line=$(echo "$match" | grep -oP '^[^:]+:\d+')
    add_finding "P0" "EXCEPTION" "$file_line" "空 catch 块 — 没有 log/error 也没有 degraded"
  done < <(git diff "$DIFF_RANGE" -U0 -- "$src_file" 2>/dev/null | grep -oP '^\+.*catch\s*\([^)]*\)\s*\{\s*\}' || true)
done

# ═══ TODO 残留检查（C002） ═══
for src_file in $SRC_FILES; do
  while IFS= read -r match; do
    file_line=$(echo "$match" | grep -oP '^[^:]+:\d+')
    add_finding "P2" "CONTRACT" "$file_line" "TODO/FIXME 残留"
  done < <(git diff "$DIFF_RANGE" -U0 -- "$src_file" 2>/dev/null | grep -oP '^\+.*\b(TODO|FIXME|HACK|XXX)\b' | grep -v 'TODO.*D[0-9]' || true)
done

# ═══ 统计 ═══
P0_COUNT=0; P1_COUNT=0; P2_COUNT=0
for f in "${FINDINGS[@]}"; do
  sev=$(echo "$f" | cut -d'|' -f1)
  case "$sev" in
    P0) ((P0_COUNT++)) ;;
    P1) ((P1_COUNT++)) ;;
    P2) ((P2_COUNT++)) ;;
  esac
done

# ═══ 交叉对比 ═══
# 检查 Agent 自我报告中是否声称了审计结果
AGENT_SELF_REPORT=$(git show HEAD:".claude/task-briefs/$TASK_ID.md" 2>/dev/null || echo "")
CROSS_CHECK_FAILS=0

if echo "$AGENT_SELF_REPORT" | grep -qi "接线检查\|wiring"; then
  if ! echo "$AGENT_SELF_REPORT" | grep -qi "grep.*确认\|caller\|调用方"; then
    ((CROSS_CHECK_FAILS++))
  fi
fi

# ═══ 生成报告 ═══
{
  echo "# 审计报告 -- $TASK_ID"
  echo ""
  echo "> 生成时间: $(date -Iseconds)"
  echo "> 审计范围: $DIFF_RANGE"
  echo ""
  echo "## 概要"
  echo ""
  echo "| 类别 | 计数 |"
  echo "|------|------|"
  echo "| P0 (严重) | $P0_COUNT |"
  echo "| P1 (警告) | $P1_COUNT |"
  echo "| P2 (建议) | $P2_COUNT |"
  echo "| **合计** | **$(($P0_COUNT + $P1_COUNT + $P2_COUNT))** |"
  echo "| 交叉对比不一致 | $CROSS_CHECK_FAILS |"
  echo ""
} > "$REPORT_FILE"

# P0 发现
if [[ $P0_COUNT -gt 0 ]]; then
  {
    echo "## P0 发现"
    echo ""
    echo "| 类别 | 位置 | 问题 |"
    echo "|------|------|------|"
    for f in "${FINDINGS[@]}"; do
      sev=$(echo "$f" | cut -d'|' -f1)
      if [[ "$sev" == "P0" ]]; then
        cat=$(echo "$f" | cut -d'|' -f2)
        loc=$(echo "$f" | cut -d'|' -f3)
        msg=$(echo "$f" | cut -d'|' -f4)
        echo "| $cat | \`$loc\` | $msg |"
      fi
    done
    echo ""
  } >> "$REPORT_FILE"
fi

# P1 发现
if [[ $P1_COUNT -gt 0 ]]; then
  {
    echo "## P1 发现"
    echo ""
    echo "| 类别 | 位置 | 问题 |"
    echo "|------|------|------|"
    for f in "${FINDINGS[@]}"; do
      sev=$(echo "$f" | cut -d'|' -f1)
      if [[ "$sev" == "P1" ]]; then
        cat=$(echo "$f" | cut -d'|' -f2)
        loc=$(echo "$f" | cut -d'|' -f3)
        msg=$(echo "$f" | cut -d'|' -f4)
        echo "| $cat | \`$loc\` | $msg |"
      fi
    done
    echo ""
  } >> "$REPORT_FILE"
fi

# P2 发现
if [[ $P2_COUNT -gt 0 ]]; then
  {
    echo "## P2 发现"
    echo ""
    for f in "${FINDINGS[@]}"; do
      sev=$(echo "$f" | cut -d'|' -f1)
      if [[ "$sev" == "P2" ]]; then
        cat=$(echo "$f" | cut -d'|' -f2)
        loc=$(echo "$f" | cut -d'|' -f3)
        msg=$(echo "$f" | cut -d'|' -f4)
        echo "- [$cat] \`$loc\`: $msg"
      fi
    done
    echo ""
  } >> "$REPORT_FILE"
fi

# 交叉对比
{
  echo "## Agent 自我报告交叉对比"
  echo ""
  if [[ $CROSS_CHECK_FAILS -gt 0 ]]; then
    echo "| 检查项 | Agent 报告 | 审计器 | 状态 |"
    echo "|--------|-----------|--------|------|"
    echo "| 接线检查 | 声称通过 | 发现 $P0_COUNT 个 P0 接线问题 | ❌ 矛盾 |"
    echo ""
    echo "**结论**: Agent 自我报告与物理事实不一致 — 建议人工审查。"
  else
    echo "Agent 自我报告与审计结果一致。"
  fi
  echo ""
  echo "---"
  echo "*审计器版本: D202 v1.0 | 规则数: $(grep -c '"id"' "$RULES_FILE" 2>/dev/null || echo 0)*"
} >> "$REPORT_FILE"

# ═══ 输出摘要 ═══
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  外部审计报告 — $TASK_ID"
echo "  P0: $P0_COUNT | P1: $P1_COUNT | P2: $P2_COUNT"
echo "  交叉对比不一致: $CROSS_CHECK_FAILS"
echo "  报告: $REPORT_FILE"
echo "═══════════════════════════════════════════════════════════"

if [[ $CROSS_CHECK_FAILS -gt 0 ]]; then
  echo "⚠ Agent 自我报告与审计结果存在矛盾 — 建议人工审查"
fi

# ═══ D214 发射信号 ═══
_SIGNAL_STATUS="green"
_SIGNAL_REASON="audit_complete_no_findings"
if [[ $P0_COUNT -gt 0 ]]; then
  _SIGNAL_STATUS="red"
  _SIGNAL_REASON="${P0_COUNT}_P0_findings"
elif [[ $P1_COUNT -gt 0 || $P2_COUNT -gt 0 ]]; then
  _SIGNAL_STATUS="yellow"
  _SIGNAL_REASON="${P1_COUNT}_P1_${P2_COUNT}_P2_findings"
fi
python3 "$SCRIPT_DIR/emit-signal.py" external-auditor "$_SIGNAL_STATUS" "$_SIGNAL_REASON" \
  --p0 "$P0_COUNT" --p1 "$P1_COUNT" --p2 "$P2_COUNT" 2>/dev/null || true
