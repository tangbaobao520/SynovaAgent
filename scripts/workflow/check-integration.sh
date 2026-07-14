#!/usr/bin/env bash
# ============================================================================
# check-integration.sh — 集成测试契约检查
#
# 第14份权威文档第三章: 11项集成契约 + L1/L2/L3 三层检查
#
# 用法:
#   bash scripts/workflow/check-integration.sh              # L1+L2
#   bash scripts/workflow/check-integration.sh --l3         # L3 语义检查(手动)
#   bash scripts/workflow/check-integration.sh --phase=N    # 按 Phase 过滤
#
# 返回:
#   0 = 全部通过
#   1 = 有 error 级别问题
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
REGISTRY="$REPO_DIR/scripts/workflow/system-registry.json"
HEALTH_LOG="$REPO_DIR/.claude/system-health.log"

# ═══ 颜色 ═══
RED='\033[0;31m'; YELLOW='\033[1;33m'; GREEN='\033[0;32m'; CYAN='\033[0;36m'; NC='\033[0m'
pass() { echo -e "  ${GREEN}✅${NC} $1"; }
warn() { echo -e "  ${YELLOW}⚠️  $1${NC}"; echo "[$(date +%Y-%m-%dT%H:%M:%S)] WARN: $1" >> "$HEALTH_LOG" 2>/dev/null || true; }
fail() { echo -e "  ${RED}❌${NC} $1" >&2; errors=$((errors+1)); }
info() { echo -e "  ${CYAN}ℹ️  $1${NC}"; }

# ═══ 参数解析 ═══
PHASE=""
L3_ONLY=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --phase=*) PHASE="${1#*=}"; shift ;;
    --l3) L3_ONLY=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ═══ 加载注册表 ═══
if [[ ! -f "$REGISTRY" ]]; then
  fail "system-registry.json 不存在 — 请先运行 node _gen_registry.cjs"
  exit 1
fi

# jq required
if ! command -v jq &>/dev/null; then
  echo "❌ jq 未安装 — 请运行: apt-get install jq" >&2
  exit 1
fi

errors=0

REG_EDGES=$(jq -r '.edges[]' "$REGISTRY" | sort)
REG_SENTINELS=$(jq -r '.sentinels[]' "$REGISTRY" | sort)
REG_COMPUTES=$(jq -r '.computes[]' "$REGISTRY" | sort)
REG_SKILLS=$(jq -r '.skills[]' "$REGISTRY" | sort)
REG_PLAYBOOKS=$(jq -r '.playbooks[]' "$REGISTRY" | sort)

