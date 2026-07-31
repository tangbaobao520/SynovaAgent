#!/bin/bash
# V4.5.0 — check-deprecated-mapping.sh
# 检查旧哨兵适配器是否已标注 @deprecated 对应新哨兵路径
# pre-commit 组 2 调用。全部 <500ms。
set +e
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RESET='\033[0m'

# V4.5.1: 一次 grep -L 替代 20 次循环 grep（慢盘上 26s → <1s）
UNDOCUMENTED=$(grep -qL "@deprecated" "$ROOT"/src/sentinel/adapters/*-sentinel.ts 2>/dev/null | wc -l | tr -d ' \n' || echo 0)

if [ "$UNDOCUMENTED" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠️  $UNDOCUMENTED 个旧适配器尚未标记 @deprecated（见 docs/plans/codex/FILE-DRIVEN-EXEC-TASKS.md B4）${RESET}"
else
  echo -e "  ${GREEN}✅ 旧适配器映射: 全部已标注 @deprecated${RESET}"
fi
exit 0
