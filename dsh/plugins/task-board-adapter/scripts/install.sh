#!/usr/bin/env bash
# install.sh — 安装 @synova/task-board-adapter 到 dsh web profile
# 幂等：重复执行安全。
# 方式①（推荐）：dsh plugin 官方方式（package.json 声明 dsh.bundle → 注册进 bundles + dependencies，pnpm 托管，升级不被清理）
# 方式②（回退）：手动复制包 + 修改 cordis.patch.yml（pnpm 不可用时；注意后续 pnpm install 可能清理未托管包）
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROFILE_DIR="${DSH_HOME:-$HOME/.dsh}/profiles/web"
PATCH_FILE="$PROFILE_DIR/cordis.patch.yml"
MARKER="task-board-adapter"
DEST="$PROFILE_DIR/node_modules/@synova/task-board-adapter"

if command -v pnpm >/dev/null 2>&1; then
  echo "==> 方式① dsh plugin 官方安装（bundle 声明）"
  dsh plugin --profile web add "file:$PLUGIN_DIR"
  echo "==> 完成。请重启 dsh web：launchctl kickstart -k gui/$(id -u)/com.synova.dsh-web"
  exit 0
fi

echo "==> pnpm 不可用，回退方式② 手动安装"
mkdir -p "$PROFILE_DIR/node_modules/@synova"
rm -rf "$DEST"
cp -R "$PLUGIN_DIR" "$DEST"
rm -f "$DEST"/.DS_Store

if grep -qF "$MARKER" "$PATCH_FILE" 2>/dev/null; then
  echo "==> patch 已存在，跳过"
else
  # cordis.patch.yml 为空列表 `[]` 时整体替换；否则追加 insert 块
  if [ "$(grep -cE '^\[\]$' "$PATCH_FILE" 2>/dev/null || true)" -ge 1 ]; then
    cat > "$PATCH_FILE" <<'EOF'
# dsh profile root — 用户 patch 层（合成树在 bundles + 本文件之上叠加）
- insert:
    - id: task-board-adapter
      name: '@synova/task-board-adapter'
EOF
  else
    cat >> "$PATCH_FILE" <<'EOF'

- insert:
    - id: task-board-adapter
      name: '@synova/task-board-adapter'
EOF
  fi
  echo "==> cordis.patch.yml 已追加 loader 条目"
fi
echo "==> 完成（方式②）。重启 dsh web 生效。⚠️ 后续 pnpm install 可能清理手动安装的包，建议安装 pnpm 后走方式①。"
