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
#
# ── D911-A（2026-09-22 三缺陷根治）新增判据（⑬-⑳）──
#   ⑬ A1 取号不越界 — 分支名无 D# + 历史含一次 merge main（main 侧带 D#）→ 只认分支自身 D#
#   ⑭ A1 扫不到不猜 — 分支自身无 D# → task_id=null，走既有降级（doc-only skip），不取 main 的号
#   ⑮ A2 读 head 树  — 工作树已切到别的分支（本地无声明文件）→ 仍按 head 树正确对账
#   ⑯ A2 反方向      — 本地有**未提交**的声明文件、head 树没有 → 不得据它放行（exit 2）
#   ⑰ A3 结论字段    — PR 正文通道不可用 → 结论块内显式打印 + `--json` 字段 + 替代路径指引
#   ⑱ A3 替代路径    — 无 PR 正文时，声明文件内 `## 写集豁免` 仍生效（exit 0）
#   ⑲ 反例① 卡不存在 — 分支名带 D# 但无任何声明文件 → 仍 exit 2（不得静默 pass）
#   ⑳ 反例② 真夹带   — 写集外文件 → 仍 exit 1 + 逐文件点名；撤掉 → exit 0
#
# 沙箱: mktemp git 仓库 + 复制 scripts/control-tower 解析器，零网络零真实仓库依赖。
# 每个沙箱**显式隔离 `GITHUB_EVENT_PATH`**（否则宿主环境会污染 ⑰/⑱ 的通道判定）。
#
# 先红后绿（D911 验收要求「同一夹具两侧可比」）: 本文件支持把**待测 gate 二进制**换成修前版本，
# 夹具与断言一字不改（默认 = 仓库内 gate）:
#   git show origin/main:scripts/control-tower/merge_writeset_gate.py > /tmp/d708-prefix.py
#   SYNO_D708_GATE=/tmp/d708-prefix.py bash tests/control-tower/merge_writeset_gate.test.sh
#   → 既有 ①-⑫ 仍绿；⑬-⑱ 必红（修前取错号/读工作树/无结论字段）；⑲⑳ 两侧都绿（该拦的仍拦）。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
unset GIT_DIR GIT_WORK_TREE
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/merge_writeset_gate.py"
GATE_SRC="${SYNO_D708_GATE:-$GATE}"   # 先红后绿注入缝：默认=仓库内 gate，仅本测试文件使用
# PYBIN 惯例（D520 / PLATFORM-CHECKLIST）：Windows 腿可能只有 python/py → 不写死 python3
PYBIN="$(command -v python3 2>/dev/null || command -v python 2>/dev/null || command -v py 2>/dev/null || echo python3)"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
# JSON 单行取值（取不到 → 明确报 JGET-FAIL，不静默当空）
jget() { printf '%s\n' "$1" | "$PYBIN" -c "import json,sys;d=json.load(sys.stdin);print($2)" 2>/dev/null || echo JGET-FAIL; }

echo "=== D708: merge-writeset-gate ==="
[ "$GATE_SRC" = "$GATE" ] || echo "  ℹ️  待测 gate 已替换（先红后绿模式）: $GATE_SRC"

# ── 接线: ci.yml 必须真的调用本 gate（D664 教训: 建了网不接线 = 纸老虎）──
grep -q 'merge_writeset_gate.py' "$REPO/.github/workflows/ci.yml" \
  && ok "接线: ci.yml 调用 merge_writeset_gate.py" || no "接线: ci.yml 未调用（M3 未接线）"

