#!/bin/bash
# 安装所有 Git hooks — 将 scripts/ 下的 check 脚本链接到 .git/hooks/
set -euo pipefail

HOOKS_DIR="$(cd "$(dirname "$0")/.." && pwd)/.git/hooks"
SCRIPTS_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "安装 Git hooks → ${HOOKS_DIR}"

# pre-commit: 铁律硬阻断
cat > "$HOOKS_DIR/pre-commit" << 'EOF'
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-commit-check.sh"
EOF
chmod +x "$HOOKS_DIR/pre-commit"

# commit-msg: Conventional Commits
cat > "$HOOKS_DIR/commit-msg" << 'EOF'
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/commit-msg-check.sh" "$1"
EOF
chmod +x "$HOOKS_DIR/commit-msg"

# pre-push: tsc + vitest + iron laws
cat > "$HOOKS_DIR/pre-push" << 'EOF'
#!/bin/bash
bash "$(git rev-parse --show-toplevel)/scripts/pre-push-check.sh"
EOF
chmod +x "$HOOKS_DIR/pre-push"

echo ""
echo "✅ Git hooks 安装完成:"
echo "   pre-commit  → bash scripts/pre-commit-check.sh"
echo "   commit-msg  → bash scripts/commit-msg-check.sh"
echo "   pre-push    → bash scripts/pre-push-check.sh"
echo ""
echo "运行 npm run hooks:install 可重新安装。"
