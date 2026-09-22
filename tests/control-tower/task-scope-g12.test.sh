#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# task-scope-g12.test.sh — D911 切片 C：组 12 判据（三源并集 / commit-date / fail-open / 剥壳）
#
# 覆盖矩阵（铁律 48: 正常 / 降级 / 边界 + 反例）:
#   C1 三源并集     S1 task-state.write_set（精确 + glob）· S2 dev doc §写集表 · S3 brief Q2
#   C2 commit-date  同一 commit 两个不同运行日 → 判定段逐字相同；基准真被读（换 commit → 结论变）
#   C3 fail-open    无认领 brief → ⚠️「无认领 brief → 本组未执行」（本地）/ CI strict ❌；禁假绿
#   C4 剥壳对称     Q2「`path` —— 说明」→ 裸路径可认领（旧实现整条当模式 → 误判越界）
#   C5 给正解       越界提示含 `## 写集` 机器块（D749 单一事实源）
#   C6 内联 Done    `## Done 标准: <内联>` 计入；空段 / 仅占位 → 仍红（不放宽成空也绿）
#   反例            文件确实不在三源并集内 → 生产模式硬阻断（hard_check，`[硬阻断]` + exit≠0）
#
# 修前（origin/main f2b251f3，sha256 2106c86c…）对照 —— 本文件每条断言的先红证据:
#   C1: S1 已声明的 tests/control-tower/task-scope-g12.test.sh 仍判「不在 Q2 范围内」
#   C2: 同一 commit 同一暂存集，brief 掉出 ±1 天运行日窗口 → 输出 ✅「所有文件均在 Q2 范围内」
#       （假绿：未执行任何判定）
#   C3: 同一路径无 else 分支 → 无 ⚠️、无「本组未执行」（静默 fail-open）
#   C4: brief_parser --q2-include 输出整条「`path` —— 说明」；作模式匹配真实路径 = False
#   C5: 越界提示只有「见 docs/synova/coordination/版本管理规范-控制塔.md」，不含 `## 写集`
#   C6: awk 对「## Done 标准: <内联>」→ DONE_SECTION=[] DONE_CHECKED=0 DONE_EMPTY=0 → 假红
#
# 环境: 临时 git repo（独立于真实仓库，零真实仓库污染）
#   夹具 commit 用 GIT_COMMITTER_DATE 固定（2020-06-01 / 2020-09-01）→ 判据可复现
#   注入缝 = 既有 SYNO_TEST_ARM=1 武装 + D911 新增 SYNO_G12_COMMIT / SYNO_G12_TODAY
# 用法: bash tests/control-tower/task-scope-g12.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PCC_SRC="$REPO_DIR/scripts/pre-commit-check.sh"

# PYBIN 三级探测（D520 / PLATFORM-CHECKLIST：Windows 可能只有 python / py）
PYBIN=""
for _c in python3 python py; do command -v "$_c" >/dev/null 2>&1 && { PYBIN="$_c"; break; }; done

PASS=0; FAIL=0
ok() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
no() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
has()   { if printf '%s' "$2" | grep -qF -- "$1"; then ok "$3"; else no "$3（缺: $1）"; fi; }
hasnt() { if printf '%s' "$2" | grep -qF -- "$1"; then no "$3（不应出现: $1）"; else ok "$3"; fi; }

[ -f "$PCC_SRC" ] || { echo "❌ 生产脚本缺失: $PCC_SRC"; exit 1; }
[ -n "$PYBIN" ] || { echo "❌ python 不可用，无法运行夹具"; exit 1; }

SB="$(mktemp -d "${TMPDIR:-/tmp}/g12d911.XXXXXX")"
trap 'rm -rf "$SB"' EXIT

# ── 沙箱仓库: 复制生产脚本（不复制 scripts/audit、不改任何真实文件）──
mkdir -p "$SB/scripts/control-tower" "$SB/scripts/workflow" "$SB/.claude/task-briefs" \
         "$SB/task-state" "$SB/docs/plans/codex/implementation" "$SB/tests/control-tower"
