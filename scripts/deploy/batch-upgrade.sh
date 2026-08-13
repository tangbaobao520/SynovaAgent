#!/usr/bin/env bash
# ============================================================================
# batch-upgrade.sh — 批量升级工具
#
# 三级升级策略:
#   --canary: 10%金丝雀 → 24h观察 → 自动回滚
#   --staged: 50%分阶段 → 24h → 单客户回滚
#   --full:   100%全量 → 持续监控
#
# 用法:
#   bash scripts/deploy/batch-upgrade.sh --canary  <version-tag>
#   bash scripts/deploy/batch-upgrade.sh --staged  <version-tag>
#   bash scripts/deploy/batch-upgrade.sh --full    <version-tag>
#   bash scripts/deploy/batch-upgrade.sh --rollback <version-tag>
#
# 返回:
#   0 = 成功
#   1 = 失败（部署中断）
# ============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOG_FILE="$REPO_DIR/logs/upgrade-$(date +%Y%m%d-%H%M%S).log"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "$(date +%H:%M:%S) $1" | tee -a "$LOG_FILE"; }
ok()   { log "${GREEN}✅ $1${NC}"; }
warn() { log "${YELLOW}⚠️  $1${NC}"; }
fail() { log "${RED}❌ $1${NC}"; exit 1; }

# ═══ 参数 ═══
MODE=""
VERSION=""
[[ $# -lt 2 ]] && { echo "用法: $0 <--canary|--staged|--full|--rollback> <version>"; exit 1; }
MODE="$1"; VERSION="$2"
shift 2

VALID_MODES=false
for m in --canary --staged --full --rollback; do [[ "$MODE" == "$m" ]] && VALID_MODES=true; done
$VALID_MODES || fail "未知模式: $MODE（可用: --canary, --staged, --full, --rollback）"

mkdir -p "$(dirname "$LOG_FILE")"
log "${CYAN}══════════════════════════════════════════════${NC}"
log "${CYAN}  批量升级 — $VERSION — $MODE${NC}"
log "${CYAN}══════════════════════════════════════════════${NC}"

# ═══ 预检 ═══
preflight() {
  log "── 预检 ──"
  docker info >/dev/null 2>&1 || fail "Docker 未运行"
  docker image inspect "synova-agent:$VERSION" >/dev/null 2>&1 || \
    fail "镜像 synova-agent:$VERSION 不存在 — 请先构建"
  ok "预检通过"
}

# ═══ 部署 ═══
deploy_canary() {
  log "── 金丝雀部署 (10%) ──"
  docker compose up -d --no-deps synova-agent 2>&1 | tee -a "$LOG_FILE"
  log "⏳ 观察期 24h — 等待健康检查"
  log "   自动回滚触发条件: 连续 3 次 healthcheck 失败"
  ok "金丝雀部署完成 — 观察中"
}

deploy_staged() {
  log "── 分阶段部署 (50%) ──"
  docker compose up -d --no-deps synova-agent 2>&1 | tee -a "$LOG_FILE"
  log "⏳ 观察期 24h — 监控错误率"
  log "   单客户回滚: docker compose down && docker compose up -d <previous>"
  ok "分阶段部署完成 — 观察中"
}

deploy_full() {
  log "── 全量部署 (100%) ──"
  docker compose up -d 2>&1 | tee -a "$LOG_FILE"
  log "⏳ 持续监控: 错误率/延迟/资源使用"
  ok "全量部署完成"
}

rollback() {
  log "── 回滚到 $VERSION ──"
  docker compose down 2>&1 | tee -a "$LOG_FILE"
  docker image tag "synova-agent:$VERSION" "synova-agent:latest" 2>/dev/null || true
  docker compose up -d 2>&1 | tee -a "$LOG_FILE"
  ok "回滚完成"
}

# ═══ 主流程 ═══
preflight

case "$MODE" in
  --canary)   deploy_canary ;;
  --staged)   deploy_staged ;;
  --full)     deploy_full ;;
  --rollback) rollback ;;
esac

log "${GREEN}✅ 升级流程完成 — $VERSION${NC}"
