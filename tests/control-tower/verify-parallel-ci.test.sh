#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# verify-parallel-ci.test.sh — D540 verify-parallel --ci-pr 沙箱测试
#
# 隔离: mktemp git 仓库 + 拷贝 scripts/ 到沙箱（verify-parallel.sh + devdoc_writeset.py 在沙箱执行），
#       真实 git ref（origin/main 已合 doc ↔ HEAD PR doc）。零真实目录零网络（M13）。
#
# 覆盖矩阵（铁律 48 正常/降级/边界 + 接线）:
#   T1 接线: --ci-pr 在 ci.yml 生产调用（非测试）
#   T2 接线: --ci-pr 在 verify-parallel.sh 定义（参数解析 + 模式分支）
#   T3 有交集 block: PR doc 写集 × 已合 doc 写集重叠 → exit 1 + 输出重叠文件
#   T4 无交集 pass: PR doc 写集 × 已合 doc 写集零交集 → exit 0
#   T5 degraded: base 不可解析 → exit 2（fail-closed，不静默当 pass）
#
# 退出码: 0 = 全部通过（T3 期望 exit 1，T4 期望 exit 0，T5 期望 exit 2）
# ═══════════════════════════════════════════════════════════════
set -uo pipefail
# D555: hook 上下文导出 GIT_INDEX_FILE（ct-test-gate 只剥 GIT_DIR/GIT_WORK_TREE，D521-3 泄漏未根治面）——
# 测试内剥掉，防沙箱 commit 污染宿主 index（D555 实证：merged.ts 垃圾条目入宿主 index 致 commit 失败）
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
VP="$REPO/scripts/control-tower/verify-parallel.sh"
CI="$REPO/.github/workflows/ci.yml"

PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

echo "=== D540 verify-parallel --ci-pr: CI/PR 写集比对 ==="

# ── T1 接线: ci.yml 生产调用 ──
if grep -q "verify-parallel.sh --ci-pr" "$CI"; then
  ok "T1 接线: ci.yml 调用 verify-parallel.sh --ci-pr"
else
  no "T1 ci.yml 未调用 --ci-pr"
fi
# ── T2 接线: verify-parallel.sh 定义 --ci-pr ──
if grep -qE '\-\-ci-pr\) MODE="ci-pr"' "$VP"; then
  ok "T2 接线: verify-parallel.sh 参数解析定义 --ci-pr"
else
  no "T2 --ci-pr 参数解析缺失"
fi
if grep -q 'MODE = "ci-pr"\|MODE="ci-pr"' "$VP"; then
  ok "T2b 接线: --ci-pr 模式分支存在"
else
  no "T2b --ci-pr 模式分支缺失"
fi

TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD" 2>/dev/null || true' EXIT

# 帮助: 建沙箱 repo（拷贝 scripts/ + git init + 设 origin/main 为 base commit）＋ feature 分支 PR doc
setup_repo() { # setup_repo <dir> <pr_doc_name>
  local d="$1" pr_doc="$2"
  rm -rf "$d"; mkdir -p "$d/src/middleware" "$d/docs/plans/codex/implementation"
  cp -R "$REPO/scripts" "$d/scripts"
  git -C "$d" init -q
  # base commit: 已合 doc（merged doc D990 声明 src/middleware/merged.ts）
  cat > "$d/docs/plans/codex/implementation/SYNOVA-IMPL-D990-merged-20260827.md" <<'EOF'
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| src/middleware/merged.ts | 修改 | 已合任务写集 |
EOF
  git -C "$d" -c user.email=t@t -c user.name=t add -A >/dev/null 2>&1
  git -C "$d" -c user.email=t@t -c user.name=t commit -qm base
  git -C "$d" update-ref refs/remotes/origin/main HEAD   # origin/main = base（已合）
  # feature 分支: PR doc
  git -C "$d" checkout -qb feat/d540-test
  cat > "$d/docs/plans/codex/implementation/$pr_doc" <<EOF
### 3.1 写集 (1 修改 + 0 新建)
| 文件 | 操作 | 说明 |
|------|------|------|
| $PR_FILE | 修改 | PR 任务写集 |
EOF
  git -C "$d" -c user.email=t@t -c user.name=t add -A >/dev/null 2>&1
  git -C "$d" -c user.email=t@t -c user.name=t commit -qm "feat: pr doc"
}

