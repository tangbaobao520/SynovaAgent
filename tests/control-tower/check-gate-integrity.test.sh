#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-gate-integrity.test.sh — M9 夹具: 门禁完整性检查器（模式哨兵 + 登记 gate + 红对账）
#
# 被测: scripts/control-tower/check-gate-integrity.sh（M9 唯一新脚本）
# 沙箱: 全部 hermetic —— 六个注入缝（SYNO_GATE_SCAN_SCRIPTS / SYNO_TESTS_DIR / SYNO_CI_YML /
#       SYNO_GATE_BASELINE / SYNO_CI_RED_BASELINE / SYNO_GATE_DEGRADED_LOG）全部指向 mktemp 目录，
#       仓库工作区零写入；红证样本只存在于 /tmp 副本（收尾有断言）。
#
# 覆盖矩阵（铁律 48: 正常 / 降级 / 边界 + 判别性）:
#   正常 — 干净沙箱（脚本+清单+双段基线自洽）→ exit 0 + 末行 `GATE-INTEGRITY: OK`
#   正常 — C 模式: 冻结格式 `NAME | first_seen=… | owner=… | expires=…` 命中 → exit 0（C1 回归）
#   正常 — C 模式: 端到端复现（自造 JSON 含两条已登记红，其中一条含中文/全角括号/点号）→ exit 0
#   正常 — C 模式: 无空格旧格式 `NAME|first_seen=…|expires=…` → exit 0（向后兼容）
#   边界 — C 模式: expires 已过期 → exit 1 且必须命中「CI 红基线过期」（C2 回归，不得只因别的文案而绿）
#   降级 — C 模式: 条目缺 expires 键 → exit 2（malformed 不静默当 0 = fail-open）
#   降级 — ci.yml 缺失 / 基线缺失 / --ci-reds 非法 JSON → 各自 exit 2 + stderr `degraded:` + 日志 JSON 五字段
#   边界 — 基线条目过期（幽灵条目）→ exit 1；扫描脚本解析到 0 个模式 → exit 2
#   边界 — 模式隔离: --patterns-only 不因 registry 面缺失而降级
#   棘轮 — PATTERN-BASELINE: 真仓库 --patterns-only → exit 0（:991 已登记；D937 落地后自适应为"须删条目"）
#   棘轮 — PATTERN 条目 expires 过期 → exit 1；条目已不再违规 → exit 1（须删条目）
#   分段 — 双段互不串行: [R] 段 key 不给 A 模式豁免；[P] 段条目不进 registry 面
#   判别性 — M1 未登记的新非法 ERE（临时脚本）→ 必红（exit 1 + 点名 file:line + 模式原文）
#   判别性 — M2 从基线删 1 条仍存在的未登记项 → 必红
#   判别性 — M4 把检查器副本的哨兵核心置为 return 0 → M1 场景必须不再红（证明夹具依赖真哨兵）
#   判别性 — M5 伪造 check-runs JSON 多加一条未登记 failure → 必红
#   回归 — M6 相邻引号段拼接模式（`'a'\"b\"'c'`）不得被截断成假违规（dev-doc-gatekeeper.sh:109 形态）
#
# B 模式分面口径（CTO 冻结 2026-09-24，实测于 base 416b4667）:
#   违规面 = CI 密封面（*.test.sh / *.test.py；只有被显式登记才会在 CI 执行）；
#   登记判定 = 路径出现在 .github/workflows/ci.yml 全文（密封 for t in 或任意 job 的 run: 步骤）；
#   *.test.ts 只统计 + NOTE（vitest glob 自动覆盖），不计违规。
#   实测: sh|py 122 文件 / 命中 43 / 未登记 79；ts 610 / 命中 1（且该 ts 文件不在盘上）。
#
# 基线取值铁律（C1/C2 缺陷教训，2026-09-24 独立自验复现）:
#   · name 匹配容忍 `|` 前空格；name 内 ERE 元字符整体转义（检查名可能含中文/全角括号/点号）
#   · expires/owner **按键取值**，绝不按字段序号（冻结格式 $2 = first_seen，不是 expires）
#   · 缺 expires 键 → exit 2 degrade（静默当 0 = fail-open）
#
# 已知边界（与本器头注释一致）: 整行注释不扫；变量/命令替换模式与 -P PCRE 计"不可校验"。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/check-gate-integrity.sh"
TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

