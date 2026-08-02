#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.5.1+D311 — pre-push (secrets + golden-case + vitest 改基 + 并行协调)
#
# 设计原则:
#   - pre-commit 已跑 12 组物理阻断 + 格式检查 → 不重复
#   - PostToolUse 已跑 tsc --incremental + vitest --related → 不重复
#   - push 的独特风险: API key 泄露到 GitHub + 全量回归遗漏 + 黄金诊断无声退化
#     + 并行 session 中间态污染 (D311 改基: vitest 只测 origin..HEAD)
#   - V4.5.1 新增: vitest --changed 作为 push 时的增量回归检查
#   - D300 新增: golden-case F1 门禁 (权威文档09 §5.2 + A线 C-G1 修复)
#   - D311 新增: 门禁 3 改基 (origin/feat/prompt-architecture..HEAD) +
#     门禁 4 工作区中间态警告 + 门禁 5 并行声明物理验证 (verify-parallel.sh)
#   - secrets 终扫是最后防线 — 一旦 key 推到 GitHub, 轮换成本极高
#
# 删除的 5 道门去哪了:
#   决策树 → task-start.sh Q1 已覆盖
#   tsc → PostToolUse verify-incremental.sh 已跑
#   vitest → PostToolUse verify-incremental.sh 已跑
#   铁律/接线/架构 → agent 自检 + pre-commit 5 项已覆盖
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering V4.5.1 — pre-push (secrets + golden-case + vitest)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══ 门禁 1: secrets 终扫 ═══
echo -e "${CYAN}── secrets 终扫 (最后防线) ───────────────────────────${RESET}"
bash "$SCRIPT_DIR/check-secrets.sh" || {
  echo ""
  echo -e "  ${RED}❌ secrets 扫描未通过 — 推送已拒绝${RESET}"
  echo "  API key 一旦推到 GitHub, 轮换成本极高。请修复后重试。"
  exit 1
}

# ═══ 门禁 2: 黄金数据集 F1 门禁 (D300, A线 C-G1) ═══
# 权威文档09 §5.2: 冻结静态快照跑完整诊断 → F1-Score 匹配 (关键边命中率+
# 根因节点匹配率+告警级别一致率 三者均=100% 门禁通过)。D51 交付评分器、
# D100 交付质量检查但从未接线 → 防无声退化失效 (C-G1)。pre-commit <5s
# 约束不满足 tsx 诊断管线 → 挂 pre-push (可容忍 10-60s)。
echo ""
echo -e "${CYAN}── golden-case F1 门禁 (D300) ─────────────────────────${RESET}"
if ! npx tsx scripts/ci/golden-case-checker.ts; then
  echo ""
  echo -e "  ${RED}❌ 黄金案例 F1 门禁失败 — 诊断质量退化解冻, 见上方 diff${RESET}"
  echo "  修复 golden-case fixture 或诊断管线后重试。"
  exit 1
fi
if ! bash "$SCRIPT_DIR/ci/diagnosis-quality-check.sh"; then
  echo ""
  echo -e "  ${RED}❌ 诊断结构质量检查失败 — 推送已拒绝${RESET}"
  echo "  修复 expert PROMPT.md 结构或检查脚本后重试。"
  exit 1
fi

# ═══ 门禁 3: vitest 改基增量回归 (D311 M1 — 只测本次推送提交) ═══
# D300 事故: 并行 session 的工作区中间态让 vitest --changed 退化成全量且失败。
# D311 改基: 用 origin/feat/prompt-architecture..HEAD 只测本次推送的提交，
# 不测工作区杂散变更。
echo ""
echo -e "${CYAN}── vitest 改基增量回归 (D311, origin..HEAD) ──────────${RESET}"
BASE_REF="origin/feat/prompt-architecture"
if ! git rev-parse --verify "$BASE_REF" > /dev/null 2>&1; then
  # 远程引用缺失 → 降级提示 + 用 HEAD^ 兜底（fail-open，不静默）
  echo -e "  ${YELLOW}⚠️  远程分支引用缺失 ($BASE_REF) — 尝试 git fetch 或用 HEAD^ 兜底${RESET}"
  git fetch origin 2>/dev/null || true
  BASE_REF="HEAD^"
fi
UNPUSHED=$(git rev-list --count "$BASE_REF..HEAD" 2>/dev/null || echo "0")
if [[ "$UNPUSHED" -eq 0 || "$UNPUSHED" = "0" ]]; then
  echo -e "  ${GREEN}✅ 无未推送提交 — 跳过 vitest 增量 (D311 改基)${RESET}"
