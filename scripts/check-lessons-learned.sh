#!/bin/bash
# Loop Engineering V4.5.1 — check-lessons-learned.sh
# 错误沉淀: Q0c 审计发现 → 写入 memory/ 条目 + class 去重
# 用法: bash scripts/check-lessons-learned.sh "name" "class" "constraint" "expected" "description"
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# D406 (P1-2, K3 D395a 审计): 四态改造后新教训写 memory/notes/proposed/（不再平铺 memory/ 根——防腐化通道重建平铺堆）
MEMORY_ROOT="$ROOT/memory/notes"
PROPOSED_DIR="$MEMORY_ROOT/proposed"
mkdir -p "$PROPOSED_DIR"

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
# D406: 文件名带日期（四态规范 YYYY-MM-DD-<主题>.md），去重按 class 扫四态全目录
SLUG=$(echo "$NAME" | tr ' /' '--' | tr -cd 'a-zA-Z0-9_-')
MEMFILE="$PROPOSED_DIR/${TODAY}-${SLUG}.md"

# 检查是否已有同 class 的条目（扫四态目录，跨目录去重）
EXISTING=$(grep -rl "^class: ${CLASS}$" "$MEMORY_ROOT" --include="*.md" 2>/dev/null | head -1 || true)

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
  # 新建条目（四态头字段，状态=proposed 与目录一致）
  cat > "$MEMFILE" << EOF
---
status: proposed
date: ${TODAY}
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
  echo "[lessons-learned] 新建免疫细胞(proposed): $MEMFILE"

  # 更新 proposed 索引
  INDEX="$PROPOSED_DIR/MEMORY.md"
  if [ ! -f "$INDEX" ]; then
    echo "# Memory Index (proposed)" > "$INDEX"
    echo "" >> "$INDEX"
  fi
  if ! grep -q "${SLUG}" "$INDEX" 2>/dev/null; then
    echo "- [${NAME}](${TODAY}-${SLUG}.md) — ${DESCRIPTION:0:80}" >> "$INDEX"
  fi
fi

echo "[lessons-learned] 完成"
