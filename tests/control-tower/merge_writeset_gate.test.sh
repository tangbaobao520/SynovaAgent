#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# merge_writeset_gate.test.sh — D708 合并级写集对账 gate 的密封测试
#
# 背景（M2 族第三次止血）: #449 夹带 51 文件 / #442 夹带 6 文件 / D593-FIX 声称提交实未提交。
# 现有门禁的盲区: pre-commit 只看单提交暂存区；verify-parallel（ci.yml L51-57）只比对
# **已合 PR 之间**的写集重叠（inter-PR），不校验单 PR 与自己声明的一致性（intra-PR）。
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   ① 正常放行  — 变更集 ⊆ 声明写集 → exit 0
#   ② 夹带必红  — 1 个声明外文件 → exit 1 + **逐文件点名**
#   ③ fail-closed — 三源皆无声明且含源码变更 → exit 2（绝不静默放行）
#   ④ 声明豁免  — `## 写集豁免` 段落（含理由）→ exit 0 且打印理由
#   ⑤ 内置豁免  — .claude/bypass.log（hook 证据账本）→ exit 0 且打印理由
#   ⑥ 分支豁免  — auto/** 自动分支 → skip
#   ⑦ 判定失败  — 取不到 merge-base → exit 2（degraded，不假装通过）
#   ⑧ 文档降级  — 无声明但全为文档范围 → skip + degraded 登记
#   接线        — ci.yml 真的调用本 gate（防「机制建成未接线」M3；D664 刚踩过同型）
# 沙箱: mktemp git 仓库 + 复制 scripts/control-tower 解析器，零网络零真实仓库依赖
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
unset GIT_DIR GIT_WORK_TREE
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/merge_writeset_gate.py"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT

echo "=== D708: merge-writeset-gate ==="

# ── 接线: ci.yml 必须真的调用本 gate（D664 教训: 建了网不接线 = 纸老虎）──
grep -q 'merge_writeset_gate.py' "$REPO/.github/workflows/ci.yml" \
  && ok "接线: ci.yml 调用 merge_writeset_gate.py" || no "接线: ci.yml 未调用（M3 未接线）"

# ── 沙箱仓库 ──
SB="$TMPD/sb"
mkdir -p "$SB/scripts/control-tower" "$SB/.claude/task-briefs" "$SB/src" "$SB/docs"
cp "$REPO/scripts/control-tower/merge_writeset_gate.py" "$SB/scripts/control-tower/"
cp "$REPO/scripts/control-tower/brief_parser.py" "$SB/scripts/control-tower/"
cp "$REPO/scripts/control-tower/devdoc_writeset.py" "$SB/scripts/control-tower/"
git -C "$SB" init -q
git -C "$SB" config user.email t@t.local
git -C "$SB" config user.name t
printf 'seed\n' > "$SB/seed.txt"
git -C "$SB" add -A >/dev/null 2>&1
git -C "$SB" commit -q -m "chore: base"
BASE=$(git -C "$SB" rev-parse HEAD)

mkbrief() { # $1 = 额外段落（写 brief 文件）
  { printf '#CRITERIA: A\n\n# Task Brief: D708 sandbox\n> 认领: 🛠 编码 session\n\n'
    printf '## Q0: 定位\n### a) 拼图\n控制塔。\n\n## Q1: 调研\n铁律 35。\n\n'
    printf '## Q2: 范围 — 最简方案\n做什么:\n- src/a.ts\n不做什么:\n- 不改 scripts/audit/audit-rules.sh\n\n'
    printf '## Q3: 验收\n入口: CI。\n\n## 架构层: scripts\n\n## Done 标准\n- [x] verify: x\n'
    [ -n "$1" ] && printf '%s\n' "$1"
  } > "$SB/.claude/task-briefs/2026-09-12-D708-sandbox.md"
}
run_gate() { # $@ = 额外 gate 参数
  (cd "$SB" && python3 "$SB/scripts/control-tower/merge_writeset_gate.py" \
     --repo-root "$SB" --base "$BASE" --head HEAD --branch "${BRANCH:-fix/D708-sandbox}" "$@" 2>&1)
}