cp "$PCC_SRC" "$SB/scripts/pre-commit-check.sh"
cp "$REPO_DIR/scripts/control-tower/brief_parser.py" "$SB/scripts/control-tower/"
cp "$REPO_DIR/scripts/control-tower/devdoc_writeset.py" "$SB/scripts/control-tower/"

for p in probe-s1 probe-s2 probe-s3 probe-c4 probe-unclaimed; do
  printf '#!/bin/sh\n# D911/C fixture probe\nexit 0\n' > "$SB/scripts/control-tower/$p.sh"
done
printf '#!/bin/sh\n# D911/C fixture probe (glob 命中)\nexit 0\n' > "$SB/tests/control-tower/probe-glob.sh"

# 夹具 brief: Q2 散文（**故意不用** `## 写集` 机器块 → 才能验证 C4 剥壳路径）
cat > "$SB/.claude/task-briefs/2020-06-01-D9901-fixture-g12.md" <<'BRIEFEOF'
# Task Brief: D9901（G12 夹具）

#CRITERIA: A

## Q0: 定位
夹具 brief：验证组 12 三源并集与剥壳口径。

## Q1: 调研
夹具。

## Q2: 范围 — 最简方案
做什么:
- `scripts/control-tower/probe-c4.sh` —— C4 夹具（反引号 + 双破折号说明）
- scripts/control-tower/probe-s3.sh
不做什么（含文件路径）:
- 不改 scripts/audit/self-diagnosis.py

## Q3: 验收
入口 → 处理 → 结果。

## 架构层: scripts/control-tower（夹具）

## Done 标准
- [ ] 夹具：组 12 判定段可提取
BRIEFEOF

# 夹具：同窗口第二份 brief + 故意损坏的 task-state JSON → 验证「声明源不可读」显式 ⚠️（禁静默）
cat > "$SB/.claude/task-briefs/2020-06-01-D9902-broken-source.md" <<'BRIEF2EOF'
## Q2: 范围
做什么:
不做什么:
## Done 标准
- [ ] 夹具：无声明
BRIEF2EOF
printf '{ "task_id": "D9902", "write_set": [ broken json\n' > "$SB/task-state/D9902.json"

# 夹具 S1: task-state write_set（精确 + glob 两形态）
cat > "$SB/task-state/D9901.json" <<'TSEOF'
{
  "task_id": "D9901",
  "title": "G12 fixture",
  "status": "claimed",
  "write_set": [
    "scripts/control-tower/probe-s1.sh",
    "tests/**"
  ]
}
TSEOF

# 夹具 S2: dev doc §写集表（devdoc_writeset.py 只认「### N.N 写集」标题 + 表格）
cat > "$SB/docs/plans/codex/implementation/SYNOVA-IMPL-D9901-fixture-20260601.md" <<'DDEOF'
# D9901 fixture dev doc

### 1.1 写集 (1 修改)

| 文件 | 操作 | 说明 |
|---|---|---|
| scripts/control-tower/probe-s2.sh | 修改 | 夹具：仅 S2 声明 |

## 其它章节
说明文字。
DDEOF

cd "$SB" || exit 1
git init -q .
git config user.email fixture@test.invalid
git config user.name fixture
git add -A >/dev/null 2>&1
# 夹具刻意让**子提交日期早于父提交**：HEAD 必须落在夹具 brief 的窗口内（反例阶段走生产模式
#   无注入缝 → 只能用 HEAD 的 commit date），父提交则提供另一个日期做「判别器活性」测试。
GIT_COMMITTER_DATE="2020-09-01T12:00:00+08:00" GIT_AUTHOR_DATE="2020-09-01T12:00:00+08:00" \
  git commit -q -m "chore: fixture (commit date 2020-09-01, 判别器活性用)" >/dev/null 2>&1