# ── 沙箱仓库 ──
SB="$TMPD/sb"
mkdir -p "$SB/scripts/control-tower" "$SB/.claude/task-briefs" "$SB/src" "$SB/docs"
cp "$GATE_SRC" "$SB/scripts/control-tower/merge_writeset_gate.py"
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
run_gate() { # $@ = 额外 gate 参数（沙箱内显式隔离 GITHUB_EVENT_PATH）
  (cd "$SB" && GITHUB_EVENT_PATH= "$PYBIN" "$SB/scripts/control-tower/merge_writeset_gate.py" \
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
# D861: 修复指引必须给得出**可执行**输出——逐文件精确路径豁免行可直接粘贴（CTO 实证踩坑：模糊描述不被接受）
echo "$OUT" | grep -q '可直接粘贴的精确豁免行' && ok "② D861 指引含可粘贴豁免行标题" || no "② 缺可粘贴豁免行标题"
echo "$OUT" | grep -q -- '- src/b_smuggled.ts — <理由' && ok "② D861 夹带文件逐条给出精确路径豁免行" || no "② 未逐条给出精确路径豁免行"
echo "$OUT" | grep -q '模糊描述' && ok "② D861 明示模糊描述不被匹配" || no "② 未明示模糊描述风险"
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
OUT=$(cd "$SB" && GITHUB_EVENT_PATH= "$PYBIN" "$SB/scripts/control-tower/merge_writeset_gate.py" \
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
echo "$OUT" | "$PYBIN" -c "
import json,sys
d=json.load(sys.stdin)
assert d['component']=='merge-writeset-gate', d
assert 'status' in d and 'smuggled' in d and 'declared' in d, d
" 2>/dev/null && ok "⑨ --json 输出契约（component/status/smuggled/declared）" || no "⑨ JSON 契约不符"

# ═══ D708 复核修复回归（主 CTO 阻塞项：D# 推断大小写敏感 + 回退链误抓登记提交）═══
echo ""
echo "=== D708 复核修复: D# 推断 ==="

# ⑩ parse_did 大小写不敏感 + 归一化大写（真实输入，主 CTO 复现命令同款）
DID_OUT=$("$PYBIN" - "$REPO" <<'PYEOF'
import importlib.util as u, sys
sp = u.spec_from_file_location("g", sys.argv[1] + "/scripts/control-tower/merge_writeset_gate.py")
m = u.module_from_spec(sp); sp.loader.exec_module(m)
cases = [("feat/win-d702-write-op-no-swallow", "D702"),
         ("docs(d702): 补文档", "D702"),
         ("fix/D708-merge-writeset-gate", "D708"),
         ("no-digit-here", None)]
bad = [f"{t}->{m.parse_did(t)!r}" for t, exp in cases if m.parse_did(t) != exp]
print("OK" if not bad else "BAD:" + ",".join(bad))
PYEOF
)
[ "$DID_OUT" = "OK" ] && ok "⑩ parse_did 大小写不敏感且归一化大写（d702→D702）" || no "⑩ $DID_OUT"

# ⑪ 回退链跳过自动登记影子提交（HEAD 常为登记提交，其 subject 带历史 D#）
#    地形: 分支名小写无大写 D 期 → 提交 feat(d712) → 再叠一个登记影子提交(含 D521)
SB2="$TMPD/d712"; mkdir -p "$SB2/scripts/control-tower" "$SB2/.claude/task-briefs" "$SB2/src"
cp "$GATE_SRC" "$SB2/scripts/control-tower/merge_writeset_gate.py"
cp "$REPO/scripts/control-tower/brief_parser.py" "$SB2/scripts/control-tower/"
cp "$REPO/scripts/control-tower/devdoc_writeset.py" "$SB2/scripts/control-tower/"
git -C "$SB2" init -q; git -C "$SB2" config user.email t@t.local; git -C "$SB2" config user.name t
printf '#CRITERIA: A\n\n# Task Brief: D712\n> 认领: 🛠 编码 session\n\n## Q0: 定位\n### a) 拼图\nx\n\n## Q1: 调研\ny\n\n## Q2: 范围 — 最简方案\n做什么:\n- src/a.ts\n不做什么:\n- 不改 scripts/audit/audit-rules.sh\n\n## Q3: 验收\n入口: CI\n\n## 架构层:\nscripts（控制塔域）\n\n## Done 标准\n- [x] verify: x\n' > "$SB2/.claude/task-briefs/2026-09-12-D712-sandbox.md"
printf 'seed\n' > "$SB2/seed.txt"; git -C "$SB2" add -A >/dev/null 2>&1
git -C "$SB2" commit -q -m "chore: base"; B2=$(git -C "$SB2" rev-parse HEAD)
printf 'a\n' > "$SB2/src/a.ts"; git -C "$SB2" add -A >/dev/null 2>&1
git -C "$SB2" commit -q -m "feat(win-d712): declared file"
git -C "$SB2" commit -q --allow-empty -m "chore: bypass COMMITTED 登记 (auto hook, D521)"
OUT=$(cd "$SB2" && GITHUB_EVENT_PATH= "$PYBIN" "$SB2/scripts/control-tower/merge_writeset_gate.py" \
        --repo-root "$SB2" --base "$B2" --head HEAD \
        --branch feat/win-write-op-no-swallow --json 2>&1 | tail -1)
TID=$(echo "$OUT" | "$PYBIN" -c "import json,sys; d=json.load(sys.stdin); print(d.get('task_id') or 'NONE', d.get('task_id_source'), d['status'])" 2>/dev/null || echo "PARSE-FAIL")
case "$TID" in
  "D712 commit-subject pass") ok "⑪ 回退链跳过登记提交 → D712（非 D521）且判定 pass" ;;
  *) no "⑪ 回退链错配: '$TID'（期望 'D712 commit-subject pass'）" ;;
esac

# ⑫ PR 正文声明源（复核建议项）: GITHUB_EVENT_PATH 里的 ## 写集豁免 生效
SB3="$TMPD/prbody"; mkdir -p "$SB3/scripts/control-tower" "$SB3/.claude/task-briefs" "$SB3/src"
cp "$REPO/scripts/control-tower/"*.py "$SB3/scripts/control-tower/"
cp "$GATE_SRC" "$SB3/scripts/control-tower/merge_writeset_gate.py"
git -C "$SB3" init -q; git -C "$SB3" config user.email t@t.local; git -C "$SB3" config user.name t
printf '#CRITERIA: A\n\n# Task Brief\n> 认领: 🛠\n\n## Q0\n### a) x\n\n## Q1\ny\n\n## Q2:\n做什么:\n- src/a.ts\n不做什么:\n- 不改 scripts/audit/audit-rules.sh\n\n## Q3\nz\n\n## 架构层:\nscripts\n\n## Done 标准\n- [x] v\n' > "$SB3/.claude/task-briefs/2026-09-12-D708-pb.md"
printf 'seed\n' > "$SB3/seed.txt"; git -C "$SB3" add -A >/dev/null 2>&1
git -C "$SB3" commit -q -m "chore: base"; B3=$(git -C "$SB3" rev-parse HEAD)
printf 'a\n' > "$SB3/src/a.ts"; printf 'b\n' > "$SB3/src/outside.ts"
git -C "$SB3" add -A >/dev/null 2>&1; git -C "$SB3" commit -q -m "feat(D708): outside"
cat > "$TMPD/event.json" <<'JSONEOF'
{"pull_request": {"body": "## 写集豁免\n- src/outside.ts — 并行线只读引用（PR 正文声明演示）"}}
JSONEOF
OUT=$(cd "$SB3" && GITHUB_EVENT_PATH="$TMPD/event.json" "$PYBIN" "$SB3/scripts/control-tower/merge_writeset_gate.py" \
        --repo-root "$SB3" --base "$B3" --head HEAD --branch fix/D708-pb 2>&1); rc=$?
{ [ "$rc" -eq 0 ] && echo "$OUT" | grep -q 'PR 正文声明演示'; } \
  && ok "⑫ PR 正文（GITHUB_EVENT_PATH）声明源生效 → exit 0 且打印理由" \
  || no "⑫ PR 正文声明源未生效: rc=$rc"

# ═══════════════════════════════════════════════════════════════
# D911-A（2026-09-22）: A1 取号不越界 / A2 读 head 树 / A3 豁免通道结论字段
#   地形全部自建密封沙箱；两侧（修前 vs 修后）在同一夹具上跑（SYNO_D708_GATE 注入缝）。
# ═══════════════════════════════════════════════════════════════
echo ""
echo "=== D911-A1: D# 取号不得越界（并入的 main 历史不提供 D#）==="

mk_sandbox() { # $1 = 沙箱目录：控制塔脚本 + 解析器 + 空 main 分支
  mkdir -p "$1/scripts/control-tower" "$1/.claude/task-briefs" "$1/src" "$1/task-state" "$1/docs"
  cp "$GATE_SRC" "$1/scripts/control-tower/merge_writeset_gate.py"
  cp "$REPO/scripts/control-tower/brief_parser.py" "$1/scripts/control-tower/"
  cp "$REPO/scripts/control-tower/devdoc_writeset.py" "$1/scripts/control-tower/"
  git -C "$1" init -q
  git -C "$1" symbolic-ref HEAD refs/heads/main
  git -C "$1" config user.email t@t.local
  git -C "$1" config user.name t
}
mk_brief() { # $1 = 目标路径; $2 = Q2 include 行内容（可含换行=多行，每行自动加 "- "）; $3 = 追加段落（可空）
  { printf '#CRITERIA: A\n\n# Task Brief: D849 a-fixture\n> 认领: 🛠 编码 session\n\n'
    printf '## Q0: 定位\n### a) 拼图\n控制塔夹具。b) 文件审计: 无。c) 决策: 复用既有解析器。\n\n'
    printf '## Q1: 调研\n铁律 35（自动化优先）。\n\n'
    printf '## Q2: 范围 — 最简方案\n做什么:\n'
    printf '%s\n' "$2" | while IFS= read -r ln; do printf -- '- %s\n' "$ln"; done
    printf '不做什么:\n- 不改 scripts/audit/audit-rules.sh\n\n'
    printf '## Q3: 验收\n入口: CI 的 D708 step。\n\n## 架构层:\nscripts（控制塔域）\n\n'
    printf '## Done 标准\n- [x] verify: bash tests/control-tower/merge_writeset_gate.test.sh\n'
    [ -n "${3:-}" ] && printf '%s\n' "$3"
  } > "$1"
}
sb_commit() { git -C "$1" add -A >/dev/null 2>&1; git -C "$1" commit -q -m "$2"; }
sb_commit_at() { # $1 = 沙箱; $2 = subject; $3 = 显式提交时间（夹具判据不得随挂钟漂移）
  git -C "$1" add -A >/dev/null 2>&1
  GIT_AUTHOR_DATE="$3" GIT_COMMITTER_DATE="$3" git -C "$1" commit -q -m "$2"
}
sb_run() { # $1 = 沙箱; $2 = base; $3 = head; $4 = branch; $5.. = 额外参数
  ( cd "$1" && GITHUB_EVENT_PATH= "$PYBIN" "$1/scripts/control-tower/merge_writeset_gate.py" \
      --repo-root "$1" --base "$2" --head "$3" --branch "$4" "${@:5}" 2>&1 )
}

# ── ⑬ A1 判别性夹具 ──
#   地形: main 侧 = c0(seed + D849 brief + D811 卡) → `feat(D811): …`（main 历史带 D#）
#         分支侧 = 从 c0 拉出 → `feat(D849): …`（+src/a.ts）→ merge main（HEAD=merge 提交，无 D#）
#   修前: 回退扫全历史 → 先撞上并入的 `feat(D811)` → 拿 D811 声明（docs/other/**）
#         → 自己的 src/a.ts 判夹带 → exit 1「任务: D811」
#   修后: 只扫 merge-base(main,head)..head → D849 → 声明 src/a.ts → exit 0
DA1="$TMPD/d911a1"; mk_sandbox "$DA1"
mk_brief "$DA1/.claude/task-briefs/2026-09-22-D849-a1-fixture.md" "src/a.ts"
printf '{"task":"D811","write_set":["docs/other/**"]}\n' > "$DA1/task-state/D811.json"
printf 'seed\n' > "$DA1/seed.txt"
sb_commit_at "$DA1" "chore: base" "2026-09-22T00:00:00+00:00"; A1_C0=$(git -C "$DA1" rev-parse HEAD)
git -C "$DA1" checkout -q -b feature/no-did-a1 "$A1_C0"
printf 'a\n' > "$DA1/src/a.ts"
sb_commit_at "$DA1" "feat(D849): 分支自身提交（真号）" "2026-09-22T01:00:00+00:00"
# main 侧提交时间**更晚**（真实世界同款: merge origin/main 把日期更新的 main 提交排到本分支自身提交之前）
git -C "$DA1" checkout -q main
printf 'main side\n' > "$DA1/docs/main-side.md"
sb_commit_at "$DA1" "feat(D811): main 侧提交（并入历史，不得提供 D#）" "2026-09-22T02:00:00+00:00"
A1_BASE=$(git -C "$DA1" rev-parse HEAD)
git -C "$DA1" checkout -q feature/no-did-a1
git -C "$DA1" merge -q --no-ff -m "Merge branch 'main' into feature/no-did-a1" main >/dev/null 2>&1
A1_OUT=$(sb_run "$DA1" "$A1_BASE" HEAD feature/no-did-a1); A1_RC=$?
[ "$A1_RC" -eq 0 ] && ok "⑬ A1 merge-main 后不误判夹带 → exit 0" \
  || no "⑬ A1 期望 exit 0，实得 $A1_RC :: $(echo "$A1_OUT" | grep -a '结论' | head -1)"
echo "$A1_OUT" | grep -q '任务: D849' && ok "⑬ A1 取到分支自身 D849" \
  || no "⑬ A1 未取到分支自身号: $(echo "$A1_OUT" | grep -a '任务' | head -1)"
echo "$A1_OUT" | grep -q 'D811' && no "⑬ A1 仍取到并入 main 的 D811（越界取号）" \
  || ok "⑬ A1 未取到并入 main 的 D811（不越界）"

# ── ⑭ A1 边界: 分支自身无 D# → None（不猜号），走既有「无声明 → 文档范围降级」──
#   地形同 ⑬，但分支自身提交 subject 无 D#、变更仅文档。
#   修前: 取 main 的 D811 → 有声明（docs/other/**）→ docs/note.md 判夹带 → exit 1（误拦文档 PR）
#   修后: did=None → 三源皆空 → 纯文档 → skip「降级放行」exit 0
DA1B="$TMPD/d911a1b"; mk_sandbox "$DA1B"
printf '{"task":"D811","write_set":["docs/other/**"]}\n' > "$DA1B/task-state/D811.json"
printf 'seed\n' > "$DA1B/seed.txt"; sb_commit "$DA1B" "chore: base"; A1B_C0=$(git -C "$DA1B" rev-parse HEAD)
printf 'main side\n' > "$DA1B/docs/main-side.md"
sb_commit "$DA1B" "feat(D811): main 侧提交（并入历史）"
A1B_BASE=$(git -C "$DA1B" rev-parse HEAD)
git -C "$DA1B" checkout -q -b feature/no-did-a1b "$A1B_C0"
mkdir -p "$DA1B/docs"   # checkout 会把「仅被 main 跟踪的 docs/」整目录收走 → 先补目录
printf 'note\n' > "$DA1B/docs/note.md"; sb_commit "$DA1B" "docs: 分支自身提交（无 D#）"
git -C "$DA1B" merge -q --no-ff -m "Merge branch 'main' into feature/no-did-a1b" main >/dev/null 2>&1
A1B_OUT=$(sb_run "$DA1B" "$A1B_BASE" HEAD feature/no-did-a1b); A1B_RC=$?
[ "$A1B_RC" -eq 0 ] && ok "⑭ A1 扫不到号 → 纯文档降级放行 exit 0" \
  || no "⑭ A1 期望 exit 0，实得 $A1B_RC :: $(echo "$A1B_OUT" | grep -a '结论' | head -1)"
echo "$A1B_OUT" | grep -q '降级放行' && ok "⑭ A1 明示降级放行语义" || no "⑭ A1 未走文档范围降级"
echo "$A1B_OUT" | grep -q 'D811' && no "⑭ A1 仍取到并入 main 的 D811（猜号）" \
  || ok "⑭ A1 未取到 main 的号（不猜号）"
A1B_JSON=$(sb_run "$DA1B" "$A1B_BASE" HEAD feature/no-did-a1b --json | tail -1)
A1B_TID=$(jget "$A1B_JSON" "'NULL' if d.get('task_id') is None else d.get('task_id')")
[ "$A1B_TID" = "NULL" ] && ok "⑭ A1 --json: task_id=null（扫不到即 None，不退化猜号）" \
  || no "⑭ A1 --json task_id=${A1B_TID}（期望 NULL）"

echo ""
echo "=== D911-A2: 声明源从被检查的 head 树读（不读本地工作树）==="

# ── ⑮ A2: 声明文件在 head 树、不在本地工作树（工作树已切到别的分支）──
DA2="$TMPD/d911a2"; mk_sandbox "$DA2"
printf 'seed\n' > "$DA2/seed.txt"; sb_commit "$DA2" "chore: base"; A2_C0=$(git -C "$DA2" rev-parse HEAD)
git -C "$DA2" checkout -q -b feature/no-did-a2
# brief 自身也在本分支提交的变更集里 → 声明里同时列出 brief 路径（真实 brief 的 `## 写集` 块同款）
mk_brief "$DA2/.claude/task-briefs/2026-09-22-D849-a2-fixture.md" \
  $'src/a.ts\n.claude/task-briefs/2026-09-22-D849-a2-fixture.md'
printf 'a\n' > "$DA2/src/a.ts"; sb_commit "$DA2" "feat(D849): 分支提交（brief + src/a.ts）"
A2_HEAD=$(git -C "$DA2" rev-parse HEAD)
git -C "$DA2" checkout -q main   # 工作树 = main：本地**没有** brief、没有 src/a.ts
A2_OUT=$(sb_run "$DA2" "$A2_C0" "$A2_HEAD" feature/no-did-a2); A2_RC=$?
[ "$A2_RC" -eq 0 ] && ok "⑮ A2 工作树不在该分支 → 仍按 head 树对账 exit 0" \
  || no "⑮ A2 期望 exit 0，实得 $A2_RC :: $(echo "$A2_OUT" | grep -a '结论' | head -1)"
echo "$A2_OUT" | grep -q 'S3:brief.Q2-include' && ok "⑮ A2 声明源来自 head 树（S3 命中 brief）" \
  || no "⑮ A2 未取到 head 树里的 brief 声明"
A2_JSON=$(sb_run "$DA2" "$A2_C0" "$A2_HEAD" feature/no-did-a2 --json | tail -1)
A2_SRC=$(jget "$A2_JSON" "d.get('sources',{}).get('brief')")
case "$A2_SRC" in
  *2026-09-22-D849-a2-fixture.md) ok "⑮ A2 sources.brief 指向 head 树路径（${A2_SRC}）" ;;
  *) no "⑮ A2 sources.brief 异常: $A2_SRC" ;;