# 场景隔离: 每场景先「清 src + 写 brief → 提交 → 记为 BASE」，使 --base..HEAD 只含本场景改动。
# （否则脚手架自身会被算进变更集 → 假夹带）
reset_sandbox() { # $1 = 豁免段落（可空）; $2 = --no-brief 表示删掉 brief
  rm -f "$SB/src/"*.ts 2>/dev/null || true
  if [ "${2:-}" = "--no-brief" ]; then
    rm -f "$SB/.claude/task-briefs/2026-09-12-D708-sandbox.md"
  else
    mkbrief "${1:-}"
  fi
  git -C "$SB" add -A >/dev/null 2>&1
  git -C "$SB" commit -q -m "chore: scaffold"
  BASE=$(git -C "$SB" rev-parse HEAD)
}
commit_it() { git -C "$SB" add -A >/dev/null 2>&1; git -C "$SB" commit -q -m "$1"; }

# ── ① 正常放行 ──
reset_sandbox ""
printf 'a\n' > "$SB/src/a.ts"; commit_it "feat(D708): declared only"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 0 ] && ok "① 正常放行: 变更集 ⊆ 声明 → exit 0" || no "① 期望 exit 0，实得 $rc :: $(echo "$OUT" | tail -2)"

# ── ② 夹带必红（恰好 1 个写集外文件）──
reset_sandbox ""
printf 'a\n' > "$SB/src/a.ts"; printf 'b\n' > "$SB/src/b_smuggled.ts"; commit_it "feat(D708): smuggle"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 1 ] && ok "② 夹带 → exit 1（业务阻断）" || no "② 期望 exit 1，实得 $rc"
echo "$OUT" | grep -q 'src/b_smuggled.ts' && ok "② 逐文件点名夹带文件" || no "② 未点名夹带文件"
echo "$OUT" | grep -q '夹带文件 1 个' && ok "② 计数正确（1 个）" || no "② 计数不符: $(echo "$OUT" | grep -a 夹带 | head -1)"
echo "$OUT" | grep -q '修复指引' && ok "② 输出修复指引（三选一）" || no "② 缺修复指引"
echo "$OUT" | grep -q 'S3:brief.Q2-include' && ok "② 输出声明源（可审计哪个源收录）" || no "② 未标注声明源"

# 撤回夹带 → 转绿（T3 实证的本地等价）
rm -f "$SB/src/b_smuggled.ts"; commit_it "fix(D708): revert smuggle"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 0 ] && ok "② 撤回夹带 → 转绿（exit 0）" || no "② 撤回后仍红: $(echo "$OUT" | tail -2)"

# ── ③ fail-closed: 三源皆无声明 + 含源码变更 ──
reset_sandbox "" --no-brief
printf 'c\n' > "$SB/src/c_undeclared.ts"; commit_it "feat(D708): no declaration"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 2 ] && ok "③ 无声明 + 源码变更 → exit 2（fail-closed）" || no "③ 期望 exit 2，实得 $rc"
echo "$OUT" | grep -q 'fail-closed' && ok "③ 明示 fail-closed 语义" || no "③ 未明示 fail-closed"
grep -q 'merge-writeset-gate' "$SB/.codex/control-tower/logs/degraded-events.log" 2>/dev/null \
  && ok "③ 降级登记落盘（铁律 11 不静默）" || no "③ 未登记 degraded-events.log"

# ── ④ 声明豁免（含理由）生效 ──
reset_sandbox $'## 写集豁免\n- src/c_undeclared.ts — sandbox 豁免演示：该文件属并行线只读引用'
printf 'c\n' > "$SB/src/c_undeclared.ts"; commit_it "feat(D708): exempted"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 0 ] && ok "④ 显式豁免生效 → exit 0" || no "④ 豁免未生效: rc=$rc"
echo "$OUT" | grep -q 'sandbox 豁免演示' && ok "④ 打印豁免理由" || no "④ 未打印豁免理由"
# 反例: 豁免条目无理由 → 不生效（门禁不许被无声改软）
reset_sandbox $'## 写集豁免\n- src/c_undeclared.ts'
printf 'c\n' > "$SB/src/c_undeclared.ts"; commit_it "feat(D708): unreasoned exempt"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 1 ] && ok "④ 反例: 无理由的豁免不生效 → exit 1" || no "④ 无理由豁免被放行（门禁变软）"

