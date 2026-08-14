#!/usr/bin/env bash
# A线 产品完整性缺口审计 — 标准化证据收集脚本 v1.0
# 用法: bash _tools/audit-grep.sh
# 输出: _tools/evidence-log.txt （头部含 commit hash + 工作区快照）
# 铁律35: 所有搜索模式写入脚本，不手动拼命令 → 可复现
set -u

export PATH="/usr/bin:/bin:/usr/local/bin:$PATH"

ROOT="D:/novis-backup-20260526/Novis/synova-agent"
cd "$ROOT" || exit 1

OUT="docs/synova/research/A线-产品完整性缺口审计-20260801/_tools/evidence-log.txt"
: > "$OUT"

log() { printf '%s\n' "$1" >> "$OUT"; }
section() { log ""; log "════════ $1 ════════"; }
g() {  # g <标签> <搜索模式> <路径>
  local label="$1" pattern="$2" path="$3"
  log ""
  log "▶ [$label] grep -rn \"$pattern\" $path"
  local out
  out=$(grep -rn --include="*.ts" --include="*.js" --include="*.py" --include="*.sh" \
    -E "$pattern" "$path" 2>/dev/null | grep -v "\.test\." | head -15)
  if [ -n "$out" ]; then
    printf '%s\n' "$out" >> "$OUT"
  else
    log "   (无匹配 → 未接线/不存在的证据)"
  fi
}

# ── 头部：可复现性绑定 ──
log "# A线审计证据日志"
log "时间: $(date '+%Y-%m-%d %H:%M:%S')"
log "commit: $(git rev-parse HEAD 2>/dev/null || echo 'N/A')"
log "--- git status 摘要 ---"
git status --short 2>/dev/null | head -30 >> "$OUT"
log "--- 结束 ---"

# ── 条件A 部署独立 ──
section "条件A 部署独立"
g "A1 安装向导" "welcome|Configure|Test Connection|synova_setup_step" "app/js/setup.js"
g "A2 GA到期日" "ga-expiry|contractExpiry|ga-access" "app/js/admin.js"
g "A3 rbac调用" "canAccessWorkspace|isGaContractExpired" "src"
g "A4 user-store" "user-store|UserStore" "src"
g "A5 租户隔离" "getOrgId|orgId" "src/routes/enterprise.ts"
g "A6 静态服务" "express.static|sendFile" "src/server.ts"

# ── 条件B 诊断自主 ──
section "条件B 诊断自主"
g "B1 诊断启动" "startDiagnosis|diagnosis-launcher|launchDiagnosis" "src"
g "B2 信号聚合消费" "signal-aggregator|SignalAggregator" "src"
g "B3 专家调度" "expert-dispatcher|ExpertDispatcher" "src"
g "B4 direction-monitor接线" "direction-monitor|DirectionMonitor" "src"
g "B5 middle-evolution接线" "middle-evolution-engine|MiddleEvolutionEngine" "src"
g "B6 NCI" "\bNCI\b|non-consensus|NonConsensus|非共识" "src"
g "B7 loop接线" "loop-scheduler|LoopScheduler|registerDefaultLoops" "src"
g "B8 对话入口(im-inbound)" "conversation-engine|ConversationEngine" "src/l1/im-inbound.ts"

# ── 条件C 结论有用 ──
section "条件C 结论有用"
g "C1 报告组装" "report-assembler|ReportAssembler|assembleReport" "src"
g "C2 交叉验证" "cross-validator|CrossValidator|convergence-engine" "src"
g "C3 质量门禁" "quality-firewall|QualityFirewall" "src"
g "C4 知识回流" "knowledge-feedback|KnowledgeFeedback|collectFeedback" "src"
g "C5 Goal闭环" "goal-lifecycle|GoalLifecycle" "src"
g "C6 Proposal" "proposal-engine|ProposalEngine|proposal-store" "src"
g "C7 交互卡片" "interactive-card|InteractiveCard" "src"

# ── 条件D 持续运行 ──
section "条件D 持续运行"
g "D1 cron持久化" "cron_jobs|trigger_type|persistRun" "src/cron"
g "D2 重启恢复" "restart-recovery|RestartRecovery|recoverInterrupted" "src"
g "D3 优雅停机" "graceful-shutdown|GracefulShutdown|drain" "src"
g "D4 心跳" "heartbeat|stalled|HEARTBEAT" "src/loops"
g "D5 故障恢复" "fault-recovery|FaultRecovery" "src"
g "D6 资源监控" "resource-monitor|memory-monitor" "src"

log ""
log "# 结束 — 证据日志完成"
echo "证据日志已写入: $OUT ($(wc -l < "$OUT") 行)"
