#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# configure-machine.sh — D318 双机身份配置（per-clone，互不覆盖）
#
# 用法: bash scripts/setup/configure-machine.sh [--role win|mac]
#
# 作用（全部写 local config，不碰 global — 两台机器各自配置）:
#   1. 身份: user.name = ClawOrg-Win / ClawOrg-Mac（机器归属靠 name 前缀，
#      git log --author="ClawOrg-Win" 可查机器）；user.email = claworg@users.noreply.github.com
#      保持同一账号 noreply（GitHub 提交归属不丢，勿用 +win 之类非标准后缀）
#   2. 安装 hooks: install-hooks.sh（4 hook toplevel-relative + synova-commit alias）
#   3. 自检: verify-hooks-installed.sh（4 项全过才 exit 0）
#   4. 配置摘要输出
#
# 兼容: bash 3.2（Mac 默认 shell）— 禁 ${ROLE^} 等 bash 4+ case-modification；
#      身份映射用 case 全枚举。
# 定位: git -C "$ROOT" — 任意 cwd 可跑（不依赖调用者所在目录）。
#       内部脚本调用走 SCRIPT_DIR（自身所在版本）而非 $ROOT/scripts — 测试用临时
#       克隆（HEAD 快照）模拟新机器时，$ROOT 下可能是旧版/缺失（D317 RESOLVER_DIR 同款模式）。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# --role win|mac 解析（默认 win）
ROLE="win"
if [ "${1:-}" = "--role" ]; then
  ROLE="${2:-win}"
fi

case "$ROLE" in
  win|windows) NAME="ClawOrg-Win" ;;
  mac|macos|darwin) NAME="ClawOrg-Mac" ;;
  *)
    echo "用法: bash scripts/setup/configure-machine.sh [--role win|mac]" >&2
    echo "  --role win — Windows 机器身份 (ClawOrg-Win)" >&2
    echo "  --role mac — Mac 机器身份 (ClawOrg-Mac)" >&2
    exit 1
    ;;
esac

echo "=== 机器身份配置: ${NAME}（${ROOT}）==="

# 1. per-clone 身份（local config）
git -C "$ROOT" config user.name "$NAME"
git -C "$ROOT" config user.email "claworg@users.noreply.github.com"
echo "  ✅ user.name = $NAME"
echo "  ✅ user.email = claworg@users.noreply.github.com"

# 2. hooks 安装（4 hook + synova-commit alias）
echo ""
echo "--- hooks 安装 ---"
bash "$SCRIPT_DIR/../install-hooks.sh"

# 3. hooks 自检（exit 1 → set -e 中断，配置不完整不允许成功）
echo ""
echo "--- hooks 自检 ---"
bash "$SCRIPT_DIR/verify-hooks-installed.sh"

# 4. 摘要
echo ""
echo "=== 当前配置摘要 ==="
git -C "$ROOT" config --local --list | grep -E "user\.(name|email)|alias\.synova-commit" || true
echo ""
echo "✅ 机器配置完成: $NAME"
echo "   本机所有提交将带身份 ${NAME}（git log --author=\"${NAME}\" 可查）"
