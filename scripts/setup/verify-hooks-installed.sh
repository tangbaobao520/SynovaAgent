#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# verify-hooks-installed.sh — D318 hooks 安装自检（install-hooks 后必跑）
#
# 用法: bash scripts/setup/verify-hooks-installed.sh
#
# 检查 4 项（exit 0 全过 / exit 1 有缺失）:
#   1. 4 个 git hook 存在且可执行（pre-commit / commit-msg / pre-push / post-commit）
#   2. 包装器无硬编码绝对路径 — 判据: `bash "` 后跟字面字符（D:/、/tmp/、/Users/、
#      C:\ 全部形式）跨机失效；跟 `$` = 运行时求值（$(git rev-parse) / $ROOT 变量，
#      可移植）。Windows 反斜杠绝对路径 `bash "C:\...` 同样被捕获。
#   3. core.hooksPath 非 Windows 绝对路径 — 文件夹整体拷贝到 Mac 时 .git/config
#      会带 `D:\...` 脏值 → git 找不到 hooks 目录 → 4 hook 全部静默失效
#      （git 不报错，只提示 skip）。检测到则提示 `git config --unset core.hooksPath`。
#   4. synova-commit alias 存在（install-hooks.sh 安装，commit gatekeeper）
#
# fail-open: 无法判定的项输出 degraded 记录，不静默吞掉（铁律 24/31）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
FAIL=0

echo "=== SynovaAgent hooks 安装自检（D318 双机可移植）==="

# 1. 4 hook 存在 + 可执行
for h in pre-commit commit-msg pre-push post-commit; do
  if [ -f "$ROOT/.git/hooks/$h" ] && [ -x "$ROOT/.git/hooks/$h" ]; then
    echo "  ✅ .git/hooks/$h 存在且可执行"
  else
    echo "  ❌ .git/hooks/$h 缺失或不可执行"
    FAIL=$((FAIL + 1))
  fi
done

# 2. 包装器无硬编码绝对路径
BAD=$(grep -HE 'bash "[^$]' \
  "$ROOT/.git/hooks/pre-commit" "$ROOT/.git/hooks/commit-msg" \
  "$ROOT/.git/hooks/pre-push" "$ROOT/.git/hooks/post-commit" 2>/dev/null || true)
if [ -z "$BAD" ]; then
  echo "  ✅ 包装器全部 toplevel-relative（无硬编码绝对路径）"
else
  echo "  ❌ 包装器含硬编码绝对路径（跨机失效）:"
  echo "$BAD" | sed 's/^/     /'
  FAIL=$((FAIL + 1))
fi

# 3. core.hooksPath 非 Windows 绝对路径
CHP=$(git config --get core.hooksPath 2>/dev/null || true)
if [ -n "$CHP" ]; then
  if echo "$CHP" | grep -qE '^[A-Za-z]:[\\/]'; then
    echo "  ❌ core.hooksPath 是 Windows 绝对路径（$CHP）"
    echo "     该值会让 Mac/CI 找不到 hooks 目录 → 4 hook 全部静默失效"
    echo "     修复: git config --unset core.hooksPath"
    FAIL=$((FAIL + 1))
  else
    echo "  ✅ core.hooksPath = $CHP（非 Windows 绝对路径）"
  fi
else
  echo "  ✅ core.hooksPath 未设置（git 默认 .git/hooks）"
fi

# 4. synova-commit alias
if git config --get alias.synova-commit >/dev/null 2>&1; then
  echo "  ✅ git alias synova-commit 存在"
else
  echo "  ❌ git alias synova-commit 缺失（install-hooks.sh 会安装）"
  FAIL=$((FAIL + 1))
fi

echo ""
if [ "$FAIL" -gt 0 ]; then
  echo "❌ hooks 安装不完整: $FAIL 项失败 — 请先重跑 bash scripts/install-hooks.sh"
  exit 1
fi
echo "✅ hooks 安装完整（双机可移植）"
exit 0
