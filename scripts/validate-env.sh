#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# validate-env.sh — 启动前环境校验 (D217)
#
# 调用 D211 env_validator.py validate，检查当前环境与 .codex/env-snapshot.json 一致。
# 降级: env_validator.py 不存在 → 跳过校验 + 告警 (不阻断启动)
#
# 接线:
#   D211: scripts/control-tower/env_validator.py — validate 命令
#   D217: agent-start.sh Step 1 调用此脚本
# ═══════════════════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$SCRIPT_DIR/control-tower/env_validator.py"
SNAPSHOT=".codex/env-snapshot.json"

# ─── 降级: 验证器不存在 ───
if [ ! -f "$VALIDATOR" ]; then
  echo "[WARN] env_validator.py not found — skipping env validation (degraded)"
  exit 0
fi

# ─── 降级: 快照文件不存在 ───
if [ ! -f "$SNAPSHOT" ]; then
  echo "[WARN] env-snapshot.json not found — run 'python env_validator.py snapshot' first (degraded)"
  exit 0
fi

# ─── 执行环境验证 ───
python "$VALIDATOR" validate
exit $?