SB="$TMPD/sb"
mkdir -p "$SB/scripts" "$SB/tests/control-tower" "$SB/logs"
MARK="INJECTED""-RED"      # 拼接构造：本文件源码内不出现该字面量（收尾断言仓库零命中）
BAD_RE='^+'"++"             # 拼接构造非法 ERE：扫描面里不出现"红"字面量
NAME_CN='门禁完整性（gate-integrity）检查 v1.2'   # 含中文/全角括号/点号 → 转义回归

PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
no() {
  echo "  ❌ $1"
  FAIL=$((FAIL + 1))
  echo "  ----- 原始输出 -----"
  printf '%s\n' "${OUT:-（空）}"
  echo "  --------------------"
}
last_line() { printf '%s\n' "$1" | tail -1; }

RUN() { # $1=scan $2=tests_dir $3=ci_yml $4=baseline $5=red_baseline $6=degraded_log ；其后 = 检查器参数
  local scan="$1" tests="$2" ciyml="$3" base="$4" redbase="$5" dlog="$6"
  shift 6
  SYNO_GATE_SCAN_SCRIPTS="$scan" \
  SYNO_TESTS_DIR="$tests" \
  SYNO_CI_YML="$ciyml" \
  SYNO_GATE_BASELINE="$base" \
  SYNO_CI_RED_BASELINE="$redbase" \
  SYNO_GATE_DEGRADED_LOG="$dlog" \
  bash "$GATE" "$@"
}

echo "=== M9: check-gate-integrity.sh 夹具（hermetic）==="
[ -f "$GATE" ] && ok "被测脚本存在: scripts/control-tower/check-gate-integrity.sh" || no "被测脚本缺失: $GATE"

# ── 沙箱: 干净仓库（脚本 + ci.yml + 双段基线自洽）────────────────────────────
SCAN_OK="$SB/scripts/scan.sh"
cat > "$SCAN_OK" <<'EOS'
#!/bin/bash
echo a | grep -E '^alpha'
grep -v '^+++' "$1"
EOS
printf '#!/bin/bash\n' > "$SB/tests/control-tower/alpha.test.sh"
printf '#!/bin/bash\n' > "$SB/tests/control-tower/beta.test.sh"
cat > "$SB/ci.yml" <<'EOY'
name: ci
jobs:
  control-tower-tests:
    steps:
      - run: |
          for t in \
            tests/control-tower/alpha.test.sh; do
            bash "$t"
          done
EOY
cat > "$SB/baseline.txt" <<'EOB'
# 夹具基线（双段）
# ═══ REGISTRY-BASELINE（夹具：beta 为未登记存量）═══
tests/control-tower/beta.test.sh
# ═══ PATTERN-BASELINE（夹具：无存量登记）═══
# 格式：<路径>:<行号> | owner=<D#> | expires=YYYY-MM-DD | evidence=<引用>
EOB
# C 模式冻结格式（C1: `NAME | first_seen=…`，`|` 前有空格）
printf 'ci-unit | first_seen=2026-09-24 | owner=D-M9-test | expires=2099-12-31 | evidence=夹具\n' > "$SB/red-baseline.txt"
printf '{"check_runs":[{"name":"ci-unit","conclusion":"failure"},{"name":"ci-lint","conclusion":"success"}]}\n' > "$SB/red-ok.json"
LOG_DEF="$SB/logs/default.log"

