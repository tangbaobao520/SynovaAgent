#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# dev-doc-gatekeeper.sh — Dev Doc 校验网守 (D206)
#
# 权威文档 #17 Ch3 S1.1：在 dev doc 分发给 Claude Code 前，必须通过 5 项
# 机械验证。防止已知错误模式传播到实现阶段。
#
# 用法:
#   bash dev-doc-gatekeeper.sh <path-to-dev-doc.md>
#
# 退出码:
#   0 = ALL PASS（可以分发）
#   1 = FAIL（不能分发 — 有阻断项）
#   2 = DEGRADED（检查自身降级，允许分发但告警）
#
# 5 项强制检查:
#   C1: Edge ID 存在性 — 每个 E-XX 在代码中真实存在
#   C2: 文件路径存在性 — 每个 src/extensions/packages 路径真实存在
#   C3: Test Requirements 章节 — 包含 L1/L2a/L2b/L2c
#   C4: Wiring Verification 章节 — 包含调用方文件路径
#   C5: Authority Doc Verification 章节 — 包含来源路径引用
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ═══ 颜色 ═══
if [[ -t 1 ]]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; NC=''
fi

# ═══ 参数 ═══
DOC_PATH="${1:-}"
if [[ -z "$DOC_PATH" ]]; then
  echo "用法: dev-doc-gatekeeper.sh <path-to-dev-doc.md>"
  exit 1
fi
if [[ ! -f "$DOC_PATH" ]]; then
  echo -e "${RED}❌ 文件未找到: $DOC_PATH${NC}"
  exit 1
fi

OVERALL_PASS=true
HAS_DEGRADED=false

# ═══ 工具函数 ═══

check_pass() { echo -e "  ${GREEN}✅${NC} $1"; }
check_fail() { echo -e "  ${RED}❌${NC} $1"; OVERALL_PASS=false; }
check_degrade() { echo -e "  ${YELLOW}⚠${NC} $1"; HAS_DEGRADED=true; }

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Dev Doc Gatekeeper — 文档校验网守"
echo "  文档: $DOC_PATH"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════
# C1: Edge ID 存在性
# ═══════════════════════════════════════════════════════════

echo "── [C1] Edge ID 存在性 ──"

C1_FAIL=0; C1_TOTAL=0
EDGE_IDS=$(grep -oP 'E-\d{2}' "$DOC_PATH" 2>/dev/null | sort -u || true)

if [[ -z "$EDGE_IDS" ]]; then
  check_pass "C1: 文档中未引用 Edge ID（跳过）"
else
  # 预加载有效 Edge ID 集合（从 42 边 JSON 定义的文件名 + 文档中提取）
  VALID_FILE=$(mktemp)
  # 从文件名提取（文件名本身包含 E-XX，如 assumption_triggered_reallocation.json 不含 E 编号）
  # 从文档目录提取
  grep -rohP 'E-\d{2}' "$PROJECT_ROOT/extensions/ontology/edge-types/" --include="*.json" 2>/dev/null > "$VALID_FILE" || true
  grep -rohP 'E-\d{2}' "$PROJECT_ROOT/docs/synova/research/权威文档01-本体层因果体系权威规范-20260714/" --include="*.md" 2>/dev/null >> "$VALID_FILE" || true
  sort -u -o "$VALID_FILE" "$VALID_FILE"

  for edge_id in $EDGE_IDS; do
    ((C1_TOTAL++))
    if grep -qF "$edge_id" "$VALID_FILE" 2>/dev/null; then
      :  # Edge ID 有效
    else
      check_fail "C1: Edge ID $edge_id 在代码库中不存在"
      ((C1_FAIL++))
    fi
  done
  rm -f "$VALID_FILE"

  if [[ $C1_FAIL -eq 0 ]]; then
    check_pass "C1: 全部 $C1_TOTAL 个 Edge ID 验证通过"
  else
    echo "        ($C1_FAIL/$C1_TOTAL 个 Edge ID 未通过)"
  fi
fi
echo ""

# ═══════════════════════════════════════════════════════════
# C2: 文件路径存在性
# ═══════════════════════════════════════════════════════════

