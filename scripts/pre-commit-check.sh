#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# 铁律自动化门禁 — pre-commit 硬阻断 + 存量警告
# 用法: bash scripts/pre-commit-check.sh
# hard-block: as any / Mock-TODO / CJS require / .only / .env leak / branch
# warning: empty catch (存量问题, 不阻断但可见)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

HARD_PASS=0; HARD_FAIL=0
WARN_COUNT=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

count_lines() {
  local input="$1"
  [ -z "$input" ] && echo 0 || echo "$input" | wc -l | tr -d ' '
}

hard_check() {
  local name="$1" matches="$2"
  local count; count=$(count_lines "$matches")
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    echo "$matches" | while read -r line; do echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    HARD_PASS=$((HARD_PASS + 1))
  fi
}

warn_check() {
  local name="$1" matches="$2"
  local count; count=$(count_lines "$matches")
  if [ "$count" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠  ${name}: ${count} 处  [存量警告, 非阻断]${RESET}"
    WARN_COUNT=$((WARN_COUNT + count))
    return 0  # never block
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    return 0
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  铁律自动化门禁 (Iron Law Automated Checks)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════
# 硬阻断 (Hard Block) — 违反直接拒绝 commit
# ═══════════════════════════════════════════════════════════
echo "── 硬阻断 ──────────────────────────────────────────────"

# 铁律 38: as any 零容忍
M=$(grep -rn 'as any[];,)}>]' src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v '//\|/\*\*' || true)
hard_check "铁律 38: as any 零容忍" "$M"

# 铁律 8: Mock/TODO 残留
M=$(grep -rn "MOCK_\|TODO.*后期\|TODO.*替换\|TODO.*hardcode" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "MOCK_残留" || true)
hard_check "铁律 8: Mock/TODO 残留" "$M"

# 铁律 9: CJS require() — 统一用 ESM import
M=$(grep -rn "require(" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v "import(" || true)
hard_check "铁律 9: CJS require() 残留" "$M"

# vitest .only()/.skip() — 不得进入 CI
M=$(grep -rn "\.only(\|\.skip(" tests/ --include="*.ts" 2>/dev/null | grep -v "node_modules" || true)
hard_check "vitest .only()/.skip() 残留" "$M"

# .env 安全检查
M=""
if [ -f .env ] && grep -q "sk-\|ApiKey.*[a-f0-9]\{20\}" .env 2>/dev/null; then
  M=".env 包含疑似真实 API Key"
fi
hard_check "P0-01: .env 不含真实 API Key" "$M"

echo ""

# ═══════════════════════════════════════════════════════════
# 存量警告 (Warning) — 不阻断，但每次 commit 可见
# ═══════════════════════════════════════════════════════════
echo "── 警告 ────────────────────────────────────────────────"

# 铁律 11: 服务端代码禁止 console.log — 必须用 logger
M=$(grep -rn "console\.log\|console\.error" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "src/cli\.ts\|src/setup\.ts\|src/tui/" \
  || true)
hard_check "铁律 11: console.log 残留 (非CLI/TUI)" "$M"

# 铁律 34: 禁止直接 commit 到 main (Git 工作流未建立前为警告)
M=""
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
if [ "$CURRENT_BRANCH" = "main" ]; then
  M="当前在 main 分支 — 铁律 34 要求 feature branch"
fi
warn_check "铁律 34: 不在 main 上 commit" "$M"

# 铁律 11+24+31: 空 catch (无 log 且无注释)
M=$(grep -rn "catch\s*{" src/ --include="*.ts" 2>/dev/null \
  | grep -v "node_modules" | grep -v "\.test\." \
  | grep -v "log\." \
  | grep -v "JSON\.parse\|ENOENT" \
  | grep -v "/\*\|//" \
  | grep -v "_reading\|setRawMode\|\.destroy()\|\.end()\|\.detach" \
  | grep -v "return '0" \
  || true)
# 二次过滤: 下一行有 log → 不算
M=$(echo "$M" | while read -r line; do
  file=$(echo "$line" | cut -d: -f1)
  linenum=$(echo "$line" | cut -d: -f2)
  next=$((linenum + 1))
  if sed -n "${next}p" "$file" 2>/dev/null | grep -q "log\."; then continue; fi
  echo "$line"
done || true)
warn_check "铁律 11+24+31: 空 catch (静默吞)" "$M"

# 技术债务追踪 (TECH_DEBT.md)
echo -n "  "
bash "$(dirname "$0")/check-tech-debt.sh" 2>/dev/null || echo "  ⚠ 技术债务检查跳过"

# 铁律 39: 架构边界检查
bash "$(dirname "$0")/check-architecture.sh" 2>/dev/null || true

echo ""
echo "───────────────────────────────────────────────────────────"

# ═══ 结果 ═══
if [ "$HARD_FAIL" -gt 0 ]; then
  echo -e "  ${RED}硬阻断: ${HARD_FAIL} 项未通过 — 提交已拒绝${RESET}"
  if [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}警告: ${WARN_COUNT} 处存量问题 (不阻断)${RESET}"
  fi
  echo ""
  echo "  修复硬阻断项后重试。替代方案见 CLAUDE.md。"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}硬阻断: 全部通过 ✅${RESET}"
  if [ "$WARN_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}警告: ${WARN_COUNT} 处存量问题 (不阻断, 建议修复)${RESET}"
  fi
  echo ""
  exit 0
fi