esac

# ── ⑯ A2 反方向: 本地**未提交**的 brief 不得成为声明源 ──
DA2B="$TMPD/d911a2b"; mk_sandbox "$DA2B"
printf 'seed\n' > "$DA2B/seed.txt"; sb_commit "$DA2B" "chore: base"; A2B_C0=$(git -C "$DA2B" rev-parse HEAD)
git -C "$DA2B" checkout -q -b feature/no-did-a2b
printf 'a\n' > "$DA2B/src/a.ts"; sb_commit "$DA2B" "feat(D849): 分支提交（head 树无 brief）"
A2B_HEAD=$(git -C "$DA2B" rev-parse HEAD)
mk_brief "$DA2B/.claude/task-briefs/2026-09-22-D849-a2b-fixture.md" "src/a.ts"   # 仅落盘，**不提交**
A2B_OUT=$(sb_run "$DA2B" "$A2B_C0" "$A2B_HEAD" feature/no-did-a2b); A2B_RC=$?
[ "$A2B_RC" -eq 2 ] && ok "⑯ A2 未提交的本地声明不得放行 → exit 2（fail-closed）" \
  || no "⑯ A2 期望 exit 2，实得 ${A2B_RC}（本地工作树被当成声明源 = 假绿）"

echo ""
echo "=== D911-A3: 豁免通道不可用 = 结论字段 + 替代路径 ==="