# ── 正常: A+B 全绿 → exit 0 + 末行 OK ──
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$LOG_DEF" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && [ "$(last_line "$OUT")" = "GATE-INTEGRITY: OK" ]; then
  ok "正常: A+B 自洽 → exit 0 + 末行 GATE-INTEGRITY: OK"
else
  no "正常路径异常: rc=$rc 末行='$(last_line "$OUT")'"
fi
printf '%s\n' "$OUT" | grep -q "PATTERN-SENTINEL: 解析 2 个模式" \
  && ok "正常: 解析到 2 个模式（ERE 1 / BRE 1，方言分判生效）" \
  || no "模式统计异常（应为 解析 2 个模式）"
printf '%s\n' "$OUT" | grep -q "PATTERN-BASELINE: registered 0；条数 0" \
  && ok "正常: PATTERN-BASELINE 空段 → registered 0 / 条数 0" \
  || no "PATTERN-BASELINE 空段统计异常"
printf '%s\n' "$OUT" | grep -q "CI-REGISTRY: 测试文件 2（密封面 sh/py 2；ts 面 0）" \
  && ok "正常: 密封面 2 文件 / 登记 1 / 未登记 1（[R] 段内）" \
  || no "登记统计异常"
printf '%s\n' "$OUT" | grep -q "CI-RED-CHECK: SKIPPED (no --ci-reds；CI job 提供)" \
  && ok "正常: 未给 --ci-reds → C 显式 SKIPPED（不参与判定）" \
  || no "C 未显式跳过"

# ── C1 回归: 冻结格式（`|` 前带空格）已登记红 → exit 0（旧实现此处误判"未登记"）──
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$SB/logs/c1.log" --ci-reds "$SB/red-ok.json" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s\n' "$OUT" | grep -q "CI-RED-CHECK: 失败检查 1 项；基线命中 1 项"; then
  ok "C1 回归: 冻结格式（NAME 后空格）→ 命中基线 → exit 0"
else
  no "C1 回归失败: rc=$rc（空格格式被判未登记）"
fi

# ── 端到端复现: 自造 JSON 含两条已登记红（其一含中文/全角括号/点号）→ exit 0 ──
{
  printf '%s | first_seen=2026-09-24 | owner=D-M9-test | expires=2099-12-31 | evidence=夹具\n' "$NAME_CN"
  printf 'ci-unit | first_seen=2026-09-24 | owner=D-M9-test | expires=2099-12-31 | evidence=夹具\n'
} > "$SB/red-two.txt"
printf '{"check_runs":[{"name":"%s","conclusion":"failure"},{"name":"ci-unit","conclusion":"failure"},{"name":"ci-ok","conclusion":"success"}]}\n' "$NAME_CN" > "$SB/red-two.json"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-two.txt" "$SB/logs/c2e2e.log" --ci-reds "$SB/red-two.json" 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s\n' "$OUT" | grep -q "CI-RED-CHECK: 失败检查 2 项；基线命中 2 项"; then
  ok "端到端复现: 两条已登记红（含中文/全角括号/点号名）→ exit 0"
else
  no "端到端复现失败: rc=$rc（应 2 项全命中）"
fi

# ── 向后兼容: 无空格旧格式 `NAME|first_seen=…|expires=…` → exit 0 ──
printf 'ci-unit|first_seen=2026-09-24|owner=D-M9-test|expires=2099-12-31|evidence=夹具\n' > "$SB/red-nospace.txt"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-nospace.txt" "$SB/logs/c3.log" --ci-reds "$SB/red-ok.json" 2>&1)"; rc=$?
[ "$rc" -eq 0 ] && ok "向后兼容: 无空格旧格式 → 命中基线 → exit 0" || no "无空格格式回归失败: rc=$rc"

# ── C2 回归: expires 已过期 → exit 1 且必须命中具体原因「CI 红基线过期」──
printf 'ci-old | first_seen=2026-01-01 | owner=D-M9-expired | expires=2020-01-01 | evidence=夹具\n' > "$SB/red-expired.txt"
printf '{"check_runs":[{"name":"ci-old","conclusion":"failure"}]}\n' > "$SB/red-old.json"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-expired.txt" "$SB/logs/c4.log" --ci-reds "$SB/red-old.json" 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: CI 红基线过期"; then
  ok "C2 回归: expires 过期 → exit 1 + 命中「CI 红基线过期」（按键取值生效）"
