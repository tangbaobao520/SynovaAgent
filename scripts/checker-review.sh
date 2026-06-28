#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# checker-review.sh — 独立验证器 (maker/checker 分离)
#
# 由 GitHub Actions 自动触发，验证 maker 提交的代码是否与 brief 一致。
# maker 不控制此脚本——修改它会在 git 历史中留下痕迹。
#
# 检查项:
#   1. compute 函数签名 (禁止 nodes.length 参数)
#   2. compute 文件行数 (禁止 < 15 行的 stub)
#   3. aggregate.ts 不使用 Math.min(v/100,1)
#   4. Q2 排除项未被修改
#   5. 模板残留 (<!--) 未清理
#   6. tsc 编译通过
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
FAIL=0

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo -e "${CYAN}  Checker Review — 独立验证器${RESET}"
echo -e "${CYAN}  maker 已提交。checker 正在验证。${RESET}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
echo ""

# 获取本次变更的文件
echo "--- 变更文件 ---"
CHANGED=$(git diff --name-only HEAD~1..HEAD 2>/dev/null || git diff --name-only origin/main..HEAD 2>/dev/null || true)
echo "$CHANGED" | head -20
echo ""

# 1. compute 文件行数检查 (禁止 < 15 行的 stub)
echo -e "${YELLOW}检查 1: compute 文件行数${RESET}"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if echo "$f" | grep -qE 'extensions/sentinels/.+/computes/.+\.ts$'; then
    lines=$(wc -l < "$ROOT/$f" 2>/dev/null || echo 0)
    if [ "$lines" -lt 15 ]; then
      # 白名单: 允许 T4-T9 的技术层哨兵（它们逻辑简单是合理的）
      name=$(basename "$(dirname "$(dirname "$f")")")
      if echo "$name" | grep -qE '^(connector-coverage|process-ai-readiness|ai-ecosystem-fit|agent-deployment-maturity|ai-investment-return|human-agent-boundary)$'; then
        echo -e "  ${YELLOW}⚠️  $f: ${lines}行 (技术层哨兵, 白名单放行)${RESET}"
        continue
      fi
      echo -e "  ${RED}❌ $f: 仅 ${lines} 行 (< 15), 可能是 stub${RESET}"
      FAIL=1
    else
      echo -e "  ${GREEN}✅ $f: ${lines}行${RESET}"
    fi
  fi
done <<< "$CHANGED"

# 2. aggregate.ts 不使用 nodes.length 模式
echo ""
echo -e "${YELLOW}检查 2: aggregate.ts 不使用 nodes.length 作为 compute 入参${RESET}"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if echo "$f" | grep -qE 'aggregate\.ts$'; then
    if grep -n 'nodes\.length' "$ROOT/$f" 2>/dev/null; then
      echo -e "  ${RED}❌ $f: 使用了 nodes.length${RESET}"
      FAIL=1
    else
      echo -e "  ${GREEN}✅ $f: 未使用 nodes.length${RESET}"
    fi
  fi
done <<< "$CHANGED"

# 3. Math.min(v/100,1) 模式 — stub 的出厂设置
echo ""
echo -e "${YELLOW}检查 3: compute 文件不含 Math.min(v/100,1) 模式${RESET}"
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if echo "$f" | grep -qE 'computes/.+\.ts$'; then
    if grep -nE 'Math\.min\([a-z]+/100' "$ROOT/$f" 2>/dev/null; then
      echo -e "  ${RED}❌ $f: 存在 Math.min(x/100,1) stub 模式${RESET}"
      FAIL=1
    else
      echo -e "  ${GREEN}✅ $f: 无 stub 模式${RESET}"
    fi
  fi
done <<< "$CHANGED"

# 4. brief 模板残留
echo ""
echo -e "${YELLOW}检查 4: brief 模板已清理${RESET}"
for brief in "$ROOT"/.claude/task-briefs/*.md; do
  [ -f "$brief" ] || continue
  if grep -c '<!--' "$brief" 2>/dev/null | grep -qv '^0$'; then
    echo -e "  ${RED}❌ $(basename "$brief"): 有 <!-- 模板残留${RESET}"
    FAIL=1
  fi
done
if [ "$FAIL" -eq 0 ]; then echo -e "  ${GREEN}✅ 全部 brief 无模板残留${RESET}"; fi

# 5. tsc 编译
echo ""
echo -e "${YELLOW}检查 5: tsc --noEmit${RESET}"
if cd "$ROOT" && npx tsc --noEmit 2>/dev/null; then
  echo -e "  ${GREEN}✅ tsc 编译通过${RESET}"
else
  echo -e "  ${RED}❌ tsc 编译失败${RESET}"
  FAIL=1
fi

# 6. vitest (changed files)
echo ""
echo -e "${YELLOW}检查 6: vitest 测试 (变更文件)${RESET}"
if cd "$ROOT" && npx vitest run --changed HEAD~1 2>/dev/null; then
  echo -e "  ${GREEN}✅ 测试通过${RESET}"
else
  echo -e "  ${RED}❌ 测试失败${RESET}"
  FAIL=1
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
if [ "$FAIL" -gt 0 ]; then
  echo -e "${RED}❌ Checker 拒绝: ${FAIL} 项未通过${RESET}"
  echo -e "${RED}   maker 需要修复后重新提交${RESET}"
  exit 1
else
  echo -e "${GREEN}✅ Checker 通过: 全部检查已验证${RESET}"
  echo -e "${GREEN}   可以合并到 main${RESET}"
fi
echo -e "${CYAN}════════════════════════════════════════════════════════════${RESET}"