# ═════════════════════════════════════════════════════════════════════════════
# L1: 结构性检查 — 零假阳性
# ═════════════════════════════════════════════════════════════════════════════
l1_checks() {
  echo -e "\n${CYAN}═══ L1 结构性检查 ═══${NC}"

  # --- L1-1: JSON 文件格式正确性 ---
  echo -e "\n${CYAN}── JSON 格式检查 ──${NC}"
  local json_errors=0
  while IFS= read -r -d '' f; do
    if ! jq . "$f" >/dev/null 2>&1; then
      fail "JSON 格式错误: $f"
      json_errors=$((json_errors+1))
    fi
  done < <(find "$REPO_DIR/extensions" "$REPO_DIR/.claude" -name "*.json" -not -path "*/node_modules/*" -print0 2>/dev/null || true)
  if [[ $json_errors -eq 0 ]]; then
    pass "所有 JSON 文件格式正确"
  fi

  # --- L1-2: YAML 文件格式正确性 ---
  echo -e "\n${CYAN}── YAML 格式检查 ──${NC}"
  local yaml_errors=0
  while IFS= read -r -d '' f; do
    if ! node -e "require('js-yaml').load(require('fs').readFileSync('$f','utf-8'))" 2>/dev/null; then
      fail "YAML 格式错误: $f"
      yaml_errors=$((yaml_errors+1))
    fi
  done < <(find "$REPO_DIR/extensions" -name "*.yaml" -not -path "*/node_modules/*" -print0 2>/dev/null || true)
  if [[ $yaml_errors -eq 0 ]]; then
    pass "所有 YAML 文件格式正确"
  fi

  # --- L1-3: Sentinel manifest 中 edges 字段值必须在 registry 中 ---
  echo -e "\n${CYAN}── 哨兵边缘引用检查 ──${NC}"
  local edge_errors=0
  while IFS= read -r -d '' mf; do
    local name
    name=$(basename "$(dirname "$mf")")
    if jq -e '.edges // empty' "$mf" >/dev/null 2>&1; then
      while IFS= read -r e; do
        if ! echo "$REG_EDGES" | grep -qxF "$e"; then
          fail "哨兵 $name 引用了未注册的边: $e"
          edge_errors=$((edge_errors+1))
        fi
      done < <(jq -r '.edges[] // empty' "$mf")
    fi
  done < <(find "$REPO_DIR/extensions/sentinels" -name "manifest.json" -not -path "*/_*/*" -print0 2>/dev/null || true)
  if [[ $edge_errors -eq 0 ]]; then
    pass "所有哨兵边缘引用均在注册表中"
  fi

  # --- L1-4: Skill manifest dependencies.edges 必须在 registry 中 ---
  echo -e "\n${CYAN}── Skill 边缘引用检查 ──${NC}"
  local skill_edge_errors=0
  while IFS= read -r -d '' mf; do
    local name
    name=$(basename "$(dirname "$mf")")
    if jq -e '.dependencies.edges // empty' "$mf" >/dev/null 2>&1; then
      while IFS= read -r e; do
        if ! echo "$REG_EDGES" | grep -qxF "$e"; then
          fail "Skill $name 引用了未注册的边: $e"
          skill_edge_errors=$((skill_edge_errors+1))
        fi
      done < <(jq -r '.dependencies.edges[] // empty' "$mf")
    fi
  done < <(find "$REPO_DIR/extensions/skills/builtin" -name "manifest.json" -print0 2>/dev/null || true)
  if [[ $skill_edge_errors -eq 0 ]]; then
    pass "所有 Skill 边缘引用均在注册表中"
  fi

  # --- L1-5: Playbook YAML edge references ---
  echo -e "\n${CYAN}── Playbook 边缘引用检查 ──${NC}"
  local pb_edge_errors=0
  while IFS= read -r -d '' yf; do
    local name
    name=$(basename "$yf" .yaml)
    if node -e "
      const y = require('js-yaml');
      const fs = require('fs');
      const doc = y.load(fs.readFileSync('$yf','utf-8'));
      if (doc && doc.dependencies && doc.dependencies.edges) {
        doc.dependencies.edges.forEach(e => { if (e.startsWith('E-')) console.log(e); })
      }
    " 2>/dev/null | while IFS= read -r e; do
      if ! echo "$REG_EDGES" | grep -qxF "$e"; then
        fail "Playbook $name 引用了未注册的边: $e"
        pb_edge_errors=$((pb_edge_errors+1))
      fi
    done
  done < <(find "$REPO_DIR/extensions/playbooks/builtin" -name "*.yaml" -print0 2>/dev/null || true)
  if [[ $pb_edge_errors -eq 0 ]]; then
    pass "所有 Playbook 边缘引用均在注册表中"
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# L2: 交叉引用检查
# ═════════════════════════════════════════════════════════════════════════════
l2_checks() {
  echo -e "\n${CYAN}═══ L2 交叉引用检查 ═══${NC}"

  # --- L2-1: Skill dependencies.computes → registry ---
  echo -e "\n${CYAN}── compute 契约引用检查 ──${NC}"
  local comp_errors=0
  while IFS= read -r -d '' mf; do
    local name
    name=$(basename "$(dirname "$mf")")
    if jq -e '.dependencies.computes // empty' "$mf" >/dev/null 2>&1; then
      while IFS= read -r c; do
        if ! echo "$REG_COMPUTES" | grep -qxF "$c"; then
          fail "Skill $name 引用了未注册的 compute 契约: $c"
          comp_errors=$((comp_errors+1))
        fi
      done < <(jq -r '.dependencies.computes[] // empty' "$mf")
    fi
  done < <(find "$REPO_DIR/extensions/skills/builtin" -name "manifest.json" -print0 2>/dev/null || true)
  if [[ $comp_errors -eq 0 ]]; then
    pass "所有 compute 契约引用均在注册表中"
  fi

  # --- L2-2: Skill dependencies.sentinels → registry ---
  echo -e "\n${CYAN}── 哨兵引用检查 ──${NC}"
  local sent_errors=0
  while IFS= read -r -d '' mf; do
    local name
    name=$(basename "$(dirname "$mf")")
    if jq -e '.dependencies.sentinels // empty' "$mf" >/dev/null 2>&1; then
      while IFS= read -r s; do
        if ! echo "$REG_SENTINELS" | grep -qxF "$s"; then
          warn "Skill $name 引用了未注册的哨兵: $s"
          sent_errors=$((sent_errors+1))
        fi
      done < <(jq -r '.dependencies.sentinels[] // empty' "$mf")
    fi
  done < <(find "$REPO_DIR/extensions/skills/builtin" -name "manifest.json" -print0 2>/dev/null || true)
  if [[ $sent_errors -eq 0 ]]; then
    pass "所有哨兵引用均在注册表中"
  fi

  # --- L2-3: Playbook skill references ---
  echo -e "\n${CYAN}── Playbook Skill 引用检查 ──${NC}"
  local pb_skill_errors=0
  while IFS= read -r -d '' yf; do
    local name
    name=$(basename "$yf" .yaml)
    while IFS= read -r skill_ref; do
      [[ -z "$skill_ref" ]] && continue
      if ! echo "$REG_SKILLS" | grep -qxF "$skill_ref"; then
        warn "Playbook $name 引用了未注册的 Skill: $skill_ref"
        pb_skill_errors=$((pb_skill_errors+1))
      fi
    done < <(node -e "
      const y = require('js-yaml');
      const fs = require('fs');
      const doc = y.load(fs.readFileSync('$yf','utf-8'));
      if (doc && doc.steps) {
        doc.steps.forEach(s => { if (s.skill) console.log(s.skill); });
      }
    " 2>/dev/null)
  done < <(find "$REPO_DIR/extensions/playbooks/builtin" -name "*.yaml" -print0 2>/dev/null || true)
  if [[ $pb_skill_errors -eq 0 ]]; then
    pass "所有 Playbook Skill 引用均在注册表中"
  fi

  # --- L2-4: Skill manifest existence check ---
  echo -e "\n${CYAN}── Skill 文件完整性检查 ──${NC}"
  local missing=0
  for skill in $REG_SKILLS; do
    local mf="$REPO_DIR/extensions/skills/builtin/$skill/manifest.json"
    if [[ ! -f "$mf" ]]; then
      fail "Skill $skill 的 manifest.json 不存在"
      missing=$((missing+1))
    fi
  done
  if [[ $missing -eq 0 ]]; then
    pass "所有 Skill 的 manifest.json 均存在"
  fi
}

# ═════════════════════════════════════════════════════════════════════════════
# L3: 语义检查（手动触发，不纳入 CI 自动化）
# ═════════════════════════════════════════════════════════════════════════════
l3_checks() {
  echo -e "\n${CYAN}═══ L3 语义检查（手动） ═══${NC}"
  info "ME 概念 × 42边语义等价 → 待实现（依赖 ME 知识库完成）"
  info "专家提示词 PLACEHOLDER × Playbook contextRequirements → 待实现"
  pass "L3 语义检查占位 — 不影响 CI"
}

# ═════════════════════════════════════════════════════════════════════════════
# 主流程
# ═════════════════════════════════════════════════════════════════════════════

mkdir -p "$(dirname "$HEALTH_LOG")"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  集成测试契约检查 — $(date +%Y-%m-%d\ %H:%M:%S)${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"

# 创建 health log（追加模式）
touch "$HEALTH_LOG"
echo "[$(date +%Y-%m-%dT%H:%M:%S)] check-integration.sh started" >> "$HEALTH_LOG"

if [[ "$L3_ONLY" == true ]]; then
  l3_checks
else
  if [[ -z "$PHASE" || "$PHASE" == "1" ]]; then
    l1_checks
  fi
  if [[ -z "$PHASE" || "$PHASE" == "2" ]]; then
    l2_checks
  fi
fi

# ═══ 结果 ═══
echo ""
if [[ $errors -gt 0 ]]; then
  echo -e "${RED}❌ $errors 个 error 级别问题${NC}" >&2
  echo "[$(date +%Y-%m-%dT%H:%M:%S)] check-integration.sh FAILED ($errors errors)" >> "$HEALTH_LOG"
  exit 1
else
  echo -e "${GREEN}✅ 全部检查通过${NC}"
  echo "[$(date +%Y-%m-%dT%H:%M:%S)] check-integration.sh PASSED" >> "$HEALTH_LOG"
  exit 0
fi