else
  no "C2 回归失败: rc=$rc（过期未被触发 = fail-open）"
fi

# ── 降级: 条目缺 expires 键 → exit 2（malformed 不静默当 0）──
printf 'ci-unit | first_seen=2026-09-24 | owner=D-M9-test | evidence=夹具（缺 expires）\n' > "$SB/red-nokey.txt"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-nokey.txt" "$SB/logs/c5.log" --ci-reds "$SB/red-ok.json" 2>&1)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s\n' "$OUT" | grep -q "degraded: CI 红基线条目缺 expires 键"; then
  ok "降级: 红基线条目缺 expires 键 → exit 2 + degraded（不静默当 0）"
else
  no "缺 expires 键未降级: rc=$rc"
fi

# ── 降级: ci.yml 缺失 → exit 2 + degraded + 日志 JSON 五字段 ──
LOG_D1="$SB/logs/d1.log"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/missing-ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$LOG_D1" --registry-only 2>&1)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s\n' "$OUT" | grep -q "degraded: CI 清单缺失" && [ "$(last_line "$OUT")" = "GATE-INTEGRITY: DEGRADED" ]; then
  ok "降级: ci.yml 缺失 → exit 2 + degraded + 末行 DEGRADED"
else
  no "降级(ci.yml 缺失)异常: rc=$rc"
fi
if [ -f "$LOG_D1" ] \
  && grep -q '"time":"' "$LOG_D1" && grep -q '"component":"check-gate-integrity"' "$LOG_D1" \
  && grep -q '"code":"B_CI_YML_MISSING"' "$LOG_D1" && grep -q '"phase":"registry"' "$LOG_D1" \
  && grep -q '"retryable":false' "$LOG_D1"; then
  ok "降级: 日志 JSON 五字段齐（time/component/code/phase/retryable）"
else
  no "降级日志 JSON 字段缺失: $(cat "$LOG_D1" 2>/dev/null)"   # swallow-ok: 仅失败诊断文本；读不到=空串，断言本身已判 FAIL（非放行）
fi

# ── 降级: 基线缺失 → exit 2 ──
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/missing-base.txt" "$SB/red-baseline.txt" "$SB/logs/d2.log" --registry-only 2>&1)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s\n' "$OUT" | grep -q "degraded: ratchet 基线缺失"; then
  ok "降级: 基线文件缺失 → exit 2 + degraded"
else
  no "降级(基线缺失)异常: rc=$rc"
fi

# ── 降级: --ci-reds 指向非法 JSON → exit 2 ──
printf 'not-json{' > "$SB/bad.json"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$SB/logs/d3.log" --ci-reds "$SB/bad.json" 2>&1)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s\n' "$OUT" | grep -q "degraded: check-runs JSON 非法"; then
  ok "降级: 非法 check-runs JSON → exit 2 + degraded"
else
  no "降级(非法 JSON)异常: rc=$rc"
fi

# ── 边界: 模式隔离（--patterns-only 不因 registry 面缺失而降级）──
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/missing-ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$SB/logs/e1.log" --patterns-only 2>&1)"; rc=$?
[ "$rc" -eq 0 ] && ok "边界: --patterns-only 不触发 registry 降级（模式隔离）" || no "模式隔离异常: rc=$rc"

# ── 边界: 解析到 0 个模式 → exit 2（CTO 明令保留）──
printf '#!/bin/bash\ntrue\n' > "$SB/scripts/empty.sh"
OUT="$(RUN "$SB/scripts/empty.sh" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$SB/logs/e2.log" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 2 ] && printf '%s\n' "$OUT" | grep -q "degraded: 可校验 grep 模式数=0"; then
  ok "边界: 空扫描脚本（0 模式）→ exit 2 + degraded（fail-closed，不报绿）"