echo "── [C2] 文件路径存在性 ──"

C2_FAIL=0; C2_TOTAL=0
FILE_PATHS=$(grep -oP '\b(src|extensions|packages|app)/[^\s\)\]"'\'',;]+' "$DOC_PATH" 2>/dev/null | sort -u || true)

if [[ -z "$FILE_PATHS" ]]; then
  check_pass "C2: 文档中未引用文件路径（跳过）"
else
  for fp in $FILE_PATHS; do
    ((C2_TOTAL++))
    full_path="$PROJECT_ROOT/$fp"
    if [[ ! -e "$full_path" ]]; then
      check_fail "C2: 文件不存在: $fp"
      ((C2_FAIL++))
    fi
  done
  if [[ $C2_FAIL -eq 0 ]]; then
    check_pass "C2: 全部 $C2_TOTAL 个文件路径验证通过"
  else
    echo "        ($C2_FAIL/$C2_TOTAL 个路径未找到)"
  fi
fi
echo ""

# ═══════════════════════════════════════════════════════════
# C3: Test Requirements 章节
# ═══════════════════════════════════════════════════════════

echo "── [C3] Test Requirements 章节 ──"

if grep -qiE "Test Requirements|Test Specification|测试要求" "$DOC_PATH" 2>/dev/null; then
  if grep -qiE '\bL1\b' "$DOC_PATH" 2>/dev/null; then
    check_pass "C3: 包含 Test Requirements 章节 + L1 引用"
  else
    check_fail "C3: 有 Test Requirements 章节但缺少 L1/L2a/L2b/L2c 层级引用"
  fi
else
  check_fail "C3: 缺少 Test Requirements 或 Test Specification 章节"
fi
echo ""

# ═══════════════════════════════════════════════════════════
# C4: Wiring Verification 章节
# ═══════════════════════════════════════════════════════════

echo "── [C4] Wiring Verification 章节 ──"

if grep -qiE "Wiring Verification|接线验证|Iron Law 4|铁律 4" "$DOC_PATH" 2>/dev/null; then
  # 检查是否包含具体文件路径（"/" 或 ".ts"）
  if grep -qiE 'src/|extensions/|\.ts' "$DOC_PATH" 2>/dev/null; then
    check_pass "C4: 包含 Wiring Verification + 调用方文件路径"
  else
    check_fail "C4: 有 Wiring Verification 章节但缺少具体调用方文件路径"
  fi
else
  check_fail "C4: 缺少 Wiring Verification 或 Iron Law 4 章节"
fi
echo ""

# ═══════════════════════════════════════════════════════════
# C5: Authority Doc Verification 章节
# ═══════════════════════════════════════════════════════════

echo "── [C5] Authority Doc Verification 章节 ──"

if grep -qiE "Authority Doc|Auth Doc|权威文档|权威文档原文" "$DOC_PATH" 2>/dev/null; then
  if grep -qiE 'docs/synova/research|packages/|src/' "$DOC_PATH" 2>/dev/null; then
    check_pass "C5: 包含 Authority Doc Verification + 来源路径引用"
  else
    check_fail "C5: 有权威文档引用但缺少具体文件路径"
  fi
else
  check_fail "C5: 缺少 Authority Doc Verification 或 Auth Doc 章节"
fi
echo ""

# ═══════════════════════════════════════════════════════════
# 结果汇总
# ═══════════════════════════════════════════════════════════

echo "═══════════════════════════════════════════════════════════"
echo "  结果汇总"
echo "═══════════════════════════════════════════════════════════"

if $OVERALL_PASS; then
  echo -e "  ${GREEN}✅ ALL PASS${NC} — 文档可以通过分发"
  echo ""
  exit 0
elif $HAS_DEGRADED && $OVERALL_PASS; then
  echo -e "  ${YELLOW}⚠ ALL PASS (有降级)${NC} — 文档可以分发，但建议审查告警"
  echo ""
  exit 0
else
  echo -e "  ${RED}❌ FAIL${NC} — 文档存在阻断项，不能分发"
  echo "  请修复上述 FAIL 项后重新运行"
  echo ""
  exit 1
fi
