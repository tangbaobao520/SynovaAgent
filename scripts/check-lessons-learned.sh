#!/bin/bash
# Loop Engineering V4.5.0 — check-lessons-learned.sh
# 错误沉淀: Q0c 审计发现 → 写入 memory/ 条目 + class 去重
# 用法: bash scripts/check-lessons-learned.sh "name" "class" "constraint" "expected" "description"
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
MEMORY_DIR="$ROOT/memory"
mkdir -p "$MEMORY_DIR"

NAME="${1:-}"
CLASS="${2:-}"
CONSTRAINT="${3:-}"
EXPECTED="${4:-}"
DESCRIPTION="${5:-}"

if [ -z "$NAME" ] || [ -z "$CLASS" ]; then
  echo "用法: check-lessons-learned.sh <name> <class> <constraint> <expected> <description>"
  exit 0
fi

TODAY=$(date +%Y-%m-%d)
MEMFILE="$MEMORY_DIR/${NAME}.md"

# 检查是否已有同 class 的条目
EXISTING=$(grep -rl "^class: ${CLASS}$" "$MEMORY_DIR" --include="*.md" 2>/dev/null | head -1 || true)

if [ -n "$EXISTING" ]; then
  # 更新 occurrences
  OCC=$(awk '/^occurrences:/{gsub(/^occurrences: */,""); print; exit}' "$EXISTING" 2>/dev/null || echo "0")
  OCC=$((OCC + 1))
  sed -i "s/^occurrences:.*/occurrences: $OCC/" "$EXISTING" 2>/dev/null
  echo "[lessons-learned] 更新已有条目: $(basename $EXISTING) (occurrences: $OCC)"
  if [ "$OCC" -ge 2 ]; then
    echo "  ⚠️  同一错误类别已出现 ${OCC} 次。建议升级 severity 为 block。"
    echo "  sed -i 's/^severity: warn/severity: block/' $EXISTING"
  fi
else
  # 新建条目
  cat > "$MEMFILE" << EOF
---
name: ${NAME}
class: ${CLASS}
constraint: "${CONSTRAINT}"
expected: ${EXPECTED}
severity: warn
occurrences: 1
first_seen: ${TODAY}
description: ${DESCRIPTION}
---
EOF
  echo "[lessons-learned] 新建免疫细胞: $MEMFILE"

  # 更新 MEMORY.md 索引
  INDEX="$MEMORY_DIR/MEMORY.md"
  if [ ! -f "$INDEX" ]; then
    echo "# Memory Index" > "$INDEX"
    echo "" >> "$INDEX"
  fi
  if ! grep -q "${NAME}" "$INDEX" 2>/dev/null; then
    echo "- [${NAME}](${NAME}.md) — ${DESCRIPTION:0:80}" >> "$INDEX"
  fi
fi

echo "[lessons-learned] 完成"
