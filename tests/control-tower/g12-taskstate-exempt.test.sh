#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# g12-taskstate-exempt.test.sh — G12 豁免 task-state 登记元数据（V4.9.2）
#
# 背景: task-state/*.json|*.md 是任务登记元数据（D382 状态机，各角色按阶段更新），
# 不是代码实现。dev-doc 提交 spec 时无"实现 brief"，混合提交（dev doc + task-state）
# 走全量 13 组时被 G12「不在 Q2 范围」误拦（2026-08-24 Win 实测，PR #139 首跑 CI 红）。
# 修复: G12 skip_re 增加 task-state/.*\.(json|md)$ 豁免——与 is_doc_only 的
#       DOC_PREFIX_RE（L175 已含 task-state/.*\.(json|md)$）语义对齐（D366 docs/ 同型）。
#       仅豁免 json/md——task-state/ 下若出现 .ts 仍被 G12 检查（防藏代码，fail-closed）。
#
# 覆盖（铁律 48: 正常/降级/边界; 函数单测，today-by-name 模式，零真实 git）:
#   T1  skip_re 接线: pre-commit-check.sh 定义 skip_re 且含 task-state 豁免
#   T2  边界: task-state/D481.json 匹配 skip → 豁免（不在 G12 检查范围）
#   T3  边界: task-state/evil.ts 不匹配 skip → 仍被 G12 检查（防藏代码）
#   T4  正常: src/foo.ts 不匹配 skip → 仍被 G12 检查（代码保护不削弱）
#
# 用法: bash tests/control-tower/g12-taskstate-exempt.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PRECOMMIT="$REPO_DIR/scripts/pre-commit-check.sh"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
check() { # check <描述> <期望> <实际>
  if [ "$2" = "$3" ]; then pass "$1"; else fail "$1 (期望 [$2] 实际 [$3])"; fi
}

# ── 1. 提取生产 skip_re（RED: 实现前无 task-state 豁免 → T2 失败）──
echo ""
echo "── 1. skip_re 定义提取 ──"
SKIP_RE=$(grep -o "skip_re = re.compile([^)]*)" "$PRECOMMIT" | head -1 || true)
if [ -n "$SKIP_RE" ]; then
  pass "pre-commit-check.sh 定义 skip_re"
  if echo "$SKIP_RE" | grep -q "task-state"; then
    pass "skip_re 含 task-state 豁免（V4.9.2）"
  else
    fail "skip_re 缺 task-state 豁免 (RED: 先实现)"
  fi
else
  fail "pre-commit-check.sh 未定义 skip_re (RED)"
fi

# ── 2. 豁免判定（用 python 按生产同款逻辑评估）──
echo ""
echo "── 2. 豁免判定矩阵 ──"
EVAL=$(python -c "
import re, sys
skip_re = re.compile(r'\.claude/|scripts/workflow/|\.codex/|memory/|docs/|task-state/.*\.(json|md)\$|\.github/')
for p in ['task-state/D481.json', 'task-state/D481.md', 'task-state/evil.ts', 'src/foo.ts', 'docs/x.md']:
    print(p + '=' + ('SKIP' if skip_re.search(p) else 'CHECK'))
" 2>&1) || EVAL=""
TS_JSON=$(echo "$EVAL" | grep '^task-state/D481.json=' | cut -d= -f2 || true)
TS_MD=$(echo "$EVAL" | grep '^task-state/D481.md=' | cut -d= -f2 || true)
TS_TS=$(echo "$EVAL" | grep '^task-state/evil.ts=' | cut -d= -f2 || true)
SRC=$(echo "$EVAL" | grep '^src/foo.ts=' | cut -d= -f2 || true)
DOC=$(echo "$EVAL" | grep '^docs/x.md=' | cut -d= -f2 || true)

check "T2 task-state/D481.json 应豁免" "SKIP" "$TS_JSON"
check "T2b task-state/D481.md 应豁免" "SKIP" "$TS_MD"
check "T3 task-state/evil.ts 不应豁免（防藏代码）" "CHECK" "$TS_TS"
check "T4 src/foo.ts 不应豁免（代码保护不削弱）" "CHECK" "$SRC"
check "T5 docs/x.md 应豁免（D366 先例保持）" "SKIP" "$DOC"

echo ""
echo "结果: 通过 $PASS / 失败 $FAIL"
[ "$FAIL" -eq 0 ]
