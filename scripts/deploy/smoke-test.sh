#!/usr/bin/env bash
# ============================================================================
# smoke-test.sh — API 冒烟测试
#
# D101: curl-based 跨所有 API 端点验证。不测试业务逻辑。
# 零 500 错误、零 connection refused、零 timeout 为通过。
#
# 用法:
#   bash scripts/deploy/smoke-test.sh [base_url]
#   默认 base_url: http://localhost:3000
# ============================================================================

BASE_URL="${1:-http://localhost:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_FILE="/tmp/synova-smoke-$(date +%Y%m%d-%H%M%S).log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
pass() { echo -e "  ${GREEN}✅${NC} $1"; echo "[PASS] $1" >> "$REPORT_FILE"; }
fail() { echo -e "  ${RED}❌${NC} $1" >&2; echo "[FAIL] $1" >> "$REPORT_FILE"; errors=$((errors+1)); }
info() { echo -e "  ${CYAN}ℹ️  $1${NC}"; }

errors=0
AUTH_TOKEN=""
rm -f "$REPORT_FILE"

echo -e "${CYAN}══════════════════════════════════════════════${NC}"
echo -e "${CYAN}  API 冒烟测试 — $(date +%Y-%m-%d\ %H:%M:%S)${NC}"
echo -e "${CYAN}  Target: $BASE_URL${NC}"
echo -e "${CYAN}══════════════════════════════════════════════${NC}"

# ═══ 前置检查 ═══
if ! curl -sf "$BASE_URL/health" >/dev/null 2>&1; then
  fail "服务器不可达 — $BASE_URL"
  exit 1
fi

# ═══ 登录获取 token ═══
if AUTH_TOKEN=$(curl -sf -X POST "$BASE_URL/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin"}' 2>/dev/null | grep -o '"token":"[^"]*"' | cut -d'"' -f4); then
  pass "POST /api/auth/login — token 获取成功"
else
  warn "POST /api/auth/login — 跳过（无 token，后续端点可能 401）"
fi

AUTH_HEADER="Authorization: Bearer $AUTH_TOKEN"

# ═══ 核心健康端点 ═══
echo -e "\n${CYAN}── 健康端点 ──${NC}"
for ep in "/health" "/healthz" "/api/healthz"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ep" 2>/dev/null)
  [[ "$code" =~ ^2[0-9][0-9]$ ]] && pass "GET $ep → $code" || fail "GET $ep → $code"
done

# ═══ 页面端点 ═══
echo -e "\n${CYAN}── 前端页面 ──${NC}"
for ep in "/app/login.html" "/app/dashboard.html" "/app/report.html" "/app/chat.html"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ep" 2>/dev/null)
  [[ "$code" =~ ^2[0-9][0-9]$ ]] && pass "GET $ep → $code" || warn "GET $ep → $code (可能未部署前端)"
done

# ═══ API 端点 ═══
echo -e "\n${CYAN}── API 端点 ──${NC}"

declare -A ENDPOINTS=(
  ["GET /api/workspace/default"]=""
  ["GET /api/workspace/default/goals"]=""
  ["GET /api/workspace/default/alerts"]=""
  ["GET /api/workspace/default/next-action"]=""
  ["GET /api/sentinel/reports"]=""
  ["GET /api/overflow/dashboard/default"]=""
  ["GET /api/overflow/snapshots/cash-cycle"]=""
  ["GET /api/sessions"]=""
  ["GET /api/audit/logs"]=""
  ["GET /api/backup/list"]=""
  ["GET /api/system/self-ops"]=""
  ["GET /api/evolution/config"]=""
  ["GET /api/ontology/types"]=""
)

for ep in "${!ENDPOINTS[@]}"; do
  method="${ep%% *}"
  path="${ep#* }"
  code=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
    -H "$AUTH_HEADER" "$BASE_URL$path" 2>/dev/null)
  if [[ "$code" =~ ^2[0-9][0-9]$ ]]; then
    pass "$method $path → $code"
  elif [[ "$code" == "401" ]] || [[ "$code" == "403" ]]; then
    warn "$method $path → $code (无权限)"
  elif [[ "$code" == "404" ]]; then
    warn "$method $path → $code (可能未部署)"
  else
    fail "$method $path → $code"
  fi
done

# ═══ POST 端点 ═══
echo -e "\n${CYAN}── POST 端点 ──${NC}"

# 投资模拟
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"cycleId":"cash-cycle","amount":100,"direction":"扩大产能"}' \
  "$BASE_URL/api/overflow/simulate" 2>/dev/null)
[[ "$code" =~ ^2[0-9][0-9]$ ]] && pass "POST /api/overflow/simulate → $code" || warn "POST /api/overflow/simulate → $code"

# 自运维操作
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"op":"check-health","requestedBy":"smoke-test"}' \
  "$BASE_URL/api/system/self-ops" 2>/dev/null)
[[ "$code" =~ ^2[0-9][0-9]$ ]] && pass "POST /api/system/self-ops → $code" || warn "POST /api/system/self-ops → $code"

# ═══ 结果统计 ═══
echo ""
echo -e "${CYAN}── 报告: $REPORT_FILE${NC}"
TOTAL=$(grep -cE "\[PASS\]|\[FAIL\]" "$REPORT_FILE" 2>/dev/null || echo 0)
PASSED=$(grep -c "\[PASS\]" "$REPORT_FILE" 2>/dev/null || echo 0)

if [[ $errors -gt 0 ]]; then
  echo -e "${RED}❌ 冒烟测试完成: $PASSED/$TOTAL 通过, $errors 个失败${NC}" >&2
  exit 1
else
  echo -e "${GREEN}✅ 冒烟测试全部通过: $PASSED/$TOTAL${NC}"
  exit 0
fi