COMMIT_OLD="$(git rev-parse HEAD)"
GIT_COMMITTER_DATE="2020-06-01T12:00:00+08:00" GIT_AUTHOR_DATE="2020-06-01T12:00:00+08:00" \
  git commit -q --allow-empty -m "chore: fixture (commit date 2020-06-01, HEAD=夹具 brief 日期)" >/dev/null 2>&1
COMMIT1="$(git rev-parse HEAD)"

# 夹具暂存集（注入缝）: S1 精确 + S1 glob + S2 + S3 剥壳 + S3 裸路径
STAGED_OK="scripts/control-tower/probe-s1.sh
tests/control-tower/probe-glob.sh
scripts/control-tower/probe-s2.sh
scripts/control-tower/probe-c4.sh
scripts/control-tower/probe-s3.sh"

strip_ansi() { sed $'s/\x1b\\[[0-9;]*m//g'; }
g12_block() { printf '%s\n' "$1" | awk '/── 组 12\/13/{f=1} f{print} /G12b:/{if(f) exit}'; }

# run_gate <commit-ref> <G12_TODAY> <SYNO_CI> <staged> → 设 GATE_OUT（去色）/ GATE_RC
run_gate() {
  GATE_OUT="$(SYNO_TEST_ARM=1 SYNO_CI="$3" \
    SYNO_G12_COMMIT="$1" SYNO_G12_TODAY="$2" \
    SYNO_GIT_CACHED_ALL_NAMES="$4" SYNO_GIT_CACHED_NAMES="$4" SYNO_GIT_CACHED_ADDED_NAMES="$4" \
    SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 SYNO_GATE_HITS_LOG="$SB/.claude/gate-hits.log" \
    bash "$SB/scripts/pre-commit-check.sh" 2>&1)"
  GATE_RC=$?
  GATE_OUT="$(printf '%s' "$GATE_OUT" | strip_ansi)"
}

# ═══ C1 + C2-a + C4：三源并集（S1 精确/glob + S2 + S3 剥壳）全部被认领 → 判定为绿 ═══
echo ""
echo "── C1/C2-a/C4: 三源并集认领（S1 精确+glob / S2 / S3 剥壳）──"
run_gate "$COMMIT1" "2030-01-01" 1 "$STAGED_OK"
OUT_A1="$GATE_OUT"; G12_A1="$(g12_block "$OUT_A1")"
had_viol="$(printf '%s' "$G12_A1" | grep -c '不在 Q2 范围内' || true)"
[ "$had_viol" -eq 0 ] && ok "C1+C4: 5 个暂存文件（S1 精确/glob、S2、S3 剥壳、S3 裸路径）全部被认领，零越界" \
  || no "C1/C4 仍报越界 ${had_viol} 处:
$G12_A1"
has "所有文件均在 Q2 范围内" "$G12_A1" "C1+C4: 组 12 判定段为通过（✅）"
has "S1 声明源不可读（D9902）" "$OUT_A1" "C1: 声明源不可读 → 显式 ⚠️ 登记（禁静默跳过该源）"
has "认领基准 commit-date(" "$G12_A1" "C2: 通过语显式给出判定基准来源 = commit date"
has "= 2020-06-01，" "$G12_A1" "C2: 基准日 = commit date 的日期（2020-06-01），非运行日"
hasnt "2030-01-01" "$G12_A1" "C2: 注入的运行日（2030-01-01）未进入判定基准（运行日与判据解耦）"

# ═══ C2：同一 commit 换运行日 → 判定段逐字相同（跨日结论不变）═══
run_gate "$COMMIT1" "2040-12-31" 1 "$STAGED_OK"
G12_A2="$(g12_block "$GATE_OUT")"
if [ "$G12_A1" = "$G12_A2" ]; then
  ok "C2: 同一 commit 两个不同运行日（2030-01-01 vs 2040-12-31）→ 组 12 判定段逐字相同"
else
  no "C2: 判定段随运行日漂移
--- 2030-01-01 ---
$G12_A1
--- 2040-12-31 ---
$G12_A2"
fi

