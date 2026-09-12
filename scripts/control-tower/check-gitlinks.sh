#!/usr/bin/env bash
# check-gitlinks.sh — D665: 禁止 gitlink(160000) 入 git 树
#
# 背景：.synova-wt-* / .sessions 运行时目录曾以 gitlink 形式入树（D595 PR #459），
# CI actions/checkout 报 "No url found for submodule path" exit 128 → main build job 常红。
# 本检查对指定 tree-ish 做全树扫描，发现任何 160000 条目即阻断。
#
# 三态退出码（D328 惯例，fail-closed）：
#   exit 0 = 树内无 gitlink（通过）
#   exit 1 = 发现 gitlink 条目（业务阻断）
#   exit 2 = 检查自身执行失败/降级（同样阻断，绝不与通过混同）
#
# 用法: bash scripts/control-tower/check-gitlinks.sh [tree-ish]
#   tree-ish 默认 HEAD；测试可传入 mktemp 沙箱仓库路径下执行的自身实例。

set -u

# UTF-8 强制（windows-compat；中文输出在 Win/Git Bash 下防 GBK 乱码）
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

TREEISH="${1:-HEAD}"

# 前置校验：git 仓库 + tree-ish 可解析（三态之 exit 2）
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "[check-gitlinks] FAIL(exit 2): 当前目录不是 git 仓库，检查无法执行" >&2
  exit 2
fi
if ! git rev-parse --verify --quiet "${TREEISH}^{commit}" >/dev/null 2>&1; then
  echo "[check-gitlinks] FAIL(exit 2): tree-ish '${TREEISH}' 不可解析为 commit" >&2
  exit 2
fi

# 全树扫描（-r 递归；gitlink 以 160000 模式出现在输出中）
LIST=$(git ls-tree -r "${TREEISH}" 2>&1)
LS_EXIT=$?
if [ $LS_EXIT -ne 0 ]; then
  echo "[check-gitlinks] FAIL(exit 2): git ls-tree 执行失败: ${LIST}" >&2
  exit 2
fi

HITS=$(printf '%s\n' "$LIST" | grep -E "^160000 " || true)
if [ -n "$HITS" ]; then
  echo "[check-gitlinks] BLOCK(exit 1): 树 ${TREEISH} 中发现 gitlink(160000) 条目——运行时目录不得入版本库："
  printf '%s\n' "$HITS"
  echo "[check-gitlinks] 修复: git rm --cached <路径> 并将目录加入 .gitignore（见 D665 note）"
  exit 1
fi

echo "[check-gitlinks] PASS: 树 ${TREEISH} 无 gitlink 条目"
exit 0
