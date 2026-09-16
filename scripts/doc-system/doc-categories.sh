#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# doc-categories.sh — 九类沉淀索引生成器（INDEX.md §2 的机器版）
#
# 契约（铁律 47 契约优先）:
#   输入:  $1 = 目标目录（缺省 docs/，另含根目录操作文档）；DOC_TRUTH_ROOT 覆盖仓库根（测试用）
#   输出:  stdout = 各类计数 + 每类前 10 文件；exit 0；目录不存在 → exit 1
#   降级:  无
#
# 分类规则（按路径，优先级从上到下）:
#   governance      docs/authority/
#   archive         路径含 /archive/ 或 /Archive/
#   decision        docs/DECISION-* 或根目录 DECISION-*
#   research        docs/synova/research/ 或 docs/research/
#   retrospective   docs/synova/audit-reports/ 或 docs/audit/ 或根目录 AUDIT-*
#   devdoc          docs/synova/coordination/ 或 docs/plans/codex/implementation/
#                   docs/specs/ 或 docs/workflow/ 或根目录操作文档(AGENTS/CLAUDE/LOOP/README/CHANGELOG)
#   draft           docs/plans/ 其余
#   pitfall         docs/lessons/ 或 memory/ 教训卡（非 session/state）
#   diary           memory/session-*/state 或根目录 WORKLOG-*
#   knowledge       knowledge/ 或 theory/
#   unclassified    其余
# 性能: find 一次 + 循环纯内建 + 进程替换（⚠️ 禁止 here-string 大内容，MSYS 会卡死）
# D782 (2026-09-16): bash 3.2 兼容重写——原 declare -A 关联数组在 mac 自带 bash 3.2
#        下崩溃（BUCKET/LISTS 恒空/恒全量，11 用例红），CI(Linux bash5) 绿 + mac 红分裂。
#        改 eval 受控枚举（类别名是下方 case 的固定枚举值，非用户输入，无注入面）。
# ═══════════════════════════════════════════════════════════════════════════════
set +e
ROOT="${DOC_TRUTH_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" # swallow-ok:
DIR="${1:-docs}"
TARGET="$ROOT/$DIR"
[ -d "$TARGET" ] || { echo "❌ 目录不存在: $TARGET" >&2; exit 1; }

# 采集文件（docs/ 全部 + 根目录 .md + memory/knowledge/theory），相对路径
COLLECT() {
  find "$TARGET" -type f -name '*.md' 2>/dev/null | sed "s|^$ROOT/||" # swallow-ok:
  if [ "$TARGET" != "$ROOT" ]; then
    find "$ROOT" -maxdepth 1 -type f -name '*.md' 2>/dev/null | sed "s|^$ROOT/||" # swallow-ok:
    find "$ROOT/memory" "$ROOT/knowledge" "$ROOT/theory" -type f -name '*.md' 2>/dev/null | sed "s|^$ROOT/||" # swallow-ok:
  fi
}

CATEGORIES="governance archive decision research retrospective devdoc draft pitfall diary knowledge unclassified"
for k in $CATEGORIES; do
  eval "BUCKET_${k}=0"
  eval "LISTS_${k}="
done

TOTAL=0
while IFS= read -r rel; do
  [ -z "$rel" ] && continue
  TOTAL=$((TOTAL+1))
  base="${rel##*/}"
  cat=""
  case "$rel" in
    docs/authority/*)                       cat=governance ;;
    CHRONICLE.md|INDEX.md|START-HERE.md)    cat=governance ;;
    *archive/*|*Archive/*)                  cat=archive ;;
    DECISION-*|docs/DECISION-*)             cat=decision ;;
    docs/synova/research/*|docs/research/*) cat=research ;;
    docs/synova/audit-reports/*|docs/audit/*|AUDIT-*) cat=retrospective ;;
    docs/synova/coordination/*|docs/plans/codex/implementation/*|docs/specs/*|docs/workflow/*) cat=devdoc ;;
    AGENTS.md|CLAUDE.md|LOOP.md|README.md|CHANGELOG.md|LOOP-ENGINEERING-CHANGELOG.md) cat=devdoc ;;
    docs/plans/*)                           cat=draft ;;
    docs/lessons/*)                         cat=pitfall ;;
    memory/*)
      case "$base" in
        session-*|project-state-*) cat=diary ;;
        *) cat=pitfall ;;
      esac ;;
    knowledge/*|theory/*)                   cat=knowledge ;;
    WORKLOG-*)                              cat=diary ;;
    *)                                      cat=unclassified ;;
  esac
  # eval 受控: $cat 是上方 case 的固定枚举值（governance|archive|…），非用户输入
  eval "BUCKET_${cat}=\$((BUCKET_${cat}+1)); LISTS_${cat}=\"\${LISTS_${cat}}\${rel}
\""
done < <(COLLECT | sort -u)

echo "═══ doc-categories — 九类沉淀索引 (root: $ROOT, dir: $DIR) ═══"
echo "总文件: $TOTAL"
for k in $CATEGORIES; do
  eval "n=\$BUCKET_${k}"
  [ "$n" -eq 0 ] && continue
  echo ""
  echo "── $k ($n) ──"
  eval "printf '%b' \"\$LISTS_${k}\"" | sed '/^$/d' | head -10 | sed 's/^/  /'
done
exit 0