# ═══ C2 降级 + 判别器活性 ═══
echo ""
echo "── C2 降级: 无 commit date → 显式 ⚠️ + 回退；窗口跟着基准走 ──"
run_gate "no-such-ref-d911" "2020-06-01" 1 "$STAGED_OK"
OUT_A3="$GATE_OUT"
has "取不到提交 no-such-ref-d911 的 commit date" "$OUT_A3" "C2 降级: 取不到 commit date → 显式 ⚠️ 打印（禁静默）"
has "override(commit-date 不可得)" "$OUT_A3" "C2 降级: 回退来源逐字可见（override = 运行日替身）"
has "所有文件均在 Q2 范围内" "$(g12_block "$OUT_A3")" "C2: 回退到 override=2020-06-01 后仍认领夹具 brief（窗口真的跟着基准走）"

# ═══ C2-b：换 commit（2020-09-01）→ 夹具 brief 掉出窗口 → C3 显式「本组未执行」═══
echo ""
echo "── C2-b/C3: commit 换成 2020-09-01 → brief 掉出窗口 → 本地 ⚠️ 显式、禁假绿 ──"
run_gate "$COMMIT_OLD" "2030-01-01" 0 "$STAGED_OK"
G12_A4="$(g12_block "$GATE_OUT")"
has "无认领 brief → 本组未执行" "$G12_A4" "C3: 本地（SYNO_CI=0）打印「无认领 brief → 本组未执行」"
has "⚠️" "$G12_A4" "C3: 本地为 ⚠️ 软提示（铁律 11 显式标记）"
hasnt "所有文件均在 Q2 范围内" "$G12_A4" "C3: 不再输出假绿「所有文件均在 Q2 范围内」"
has "2020-09-01" "$G12_A4" "C2-b: 认领窗口基准 = 新 commit 的 date（判别器是活的，不是常数）"

echo ""
echo "── C3: CI strict（SYNO_CI=1）→ 同一路径转硬阻断并点名 ──"
run_gate "$COMMIT_OLD" "2030-01-01" 1 "$STAGED_OK"
G12_A5="$(g12_block "$GATE_OUT")"
has "❌ G12: 无认领 brief → 本组未执行" "$G12_A5" "C3: CI strict 下转 ❌ 硬阻断（D515/D516 分层）"
has "CI strict——软提示在 CI 上为硬阻断" "$G12_A5" "C3: 转硬理由在输出中可见（M1 类失败点名）"

# ═══ 反例：文件确实不在三源并集内 → 生产模式硬阻断（无注入缝 → decl_check=hard_check）═══
echo ""
echo "── 反例: 真越界文件 → 生产模式（hard_check）硬阻断 ──"
# 反例探针必须是**新增**文件（已提交文件 git add 无 diff → 暂存集为空 → 假通过）
printf '#!/bin/sh\n# D911/C counter-example probe\nexit 0\n' > "$SB/scripts/control-tower/probe-counter-new.sh"
git add scripts/control-tower/probe-counter-new.sh >/dev/null 2>&1
GATE_OUT="$(SYNO_GATEKEEPER_ACK=1 SYNO_SKIP_PARALLEL_WARN=1 SYNO_GATE_HITS_LOG="$SB/.claude/gate-hits.log" \
  bash "$SB/scripts/pre-commit-check.sh" 2>&1)"
GATE_RC=$?
OUT_B="$(printf '%s' "$GATE_OUT" | strip_ansi)"
G12_B="$(g12_block "$OUT_B")"
has "❌ G12: task brief Q2 范围一致性（写集单一事实源，D749）" "$G12_B" "反例: 生产模式组 12 判红（点名组名）"
has "[硬阻断]" "$G12_B" "反例: 走 hard_check（[硬阻断]）= 真硬阻断，不是软提示"
has "probe-counter-new.sh (不在 Q2 范围内" "$G12_B" "反例: 越界文件被逐条点名"
has "## 写集" "$G12_B" "C5: 越界提示给出正解「## 写集」机器块（D749 单一事实源）"
has "parse_write_set" "$G12_B" "C5: 正解指向可核的解析器函数（brief_parser.parse_write_set）"
has "三源并集" "$G12_B" "C5: 提示写明认领源 = 三源并集（口径可审计）"
[ "$GATE_RC" -ne 0 ] && ok "反例: 门禁退出码非 0（实测 ${GATE_RC}）" || no "反例: 退出码为 0（未阻断）"
git reset -q HEAD scripts/control-tower/probe-counter-new.sh >/dev/null 2>&1

