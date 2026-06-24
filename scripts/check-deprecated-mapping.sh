#!/bin/bash
# V4.2.3 — check-deprecated-mapping.sh
# 检查旧哨兵适配器是否已标注 @deprecated 对应新哨兵路径
# pre-commit 组 2 调用。全部 <500ms。
set +e
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RESET='\033[0m'

UNDOCUMENTED=0
for sentinel_dir in "$ROOT/extensions/sentinels/"*/; do
  name=$(basename "$sentinel_dir")
  [ "$name" = "shared" ] && continue
  adapter="$ROOT/src/sentinel/adapters/${name}-sentinel.ts"
  [ -f "$adapter" ] && ! grep -q "@deprecated" "$adapter" 2>/dev/null && UNDOCUMENTED=$((UNDOCUMENTED + 1))
done

if [ "$UNDOCUMENTED" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠️  $UNDOCUMENTED 个旧适配器尚未标记 @deprecated（见 docs/plans/codex/FILE-DRIVEN-EXEC-TASKS.md B4）${RESET}"
else
  echo -e "  ${GREEN}✅ 旧适配器映射: 全部已标注 @deprecated${RESET}"
fi
exit 0