# ── ⑰ A3: 无 --pr-body 且无 GITHUB_EVENT_PATH → 结论块内显式打印 + JSON 字段 ──
DA3="$TMPD/d911a3"; mk_sandbox "$DA3"
printf 'seed\n' > "$DA3/seed.txt"; sb_commit "$DA3" "chore: base"; A3_BASE=$(git -C "$DA3" rev-parse HEAD)
mk_brief "$DA3/.claude/task-briefs/2026-09-22-D849-a3-fixture.md" \
  $'src/a.ts\n.claude/task-briefs/2026-09-22-D849-a3-fixture.md'
printf 'a\n' > "$DA3/src/a.ts"; printf 'b\n' > "$DA3/src/outside.ts"
sb_commit "$DA3" "feat(D849): declared + outside"
A3_OUT=$(sb_run "$DA3" "$A3_BASE" HEAD fix/D849-a3); A3_RC=$?
[ "$A3_RC" -eq 1 ] && ok "⑰ A3 通道不可用**不改变退出码语义** → 仍 exit 1（夹带照拦）" \
  || no "⑰ A3 期望 exit 1，实得 $A3_RC"
A3_NEXT=$(echo "$A3_OUT" | grep -a -A1 '结论:' | tail -1)
case "$A3_NEXT" in
  *豁免通道不可用*) ok "⑰ A3 连续字面「豁免通道不可用」在结论块内（结论行下一行）" ;;
  *) no "⑰ A3 结论块内无「豁免通道不可用」（只在尾注或字面被割裂）: '$A3_NEXT'" ;;
