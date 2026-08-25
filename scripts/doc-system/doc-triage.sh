#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# doc-triage.sh — 文档一次性盘点（治理机制 #5，GOVERNANCE.md）
#
# 契约（铁律 47 契约优先）:
#   输入:  $1 = 目标目录（缺省 docs/）；环境 DOC_TRUTH_ROOT 覆盖仓库根（测试用）
#   输出:  stdout = 盘点汇总（总览 + 分类计数 + 归档/删除候选列表）；exit 0
#   降级:  目录不存在 → ❌ 提示 exit 1；INDEX/CHRONICLE 缺失 → 引用检查自动降级
#
# 分类（优先级从高到低）:
#   DEL  删除候选: 文件名匹配 _tmp/_debug/_fix/*.bak/*.orig/*副本*
#   KEEP 保留:     被 INDEX.md/CHRONICLE.md/START-HERE.md/DOCS-REGISTRY.yaml 引用
#   ARCH 归档候选: 路径含 archive/Archive 或 mtime > 90 天
#   NEW  观察:     mtime ≤ 30 天（近期新增，保留观察）
#   UNK  待人工:   其余
# 性能: 批量预计算 + 循环全 bash 内建 + 进程替换（< <()）。
#        ⚠️ 禁止用 here-string（<<<）传递大输出——MSYS bash 下会卡死。
# 说明: 本次仅扫描 .md；.html 交付物另论。
# ═══════════════════════════════════════════════════════════════════════════════
set +e
ROOT="${DOC_TRUTH_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" # swallow-ok:
DIR="${1:-docs}"
TARGET="$ROOT/$DIR"
[ -d "$TARGET" ] || { echo "❌ 目录不存在: $TARGET" >&2; exit 1; }

REFS=()
for r in INDEX.md CHRONICLE.md START-HERE.md docs/authority/DOCS-REGISTRY.yaml; do
  [ -f "$ROOT/$r" ] && REFS+=("$ROOT/$r")
done

TOTAL=$(find "$TARGET" -type f -name '*.md' 2>/dev/null | sed '/^$/d' | wc -l | tr -d ' ') # swallow-ok:
BYTES=$(find "$TARGET" -type f -name '*.md' -exec cat {} + 2>/dev/null | wc -c | tr -d ' ') # swallow-ok:

declare -A REFSET OLDSET RECENTSET
if [ "${#REFS[@]}" -gt 0 ]; then
  while IFS= read -r n; do [ -n "$n" ] && REFSET["$n"]=1; done < <(grep -hoE '[A-Za-z0-9._-]+\.md' "${REFS[@]}" 2>/dev/null | sort -u) # swallow-ok:
fi
while IFS= read -r l; do [ -n "$l" ] && OLDSET["$l"]=1; done < <(find "$TARGET" -type f -name '*.md' -mtime +90 2>/dev/null) # swallow-ok:
while IFS= read -r l; do [ -n "$l" ] && RECENTSET["$l"]=1; done < <(find "$TARGET" -type f -name '*.md' -mtime -30 2>/dev/null) # swallow-ok:

DEL=(); KEEP=(); ARCH=(); NEW=(); UNK=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  base="${f##*/}"   # 纯内建取 basename（外部 basename 在 SYSTEM 会话下 75ms/次，537 文件=41s）
  if [[ "$base" =~ _tmp|_debug|_fix|\.bak$|\.orig$|副本 ]]; then DEL+=("$f"); continue; fi
  if [[ -n "${REFSET[$base]+x}" ]]; then KEEP+=("$f"); continue; fi
  if [[ "$f" =~ /archive/|/Archive/ ]]; then ARCH+=("$f"); continue; fi
  if [[ -n "${OLDSET[$f]+x}" ]]; then ARCH+=("$f"); continue; fi
  if [[ -n "${RECENTSET[$f]+x}" ]]; then NEW+=("$f"); continue; fi
  UNK+=("$f")
done < <(find "$TARGET" -type f -name '*.md' 2>/dev/null | sort) # swallow-ok:

echo "═══ doc-triage 盘点报告 (root: $ROOT, dir: $DIR) ═══"
echo "总文件: $TOTAL | 总大小: $((BYTES/1024)) KB"
echo "分类: KEEP保留 ${#KEEP[@]} | ARCH归档候选 ${#ARCH[@]} | DEL删除候选 ${#DEL[@]} | NEW观察 ${#NEW[@]} | UNK待人工 ${#UNK[@]}"
echo ""
echo "── 归档候选（前 25）──"
for f in "${ARCH[@]:0:25}"; do echo "  $f"; done
echo ""
echo "── 删除候选 ──"
for f in "${DEL[@]}"; do echo "  $f"; done
echo ""
echo "── 待人工（完整清单，需逐份定性）──"
for f in "${UNK[@]}"; do echo "  $f"; done
echo ""
echo "建议: 人工审阅后 → 归档候选移入 docs/archive/ 并立墓碑；删除候选确认后删除；UNK 逐个定性。"
exit 0
