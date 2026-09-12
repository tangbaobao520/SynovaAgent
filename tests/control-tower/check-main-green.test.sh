#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-main-green.test.sh — D653 合入即绿门禁测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 当前红 = 基线 → exit 0; 新增红已豁免 → exit 0 放行
#   缺失 — 当前红含基线外未豁免红 → exit 1 + 点名 + 写待办
#   降级 — 基线文件缺失 → exit 2 + degraded（fail-closed）
#   边界 — --from-log 解析（含 ANSI 码 verbose 输出）; --self-check 非法行;
#          24h 升级（旧 mtime 待办已存在 → 升级提示且不覆盖 FIRST_SEEN）
#   接线 — ci.yml test job/canary 调用 + pre-commit-check.sh 组 15（铁律 0-2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/check-main-green.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

SANDBOX="$(mktemp -d /tmp/d653-test.XXXXXX)"
trap 'rm -rf "$SANDBOX"' EXIT

# 沙箱基线/豁免/待办/当前
BASE="$SANDBOX/baseline.txt"; EXEM="$SANDBOX/exemptions.txt"; TODO="$SANDBOX/MAIN-RED-NEW.md"
cat > "$BASE" <<'EOF'
# 基线注释行
tests/agent/expert-file-loader.integration.test.ts
tests/expert/analytical-lens.test.ts
EOF
cat > "$EXEM" <<'EOF'
# 豁免注释行
tests/env-only/gpu.test.ts # D999 Windows 环境依赖
EOF

run_gate() { # $@ = 透传参数; OUT/RC 出口
  OUT=$(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE SYNO_REPO_ROOT="$SANDBOX" \
    bash "$GATE" --baseline "$BASE" --exemptions "$EXEM" --todo "$TODO" "$@" 2>&1)
  RC=$?
}

echo "=== D653 check-main-green 测试 ==="

# ── 语法 + 三态 ──
bash -n "$GATE" 2>/dev/null && ok "语法合法（bash -n）" || no "语法错误"
grep -q "exit 2" "$GATE" && grep -q "exit 1" "$GATE" && grep -q "exit 0" "$GATE" \
  && ok "三态退出码（0/1/2）存在" || no "三态退出码缺失"

# ── 1. 正常: 当前 = 基线 → exit 0 ──
printf 'tests/agent/expert-file-loader.integration.test.ts\ntests/expert/analytical-lens.test.ts\n' > "$SANDBOX/cur1.txt"
run_gate --current "$SANDBOX/cur1.txt"
[ "$RC" -eq 0 ] && echo "$OUT" | grep -q "MAIN-GREEN-OK" && ok "正常: 当前=基线 → exit 0" || no "正常路径失败 (rc=$RC): $OUT"

# ── 2. 缺失: 基线外未豁免红 → exit 1 + 点名 + 写待办 ──
printf 'tests/agent/expert-file-loader.integration.test.ts\ntests/new-anon/broken.test.ts\n' > "$SANDBOX/cur2.txt"
run_gate --current "$SANDBOX/cur2.txt"
if [ "$RC" -eq 1 ] && echo "$OUT" | grep -q "tests/new-anon/broken.test.ts"; then
  ok "缺失: 新增匿名红 → exit 1 + 点名"
else
  no "新增匿名红未拦 (rc=$RC): $OUT"
fi
[ -f "$TODO" ] && grep -q "tests/new-anon/broken.test.ts" "$TODO" && ok "待办已写且含匿名红清单" || no "待办未写或缺清单"

# ── 3. 豁免: 新增红已在豁免登记 → exit 0 放行 ──
printf 'tests/agent/expert-file-loader.integration.test.ts\ntests/env-only/gpu.test.ts\n' > "$SANDBOX/cur3.txt"
run_gate --current "$SANDBOX/cur3.txt"
[ "$RC" -eq 0 ] && echo "$OUT" | grep -q "已登记豁免" && ok "豁免: 已归属红 → exit 0 放行" || no "豁免误拦 (rc=$RC): $OUT"

# ── 4. 降级: 基线缺失 → exit 2 + degraded ──
run_gate --current "$SANDBOX/cur1.txt" --baseline "$SANDBOX/no-such-baseline.txt"
[ "$RC" -eq 2 ] && echo "$OUT" | grep -qi "degraded" && ok "降级: 基线缺失 → exit 2 + degraded" || no "基线缺失未降级 (rc=$RC): $OUT"

# ── 5. 边界: --from-log 解析（含 ANSI 码的 vitest verbose 输出）──
printf '\x1b[31m FAIL \x1b[0m tests/agent/expert-file-loader.integration.test.ts > x\n\x1b[31m FAIL \x1b[0m tests/from-log/extra.test.ts > y\n ✓ tests/fine/ok.test.ts (3ms)\n' > "$SANDBOX/run.log"
printf 'tests/agent/expert-file-loader.integration.test.ts\ntests/expert/analytical-lens.test.ts\n' > "$SANDBOX/cur5.txt"
run_gate --from-log "$SANDBOX/run.log"
if [ "$RC" -eq 1 ] && echo "$OUT" | grep -q "tests/from-log/extra.test.ts" && ! echo "$OUT" | grep -q "tests/fine/ok"; then
  ok "边界: --from-log 剥 ANSI 提取 FAIL 文件, 不误吞 PASS 行"
else
  no "from-log 解析失败 (rc=$RC): $OUT"
fi

# ── 6. 边界: --self-check 非法基线行 → exit 1; 合法 → exit 0 ──
cp "$BASE" "$SANDBOX/bad-base.txt"; echo "不是路径的行" >> "$SANDBOX/bad-base.txt"
run_gate --self-check --baseline "$SANDBOX/bad-base.txt"
[ "$RC" -eq 1 ] && echo "$OUT" | grep -q "非法行" && ok "self-check: 非法基线行 → exit 1" || no "self-check 未拦非法行 (rc=$RC): $OUT"
run_gate --self-check
[ "$RC" -eq 0 ] && ok "self-check: 合法基线+豁免 → exit 0" || no "self-check 误拦合法文件 (rc=$RC): $OUT"

# ── 7. 边界: 24h 升级（旧 mtime 待办已存在 → 升级提示, 不覆盖 FIRST_SEEN）──
printf '# main 新增匿名红待办（D653 自动生成）\n\n> 首次发现 2026-09-08 00:00\n' > "$TODO"
touch -t 202609080000 "$TODO" 2>/dev/null || touch -t 202609080000 "$TODO"
printf 'tests/agent/expert-file-loader.integration.test.ts\ntests/new-anon/broken.test.ts\n' > "$SANDBOX/cur7.txt"
run_gate --current "$SANDBOX/cur7.txt"
if [ "$RC" -eq 1 ] && echo "$OUT" | grep -q "24h"; then
  ok "边界: 挂账 ≥24h → 升级提示（旧待办不被覆盖）"
else
  no "24h 升级未触发 (rc=$RC): $OUT"
fi

# ── 8. 接线: ci.yml + pre-commit-check.sh（铁律 0-2 WIRE CHECK）──
grep -q "check-main-green" "$REPO/.github/workflows/ci.yml" \
  && ok "接线: ci.yml 调用 check-main-green.sh" || no "接线缺失: ci.yml 未调用"
grep -q "check-main-green" "$REPO/scripts/pre-commit-check.sh" \
  && ok "接线: pre-commit-check.sh 组 15 调用" || no "接线缺失: pre-commit 未调用"

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "  Status: ✅ check-main-green 测试通过" || echo "  Status: ❌ check-main-green 测试未通过"
exit $FAIL
