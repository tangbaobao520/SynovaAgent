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

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
