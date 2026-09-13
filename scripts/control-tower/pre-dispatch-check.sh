#!/usr/bin/env bash
# D732 UTF-8 强制
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# pre-dispatch-check.sh — 派单前机械复核（skill: pre-dispatch-check 的可自动化部分）
#
# 背景（D732 前 CTO 亲历）: 派单文档凭印象写写集路径（src/l4/evidence/**，实际代码在
#   src/evidence/），且把员工转述的技术声称当结论 → 执行方拿到的派单本身有错。
# 本脚本只做**机械可判**的四项（①②④⑥）；③技术声称复现 / ⑤写集交集 / ⑦依赖 / ⑧交付物
#   属语义判断，由 skill 强制人工完成，脚本不假装能做。
#
# 用法: bash scripts/control-tower/pre-dispatch-check.sh <派单文档路径>
# 退出码（三态，对齐 ctrl-tower-change 模式 1）:
#   0 = 机械项全通过
#   1 = 发现问题（无 task-state / 路径不存在 / 行号越界）
#   2 = 检查本身执行失败（文档不存在、非 git 仓库）
# 契约: 输入=派单文档路径（可含中文）；输出=逐项 ✅/⚠️ 点名；不修改任何文件
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
DOC="${1:-}"
if [ -z "$DOC" ]; then echo "用法: $0 <派单文档路径>"; exit 2; fi
[ -f "$DOC" ] || { echo "❌ 派单文档不存在: $DOC"; exit 2; }
ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || { echo "❌ 非 git 仓库"; exit 2; }
FIND=0
tmp=$(mktemp); trap 'rm -f "$tmp"' EXIT

echo "── ① 任务号真实性（禁臆写，需 task-state 存在）──"
for d in $(grep -oE 'D[0-9]{3}' "$DOC" | sort -u); do
  if [ -f "$ROOT/task-state/$d.json" ]; then echo "  ✅ $d 已登记"
  else echo "  ⚠️ $d 无 task-state（新建须走 alloc-task-id.sh）"; FIND=1; fi
done

echo "── ④ 写集路径存在性（不存在须显式标注「新建」）──"
grep -oE '(src|scripts|tests|docs|electron|electron-renderer)/[A-Za-z0-9_./*-]+' "$DOC" \
  | sed 's/[.,，。；、)]*$//' | sort -u > "$tmp"
while read -r p; do
  [ -z "$p" ] && continue
  case "$p" in *\**) base="${p%/**}";; *) base="$p";; esac
  if [ -e "$ROOT/$base" ]; then echo "  ✅ $p"
  else echo "  ⚠️ 不存在: $p"; FIND=1; fi
done < "$tmp"

echo "── ⑥ 引用 file:line 抽查（行号会漂移）──"
grep -oE '[A-Za-z0-9_./-]+\.(ts|cjs|mjs|sh|py|json|yml):[0-9]+' "$DOC" | sort -u | head -25 | while IFS=: read -r f l; do
  if [ ! -f "$ROOT/$f" ]; then echo "  ⚠️ 文件不存在: $f"
  elif [ "$(wc -l < "$ROOT/$f" | tr -d ' ')" -lt "$l" ]; then echo "  ⚠️ $f 仅 $(wc -l < "$ROOT/$f" | tr -d ' ') 行，引用 :$l 越界"
  else echo "  ✅ $f:$l"; fi
done > "$tmp.line"
cat "$tmp.line"; grep -q '⚠️' "$tmp.line" && FIND=1

echo "── ② 前置 PR 合并状态（需 GITHUB_TOKEN；无则跳过，不静默）──"
TOKEN="${GITHUB_TOKEN:-}"
if [ -z "$TOKEN" ] && [ -f "$HOME/.dsh/.credentials.yaml" ]; then
  TOKEN=$(grep -E '^\s*GITHUB_TOKEN:' "$HOME/.dsh/.credentials.yaml" 2>/dev/null | sed 's/.*GITHUB_TOKEN:[[:space:]]*//' | tr -d '\r\n')
fi
if [ -z "$TOKEN" ]; then
  echo "  ⚠️ degraded: 无 GITHUB_TOKEN → 跳过前置 PR 核验（须人工核）"
else
  for pr in $(grep -oE '#[0-9]{2,4}' "$DOC" | tr -d '#' | sort -u); do
    st=$(curl -s -H "Authorization: token $TOKEN" "https://api.github.com/repos/tangbaobao520/SynovaAgent/pulls/$pr" 2>/dev/null \
      | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('state'),d.get('merged'))" 2>/dev/null || echo "? ?")
    echo "  PR #$pr → $st（派单若声称"已合"须与此一致）"
  done
fi

echo
[ "$FIND" -eq 0 ] && { echo "  ✅ 机械项全通过（③⑤⑦⑧ 仍须按 skill 人工完成）"; exit 0; }
echo "  ❌ 机械项发现问题——修正后再派单"; exit 1