# ── ⑤ 内置豁免: bypass.log（post-commit hook 每次追加的证据账本）──
reset_sandbox ""
printf 'e\n' > "$SB/src/a.ts"; printf 'log\n' >> "$SB/.claude/bypass.log"; commit_it "feat(D708): bypass log"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 0 ] && ok "⑤ bypass.log 内置豁免 → exit 0" || no "⑤ bypass.log 被误判夹带: rc=$rc"
echo "$OUT" | grep -q 'post-commit hook' && ok "⑤ 打印内置豁免理由" || no "⑤ 未打印内置豁免理由"

# ── ⑥ 分支豁免: auto/**（CI 生成物分支）──
BRANCH="auto/dashboard" OUT=$(run_gate); rc=$?
{ [ "$rc" -eq 0 ] && echo "$OUT" | grep -q 'auto/'; } \
  && ok "⑥ auto/** 自动分支 → skip（exit 0）" || no "⑥ auto 分支豁免失效"
BRANCH="fix/D708-sandbox"

# ── ⑥b 分支豁免: main/master（合并后 push 不归本 gate 管）──
BRANCH="main" OUT=$(run_gate); rc=$?
{ [ "$rc" -eq 0 ] && echo "$OUT" | grep -q '合并后 push'; } \
  && ok "⑥b main 分支 → skip（触发点在合并前）" || no "⑥b main 分支未跳过: rc=$rc"
BRANCH="fix/D708-sandbox"

# ── ⑦ 判定失败 → exit 2（不假装通过）──
OUT=$(cd "$SB" && python3 "$SB/scripts/control-tower/merge_writeset_gate.py" \
        --repo-root "$SB" --base no-such-ref-xyz --head HEAD --branch fix/D708-sandbox 2>&1); rc=$?
[ "$rc" -eq 2 ] && ok "⑦ 取不到 merge-base → exit 2" || no "⑦ 期望 exit 2，实得 $rc"

# ── ⑧ 无声明但全为文档范围 → skip + degraded（不阻断文档 PR）──
reset_sandbox "" --no-brief
printf 'd\n' > "$SB/docs/note.md"; commit_it "docs(D708): docs only"
OUT=$(run_gate); rc=$?
{ [ "$rc" -eq 0 ] && echo "$OUT" | grep -q '降级放行'; } \
  && ok "⑧ 纯文档无声明 → skip + 降级放行" || no "⑧ 纯文档被误阻断: rc=$rc"

# ── ⑨b CJK 文件名（本仓大量中文文档名 → core.quotepath 必须关，否则被误判夹带）──
reset_sandbox ""
mkdir -p "$SB/docs/synova/coordination"
printf 'z\n' > "$SB/docs/synova/coordination/D708-中文设计稿-20260912.md"
mkbrief ""
commit_it "docs(D708): cjk filename"
OUT=$(run_gate); rc=$?
if [ "$rc" -eq 1 ] && echo "$OUT" | grep -q 'D708-中文设计稿-20260912.md'; then
  ok "⑨b CJK 文件名被正确判为夹带并原样点名（quotepath 已关）"
else
  no "⑨b CJK 文件名处理异常: rc=$rc :: $(echo "$OUT" | grep -a 夹带 | head -2)"
fi
# 声明里加入该中文路径 → 必须转绿（证明匹配而非转义串比较）
reset_sandbox $'## 写集豁免\n- docs/synova/coordination/D708-中文设计稿-20260912.md — CJK 路径匹配演示'
printf 'z\n' > "$SB/docs/synova/coordination/D708-中文设计稿-20260912.md"; commit_it "docs(D708): cjk declared"
OUT=$(run_gate); rc=$?
[ "$rc" -eq 0 ] && ok "⑨b CJK 路径加入声明后转绿（匹配语义正确）" || no "⑨b CJK 路径声明未生效: rc=$rc"

# ── ⑨ JSON 输出契约（CI 消费）──
OUT=$(run_gate --json | tail -1)
echo "$OUT" | python3 -c "
import json,sys
d=json.load(sys.stdin)
assert d['component']=='merge-writeset-gate', d
assert 'status' in d and 'smuggled' in d and 'declared' in d, d
" 2>/dev/null && ok "⑨ --json 输出契约（component/status/smuggled/declared）" || no "⑨ JSON 契约不符"

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
