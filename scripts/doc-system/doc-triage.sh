#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
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
# D782 (2026-09-16): bash 3.2 兼容重写——原 declare -A 集合在 mac 自带 bash 3.2
#        下崩溃（`declare: -A: invalid option`），CI(Linux bash5) 绿 + mac 红分裂。
#        集合改「首尾换行定界的多行字符串 + [[ == *…* ]] 精确行匹配」（纯内建）。
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

NL=$'\n'
# ── 集合（bash3.2 兼容: 首尾换行定界; 成员查询 = [[ $STR == *$NL<item>$NL* ]]）──
REFSTR="${NL}${NL}"
if [ "${#REFS[@]}" -gt 0 ]; then
  REFSTR="${NL}$(grep -hoE '[A-Za-z0-9._-]+\.md' "${REFS[@]}" 2>/dev/null | sort -u)${NL}" # swallow-ok:
fi
OLDSTR="${NL}$(find "$TARGET" -type f -name '*.md' -mtime +90 2>/dev/null)${NL}" # swallow-ok:
RECENTSTR="${NL}$(find "$TARGET" -type f -name '*.md' -mtime -30 2>/dev/null)${NL}" # swallow-ok:

DEL=(); KEEP=(); ARCH=(); NEW=(); UNK=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  base="${f##*/}"   # 纯内建取 basename（外部 basename 在 SYSTEM 会话下 75ms/次，537 文件=41s）
  if [[ "$base" =~ _tmp|_debug|_fix|\.bak$|\.orig$|副本 ]]; then DEL+=("$f"); continue; fi
  if [[ "$REFSTR" == *"${NL}${base}${NL}"* ]]; then KEEP+=("$f"); continue; fi
  if [[ "$f" =~ /archive/|/Archive/ ]]; then ARCH+=("$f"); continue; fi
  if [[ "$OLDSTR" == *"${NL}${f}${NL}"* ]]; then ARCH+=("$f"); continue; fi
  if [[ "$RECENTSTR" == *"${NL}${f}${NL}"* ]]; then NEW+=("$f"); continue; fi
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