# ── T3 有交集 block ──
echo ""
echo "── T3 CI 模式: 有交集 → block (exit 1) ──"
PR_FILE="src/middleware/merged.ts"   # 与已合 doc D990 的重叠路径
SB_BLOCK="$TMPD/block"
setup_repo "$SB_BLOCK" "SYNOVA-IMPL-D991-block-20260827.md"
OUT=$(cd "$SB_BLOCK" && bash "$SB_BLOCK/scripts/control-tower/verify-parallel.sh" --ci-pr origin/main 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then ok "T3 有交集 block (exit 1)"; else no "T3 期望 exit 1 实际 $rc :: $OUT"; fi
[ "$(echo "$OUT" | grep -c "重叠" | tr -d '\n\r' || true)" -ge 1 ] && ok "T3 输出点名重叠文件" || no "T3 未输出重叠 ::\n$OUT"

# ── T4 无交集 pass ──
echo ""
echo "── T4 CI 模式: 无交集 → pass (exit 0) ──"
PR_FILE="src/middleware/other.ts"    # 与已合 doc D990 无交集
SB_PASS="$TMPD/pass"
setup_repo "$SB_PASS" "SYNOVA-IMPL-D992-pass-20260827.md"
OUT=$(cd "$SB_PASS" && bash "$SB_PASS/scripts/control-tower/verify-parallel.sh" --ci-pr origin/main 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then ok "T4 无交集 pass (exit 0)"; else no "T4 期望 exit 0 实际 $rc :: $OUT"; fi

# ── T5 degraded: base 不可解析 ──
echo ""
echo "── T5 CI 模式: base 不可解析 → degraded (exit 2) ──"
SB_DEG="$TMPD/deg"
setup_repo "$SB_DEG" "SYNOVA-IMPL-D993-deg-20260827.md"
OUT=$(cd "$SB_DEG" && bash "$SB_DEG/scripts/control-tower/verify-parallel.sh" --ci-pr does-not-exist-ref 2>&1); rc=$?
if [ "$rc" -eq 2 ]; then ok "T5 base 不可解析 degraded (exit 2)"; else no "T5 期望 exit 2 实际 $rc :: $OUT"; fi

# ── D555: 已关闭任务豁免（serial reuse）──
if grep -q "_is_closed_doc" "$VP" && grep -q "已关闭任务豁免" "$VP"; then
  ok "T6 接线: _is_closed_doc + ci-pr 豁免分支在位"
else
  no "T6 _is_closed_doc/豁免分支缺失"
fi

echo ""
echo "── T7 CI 模式: 已合 doc 任务已关闭（task-state audited）→ 豁免 pass (exit 0) ──"
PR_FILE="src/middleware/merged.ts"   # 与 D990 重叠，但 D990 audited → 应豁免
SB_CLOSED1="$TMPD/closed1"
setup_repo "$SB_CLOSED1" "SYNOVA-IMPL-D994-closed-20260827.md"
mkdir -p "$SB_CLOSED1/task-state"
printf '{"task_id":"D990","status":"audited"}\n' > "$SB_CLOSED1/task-state/D990.json"
OUT=$(cd "$SB_CLOSED1" && bash "$SB_CLOSED1/scripts/control-tower/verify-parallel.sh" --ci-pr origin/main 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then ok "T7 audited 豁免 pass (exit 0)"; else no "T7 期望 exit 0 实际 $rc :: $OUT"; fi
[ "$(echo "$OUT" | grep -c "已关闭任务豁免" | tr -d '\n\r' || true)" -ge 1 ] && ok "T7 输出点名豁免" || no "T7 未输出豁免 :: $OUT"

echo ""
echo "── T8 CI 模式: 历史任务无 task-state 但有审计报告 → 豁免 pass (exit 0) ──"
SB_CLOSED2="$TMPD/closed2"
setup_repo "$SB_CLOSED2" "SYNOVA-IMPL-D995-closed2-20260827.md"
mkdir -p "$SB_CLOSED2/docs/synova/audit-reports"
printf '# audit D990\n' > "$SB_CLOSED2/docs/synova/audit-reports/2026-08-22-D990-merged.md"
OUT=$(cd "$SB_CLOSED2" && bash "$SB_CLOSED2/scripts/control-tower/verify-parallel.sh" --ci-pr origin/main 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then ok "T8 审计报告豁免 pass (exit 0)"; else no "T8 期望 exit 0 实际 $rc :: $OUT"; fi

echo ""
echo "── T8b CI 模式: 无 task-state 无报告，但 (D#) 合并提交在 base → 豁免 pass (exit 0) ──"
SB_MERGED="$TMPD/merged"
setup_repo "$SB_MERGED" "SYNOVA-IMPL-D997-merged2-20260827.md"
git -C "$SB_MERGED" -c user.email=t@t -c user.name=t commit -q --allow-empty -m "fix(D990): merged task commit"
git -C "$SB_MERGED" update-ref refs/remotes/origin/main HEAD
OUT=$(cd "$SB_MERGED" && bash "$SB_MERGED/scripts/control-tower/verify-parallel.sh" --ci-pr origin/main 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then ok "T8b 合并提交信号豁免 pass (exit 0)"; else no "T8b 期望 exit 0 实际 $rc :: $OUT"; fi

echo ""
echo "── T9 CI 模式: 无关闭信号（无 task-state 无报告）→ 仍 block (fail-closed 不削弱) ──"
SB_OPEN="$TMPD/open"
setup_repo "$SB_OPEN" "SYNOVA-IMPL-D996-open-20260827.md"
OUT=$(cd "$SB_OPEN" && bash "$SB_OPEN/scripts/control-tower/verify-parallel.sh" --ci-pr origin/main 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then ok "T9 无信号仍 block (exit 1)"; else no "T9 期望 exit 1 实际 $rc :: $OUT"; fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
