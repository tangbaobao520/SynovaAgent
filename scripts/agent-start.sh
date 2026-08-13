#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# agent-start.sh — Agent 统一启动入口 (D217)
#
# 4 步启动流程 (Ch6 §6.2 + D219):
#   Step 0: 门禁自检 — check-gates-v2.py (可选)
#   Step 1: 环境验证 — validate-env.sh
#   Step 2: 契约门禁 — run-contract-gate.ts (如 .codex/contracts 存在)
#   Step 3: 写入锁准备 — mkdir -p .write-locks
#   Final:   exec npx tsx src/index.ts
#
# 支持 --dry-run: 跳过 final exec（用于测试验证流程）
#
# 接线:
#   D217 validate-env.sh — Step 1 调用
#   D215 contract-gate.ts — Step 2 调用
#   D209 write_lock.py — Step 3 初始化目录
#   package.json "dev" → 此脚本
# ═══════════════════════════════════════════════════════════════════════════════

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ─── 解析参数 ───
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo "[DRY-RUN] agent-start.sh running in dry-run mode"
fi

echo ""
echo "========================================"
echo "  SynovaAgent 启动中..."
echo "========================================"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 0a: 控制塔信号初始化 — D230
# ═══════════════════════════════════════════════════════════════════════════════

echo "[0/5] 控制塔信号初始化..."
EMIT="$ROOT/scripts/control-tower/emit-signal.py"
if [ -f "$EMIT" ]; then
  python "$EMIT" gatekeeper green "startup_check"
  python "$EMIT" context-injector yellow "pending_first_injection"
  python "$EMIT" contract-archiver yellow "pending_first_extract"
  python "$EMIT" write-lock green "lock_service_ready"
  python "$EMIT" env-validator green "env_snapshot_available"
  echo "  [OK] 控制塔信号已初始化"
else
  echo "  [SKIP] emit-signal.py 不存在 — 跳过"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 0b: 门禁自检 — D219 (附录 A v2.0  §三-四)
# ═══════════════════════════════════════════════════════════════════════════════

echo "[1/5] 门禁检查..."
if [ -f "$ROOT/scripts/audit/check-gates-v2.py" ]; then
  if python "$ROOT/scripts/audit/check-gates-v2.py" --quiet; then
    echo "  [PASS] 门禁报告已更新 → .codex/signals/gate-status.json"
  else
    echo "  [WARN] 门禁检查失败 — 不影响启动（降级）"
  fi
else
  echo "  [SKIP] check-gates-v2.py 不存在 — 跳过"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 1: 环境验证
# ═══════════════════════════════════════════════════════════════════════════════

echo "[2/5] 环境验证..."
if bash "$ROOT/scripts/validate-env.sh"; then
  echo "  [PASS] 环境验证通过"
else
  echo "  [FAIL] 环境验证未通过 — 请先运行 'python scripts/control-tower/env_validator.py snapshot' 更新快照"
  exit 1
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 2: 契约门禁
# ═══════════════════════════════════════════════════════════════════════════════

echo "[3/5] 契约门禁..."
if [ -d "$ROOT/.codex/contracts" ] && [ "$(ls -A "$ROOT/.codex/contracts" 2>/dev/null | grep -v '^archive$')" ]; then
  if [ -f "$ROOT/scripts/run-contract-gate.ts" ]; then
    if npx tsx "$ROOT/scripts/run-contract-gate.ts"; then
      echo "  [PASS] 契约门禁通过"
    else
      echo "  [FAIL] 契约门禁未通过 — Agent 拒绝启动"
      exit 1
    fi
  else
    echo "  [WARN] run-contract-gate.ts not found — skipping (degraded)"
  fi
else
  echo "  [SKIP] 无待验契约，跳过"
fi
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Step 3: 写入锁准备
# ═══════════════════════════════════════════════════════════════════════════════

echo "[4/5] 写入锁准备..."
mkdir -p "$ROOT/.write-locks"
echo "  [OK] .write-locks/ 就绪"
echo ""

# ═══════════════════════════════════════════════════════════════════════════════
# Final: Agent 启动
# ═══════════════════════════════════════════════════════════════════════════════

echo "========================================"
echo "  5 步启动完成，进入主循环..."
echo "========================================"
echo ""

if $DRY_RUN; then
  echo "[DRY-RUN] Skipping exec npx tsx src/index.ts"
  exit 0
fi

exec npx tsx "$ROOT/src/index.ts"
