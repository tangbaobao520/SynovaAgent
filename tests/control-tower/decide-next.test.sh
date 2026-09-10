#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# decide-next.test.sh — D663: post-commit 建议面板架构探测回归测试
#
# 覆盖矩阵（铁律 48 三路径）:
#   正常 — check-architecture.sh 存在（无可执行位）→ 面板不误报「不存在」（D663: -x→-f）
#   边界 — 探测生效: 假 check 输出 ❌ → 面板报「存在跨层违规」
#   降级 — check-architecture.sh 缺失 → 面板显式报「check-architecture.sh 不存在」
#
# 沙箱: mktemp 临时 git repo + 被测脚本复制进沙箱同构路径（$0 相对推导 REPO_ROOT）。
# 沙箱 git commit 显式身份注入（D662/D663 密封惯例, CI 零配置可复现）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/../../scripts/workflow/decide-next.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

TMP=$(mktemp -d)
trap 'rm -rf "$TMP" 2>/dev/null || true' EXIT

make_sandbox() { # $1=场景名
  local SB="$TMP/$1"
  mkdir -p "$SB/scripts/workflow"
  cp "$SRC" "$SB/scripts/workflow/decide-next.sh"
  # 密封身份注入: 沙箱 commit 不依赖宿主全局身份（D663 同款修复）
  git -C "$SB" init -q && git -C "$SB" -c user.name=t -c user.email=t@t commit -q --allow-empty -m seed
  echo "$SB"
}

echo "=== D663 decide-next 架构探测回归 ==="

# ── 正常: 文件存在且无可执行位（-rw-r--r--，主仓库实际状态）→ 不误报「不存在」 ──
SB1=$(make_sandbox normal)
printf '#!/bin/bash\necho "架构检查: 全部通过 ✅"\n' > "$SB1/scripts/check-architecture.sh"
chmod 644 "$SB1/scripts/check-architecture.sh"
OUT1=$(cd "$SB1" && bash scripts/workflow/decide-next.sh 2>&1)
if echo "$OUT1" | grep -q "check-architecture.sh 不存在"; then
  no "无可执行位不应误报「不存在」（-x 探测回归）"
elif echo "$OUT1" | grep -q "无跨层违规"; then
  ok "文件存在(无 x 位) → 正常探测「无跨层违规」"
else
  no "预期「无跨层违规」, 实际输出异常"
fi

# ── 边界: 探测生效 — 假 check 报 ❌ → 面板报「存在跨层违规」 ──
SB2=$(make_sandbox edge)
printf '#!/bin/bash\necho "❌ 跨层违规"\n' > "$SB2/scripts/check-architecture.sh"
chmod 644 "$SB2/scripts/check-architecture.sh"
OUT2=$(cd "$SB2" && bash scripts/workflow/decide-next.sh 2>&1)
if echo "$OUT2" | grep -q "存在跨层违规"; then
  ok "check 输出 ❌ → 面板报「存在跨层违规」（探测真实接线）"
else
  no "预期「存在跨层违规」, 探测未接线"
fi

# ── 降级: 文件缺失 → 显式报「不存在」（不静默） ──
SB3=$(make_sandbox degraded)
OUT3=$(cd "$SB3" && bash scripts/workflow/decide-next.sh 2>&1)
if echo "$OUT3" | grep -q "check-architecture.sh 不存在"; then
  ok "文件缺失 → 显式降级提示「check-architecture.sh 不存在」"
else
  no "预期降级提示「check-architecture.sh 不存在」"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
