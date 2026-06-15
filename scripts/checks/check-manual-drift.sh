#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# pre-commit 硬阻断: 手册漂移检测 (快速版, <2s)
#
# 挂在: pre-commit
# 原则: 只做快速 grep 对比, 不做全量代码扫描
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

MANUAL=$(find docs/ -name "SYNOVA-MASTER-全量对齐手册*.html" 2>/dev/null | sort -r | head -1)
if [ -z "$MANUAL" ]; then
  echo -e "  ${YELLOW}⚠  全量对齐手册未找到, 跳过漂移检测${RESET}"
  exit 0
fi

DRIFTS=""
HAD_DRIFT=0

# ── 检查 1: 专家数量 ──
# 手册说 7 位专家 → 代码实际?
MANUAL_EXPERTS=$(grep -oP '[67] 位专家|[67] 个专家' "$MANUAL" 2>/dev/null | head -1 || true)
if echo "$MANUAL_EXPERTS" | grep -q "7"; then
  # 从 ExpertType union 提取诊断专家类型 (排除 knowledge)
  ACTUAL_EXPERTS=$(grep "ExpertType\s*=" src/orchestrator/subagent-coordinator.ts 2>/dev/null \
    | grep -oP "'[a-z_]+'" | grep -v "knowledge" | sort -u | wc -l | tr -d ' ' || echo "?")
  if [ "${ACTUAL_EXPERTS:-0}" -gt 7 ] 2>/dev/null; then
    DRIFTS="${DRIFTS}  手册: 7 位专家 → 代码: ${ACTUAL_EXPERTS} 位 (需更新手册第4章)"$'\n'
    HAD_DRIFT=1
  fi
fi

# ── 检查 2: SOG 节点类型 ──
# 手册说 14 种节点 → 代码实际?
if grep -q "14 种节点\|14种节点" "$MANUAL" 2>/dev/null; then
  ACTUAL_NODES=$(grep -cE "^\s*[A-Z_]+\s*=" packages/sog-core/src/sog-core-schema.ts 2>/dev/null | head -1 | tr -d ' ' || echo "?")
  # 粗略估计: 枚举中大写键的数量
  ACTUAL_NODES=$(grep -oP "SOGNodeType\.\w+" packages/sog-core/src/sog-core-schema.ts 2>/dev/null | sort -u | wc -l | tr -d ' ' || echo "?")
  if [ "${ACTUAL_NODES:-14}" -gt 14 ] 2>/dev/null; then
    DRIFTS="${DRIFTS}  手册: 14 种节点 → 代码: ~${ACTUAL_NODES} 种 (需更新手册第7章, 新增 BusinessModel)"$'\n'
    HAD_DRIFT=1
  fi
fi

# ── 检查 3: 调度框架存在性 ──
# 只在 "调度框架" 和 "尚未建设/未建设" 出现在同一行时才报警
SCHEDULER_DRIFT=$(grep -n "调度框架.*尚未建设\|调度框架.*未建设\|CronScheduler.*尚未建设\|SentinelRunner.*未建设" "$MANUAL" 2>/dev/null || true)
if [ -n "$SCHEDULER_DRIFT" ]; then
  if [ -f "src/sentinel/runner.ts" ] && grep -q "class SentinelRunner" src/sentinel/runner.ts 2>/dev/null; then
    if [ -f "src/cron/scheduler.ts" ] && grep -q "class CronScheduler" src/cron/scheduler.ts 2>/dev/null; then
      DRIFT_COUNT=$(echo "$SCHEDULER_DRIFT" | grep -c . 2>/dev/null) || DRIFT_COUNT=0
      DRIFTS="${DRIFTS}  手册: '调度框架尚未建设' → 代码: SentinelRunner + CronScheduler 已实现"$'\n'
      DRIFTS="${DRIFTS}    需更新: (${DRIFT_COUNT} 处需修正)"$'\n'
      HAD_DRIFT=1
    fi
  fi
fi

# ── 输出 ──
if [ "$HAD_DRIFT" -eq 0 ]; then
  echo -e "  ${GREEN}✅ 手册漂移: 无 (代码与手册一致)${RESET}"
  exit 0
else
  echo -e "  ${RED}❌ 手册漂移检测 (硬阻断): 代码已超前于手册${RESET}"
  echo -e "$DRIFTS"
  echo ""
  echo "  修复: 更新 docs/SYNOVA-MASTER-全量对齐手册-*.html 中的数字和状态标记"
  echo "  手册是唯一真相源 — 不允许手册与代码不同步"
  exit 1
fi