esac
# ⑰c 字面口径（D911 验收 #3，K3 字面可检）：连续字面必须落在**结论块内**（结论行之后、warns 之前），
#     且不得退回旧写法「豁免通道: 不可用」（`:` + 空格 会把字面割裂）
A3_CONC_NO=$(echo "$A3_OUT" | grep -a -n '结论:' | head -1 | cut -d: -f1)
A3_LIT_NO=$(echo "$A3_OUT" | grep -a -n '豁免通道不可用' | head -1 | cut -d: -f1)
A3_WARN_NO=$(echo "$A3_OUT" | grep -a -n '^   ⚠️  ' | head -1 | cut -d: -f1)
if [ -n "$A3_LIT_NO" ] && [ -n "$A3_CONC_NO" ] && [ "$A3_LIT_NO" -gt "$A3_CONC_NO" ] \
   && { [ -z "$A3_WARN_NO" ] || [ "$A3_LIT_NO" -lt "$A3_WARN_NO" ]; }; then
  ok "⑰c A3 连续字面「豁免通道不可用」位于结论块内（结论行 $A3_CONC_NO → 字面行 $A3_LIT_NO → 首条 warns 行 ${A3_WARN_NO:-无}）"
else
  no "⑰c A3 字面位置不符（结论行=${A3_CONC_NO} 字面行=${A3_LIT_NO} 首条 warns 行=${A3_WARN_NO}）"
