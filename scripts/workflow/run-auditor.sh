#!/bin/bash
# run-auditor.sh — 调用 ArchitectureAuditor Agent 执行架构审计
# 用在 pre-push 中 (通过 RUN_ARCH_AUDIT=1 环境变量启用)
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

BRIEF=$(find .claude/task-briefs/ -name "$(date +%Y-%m-%d)*" 2>/dev/null | head -1 || echo "")
DIFF=$(git diff --cached 2>/dev/null | head -500 || echo "(empty diff)")

echo "=== Architecture Auditor ==="
echo "Task Brief: ${BRIEF:-无}"
echo "Diff size: $(echo "$DIFF" | wc -l) lines"
echo ""

# 如果 Claude Code 支持 agent 子命令，用这个:
# claude --agent architecture-auditor --print "审计以下代码变更"
# 备选: 将审计提示写入文件，供 AI 会话读取

AUDIT_FILE="/tmp/audit-prompt-$$.txt"
cat > "$AUDIT_FILE" << EOF
请以 ArchitectureAuditor 角色，审计以下代码变更和 task brief。

## Task Brief
${BRIEF:-无 task brief}

## Git Diff (staged)
$DIFF

请按审计清单逐项检查，输出 AUDIT_FAILED=true 或 AUDIT_PASSED=true。
EOF

echo "审计提示已写入: $AUDIT_FILE"
echo "请在 Claude Code 会话中运行审计，或通过环境变量 RUN_ARCH_AUDIT=1 在 pre-push 时自动触发。"
exit 0
