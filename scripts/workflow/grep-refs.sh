#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# grep-refs.sh — 改前先 grep 全仓库引用 (V4.4.5)
#
# 用法: bash scripts/workflow/grep-refs.sh "符号1" "符号2" ...
# 功能: grep 每个符号在 src/ extensions/ tests/ packages/ 中的全部引用,
#       写入 .claude/reference-map.md, 创建 .claude/grep-verified 门禁文件。
#
# 门禁: hook-block-write.sh 检查 .claude/grep-verified 是否存在。
#       不存在 → 拒绝 Write/Edit（物理阻断，非AI自律）。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
REFMAP="$ROOT/.claude/reference-map.md"
GATE="$ROOT/.claude/grep-verified"

if [ $# -eq 0 ]; then
  echo "用法: bash scripts/workflow/grep-refs.sh \"符号1\" \"符号2\" ..."
  echo "示例: bash scripts/workflow/grep-refs.sh \"EdgeType.DEPENDS_ON\" \"EdgeType.INFORMS\""
  exit 1
fi

echo "# Reference Map" > "$REFMAP"
echo "" >> "$REFMAP"
echo "| 符号 | 文件 | 行 | 内容 |" >> "$REFMAP"
echo "|------|------|-----|------|" >> "$REFMAP"

TOTAL=0
for pattern in "$@"; do
  echo "" >> "$REFMAP"
  echo "## $pattern" >> "$REFMAP"

  RESULTS=$(grep -rn "$pattern" "$ROOT/src/" "$ROOT/extensions/" "$ROOT/tests/" "$ROOT/packages/" \
    --include="*.ts" --include="*.tsx" --include="*.json" 2>/dev/null | grep -v node_modules | grep -v '.test.ts' || true)

  COUNT=0
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    FILE=$(echo "$line" | cut -d: -f1)
    LINE_NO=$(echo "$line" | cut -d: -f2)
    CONTENT=$(echo "$line" | cut -d: -f3- | sed 's/|/\\|/g')
    REL_FILE="${FILE#$ROOT/}"
    echo "| \`$pattern\` | $REL_FILE | $LINE_NO | \`$CONTENT\` |" >> "$REFMAP"
    COUNT=$((COUNT + 1))
    TOTAL=$((TOTAL + 1))
  done <<< "$RESULTS"

  # 也搜 test 文件（单独标出）
  TEST_RESULTS=$(grep -rn "$pattern" "$ROOT/tests/" \
    --include="*.test.ts" --include="*.test.tsx" --include="*.integration.test.ts" 2>/dev/null | grep -v node_modules || true)
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    FILE=$(echo "$line" | cut -d: -f1)
    LINE_NO=$(echo "$line" | cut -d: -f2)
    CONTENT=$(echo "$line" | cut -d: -f3- | sed 's/|/\\|/g')
    REL_FILE="${FILE#$ROOT/}"
    echo "| \`$pattern\` | **$REL_FILE** 📋 | $LINE_NO | \`$CONTENT\` |" >> "$REFMAP"
    TOTAL=$((TOTAL + 1))
  done <<< "$TEST_RESULTS"

  if [ "$COUNT" -eq 0 ]; then
    echo "| \`$pattern\` | *(无引用)* | — | — |" >> "$REFMAP"
  fi
done

# 创建门禁文件
touch "$GATE"
echo "✅ Reference map: $REFMAP"
echo "   共 $TOTAL 处引用 (含 test 文件已标注 📋)"
echo "   门禁已打开: $GATE"
echo ""
echo "请在 $REFMAP 中逐项审查:"
echo "  1. 哪些需要改（标注 ✅）"
echo "  2. 哪些不改但要注意（标注 👀）"
echo "  3. 哪些是测试，改名后一同更新"