# ═══ C4（解析器级：剥壳与 _clean_entry 同规则）═══
echo ""
echo "── C4: parse_q2 剥壳（反引号 + \` — \`/\` —— \` 两种破折号）──"
C4_FIX="$SB/c4-fixture.md"
cat > "$C4_FIX" <<'C4EOF'
## Q2: 范围
做什么:
- `scripts/pre-commit-check.sh` —— 三源并集夹具
- `scripts/control-tower/brief_parser.py` — 单破折号
- scripts/plain/bare.sh
不做什么:
- 不改 scripts/audit/（红线，尾斜杠契约必须保留）
C4EOF
C4_INC="$("$PYBIN" "$SB/scripts/control-tower/brief_parser.py" --q2-include "$C4_FIX" 2>/dev/null)"  # swallow-ok: 解析器失败 → 空 → 断言立即失败（可见）
C4_EXC="$("$PYBIN" "$SB/scripts/control-tower/brief_parser.py" --q2-exclude "$C4_FIX" 2>/dev/null)"  # swallow-ok: 解析器失败 → 空 → 断言立即失败（可见）
printf '%s\n' "$C4_INC" | grep -qx "scripts/pre-commit-check.sh" \
  && ok "C4: 「\`path\` —— 说明」→ 裸路径 scripts/pre-commit-check.sh" \
  || no "C4: 双破折号/反引号未剥: $C4_INC"
printf '%s\n' "$C4_INC" | grep -qx "scripts/control-tower/brief_parser.py" \
  && ok "C4: 「\`path\` — 说明」→ 裸路径（单破折号保持）" || no "C4: 单破折号回归: $C4_INC"
printf '%s\n' "$C4_INC" | grep -qx "scripts/plain/bare.sh" \
  && ok "C4: 裸路径原样通过（不回归）" || no "C4: 裸路径被破坏"
printf '%s\n' "$C4_EXC" | grep -qx "scripts/audit/" \
  && ok "C4: exclude 目录条目保留尾斜杠（既有契约不回归）" || no "C4: 尾斜杠契约被破坏: $C4_EXC"

# ═══ C6: `## Done 标准: <内联>` 计入；空/占位仍红 ═══
echo ""
echo "── C6: Done 标准内联写法（解析器 + 生产 awk 同口径）──"
printf '## Done 标准: 跑 bash scripts/pre-commit-check.sh 得 exit 0\n## 架构层: L3\n' > "$SB/d-inline.md"
printf '## Done 标准\n## 架构层: L3\n'                                            > "$SB/d-empty.md"
printf '## Done 标准\n<!-- 待填 -->\n'                                           > "$SB/d-placeholder.md"
done_count() { "$PYBIN" "$SB/scripts/control-tower/brief_parser.py" --all "$SB/$1.md" 2>/dev/null \
  | "$PYBIN" -c "import json,sys; print(json.load(sys.stdin).get('done_count', 0))" 2>/dev/null || echo 0; }
DC_INLINE="$(done_count d-inline)"; DC_EMPTY="$(done_count d-empty)"; DC_PH="$(done_count d-placeholder)"
[ "${DC_INLINE:-0}" -ge 1 ] && ok "C6: 内联写法（仅标题行）→ done_count=${DC_INLINE}≥1（旧实现为 0 → 假红）" \
  || no "C6: 内联写法仍判空（done_count=${DC_INLINE:-?}）"
