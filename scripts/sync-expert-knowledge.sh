#!/bin/bash
# v3.5 PRD §20.2: 同步共享知识到各专家 KNOWLEDGE.md 的引用
# 确保8位专家的KNOWLEDGE.md引用knowledge/shared/而非复制
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SHARED_DIR="$ROOT/knowledge/shared"
EXPERT_DIR="$ROOT/expert"

echo "=== Syncing shared knowledge references ==="
count=0
for expert_dir in "$EXPERT_DIR"/*/; do
  name=$(basename "$expert_dir")
  [ "$name" = "_template" ] && continue
  KNOWLEDGE_FILE="$expert_dir/KNOWLEDGE.md"
  [ ! -f "$KNOWLEDGE_FILE" ] && continue
  
  for shared_file in "$SHARED_DIR"/*.md; do
    [ ! -f "$shared_file" ] && continue
    sf_name=$(basename "$shared_file")
    # Check if already referenced
    if grep -q "knowledge/shared/$sf_name" "$KNOWLEDGE_FILE" 2>/dev/null; then
      continue
    fi
    # Add reference
    echo "  $name → $sf_name"
    echo "参见 knowledge/shared/$sf_name" >> "$KNOWLEDGE_FILE"
    count=$((count + 1))
  done
done
echo "Done: $count references synced"
