#!/bin/bash
# 读取 TECH_DEBT.md 并输出摘要
# pre-commit 集成: 每次 commit 时显示未解决问题数
set -euo pipefail

DEBT_FILE="$(git rev-parse --show-toplevel 2>/dev/null || echo "$(cd "$(dirname "$0")/.." && pwd)")/TECH_DEBT.md"

if [ ! -f "$DEBT_FILE" ]; then
  echo "  ⚠ TECH_DEBT.md 不存在 — 跳过技术债务检查"
  exit 0
fi

# 统计未解决项
TOTAL=$(grep -c '^\- \[ \]' "$DEBT_FILE" 2>/dev/null) || TOTAL=0
RESOLVED=$(grep -c '^\- \[x\]' "$DEBT_FILE" 2>/dev/null) || RESOLVED=0

if [ "$TOTAL" -eq 0 ]; then
  echo "  ✅ 技术债务: 0 项待解决"
  exit 0
fi

# 找最旧的未解决项
OLDEST_LINE=$(grep '^\- \[ \]' "$DEBT_FILE" | head -1)
OLDEST_DATE=$(echo "$OLDEST_LINE" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1)

if [ -n "$OLDEST_DATE" ]; then
  # 计算天数 (跨平台)
  OLDEST_SEC=$(date -d "$OLDEST_DATE" +%s 2>/dev/null || date -j -f "%Y-%m-%d" "$OLDEST_DATE" +%s 2>/dev/null || echo 0)
  NOW_SEC=$(date +%s)
  AGE_DAYS=$(( (NOW_SEC - OLDEST_SEC) / 86400 ))
  AGE_INFO="，最旧: ${AGE_DAYS} 天"
else
  AGE_INFO=""
fi

echo "  ⚠ 技术债务: ${TOTAL} 项待解决${AGE_INFO}"

# 超过 30 天 → 升级提醒
if [ "${AGE_DAYS:-0}" -gt 30 ]; then
  echo "     🔴 有项目超过 30 天未修复 — 应升级为 P1 优先处理"
fi

echo ""
echo "  详情: cat TECH_DEBT.md"
echo ""

exit 0
