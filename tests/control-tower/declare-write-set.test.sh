#!/bin/bash
# declare-write-set.test.sh — 写集生成器密封测试（D749）
# 覆盖: ① 正常生成 ② 幂等（块唯一）③ builtin 自动豁免 ④ 空变更集 → exit 2（不静默写空块）
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
S="$REPO/scripts/control-tower/declare-write-set.sh"
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }; no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD=$(mktemp -d); trap 'rm -rf "$TMPD"' EXIT
cd "$TMPD" || exit 1
git init -q . && git config user.email t@e.com && git config user.name t && git config commit.gpgsign false
mkdir -p a .claude/task-briefs
echo x > a/f.txt && git add -A && git commit -qm init
printf '# Task Brief: t\n\n## Q2: 范围\n做什么：\n' > .claude/task-briefs/t.md
echo y > a/g.txt && mkdir -p .claude && echo "line" > .claude/bypass.log
git add -A && git commit -qm second
bash "$S" --brief .claude/task-briefs/t.md --base HEAD~1 >/dev/null 2>&1 && ok "① 正常生成 exit 0" || no "① 生成失败"
grep -q 'WRITE-SET:BEGIN' .claude/task-briefs/t.md && ok "② 块已写入 brief" || no "② 块未写入"
grep -q 'a/g.txt' .claude/task-briefs/t.md && ok "③ 变更文件已登记" || no "③ 变更文件缺失"
grep -q 'builtin' .claude/task-briefs/t.md && ok "④ builtin 自动豁免标注" || no "④ builtin 未标注"
bash "$S" --brief .claude/task-briefs/t.md --base HEAD~1 >/dev/null 2>&1
[ "$(grep -c 'WRITE-SET:BEGIN' .claude/task-briefs/t.md)" -eq 1 ] && ok "⑤ 幂等：块唯一" || no "⑤ 块重复"
rc=0; bash "$S" --brief .claude/task-briefs/t.md --base HEAD >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 2 ] && ok "⑥ 空变更集 → exit 2（三态）" || no "⑥ 期望 exit 2 实得 $rc"
echo ""; echo "  结果: $PASS 通过, $FAIL 失败"; [ "$FAIL" -eq 0 ] && exit 0 || exit 1
