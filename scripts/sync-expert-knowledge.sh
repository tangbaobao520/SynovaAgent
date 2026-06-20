#!/bin/bash
# Loop Engineering v3.3 — sync-expert-knowledge.sh
# 检查专家 KNOWLEDGE.md 中引用的 knowledge/shared/ 文件是否真实存在。
# 引用格式: 参见 knowledge/shared/xxx.md
# 用法: bash scripts/sync-expert-knowledge.sh [--fix]
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SHARED_DIR="$ROOT/knowledge/shared"
FAIL=0

if [ ! -d "$SHARED_DIR" ]; then
  echo "⚠ knowledge/shared/ 目录不存在 — 跳过同步检查"
  exit 0
fi

echo "=== 专家知识引用同步检查 ==="
echo ""

# 扫描所有 expert/*/KNOWLEDGE.md 中的 shared/ 引用
for know_file in "$ROOT/expert"/*/KNOWLEDGE.md; do
  [ ! -f "$know_file" ] && continue
  expert_name=$(basename "$(dirname "$know_file")")

  # 提取引用: 参见 knowledge/shared/xxx.md
  refs=$(grep -oP 'knowledge/shared/[a-zA-Z0-9_-]+\.md' "$know_file" 2>/dev/null || true)

  if [ -z "$refs" ]; then
    echo "  $expert_name: 无 shared/ 引用"
    continue
  fi

  for ref in $refs; do
    ref_path="$ROOT/$ref"
    if [ -f "$ref_path" ]; then
      echo "  ✅ $expert_name → $ref"
    else
      echo "  ❌ $expert_name → $ref (文件不存在)"
      FAIL=1
    fi
  done
done

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 所有知识引用有效"
else
  echo "❌ 存在断裂引用 — 请修复 KNOWLEDGE.md 或创建 shared/ 文件"
  exit 1
fi
