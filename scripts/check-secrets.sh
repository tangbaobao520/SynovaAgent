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
# 测试注入: SYNO_SECRETS_ROOT 覆盖扫描根（secrets-env-exempt.test.sh 沙箱单测）
REPO_ROOT="${SYNO_SECRETS_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'; VIOLATIONS=0

echo ""
echo "═══ Secrets 扫描 ═══"
echo ""

# ═══ 0. 全工作区扫描 (硬阻断) ═══
# 不限于暂存区 — 磁盘上任一文件含真实 API Key 即阻断。
# D370 修复: gitignored + 未跟踪的 .env = 本地密钥库（产品运行依赖真实密钥的正常状态），
#   豁免扫描——泄漏保护由 检查1 (.env 暂存阻断) + .gitignore 条目 + git 跟踪状态共同覆盖。
#   被 git 跟踪的 .env 含真实 Key = 泄漏事故，仍硬阻断。
# 历史事故: .env 和 .claude/settings.local.json 含真实 Key 但从未暂存, 旧门禁漏掉。
echo "── 全工作区扫描 ──"
FULL_SCAN=$(grep -rn \
  -e 'sk-[a-zA-Z0-9]\{20,\}' \
  -e 'cli_[a-z0-9]\{10,\}' \
  "$REPO_ROOT" \
  --include='*.env' --include='*.env.*' \
  --include='*.json' --include='*.ts' --include='*.js' \
  --include='*.yaml' --include='*.yml' --include='*.sh' \
  --include='*.bat' --include='*.ps1' \
  2>/dev/null \
  | grep -v 'node_modules' \
  | grep -v '\.git/' \
  | grep -v '\.claude/' \
  | grep -v '/dist/\|/build/\|/release/\|/vendor/\|/tests/' \
  | grep -v 'package-lock\.json' \
  | grep -v 'your-\|example\|placeholder\|demo\|test-\|xxx\|TODO\|CHANGE\|CHANGE_ME' \
  | grep -v 'setx.*FEISHU\|export.*FEISHU\|Bash(setx\|Bash(export' \
  | grep -v "'fde-tool'\|'steady_operator'\|'web-user'\|'strategy'\|'information_flow'\|'resolved'\|'evidence'\|'community'\|'deepseek'\|'qwen'\|'glm'\|'kimi'\|'yi'\|'minimax'\|'step'\|'ernie'\|'openai'\|'gateway'\|'silicon'" \
  | grep -v "deepseek-chat\|deepseek-v4\|deepseek-r1\|qwen-max\|qwen-plus\|glm-4\|kimi-latest\|ernie-bot" \
  || true)

# 二次过滤: .env.example 中的占位符不阻断
# D370: 未跟踪 .env 豁免（grep 输出路径为相对 REPO_ROOT 的 "<path>:<line>:<content>"）
FULL_SCAN_FILTERED=""
if [ -n "$FULL_SCAN" ]; then
  # D417/U5b: git 可用性预检 — git 不可用时 ls-files 会把"git 故障"误判为"未跟踪"而静默豁免（fail-open, M1）。
  # secrets 是安全关键门禁: 豁免判定失效 → fail-closed（exit 2 degraded, 不静默放行）。
  if ! git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  git 不可用 — .env 跟踪状态无法判定, secrets 扫描降级（fail-closed, 不静默豁免）${NC}" >&2
    echo "degraded: git 不可用, .env 豁免判定失效 (code=SECRETS_GATE_ERROR, phase=scan, retryable=true)" >&2
    exit 2
  fi
  while IFS= read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    if echo "$FILE" | grep -qE '(^|/)\.env$'; then
      # 未跟踪 → 本地密钥库 → 豁免（git ls-files 仅输出被跟踪路径）
      if ! git -C "$REPO_ROOT" ls-files --error-unmatch "$FILE" >/dev/null 2>&1; then
        continue
      fi
    fi
    case "$FILE" in *.env.example) continue ;; esac
    FULL_SCAN_FILTERED="${FULL_SCAN_FILTERED}${line}\n"
  done <<< "$FULL_SCAN"
fi

if [ -n "$FULL_SCAN_FILTERED" ]; then
  COUNT=$(echo "$FULL_SCAN_FILTERED" | wc -l | tr -d ' ')
  echo -e "  ${RED}❌ 工作区发现真实凭证: ${COUNT} 处  [硬阻断]${NC}"
  echo "$FULL_SCAN_FILTERED" | head -10 | while read -r line; do echo "     ${line}"; done
  echo "  以上文件包含疑似真实 API Key / App Secret。"
  echo "  如果是真实密钥 → 立即轮换 + 删除。如果是占位符 → 加入排除列表。"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "  ${GREEN}✅ 工作区无真实凭证${NC}"
fi

echo ""

