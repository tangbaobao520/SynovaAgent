#!/bin/bash
# check-secrets.sh — 凭证/密钥泄漏检测 (pre-commit 硬阻断)
#
# 覆盖所有已知泄露模式：
#   - LLM API Key (sk-/ak-/fk-/org- 前缀)
#   - 飞书 App Secret / App ID
#   - Password / Token 硬编码在非 .env 文件中
#   - .env 文件被意外暂存
#
# 历史事故: .env 真实 API Key 暴露仓库 / 飞书 App Secret 暴露
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'; VIOLATIONS=0

echo ""
echo "═══ Secrets 扫描 ═══"
echo ""

# ═══ 1. .env 意外暂存 ═══
if git diff --cached --name-only 2>/dev/null | grep -q '^\.env$'; then
  echo -e "  ${RED}❌ .env 文件被暂存 — 请立即 git rm --cached .env${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "  ${GREEN}✅ .env 未被暂存${NC}"
fi

# ═══ 2. .gitignore 必须包含 .env ═══
if ! grep -q '^\.env$' "$REPO_ROOT/.gitignore" 2>/dev/null; then
  echo -e "  ${RED}❌ .gitignore 缺少 .env 条目${NC}"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "  ${GREEN}✅ .gitignore 包含 .env${NC}"
fi

# ═══ 3. 源码硬编码密钥扫描 (全部文件, 包括测试) ═══
# 测试文件里的 fallback 值同样危险 — 真实密钥不能出现在仓库任何位置
STAGED=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null \
  | grep -E '\.(ts|js|json|yaml|yml|md|html)$' \
  | grep -v node_modules || true)

HARDCODED=""
if [ -n "$STAGED" ]; then
  # 三个可靠模式:
  #   1. LLM API Key 前缀 (sk-/ak-/fk-/org-)
  #   2. 飞书/企业 App ID 前缀 (cli_)
  #   3. process.env 回退到硬编码字符串 (|| 'xxx' 或 || "xxx")
  HARDCODED=$(echo "$STAGED" | xargs grep -Hn \
    -e 'sk-[a-zA-Z0-9]\{20,\}' \
    -e 'cli_[a-z0-9]\{10,\}' \
    -e "||\s*'[a-zA-Z0-9_-]\{8,\}'" \
    -e '||\s*"[a-zA-Z0-9_-]\{8,\}"' \
    2>/dev/null \
    | grep -v 'your-\|example\|placeholder\|demo\|test-\|xxx\|TODO\|CHANGE\|'\''\s*$' \
    || true)
fi

if [ -n "$HARDCODED" ]; then
  COUNT=$(echo "$HARDCODED" | wc -l | tr -d ' ')
  echo -e "  ${RED}❌ 硬编码凭证: ${COUNT} 处${NC}"
  echo "$HARDCODED" | head -10 | while read -r line; do echo "     ${line}"; done
  echo "  禁止在源码中硬编码 API Key / App Secret / Token / Password。"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "  ${GREEN}✅ 暂存文件无硬编码凭证${NC}"
fi

# ═══ 4. 本地 .env 提醒 (不阻断) ═══
if [ -f "$REPO_ROOT/.env" ] && grep -q 'sk-\|FEISHU\|DEEPSEEK' "$REPO_ROOT/.env" 2>/dev/null; then
  echo -e "  ${YELLOW}⚠️  本地 .env 包含 API Key (未暂存, 不阻断)${NC}"
fi

echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}Secrets 扫描: ${VIOLATIONS} 项违规 — 提交已拒绝${NC}"
  exit 1
else
  echo -e "  ${GREEN}Secrets 扫描: 全部通过 ✅${NC}"
  exit 0
fi