fi
case "$A3_NEXT" in
  *豁免通道:*) no "⑰c A3 退回旧字面「豁免通道: 不可用」（字面被 '$A3_NEXT' 割裂）" ;;
  *) ok "⑰c A3 未使用旧字面「豁免通道: 」（字面连续）" ;;
esac
echo "$A3_OUT" | grep -q '修复指引: 改用声明文件内' \
  && ok "⑰ A3 结论块给出替代路径（改用声明文件内 ## 写集豁免）" || no "⑰ A3 缺替代路径指引"
echo "$A3_OUT" | grep -a '^     ③' | grep -q '声明文件内' \
  && ok "⑰ A3 夹带修复指引 ③ 指向声明文件路径（不依赖 PR 正文）" || no "⑰ A3 ③ 指引未指向声明文件"
echo "$A3_OUT" | grep -q 'src/outside.ts' && ok "⑰ A3 夹带文件仍逐条点名" || no "⑰ A3 未点名夹带文件"
A3_JSON=$(sb_run "$DA3" "$A3_BASE" HEAD fix/D849-a3 --json | tail -1)
A3_CHAN=$(jget "$A3_JSON" "d.get('exempt_channel')")
A3_FIX=$(jget "$A3_JSON" "d.get('exempt_channel_fix')")
[ "$A3_CHAN" = "unavailable" ] && ok "⑰ A3 --json: exempt_channel=unavailable（结论字段落 JSON）" \
  || no "⑰ A3 --json exempt_channel=${A3_CHAN}（期望 unavailable）"