else
  no "0 模式边界异常: rc=$rc"
fi

# ── 边界: 基线过期（幽灵条目）→ exit 1 ──
printf '# 基线\ntests/control-tower/beta.test.sh\ntests/control-tower/ghost.test.sh\n' > "$SB/baseline-stale.txt"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline-stale.txt" "$SB/red-baseline.txt" "$SB/logs/e3.log" --registry-only 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: 基线过期，须删条目: tests/control-tower/ghost.test.sh"; then
  ok "边界: 基线幽灵条目 → exit 1（基线过期）"
else
  no "基线过期边界异常: rc=$rc"
fi

# ── 棘轮 R1: 真仓库 --patterns-only → exit 0（:991 已登记）──
OUT="$(SYNO_GATE_DEGRADED_LOG="$SB/logs/real.log" bash "$GATE" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s\n' "$OUT" | grep -q "PATTERN-BASELINE: registered 1；条数 1"; then
  ok "棘轮: 真仓库 --patterns-only → exit 0（:991 已登记，registered 1）"
elif [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: 基线过期，须删条目: scripts/pre-commit-check.sh:991"; then
  ok "棘轮: 真仓库 --patterns-only → exit 1 且点名 :991（= D937 已落地，应删 [P] 条目；断言按状态自适应）"
else
  no "棘轮: 真仓库 --patterns-only 非预期: rc=$rc"
fi

# ── 棘轮: PATTERN 条目 expires 过期 → exit 1 ──
SCAN_M1="$SB/scripts/m1-scan.sh"
{
  printf '#!/bin/bash\n'
  printf 'echo a | grep -E %s\n' "'^alpha'"
  printf 'X=$(echo a | grep -Ev "%s")  # %s M1\n' "$BAD_RE" "$MARK"
} > "$SCAN_M1"
cat > "$SB/baseline-pat-expired.txt" <<EOB
# 夹具基线
# ═══ REGISTRY-BASELINE（夹具）═══
tests/control-tower/beta.test.sh
# ═══ PATTERN-BASELINE（夹具：过期条目）═══
# 格式：<路径>:<行号> | owner=<D#> | expires=YYYY-MM-DD | evidence=<引用>
$SCAN_M1:3 | owner=fixture | expires=2020-01-01 | evidence=夹具-过期
EOB
OUT="$(RUN "$SCAN_M1" "$SB/tests" "$SB/ci.yml" "$SB/baseline-pat-expired.txt" "$SB/red-baseline.txt" "$SB/logs/r2.log" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: PATTERN 基线过期（须修或延期）"; then
  ok "棘轮: PATTERN 条目 expires 过期 → exit 1"
else
  no "PATTERN 过期未触发: rc=$rc"
fi

# ── 棘轮: PATTERN 条目已不再违规 → exit 1（须删条目）──
cat > "$SB/baseline-pat-stale.txt" <<EOB
# 夹具基线
# ═══ REGISTRY-BASELINE（夹具）═══
tests/control-tower/beta.test.sh
# ═══ PATTERN-BASELINE（夹具：失效条目 = 指向合法模式行）═══
# 格式：<路径>:<行号> | owner=<D#> | expires=YYYY-MM-DD | evidence=<引用>
$SCAN_OK:2 | owner=fixture | expires=2099-12-31 | evidence=夹具-已不再违规
EOB
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline-pat-stale.txt" "$SB/red-baseline.txt" "$SB/logs/r3.log" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: 基线过期，须删条目"; then
  ok "棘轮: PATTERN 条目已不再违规 → exit 1（须删条目）"
else
  no "PATTERN 失效条目未触发: rc=$rc"
fi

# ── 分段隔离 A: [R] 段里的 key 不给 [P] 面生效（新非法模式仍必红）──
cat > "$SB/baseline-cross.txt" <<EOB
# 夹具基线
# ═══ REGISTRY-BASELINE（夹具：把 M1 的 key 错放在 [R] 段）═══
tests/control-tower/beta.test.sh
$SCAN_M1:3
# ═══ PATTERN-BASELINE（夹具：空）═══
# 格式：<路径>:<行号> | owner=<D#> | expires=YYYY-MM-DD | evidence=<引用>
EOB
OUT="$(RUN "$SCAN_M1" "$SB/tests" "$SB/ci.yml" "$SB/baseline-cross.txt" "$SB/red-baseline.txt" "$SB/logs/r4.log" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: 非法 ERE 模式"; then
  ok "分段隔离: [R] 段条目不给 A 模式豁免 → 新非法模式仍必红（exit 1）"
else
  no "分段隔离 A 失败: rc=$rc（跨段串行！）"
fi

# ── 分段隔离 B: [P] 段条目不给 registry 面生效（registry 仍按 [R] 判 → exit 0）──
cat > "$SB/baseline-both.txt" <<EOB
# 夹具基线
# ═══ REGISTRY-BASELINE（夹具：beta 存量）═══
tests/control-tower/beta.test.sh
# ═══ PATTERN-BASELINE（夹具：M1 的 key 正确放在 [P] 段）═══
# 格式：<路径>:<行号> | owner=<D#> | expires=YYYY-MM-DD | evidence=<引用>
$SCAN_M1:3 | owner=fixture | expires=2099-12-31 | evidence=夹具-M1
EOB
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline-both.txt" "$SB/red-baseline.txt" "$SB/logs/r5.log" --registry-only 2>&1)"; rc=$?
[ "$rc" -eq 0 ] && ok "分段隔离: [P] 段条目不进 registry 面 → exit 0（无跨段串行）" || no "分段隔离 B 失败: rc=$rc"
OUT="$(RUN "$SCAN_M1" "$SB/tests" "$SB/ci.yml" "$SB/baseline-both.txt" "$SB/red-baseline.txt" "$SB/logs/r6.log" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s\n' "$OUT" | grep -q "PATTERN-BASELINE: registered 1；条数 1"; then
  ok "分段隔离: [P] 段条目正确豁免既有非法模式 → exit 0（registered 1）"
else
  no "分段隔离([P] 豁免)失败: rc=$rc"
fi

# ── 判别性 M1: 未登记的新非法 ERE（临时脚本）→ 必红 + 点名 file:line ──
OUT="$(RUN "$SCAN_M1" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$SB/logs/m1.log" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: 非法 ERE 模式" \
  && printf '%s\n' "$OUT" | grep -q "m1-scan.sh:3" && printf '%s\n' "$OUT" | grep -q -F "$BAD_RE"; then
  ok "M1: 新注入非法 ERE（未登记）→ exit 1 + 点名 m1-scan.sh:3 + 模式原文"
else
  no "M1 判别性失败: rc=$rc（注入未被拦下）"
fi

# ── 判别性 M4: 哨兵核心置 return 0 → M1 场景必须不再红（证明夹具依赖真哨兵）──
MUT="$TMPD/mutated-gate.sh"
sed 's|^  _sentinel_grep .*M9-SENTINEL-CORE.*$|  _rc=0|' "$GATE" > "$MUT"
if cmp -s "$GATE" "$MUT"; then
  no "M4 变异未生效（sed 未命中 M9-SENTINEL-CORE 标记行）"
else
  ok "M4: 变异体已生成（哨兵核心行被替换）"
fi
OUT="$(SYNO_GATE_SCAN_SCRIPTS="$SCAN_M1" SYNO_TESTS_DIR="$SB/tests" SYNO_CI_YML="$SB/ci.yml" \
  SYNO_GATE_BASELINE="$SB/baseline.txt" SYNO_CI_RED_BASELINE="$SB/red-baseline.txt" \
  SYNO_GATE_DEGRADED_LOG="$SB/logs/m4.log" bash "$MUT" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && ! printf '%s\n' "$OUT" | grep -q "VIOLATION"; then
  ok "M4: 变异体下 M1 场景不再红（exit 0）→ 夹具依赖真哨兵，判别性成立"
else
  no "M4 判别性失败: rc=$rc（哨兵失效后 M1 仍报红 = M1 未依赖哨兵）"
fi

# ── 判别性 M5: 伪造 check-runs JSON 多加一条未登记 failure → 必红 ──
printf '{"check_runs":[{"name":"ci-unit","conclusion":"failure"},{"name":"ci-rogue","conclusion":"failure"}]}\n' > "$SB/red-rogue.json"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$SB/logs/m5.log" --ci-reds "$SB/red-rogue.json" 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: 未登记 CI 失败: ci-rogue"; then
  ok "M5: 未登记 failure → exit 1（点名 ci-rogue）"
else
  no "M5 判别性失败: rc=$rc"
fi

# ── 判别性 M2: 从基线删 1 条仍存在的未登记项 → 必红 ──
printf '# 基线\n' > "$SB/baseline-m2.txt"
OUT="$(RUN "$SCAN_OK" "$SB/tests" "$SB/ci.yml" "$SB/baseline-m2.txt" "$SB/red-baseline.txt" "$SB/logs/m2.log" --registry-only 2>&1)"; rc=$?
if [ "$rc" -eq 1 ] && printf '%s\n' "$OUT" | grep -q "VIOLATION: 新增测试未登记 CI 密封清单: tests/control-tower/beta.test.sh"; then
  ok "M2: 基线删条 → exit 1（原基线内未登记项被点名为新增）"
else
  no "M2 判别性失败: rc=$rc"
fi

# ── 回归 M6: 相邻引号段拼接模式不得被截断成假违规（真实形态，逐字节复刻 dev-doc-gatekeeper.sh:109）──
cat > "$SB/scripts/m6-scan.sh" <<'EOM'
#!/bin/bash
echo a | grep -E '^alpha'
grep -oE '(^|[^a-zA-Z0-9_])(src|packages)/[^][:space:])\"'\'',;]+' "$1"
EOM
OUT="$(RUN "$SB/scripts/m6-scan.sh" "$SB/tests" "$SB/ci.yml" "$SB/baseline.txt" "$SB/red-baseline.txt" "$SB/logs/m6.log" --patterns-only 2>&1)"; rc=$?
if [ "$rc" -eq 0 ] && printf '%s\n' "$OUT" | grep -q "GATE-INTEGRITY: OK"; then
  ok "M6: 引号段拼接模式整体拼接后验证 → 不误报（回归守住 dev-doc-gatekeeper.sh:109 形态）"
else
  no "M6 回归失败（拼接模式被截断成假违规）: rc=$rc"
fi

# ── 收尾: 红证不残留（仓库内零命中）──
HITS="$(grep -rl -- "$MARK" "$REPO/scripts" "$REPO/tests" 2>/dev/null | wc -l | tr -d ' ')"   # swallow-ok: 探测型 grep（红证残留检查）；无命中=期望结果 0，grep rc=1 不是错误
[ "$HITS" = "0" ] && ok "红证不残留: scripts/ + tests/ 内 '${MARK}' 命中 0" \
  || no "红证残留: scripts/ + tests/ 内命中 ${HITS} 个文件"
TMP_HITS="$(grep -rl -- "$MARK" "$TMPD" 2>/dev/null | wc -l | tr -d ' ')"   # swallow-ok: 探测型 grep（/tmp 副本存在性）；无命中即判 FAIL，非放行
[ "$TMP_HITS" -ge 1 ] && ok "红证只在 /tmp 副本（命中 ${TMP_HITS} 个文件）" || no "红证样本未落在 /tmp 副本"

echo ""
echo "=== 结果: PASS=${PASS} FAIL=${FAIL} ==="
[ "$FAIL" -eq 0 ] || exit 1
exit 0
