#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# doc-registry-gate.sh — 登记门禁（治理机制 #1，GOVERNANCE.md）
#
# 契约（铁律 47 契约优先）:
#   输入:  环境 DOC_TRUTH_ROOT 覆盖仓库根（测试用）
#          git 仓库 → 检查 untracked 新增 .md/.yaml 是否已登记；
#          非 git（测试 fixture）→ 全量扫描模式
#   输出:  每文件 ✅/❌ + 汇总；任一未登记 → exit 1（硬阻断）；全部登记 → exit 0
#   降级:  DOCS-REGISTRY.yaml 缺失 → ⚠️ 警告 exit 0（台账未建立不阻断）
#
# 排除（生成物/历史区，无需登记）:
#   - docs/synova/DASHBOARD*.md（自动生成）
#   - 路径含 /archive/ 或 /Archive/（历史归档，只读）
# ═══════════════════════════════════════════════════════════════════════════════
set +e
ROOT="${DOC_TRUTH_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" # swallow-ok:
REGISTRY="$ROOT/docs/authority/DOCS-REGISTRY.yaml"
[ -f "$REGISTRY" ] || { echo "  ⚠️ 降级: DOCS-REGISTRY.yaml 不存在，跳过登记检查（exit 0）"; exit 0; }
REG=$(cat "$REGISTRY")

EXCLUDE='^tmp/|\.claude/|memory/|docs/plans/codex/implementation/|docs/synova/audit-reports/|docs/authority/chronicle-drafts/|docs/synova/DASHBOARD.*\.md$|/archive/|/Archive/'

FAIL=0; CHECKED=0
check_file() { # $1 = 相对路径
  local rel="$1"
  [ -z "$rel" ] && return
  [ "$rel" = "docs/authority/DOCS-REGISTRY.yaml" ] && return   # 台账自身（自引用）
  [[ "$rel" =~ $EXCLUDE ]] && return   # 纯内建正则（外部 grep 在 SYSTEM 会话下每文件 ~75ms）
  CHECKED=$((CHECKED+1))
  local base="${rel##*/}"
  if [[ "$REG" == *"$rel"* ]] || [[ "$REG" == *"$base"* ]]; then
    echo "  ✅ 已登记: $rel"
  else
    echo "  ❌ 未登记: $rel （请加入 docs/authority/DOCS-REGISTRY.yaml）"
    FAIL=$((FAIL+1))
  fi
}

if git -c safe.directory="$ROOT" -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  # untracked 新增 + staged 新增（git add 过、未提交）都要登记；
  # 提交场景靠 staged 集合（git add 后文件不再出现在 ls-files --others）
  while IFS= read -r rel; do check_file "$rel"; done < <({ git -c safe.directory="$ROOT" -C "$ROOT" ls-files --others --exclude-standard 2>/dev/null; git -c safe.directory="$ROOT" -C "$ROOT" diff --cached --name-only --diff-filter=A 2>/dev/null; } | grep -E '\.(md|yaml)$' | sort -u) # swallow-ok:
else
  while IFS= read -r rel; do check_file "$rel"; done < <(find "$ROOT" -type f \( -name '*.md' -o -name '*.yaml' \) 2>/dev/null | sed "s|^$ROOT/||") # swallow-ok:
fi

echo "── 汇总: 检查 $CHECKED 个文档，$FAIL 个未登记 ──"
if [ "$FAIL" -eq 0 ]; then echo "  ✅ 登记门禁通过"; exit 0; else echo "  ❌ 登记门禁阻断"; exit 1; fi