# ═══ 0b. .claude/ 目录专项扫描 (硬阻断) ═══
# settings.local.json 可能含 API Key (如 DEEPSEEK_API_KEY=sk-xxx)
echo "── .claude/ 目录扫描 ──"
CLAUDE_SCAN=$(grep -rn \
  -e 'sk-[a-zA-Z0-9]\{20,\}' \
  -e 'cli_[a-z0-9]\{10,\}' \
  "$REPO_ROOT/.claude/" \
  --include='*.json' --include='*.yaml' --include='*.yml' \
  2>/dev/null \
  | grep -v 'your-\|example\|placeholder\|xxx\|TODO' \
  | grep -v 'setx.*FEISHU\|export.*FEISHU\|Bash(setx\|Bash(export' \
  || true)

if [ -n "$CLAUDE_SCAN" ]; then
  COUNT=$(echo "$CLAUDE_SCAN" | wc -l | tr -d ' ')
  echo -e "  ${RED}❌ .claude/ 目录含真实凭证: ${COUNT} 处  [硬阻断]${NC}"
  echo "$CLAUDE_SCAN" | while read -r line; do echo "     ${line}"; done
  echo "  .claude/ 目录中的 API Key 同样危险 — settings.local.json 可能被备份/同步。"
  VIOLATIONS=$((VIOLATIONS + 1))
else
  echo -e "  ${GREEN}✅ .claude/ 目录无凭证${NC}"
fi

echo ""

# ═══ 1. .env 意外暂存 ═══
if git diff --cached --name-only 2>/dev/null | grep -qE '(^|/)\.env$'; then
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
  # 修复 (D291): 模式 3 仅匹配 process.env 回退, 排除业务默认值 (sourceType || 'document' 非凭证)
  HARDCODED=$(echo "$STAGED" | xargs grep -Hn \
    -e 'sk-[a-zA-Z0-9]\{20,\}' \
    -e 'cli_[a-z0-9]\{10,\}' \
    -e 'process\.env\.[A-Z_]*\s*||\s*['"'"'"][a-zA-Z0-9_-]\{8,\}['"'"'"]' \
    2>/dev/null \
    | grep -v 'your-\|example\|placeholder\|demo\|test-\|xxx\|TODO\|CHANGE\|Observation\|'\''\s*$' \
    | grep -v "'fde-tool'\|'steady_operator'\|'web-user'\|'strategy'\|'information_flow'\|'resolved'\|'evidence'\|'community'\|'deepseek'\|'qwen'\|'glm'\|'kimi'\|'yi'\|'minimax'\|'step'\|'ernie'\|'openai'\|'gateway'\|'silicon'\|'not_bound'" \
    | grep -v "deepseek-chat\|deepseek-v4\|deepseek-r1\|qwen-max\|qwen-plus\|glm-4\|kimi-latest\|ernie-bot" \
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

# ═══ 4. 本地 .env 检查 (硬阻断 — 被 git 跟踪的 .env 含真实 Key 即阻断) ═══
# D370 修复: 未跟踪 + gitignored 的 .env = 本地密钥库（产品运行依赖真实密钥的正常状态），
#   不阻断（泄漏路径由 git 跟踪状态 + 检查1 暂存阻断覆盖）。
#   被 git 跟踪的 .env 含真实 Key = 泄漏事故 → 硬阻断。
# 历史事故: 旧门禁此处只警告不阻断, .env 真实 Key 长期留在磁盘未被发现。
if [ -f "$REPO_ROOT/.env" ]; then
  if git -C "$REPO_ROOT" ls-files --error-unmatch .env >/dev/null 2>&1; then
    REAL_KEY_IN_ENV=$(grep -E 'sk-[a-zA-Z0-9]{20,}' "$REPO_ROOT/.env" 2>/dev/null \
      | grep -v 'your-\|example\|placeholder\|xxx\|sk-your' || true)
    if [ -n "$REAL_KEY_IN_ENV" ]; then
      echo -e "  ${RED}❌ 本地 .env 含真实 API Key 且被 git 跟踪  [硬阻断]${NC}"
      echo "$REAL_KEY_IN_ENV" | while read -r line; do echo "     ${line}"; done
      echo "  被跟踪的 .env 会随仓库泄漏。git rm --cached .env 解除跟踪后重试。"
      VIOLATIONS=$((VIOLATIONS + 1))
    else
      echo -e "  ${GREEN}✅ 被跟踪 .env 无真实凭证${NC}"
    fi
  else
    echo -e "  ${GREEN}✅ .env 未跟踪（本地密钥库, D370 豁免 — 暂存仍阻断）${NC}"
  fi
else
  echo -e "  ${GREEN}✅ 无 .env 文件${NC}"
fi

echo ""
if [ "$VIOLATIONS" -gt 0 ]; then
  echo -e "${RED}Secrets 扫描: ${VIOLATIONS} 项违规 — 提交已拒绝${NC}"
  exit 1
else
  echo -e "  ${GREEN}Secrets 扫描: 全部通过 ✅${NC}"
  exit 0
fi
