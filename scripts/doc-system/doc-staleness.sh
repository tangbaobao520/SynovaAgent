#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# doc-staleness.sh — 文档过期标记（治理机制 #3，GOVERNANCE.md）
#
# 契约（铁律 47 契约优先）:
#   输入:  目标 = 权威层 docs/authority/*.md + 根目录 INDEX/CHRONICLE/START-HERE
#          环境 DOC_STALENESS_DAYS（缺省 90）；DOC_TRUTH_ROOT 覆盖仓库根（测试用）
#   输出:  每文档 ✅/⚠️；任一过期 → exit 1（供注入器标记 stale、不当作现状）；
#          全部新鲜 → exit 0
#   降级:  文档缺失 → ⚠️ 提示（不判失败）；无法取 mtime → 跳过
# ═══════════════════════════════════════════════════════════════════════════════
set +e
ROOT="${DOC_TRUTH_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" # swallow-ok:
DAYS="${DOC_STALENESS_DAYS:-90}"
DOCS=(INDEX.md CHRONICLE.md START-HERE.md docs/authority/PRD.md docs/authority/ARCHITECTURE.md docs/authority/STATUS.md docs/authority/DOCS-REGISTRY.yaml docs/authority/GOVERNANCE.md docs/authority/DRIFT-LEDGER.md)

STALE=0
echo "═══ doc-staleness.sh — 权威层新鲜度检查 (阈值 ${DAYS} 天) ═══"
for rel in "${DOCS[@]}"; do
  f="$ROOT/$rel"
  [ -f "$f" ] || { echo "  ⚠️ 缺失: $rel"; continue; }
  if find "$f" -mtime +"$DAYS" -print -quit 2>/dev/null | grep -q .; then # swallow-ok:
    echo "  ⚠️ 过期: $rel （>${DAYS} 天未更新）"; STALE=$((STALE+1))
  else
    echo "  ✅ 新鲜: $rel"
  fi
done
if [ "$STALE" -eq 0 ]; then
  echo "  ✅ 全部新鲜"; exit 0
else
  echo "  ❌ $STALE 份过期（agent 注入时应标记 stale，不当作现状）"; exit 1
fi
