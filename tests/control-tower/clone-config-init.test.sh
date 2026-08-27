#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# clone-config-init.test.sh — D540 _ensure_clone_git_config 沙箱测试
#
# 隔离: mktemp git 仓库 + 函数级提取（真实 install-hooks.sh 中提取 _ensure_clone_git_config
#       在沙箱执行）。零真实目录零网络（M13 — ctrl-tower-change 模式 5）。
#
# 覆盖矩阵（铁律 48 正常/降级/边界 + 接线）:
#   T1 接线: _ensure_clone_git_config 在 install-hooks.sh 被生产调用（主流程）
#   T2 幂等: local 已设 user.name → 不覆盖（值不变）
#   T3 仅当缺失才设: local 无 user.name/email → 写默认 synova-mac / claworg@users.noreply.github.com
#   T4 env 覆盖: SYNO_GIT_NAME/SYNO_GIT_EMAIL → 写注入值
#   T5 core.quotepath=false → quotepath 设为 false
#   T6 credential.helper → 默认 osxkeychain 写入
#   T7 不覆盖已有 credential: 已设 helper 不变（尊重 token）
#   T8 降级: $ROOT 非 git 仓库 → degraded 记录 + 不 exit 1（铁律 11）
#
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"
INSTALL="$REPO/scripts/install-hooks.sh"

PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }

# ── _degraded_log 测试桩（install-hooks.sh 函数引用它；记录而非写真实日志）──
DEGRADED_RECORD=""
_degraded_log() { DEGRADED_RECORD="$1|$2"; }

# ── 从 install-hooks.sh 提取 _ensure_clone_git_config（awk 到函数首行 ^} 为止）──
extract_fn() {
  awk -v fn="$1" '
    $0 ~ ("^" fn "\\(\\)[[:space:]]*\\{") && !started { started=1 }
    started { print }
    started && /^}/ { exit }
  ' "$2"
}

echo "=== D540 clone-config-init: _ensure_clone_git_config 沙箱 ==="

# ── T1 接线: 生产调用 ──
if grep -q "_ensure_clone_git_config()" "$INSTALL" && grep -qE '^_ensure_clone_git_config$' "$INSTALL"; then
  ok "T1 接线: _ensure_clone_git_config 定义 + 主流程调用"
else
  no "T1 _ensure_clone_git_config 未定义或主流程调用缺失"
fi

# ── 提取并装载函数 ──
FN_BODY="$(extract_fn _ensure_clone_git_config "$INSTALL")"
if [ -z "$FN_BODY" ]; then
  no "提取 _ensure_clone_git_config 失败（函数体为空）"
  echo "结果: $PASS 通过, $FAIL 失败"; [ "$FAIL" -eq 0 ] && exit 0 || exit 1
fi
if ! eval "$FN_BODY"; then
  no "装载 _ensure_clone_git_config 失败"
  echo "结果: $PASS 通过, $FAIL 失败"; [ "$FAIL" -eq 0 ] && exit 0 || exit 1
fi
if declare -F _ensure_clone_git_config >/dev/null 2>&1; then
  ok "提取+装载 _ensure_clone_git_config 成功"
else
  no "提取+装载失败: 函数未定义"
fi

TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD" 2>/dev/null || true' EXIT
SBX="$TMPD/sbx"

# 帮助函数: 建一个干净 git 仓库沙箱
new_sandbox() {
  rm -rf "$SBX"; mkdir -p "$SBX"
  git -C "$SBX" init -q
  ROOT="$SBX"
}

