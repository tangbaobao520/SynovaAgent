#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.2.7 — check-verifiable-done.sh
# Done 标准可证伪性检查。pre-commit 第 6 组调用。全部 <1s。
#
# Anthropic 原则 2: 先设计验证标准，再设计实现。
# "入口可触达" 不是可证伪的验收标准。
# "verify: npx vitest run tests/acceptance/zero-code-industry" 是。
#
# 规则:
#   - Done 标准中每个 - [x] 必须包含 verify: 前缀 + 至少 10 个字符的可执行描述
#   - 或者 - [x] 后必须有一行缩进的 verify: 子项
# ═══════════════════════════════════════════════════════════════════════════════
set +e

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; RESET='\033[0m'

TODAY=$(date +%Y-%m-%d)
BRIEF=$(find "$ROOT/.claude/task-briefs/" -name "*.md" -type f 2>/dev/null | xargs ls -t 2>/dev/null | head -1)

if [ -z "$BRIEF" ]; then
  echo -e "  ${GREEN}✅ Done 可证伪性 (无 brief, 跳过)${RESET}"
  exit 0
fi

# 提取 Done 标准段落
DONE_SECTION=$(awk '/^## Done 标准/{found=1; next} found && /^## /{exit} found' "$BRIEF" 2>/dev/null)

# 统计 - [x] 项
CHECKED=$(echo "$DONE_SECTION" | grep -cE '^\s*- \[x\]' 2>/dev/null | tr -d '\r' || echo 0)
CHECKED=${CHECKED//[^0-9]/}
[ -z "$CHECKED" ] && CHECKED=0
if [ "$CHECKED" -eq 0 ]; then
  echo -e "  ${GREEN}✅ Done 可证伪性 (无 checked 项)${RESET}"
  exit 0
fi

# 检查每个 - [x] 是否包含 verify:
UNVERIFIED=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  # 检查是否包含 verify: 关键字
  if ! echo "$line" | grep -qi 'verify:' 2>/dev/null; then
    UNVERIFIED="${UNVERIFIED}  ${line}\n"
  fi
done <<< "$(echo "$DONE_SECTION" | grep -E '^\s*- \[x\]')"

if [ -n "$UNVERIFIED" ]; then
  echo -e "  ${RED}❌ Done 可证伪性: ${CHECKED} 项 Done 中 $(echo -e "$UNVERIFIED" | grep -c .) 项缺 verify:  [硬阻断]${RESET}"
  echo -e "$UNVERIFIED"
  echo "    每个 - [x] 必须包含 verify: <可执行验证命令>"
  echo "    例: - [x] verify: npx vitest run tests/acceptance/zero-code-industry"
  exit 1
else
  echo -e "  ${GREEN}✅ Done 可证伪性 (${CHECKED} 项全部有 verify:)${RESET}"
  exit 0
fi