case "$A3_FIX" in
  *'## 写集豁免'*) A3_FIX_HAS_HEADING=1 ;;
  *) A3_FIX_HAS_HEADING=0 ;;
esac
case "$A3_FIX" in
  *声明文件*) A3_FIX_HAS_FILEPATH=1 ;;
  *) A3_FIX_HAS_FILEPATH=0 ;;
esac
{ [ "$A3_FIX_HAS_HEADING" = 1 ] && [ "$A3_FIX_HAS_FILEPATH" = 1 ]; } \
  && ok "⑰ A3 --json: exempt_channel_fix 写明「声明文件内 ## 写集豁免」" \
  || no "⑰ A3 --json exempt_channel_fix 异常: $A3_FIX" 

# ⑰b 两种「取不到豁免」的其余形态：`--pr-body` 指向不可读文件 / GITHUB_EVENT_PATH 指向不存在文件
#     （都是通道不可用 → 同样列结论字段；**退出码与放行判定不变**）
A3C_JSON=$(sb_run "$DA3" "$A3_BASE" HEAD fix/D849-a3 --json --pr-body "$TMPD/does-not-exist.json" | tail -1)
[ "$(jget "$A3C_JSON" "d.get('exempt_channel')")" = "unavailable" ] \
  && ok "⑰b A3 --pr-body 不可读 → 仍判通道不可用（不静默放行）" \
  || no "⑰b A3 --pr-body 不可读时通道状态异常"
A3C_RC=$(sb_run "$DA3" "$A3_BASE" HEAD fix/D849-a3 --pr-body "$TMPD/does-not-exist.json" >/dev/null 2>&1; echo $?)
[ "$A3C_RC" = "1" ] && ok "⑰b A3 --pr-body 不可读 → 退出码语义不变（仍 exit 1）" \
  || no "⑰b A3 退出码被改动: $A3C_RC"
A3D_JSON=$(cd "$DA3" && GITHUB_EVENT_PATH="$TMPD/no-such-event.json" "$PYBIN" "$DA3/scripts/control-tower/merge_writeset_gate.py" \
  --repo-root "$DA3" --base "$A3_BASE" --head HEAD --branch fix/D849-a3 --json 2>&1 | tail -1)