# ── T2 幂等: 已设 user.name → 不覆盖 ──
new_sandbox
git -C "$SBX" config --local user.name "pre-existing-name"
git -C "$SBX" config --local user.email "pre@existing"
_ensure_clone_git_config >/dev/null 2>&1
GOT=$(git -C "$SBX" config --local --get user.name)
[ "$GOT" = "pre-existing-name" ] && ok "T2 幂等: 已设 user.name 不覆盖 ($GOT)" || no "T2 已设被覆盖: $GOT"
GOT_EMAIL=$(git -C "$SBX" config --local --get user.email)
[ "$GOT_EMAIL" = "pre@existing" ] && ok "T2 幂等: 已设 user.email 不覆盖 ($GOT_EMAIL)" || no "T2 email 被覆盖: $GOT_EMAIL"

# ── T3 仅当缺失才设: 空沙箱 → 默认 ──
new_sandbox
_ensure_clone_git_config >/dev/null 2>&1
GOT=$(git -C "$SBX" config --local --get user.name)
GOT_EMAIL=$(git -C "$SBX" config --local --get user.email)
[ "$GOT" = "synova-mac" ] && ok "T3 缺失才设: user.name=synova-mac ($GOT)" || no "T3 user.name 默认错误: $GOT"
[ "$GOT_EMAIL" = "claworg@users.noreply.github.com" ] && ok "T3 缺失才设: user.email=claworg... ($GOT_EMAIL)" || no "T3 user.email 默认错误: $GOT_EMAIL"

# ── T4 env 覆盖 ──
new_sandbox
SYNO_GIT_NAME="foo-agent" SYNO_GIT_EMAIL="bar@test" _ensure_clone_git_config >/dev/null 2>&1
GOT=$(git -C "$SBX" config --local --get user.name)
GOT_EMAIL=$(git -C "$SBX" config --local --get user.email)
[ "$GOT" = "foo-agent" ] && ok "T4 env 覆盖: user.name=foo-agent ($GOT)" || no "T4 env name 未生效: $GOT"
[ "$GOT_EMAIL" = "bar@test" ] && ok "T4 env 覆盖: user.email=bar@test ($GOT_EMAIL)" || no "T4 env email 未生效: $GOT_EMAIL"

# ── T5 core.quotepath=false ──
new_sandbox
_ensure_clone_git_config >/dev/null 2>&1
QP=$(git -C "$SBX" config --local --get core.quotepath)
[ "$QP" = "false" ] && ok "T5 core.quotepath=false ($QP)" || no "T5 quotepath 未设 false: $QP"

# ── T6 credential.helper 默认 ──
new_sandbox
_ensure_clone_git_config >/dev/null 2>&1
CH=$(git -C "$SBX" config --local --get credential.helper)
[ "$CH" = "osxkeychain" ] && ok "T6 credential.helper=osxkeychain ($CH)" || no "T6 credential.helper 默认错误: $CH"

# ── T7 不覆盖已有 credential ──
new_sandbox
git -C "$SBX" config --local credential.helper "manager-core"
_ensure_clone_git_config >/dev/null 2>&1
CH=$(git -C "$SBX" config --local --get credential.helper)
[ "$CH" = "manager-core" ] && ok "T7 不覆盖已有 credential.helper ($CH)" || no "T7 credential 被覆盖: $CH"

# ── T8 降级: $ROOT 非 git 仓库 → degraded 记录 + 不 exit 1 ──
rm -rf "$SBX"; mkdir -p "$SBX"
ROOT="$SBX"   # 非 git 仓库
DEGRADED_RECORD=""
EXIT_CODE=0
_ensure_clone_git_config >/dev/null 2>&1 || EXIT_CODE=$?   # 直接调用（非子 shell，_degraded_log 桩生效）
if [ -n "$DEGRADED_RECORD" ]; then
  ok "T8 降级: 非 git 仓库 → _degraded_log 记录 ($DEGRADED_RECORD)"
else
  no "T8 降级: 未写 _degraded_log"
fi
if [ "$EXIT_CODE" -ne 1 ]; then
  ok "T8 降级: 配置失败不 exit 1 (exit=$EXIT_CODE)"
else
  no "T8 配置失败不应 exit 1 (exit=$EXIT_CODE)"
fi

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
