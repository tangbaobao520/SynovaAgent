#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# install-post-commit.sh — D210 外部审计器 post-commit 安装脚本
#
# 用法: bash scripts/workflow/install-post-commit.sh
#
# 作用:
#   将 scripts/hooks/post-commit.sh 安装到 .git/hooks/post-commit。
#   确保每次提交后自动触发 external-auditor.sh。
#   幂等：重复安装不报错。
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
SOURCE="$ROOT/scripts/hooks/post-commit.sh"
TARGET="$ROOT/.git/hooks/post-commit"

if [ ! -f "$SOURCE" ]; then
  echo "❌ source 不存在: $SOURCE"
  exit 1
fi

cat > "$TARGET" <<SCRIPT
#!/bin/bash
exec bash "$SOURCE"
SCRIPT
chmod +x "$TARGET"

echo "✅ post-commit hook 已安装 → $TARGET"
echo "   调用链: git commit → .git/hooks/post-commit → $SOURCE → external-auditor.sh"