[ "$(jget "$A3D_JSON" "d.get('exempt_channel')")" = "unavailable" ] \
  && ok "⑰b A3 GITHUB_EVENT_PATH 指向不存在文件 → 仍判通道不可用" \
  || no "⑰b A3 GITHUB_EVENT_PATH 异常时通道状态异常" 

# ── ⑱ A3 替代路径可用: 无 PR 正文时，声明文件内 `## 写集豁免` 仍生效 ──
mk_brief "$DA3/.claude/task-briefs/2026-09-22-D849-a3-fixture.md" "src/a.ts" \
  $'## 写集豁免\n- src/outside.ts — 并行线只读引用（声明文件通道演示）\n- .claude/task-briefs/2026-09-22-D849-a3-fixture.md — 本任务 brief 自身（豁免段更新）'
sb_commit "$DA3" "docs(D849): brief 内写集豁免"
A3B_OUT=$(sb_run "$DA3" "$A3_BASE" HEAD fix/D849-a3); A3B_RC=$?
{ [ "$A3B_RC" -eq 0 ] && echo "$A3B_OUT" | grep -q '声明文件通道演示'; } \
  && ok "⑱ A3 声明文件内 ## 写集豁免 生效（无 PR 正文）→ exit 0 且打印理由" \
  || no "⑱ A3 声明文件豁免未生效: rc=$A3B_RC"

echo ""
echo "=== D911 反例: 该拦的仍须拦 ==="

# ── ⑲ 反例①: 分支名带 D# 但该卡不存在（无任何声明文件）→ 仍 exit 2，不得静默 pass ──
DA4="$TMPD/d911a4"; mk_sandbox "$DA4"
printf 'seed\n' > "$DA4/seed.txt"; sb_commit "$DA4" "chore: base"; A4_BASE=$(git -C "$DA4" rev-parse HEAD)
printf 'c\n' > "$DA4/src/c_undeclared.ts"; sb_commit "$DA4" "feat(D999): 无声明文件"
A4_OUT=$(sb_run "$DA4" "$A4_BASE" HEAD fix/D999); A4_RC=$?
[ "$A4_RC" -eq 2 ] && ok "⑲ 反例① 卡不存在 → 仍 exit 2（无法判定）" \
  || no "⑲ 反例① 期望 exit 2，实得 ${A4_RC}（静默 pass = 门禁变软）"
echo "$A4_OUT" | grep -q 'fail-closed' && ok "⑲ 反例① 明示 fail-closed" || no "⑲ 反例① 未明示 fail-closed"
A4_JSON=$(sb_run "$DA4" "$A4_BASE" HEAD fix/D999 --json | tail -1)
[ "$(jget "$A4_JSON" "d.get('status')")" = "degraded" ] \
  && ok "⑲ 反例① --json status=degraded（不是 pass）" || no "⑲ 反例① status 非 degraded"

# ── ⑳ 反例②: 真夹带（写集外文件）→ 仍 exit 1 + 逐文件点名；撤掉 → exit 0 ──
DA5="$TMPD/d911a5"; mk_sandbox "$DA5"
printf 'seed\n' > "$DA5/seed.txt"; sb_commit "$DA5" "chore: base"; A5_BASE=$(git -C "$DA5" rev-parse HEAD)
mk_brief "$DA5/.claude/task-briefs/2026-09-22-D849-a5-fixture.md" \
  $'src/a.ts\n.claude/task-briefs/2026-09-22-D849-a5-fixture.md'
printf 'a\n' > "$DA5/src/a.ts"; printf 'x\n' > "$DA5/src/smuggled.ts"
sb_commit "$DA5" "feat(D849): real smuggle"
A5_OUT=$(sb_run "$DA5" "$A5_BASE" HEAD fix/D849-a5); A5_RC=$?
{ [ "$A5_RC" -eq 1 ] && echo "$A5_OUT" | grep -q -- '- src/smuggled.ts'; } \
  && ok "⑳ 反例② 真夹带 → 仍 exit 1 且逐文件点名" || no "⑳ 反例② 期望 exit 1 + 点名，实得 $A5_RC"
rm -f "$DA5/src/smuggled.ts"; sb_commit "$DA5" "fix(D849): revert smuggle"
A5B_OUT=$(sb_run "$DA5" "$A5_BASE" HEAD fix/D849-a5); A5B_RC=$?
[ "$A5B_RC" -eq 0 ] && ok "⑳ 反例② 撤掉夹带 → 回到 exit 0" \
  || no "⑳ 反例② 撤回后仍红: $A5B_RC"

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
