#!/usr/bin/env bash
# ============================================================================
# check-integration.sh — 集成测试契约检查
#
# 第14份权威文档第三章: 11项集成契约 + L1/L2/L3 三层检查
#
# 用法:
#   bash scripts/workflow/check-integration.sh              # L1+L2
#   bash scripts/workflow/check-integration.sh --l3         # L3 语义检查(手动)
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY="$REPO_DIR/scripts/workflow/system-registry.json"
HEALTH_LOG="$REPO_DIR/.claude/system-health.log"

# 颜色
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
pass() { echo -e "  ${GREEN}✅${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; echo "[$(date +%Y-%m-%dT%H:%M:%S)] WARN: $1" >> "$HEALTH_LOG" 2>/dev/null || true; }
fail() { echo -e "  ${RED}❌${NC} $1" >&2; errors=$((errors+1)); }
info() { echo -e "  ${CYAN}ℹ️  $1${NC}"; }

# 参数
L3_ONLY=false
[[ "${1:-}" == "--l3" ]] && L3_ONLY=true

errors=0

# jq required
if ! command -v jq &>/dev/null; then
  echo "❌ jq 未安装" >&2; exit 1
fi

# 加载注册表
REG_EDGES=$(jq -r '.edges[]' "$REGISTRY")
REG_SENTINELS=$(jq -r '.sentinels[]' "$REGISTRY")
REG_COMPUTES=$(jq -r '.computes[]' "$REGISTRY")
REG_SKILLS=$(jq -r '.skills[]' "$REGISTRY")
REG_PLAYBOOKS=$(jq -r '.playbooks[]' "$REGISTRY")

# ═══ L1: 结构性检查 ═══
l1_checks() {
  echo -e "\n${CYAN}═══ L1 结构性检查 ═══${NC}"

  # L1-1: JSON 格式
  echo -e "\n${CYAN}── JSON 格式检查 ──${NC}"
  local jerr=0
  while IFS= read -r f; do
    jq . "$f" >/dev/null 2>&1 || { fail "JSON 格式错误: $f"; jerr=$((jerr+1)); }
  done < <(find "$REPO_DIR/extensions" -name "*.json" ! -path "*/node_modules/*" 2>/dev/null || true)
  [[ $jerr -eq 0 ]] && pass "所有 JSON 文件格式正确"

  # L1-2: YAML 格式
  echo -e "\n${CYAN}── YAML 格式检查 ──${NC}"
  local yerr=0
  while IFS= read -r f; do
    node -e "require('js-yaml').load(require('fs').readFileSync('$f','utf-8'))" 2>/dev/null || \
      { fail "YAML 格式错误: $f"; yerr=$((yerr+1)); }
  done < <(find "$REPO_DIR/extensions" -name "*.yaml" ! -path "*/node_modules/*" 2>/dev/null || true)
  [[ $yerr -eq 0 ]] && pass "所有 YAML 文件格式正确"

  # L1-3: Skill manifest edges → registry
  echo -e "\n${CYAN}── Skill 边缘引用检查 ──${NC}"
  local serr=0
  while IFS= read -r mf; do
    local name; name=$(basename "$(dirname "$mf")" 2>/dev/null || echo "unknown")
    while IFS= read -r e; do
      [[ -z "$e" ]] && continue
      grep -qxF "$e" <<< "$REG_EDGES" 2>/dev/null || { fail "Skill $name 引用了未注册边: $e"; serr=$((serr+1)); }
    done < <(jq -r '.dependencies.edges[] // empty' "$mf" 2>/dev/null || true)
  done < <(find "$REPO_DIR/extensions/skills/builtin" -name "manifest.json" 2>/dev/null || true)
  [[ $serr -eq 0 ]] && pass "所有 Skill 边缘引用均在注册表中"

  # L1-4: Playbook YAML edge refs
  echo -e "\n${CYAN}── Playbook 边缘引用检查 ──${NC}"
  local perr=0
  while IFS= read -r yf; do
    local name; name=$(basename "$yf" .yaml 2>/dev/null || echo "unknown")
    local edges
    edges=$(node -e "
      const y = require('js-yaml'), fs = require('fs');
      const doc = y.load(fs.readFileSync('$yf','utf-8'));
      if (!doc || !doc.dependencies || !doc.dependencies.edges) process.exit(0);
      doc.dependencies.edges.forEach(e => { if (typeof e === 'string' && e.startsWith('E-')) console.log(e); });
    " 2>/dev/null || true)
    while IFS= read -r e; do
      [[ -z "$e" ]] && continue
      grep -qxF "$e" <<< "$REG_EDGES" 2>/dev/null || { fail "Playbook $name 引用了未注册边: $e"; perr=$((perr+1)); }
    done <<< "$edges"
  done < <(find "$REPO_DIR/extensions/playbooks/builtin" -name "*.yaml" 2>/dev/null || true)
  [[ $perr -eq 0 ]] && pass "所有 Playbook 边缘引用均在注册表中"
}

# ═══ L2: 交叉引用检查 ═══
l2_checks() {
  echo -e "\n${CYAN}═══ L2 交叉引用检查 ═══${NC}"

  # L2-1: Skill computes → registry
  echo -e "\n${CYAN}── compute 契约引用检查 ──${NC}"
  local cerr=0
  while IFS= read -r mf; do
    local name; name=$(basename "$(dirname "$mf")" 2>/dev/null || echo "unknown")
    while IFS= read -r c; do
      [[ -z "$c" ]] && continue
      grep -qxF "$c" <<< "$REG_COMPUTES" 2>/dev/null || { fail "Skill $name 引用了未注册 compute: $c"; cerr=$((cerr+1)); }
    done < <(jq -r '.dependencies.computes[] // empty' "$mf" 2>/dev/null || true)
  done < <(find "$REPO_DIR/extensions/skills/builtin" -name "manifest.json" 2>/dev/null || true)
  [[ $cerr -eq 0 ]] && pass "所有 compute 契约引用均在注册表中"

  # L2-2: Skill sentinels → registry
  echo -e "\n${CYAN}── 哨兵引用检查 ──${NC}"
  local serr=0
  while IFS= read -r mf; do
    local name; name=$(basename "$(dirname "$mf")" 2>/dev/null || echo "unknown")
    while IFS= read -r s; do
      [[ -z "$s" ]] && continue
      grep -qxF "$s" <<< "$REG_SENTINELS" 2>/dev/null || { warn "Skill $name 引用了未注册哨兵: $s"; serr=$((serr+1)); }
    done < <(jq -r '.dependencies.sentinels[] // empty' "$mf" 2>/dev/null || true)
  done < <(find "$REPO_DIR/extensions/skills/builtin" -name "manifest.json" 2>/dev/null || true)
  [[ $serr -eq 0 ]] && pass "所有哨兵引用均在注册表中"

  # L2-3: Playbook skills → registry
  echo -e "\n${CYAN}── Playbook Skill 引用检查 ──${NC}"
  local pserr=0
  while IFS= read -r yf; do
    local name; name=$(basename "$yf" .yaml 2>/dev/null || echo "unknown")
    local skills
    skills=$(node -e "
      const y = require('js-yaml'), fs = require('fs');
      const doc = y.load(fs.readFileSync('$yf','utf-8'));
      if (!doc || !doc.steps) process.exit(0);
      doc.steps.forEach(s => { if (s.skill) console.log(s.skill); });
    " 2>/dev/null || true)
    while IFS= read -r sk; do
      [[ -z "$sk" ]] && continue
      grep -qxF "$sk" <<< "$REG_SKILLS" 2>/dev/null || { warn "Playbook $name 引用了未注册 Skill: $sk"; pserr=$((pserr+1)); }
    done <<< "$skills"
  done < <(find "$REPO_DIR/extensions/playbooks/builtin" -name "*.yaml" 2>/dev/null || true)
  [[ $pserr -eq 0 ]] && pass "所有 Playbook Skill 引用均在注册表中"
}

# ═══ L3: 语义检查（手动） ═══
l3_checks() {
  echo -e "\n${CYAN}═══ L3 语义检查（手动） ═══${NC}"
  info "ME 概念 × 42边语义等价 → 待实现"
  info "专家提示词 PLACEHOLDER × Playbook contextRequirements → 待实现"
}

# ═══ 主流程 ═══
mkdir -p "$(dirname "$HEALTH_LOG")" 2>/dev/null || true
touch "$HEALTH_LOG" 2>/dev/null || true

echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  集成测试契约检查 — $(date +%Y-%m-%d\ %H:%M:%S)${NC}"
echo -e "${CYAN}══════════════════════════════════════════════${NC}"

if $L3_ONLY; then
  l3_checks
else
  l1_checks
  l2_checks
fi

echo ""
if [[ $errors -gt 0 ]]; then
  echo -e "${RED}❌ $errors 个 error 级别问题${NC}" >&2
  echo "[$(date +%Y-%m-%dT%H:%M:%S)] FAILED ($errors errors)" >> "$HEALTH_LOG"
  exit 1
else
  echo -e "${GREEN}✅ 全部检查通过${NC}"
  echo "[$(date +%Y-%m-%dT%H:%M:%S)] PASSED" >> "$HEALTH_LOG"
  exit 0
fi
