#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# install-hooks.sh — V4.5.0 Git Hooks 安装脚本
#
# 用法: bash scripts/install-hooks.sh
#
# 作用:
#   将 .git/hooks/ 中的 git hook 设为从 scripts/hooks/ 加载。
#   scripts/hooks/ 被 git 跟踪，修改后所有 session 同步。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

echo "=== SynovaAgent V4.5.0 Git Hooks 安装 ==="
mkdir -p "$ROOT/scripts/hooks"

install_hook() {
  local name="$1"
  local tracked="$ROOT/scripts/hooks/${name}.sh"
  local target="$ROOT/.git/hooks/$name"
  if [ ! -f "$tracked" ]; then
    echo "  !! $tracked 不存在 — 跳过"
    return
  fi
  cat > "$target" <<SCRIPT
#!/bin/bash
exec bash "$tracked"
SCRIPT
  chmod +x "$target"
  echo "  ✅ $name"
}

install_hook "post-commit"
# 后续新增 hook 在这里加: install_hook "pre-commit"

echo ""
echo "✅ 安装完成。当前 hooks:"
ls -la "$ROOT/.git/hooks/" | grep -v ".sample"