elif ! git rev-parse --verify "$BASE_REF..HEAD" > /dev/null 2>&1; then
  echo -e "  ${YELLOW}⚠️  HEAD 为根提交 — 跳过 vitest 增量 (D311 改基)${RESET}"
else
  CHANGED_TS=$(git diff --name-only "$BASE_REF"..HEAD 2>/dev/null | grep -E '\.(ts|tsx|js|jsx)$' || true)
  if [[ -z "$CHANGED_TS" ]]; then
    echo -e "  ${GREEN}✅ 本次推送无 TS 变更 ($UNPUSHED 提交) — 跳过 vitest 增量 (D311 改基)${RESET}"
  else
    if ! npx vitest run --changed "$BASE_REF..HEAD" 2>&1 | tail -3; then
      echo ""
      echo -e "  ${YELLOW}⚠️  vitest 改基增量有失败 — 请检查后重试推送${RESET}"
      npx vitest run --changed "$BASE_REF..HEAD" --reporter=verbose 2>&1 | grep "FAIL " | head -5
      echo ""
      echo -e "  ${RED}❌ vitest 增量回归未通过 — 推送已拒绝 (D311 改基)${RESET}"
      echo "  修复测试失败后重试, 或在紧急情况下使用 --no-verify 绕过。"
      exit 1
    fi
  fi
fi

# ═══ 门禁 4: 工作区中间态保护 (D311 M1 — 警告不阻断) ═══
# push 只推已提交内容（改基已消除污染），但未提交的他人 src/ 改动需显式提示。
echo ""
echo -e "${CYAN}── 工作区中间态检查 (D311) ───────────────────────────${RESET}"
SESSION_REGISTRY="$SCRIPT_DIR/control-tower/session_registry.py"
if [[ -f "$SESSION_REGISTRY" ]]; then
  UNCOMMITTED_SRC=$(git status --porcelain 2>/dev/null | grep -E '^\s*[MAD?]' | awk '{print $2}' | grep -E '^src/' | head -10 || true)
  if [[ -n "$UNCOMMITTED_SRC" ]]; then
    ATTR_OUT=$(python3 "$SESSION_REGISTRY" attribution $UNCOMMITTED_SRC 2>/dev/null || echo '{"attribution":[]}')
    FOREIGN=$(echo "$ATTR_OUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    for a in d.get('attribution',[]):
        if a.get('owner'):
            print(f\"  ⚠️  {a['file']} 属于 {a['owner']}（未提交）— 工作区中间态; push 不包含它, 请协调提交顺序\")
except Exception:
    pass
" 2>/dev/null || true)
    if [[ -n "$FOREIGN" ]]; then
      echo -e "  ${YELLOW}${FOREIGN}${RESET}"
    fi
    NODECLARED=$(echo "$ATTR_OUT" | python3 -c "
import json,sys
try:
    d=json.load(sys.stdin)
    no = [a['file'] for a in d.get('attribution',[]) if not a.get('owner')]
    if no: print(f\"  ℹ️  另有 {len(no)} 个 src/ 改动无写集登记（可能来自未注册 session）\")
except Exception:
    pass
" 2>/dev/null || true)
    if [[ -n "$NODECLARED" ]]; then
      echo -e "  ${CYAN}${NODECLARED}${RESET}"
    fi
  else
    echo -e "  ${GREEN}✅ 无未提交 src/ 改动${RESET}"
  fi
else
  echo -e "  ${YELLOW}⚠️  session_registry.py 缺失 — 中间态检查跳过 (fail-open)${RESET}"
fi

# ═══ 门禁 5: 并行声明物理验证 (D311 M1 — verify-parallel) ═══
echo ""
echo -e "${CYAN}── 并行声明物理验证 (D311) ───────────────────────────${RESET}"
VERIFY_PARALLEL="$SCRIPT_DIR/control-tower/verify-parallel.sh"
if [[ -f "$VERIFY_PARALLEL" ]]; then
  if ! bash "$VERIFY_PARALLEL" --scan-today; then
    echo ""
    echo -e "  ${RED}❌ 并行声明验证未通过 — 今日 dev doc 写集存在重叠, 推送已拒绝 (D311)${RESET}"
    exit 1
  fi
else
  echo -e "  ${YELLOW}⚠️  verify-parallel.sh 缺失 — 并行声明验证跳过 (fail-open)${RESET}"
fi

echo ""
echo -e "  ${GREEN}✅ 全部门禁通过 — 允许推送${RESET}"
echo ""
