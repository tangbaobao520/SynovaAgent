#!/bin/bash
# Loop Engineering V4.2.6 — validate-expert-config.sh
# 校验 expert-registry.yaml 中引用的 tools/skills/output_schema 是否真实存在。
# pre-commit 第9项调用。全部 <1s。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
YAML="$ROOT/expert/expert-registry.yaml"
FAIL=0

# 如果 yaml 不存在 → 跳过（允许纯文件驱动的部署）
if [ ! -f "$YAML" ]; then
  exit 0
fi

# 提取 yaml 中 tools: 下列出的工具名
TOOLS=$(grep -E '^\s+- [a-z_]+$' "$YAML" 2>/dev/null | sed 's/.*- //' | sort -u || true)

# 验证每个 tool 对应的 skill 文件存在
for tool in $TOOLS; do
  # tools 对应 expert/*/TOOLS.md 中的条目 或 skills/ 目录中的文件
  FOUND=$(grep -rl "$tool" "$ROOT/expert/" --include="*.md" 2>/dev/null | head -1)
  if [ -z "$FOUND" ]; then
    # 也检查 skills/ 目录
    SKILL_FILE=$(find "$ROOT/skills/" -name "${tool}.md" 2>/dev/null | head -1)
    if [ -z "$SKILL_FILE" ]; then
      echo "❌ expert-registry.yaml: tool '$tool' 在 expert/ 和 skills/ 中均未找到"
      FAIL=1
    fi
  fi
done

# 验证 yaml 中声明的 expert 目录存在
EXPERTS=$(grep -E '^  [a-z_]+:$' "$YAML" 2>/dev/null | sed 's/ *//g' | sed 's/:$//' | grep -v '^version$\|^experts$' || true)
for exp in $EXPERTS; do
  if [ ! -d "$ROOT/expert/$exp" ]; then
    echo "❌ expert-registry.yaml: 专家 '$exp' 目录不存在 ($ROOT/expert/$exp)"
    FAIL=1
  fi
done

if [ "$FAIL" -eq 1 ]; then
  exit 1
fi
exit 0