[ "${DC_EMPTY:-0}" -eq 0 ] && ok "C6 反例: 空段 → done_count=0（不放宽成空也绿）" || no "C6 反例: 空段被放行"
[ "${DC_PH:-0}" -eq 0 ] && ok "C6 反例: 仅 \`<!-- -->\` 占位 → done_count=0（仍红）" || no "C6 反例: 占位被放行"

# 生产 awk：**提取生产脚本那一行原样 eval 执行**（不是复制一份实现，避免口径漂移）
DONE_LINE="$(grep -m1 'DONE_SECTION=\$(awk' "$PCC_SRC" || true)"
if [ -n "$DONE_LINE" ]; then
  # 注意: 生产行本身是 `DONE_SECTION=$(awk ...)` —— 必须**在当前 shell** eval 赋值，
  #   不可再套一层 $( ... )（子 shell 内赋值不回传 → 假空段）。
  BRIEF="$SB/d-inline.md";      DONE_SECTION=""; eval "$DONE_LINE" 2>/dev/null || true
  DE_INLINE="$(printf '%s' "$DONE_SECTION" | grep -vc "^##\|^<!--\|^$" | tr -d '\n\r' || true)"
  BRIEF="$SB/d-empty.md";       DONE_SECTION=""; eval "$DONE_LINE" 2>/dev/null || true
  DE_EMPTY="$(printf '%s' "$DONE_SECTION" | grep -vc "^##\|^<!--\|^$" | tr -d '\n\r' || true)"
  BRIEF="$SB/d-placeholder.md"; DONE_SECTION=""; eval "$DONE_LINE" 2>/dev/null || true
  DE_PH="$(printf '%s' "$DONE_SECTION" | grep -vc "^##\|^<!--\|^$" | tr -d '\n\r' || true)"
  [ "${DE_INLINE:-0}" -ge 1 ] && ok "C6: 生产 awk 对内联写法取到内容（DONE_EMPTY=${DE_INLINE}≥1 → 不假红）" \
    || no "C6: 生产 awk 仍未取到内联内容（DONE_EMPTY=${DE_INLINE:-?}）"
  [ "${DE_EMPTY:-0}" -eq 0 ] && ok "C6 反例: 生产 awk 对空段 DONE_EMPTY=0（仍判红，未放宽）" || no "C6 反例: 空段被放行"
  [ "${DE_PH:-0}" -eq 0 ] && ok "C6 反例: 生产 awk 对占位段 DONE_EMPTY=0（仍判红）" || no "C6 反例: 占位段被放行"
else
  no "C6: 生产脚本未找到 DONE_SECTION awk 行（形状漂移）"
fi

# 消费侧（pre-commit 1351 → check-brief-parseable.sh ④）内联写法不再报「无条目」
PARSEABLE="$REPO_DIR/scripts/workflow/check-brief-parseable.sh"
if [ -f "$PARSEABLE" ]; then
  PO_INLINE="$(bash "$PARSEABLE" "$SB/d-inline.md" 2>&1 || true)"
  PO_EMPTY="$(bash "$PARSEABLE" "$SB/d-empty.md" 2>&1 || true)"
  hasnt "Done 标准无条目" "$PO_INLINE" "C6: check-brief-parseable ④ 对内联写法不再报「无条目」（消费侧口径一致）"
  has "Done 标准无条目" "$PO_EMPTY" "C6 反例: check-brief-parseable ④ 对空段仍报「无条目」"
else
  no "C6: check-brief-parseable.sh 缺失，消费侧无法验证"
fi

# ═══ 接线（辅助，非验收主证据）: 三源解析器真的被调用 ═══
echo ""
echo "── 接线: 三源解析器调用点 ──"
wire() { # wire <字面> <描述>
  if grep -qF -- "$1" "$PCC_SRC"; then ok "$2"; else no "$2（缺字面: $1）"; fi
}
wire 'brief_parser.py" --q2-include' "接线: S3 = brief_parser.py --q2-include"
wire 'devdoc_writeset.py" --extract' "接线: S2 = devdoc_writeset.py --extract"
wire 'task-state/$BDID.json' "接线: S1 = task-state/<D#>.json write_set"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
