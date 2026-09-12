#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-evidence-cited.test.sh — D652 evidence 入库铁律测试
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 引用 git 跟踪路径 → exit 0 + EVIDENCE-OK
#   缺失 — 引用未跟踪路径 → exit 1 + 点名文件与路径
#   无引用 — evidence 值无路径 / 无 evidence 键 → exit 0（正常默认）
#   降级 — JSON 解析失败 → exit 2 + stderr degraded（铁律 24: ≠ ENOENT）
#   边界 — 无 task-state 变更 → exit 0 秒过; 中文描述混合引用提取（真实形态）
#   接线 — pre-commit-check.sh 调用了本门禁（铁律 0-2 WIRE CHECK）
#   语法 — bash -n + 三态退出码存在
#
# 沙箱: mktemp 临时 git 仓库 + --staged 注入缝, 零真实目录零网络（模式 5）。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="$REPO/scripts/control-tower/check-evidence-cited.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

SANDBOX="$(mktemp -d /tmp/d652-test.XXXXXX)"
trap 'rm -rf "$SANDBOX"' EXIT
git -C "$SANDBOX" init -q 2>/dev/null
git -C "$SANDBOX" -c user.email=t@t -c user.name=t add -A 2>/dev/null
mkdir -p "$SANDBOX/task-state" "$SANDBOX/docs/synova/audit-reports/D577-demo-evidence"
# tracked 证据文件（模拟 D577 先例: 落非忽略目录并入库）
echo "evidence" > "$SANDBOX/docs/synova/audit-reports/D577-demo-evidence/README.md"
git -C "$SANDBOX" -c user.email=t@t -c user.name=t add docs/ >/dev/null 2>&1
git -C "$SANDBOX" -c user.email=t@t -c user.name=t commit -qm "init" >/dev/null 2>&1
# untracked 证据目录（模拟 K3 实测: 引用了但从未入库）
mkdir -p "$SANDBOX/evidence/D999-not-in-git"
echo "ghost" > "$SANDBOX/evidence/D999-not-in-git/assertions.txt"

run_gate() { # $1=staged-list-file → 输出进 OUT, exit code 进 RC
  OUT=$(cd "$SANDBOX" && env -u GIT_DIR -u GIT_WORK_TREE -u GIT_INDEX_FILE \
    SYNO_REPO_ROOT="$SANDBOX" bash "$GATE" --staged "$1" 2>&1)
  RC=$?
}

echo "=== D652 check-evidence-cited 测试 ==="

# ── 语法 + 三态 ──
if bash -n "$GATE" 2>/dev/null; then ok "语法合法（bash -n）"; else no "语法错误"; fi
if grep -q "exit 2" "$GATE" && grep -q "exit 1" "$GATE" && grep -q "exit 0" "$GATE"; then
  ok "三态退出码（0/1/2）存在"
else
  no "三态退出码缺失"
fi

# ── 1. 正常: 引用 tracked 路径（文件级 + 目录级）→ exit 0 ──
cat > "$SANDBOX/task-state/D900.json" <<'EOF'
{"task_id": "D900",
 "impl": {"evidence": "docs/synova/audit-reports/D577-demo-evidence/（README + 断言原文落盘）",
          "notes": "引用格式模拟真实形态: 目录+中文括号说明"},
 "audit": {"report": "docs/synova/audit-reports/D577-demo-evidence/README.md"}}
EOF
echo "task-state/D900.json" > "$SANDBOX/staged1.txt"
run_gate "$SANDBOX/staged1.txt"
if [ "$RC" -eq 0 ] && echo "$OUT" | grep -q "EVIDENCE-OK"; then
  ok "正常: tracked 引用（文件+目录+中文括号混合）→ exit 0"
else
  no "正常路径失败 (rc=$RC): $OUT"
fi

# ── 2. 缺失: 引用未跟踪路径 → exit 1 + 点名 ──
cat > "$SANDBOX/task-state/D901.json" <<'EOF'
{"task_id": "D901",
 "impl": {"evidence": "evidence/D999-not-in-git/（12 件: README + assertions）"}}
EOF
echo "task-state/D901.json" > "$SANDBOX/staged2.txt"
run_gate "$SANDBOX/staged2.txt"
if [ "$RC" -eq 1 ] && echo "$OUT" | grep -q "evidence/D999-not-in-git" && echo "$OUT" | grep -q "D901"; then
  ok "缺失: 未跟踪引用 → exit 1 + 点名文件与路径"
else
  no "缺失路径未拦 (rc=$RC): $OUT"
fi

# ── 3. 无引用: evidence 值无路径 token → exit 0 ──
cat > "$SANDBOX/task-state/D902.json" <<'EOF'
{"task_id": "D902",
 "impl": {"evidence": "exit 0 + 四断言全过（描述性文字, 无路径引用）",
          "waiting": "GUI 环境缺失不伪造（D523 DS4 同型）"}}
EOF
echo "task-state/D902.json" > "$SANDBOX/staged3.txt"
run_gate "$SANDBOX/staged3.txt"
if [ "$RC" -eq 0 ]; then
  ok "无引用: 描述性 evidence → exit 0（正常默认）"
else
  no "无引用误拦 (rc=$RC): $OUT"
fi

# ── 4. 降级: JSON 解析失败 → exit 2 + degraded ──
printf '{"task_id": "D903", "impl": BROKEN' > "$SANDBOX/task-state/D903.json"
echo "task-state/D903.json" > "$SANDBOX/staged4.txt"
run_gate "$SANDBOX/staged4.txt"
if [ "$RC" -eq 2 ] && echo "$OUT" | grep -qi "degraded"; then
  ok "降级: 坏 JSON → exit 2 + degraded 显式（铁律 24）"
else
  no "坏 JSON 未降级 (rc=$RC): $OUT"
fi

# ── 5. 边界: 空触碰集合 → exit 0 秒过 ──
: > "$SANDBOX/staged5.txt"
run_gate "$SANDBOX/staged5.txt"
if [ "$RC" -eq 0 ] && echo "$OUT" | grep -q "SKIP"; then
  ok "边界: 无 task-state 变更 → SKIP + exit 0"
else
  no "空触碰未跳过 (rc=$RC): $OUT"
fi

# ── 6. 边界: 非 task-state 路径被过滤 ──
echo "src/some-file.ts" > "$SANDBOX/staged6.txt"
run_gate "$SANDBOX/staged6.txt"
if [ "$RC" -eq 0 ] && echo "$OUT" | grep -q "SKIP"; then
  ok "边界: 非 task-state 触碰被过滤 → SKIP"
else
  no "非 task-state 未过滤 (rc=$RC): $OUT"
fi

# ── 7. 接线: pre-commit-check.sh 调用本门禁（铁律 0-2 WIRE CHECK）──
if grep -q "check-evidence-cited" "$REPO/scripts/pre-commit-check.sh"; then
  ok "接线: pre-commit-check.sh 调用 check-evidence-cited.sh"
else
  no "接线缺失: pre-commit-check.sh 未调用本门禁"
fi

echo ""
echo "  结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && echo "  Status: ✅ check-evidence-cited 测试通过" || echo "  Status: ❌ check-evidence-cited 测试未通过"
exit $FAIL
