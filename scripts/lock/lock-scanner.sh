#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# lock-scanner.sh — 孤儿锁扫描器 (D218)
#
# 权威文档 #17 Ch4 §2.3 + 实现表 460.
# 扫描 .write-locks/ 目录，清理 PID 已不存在的孤儿锁。
# 通过 D214 emitSignal 写入信号到 .codex/signals/write-lock.json。
#
# 用法: bash scripts/lock/lock-scanner.sh
# 退出码: 0 = 成功（可能清理了锁），1 = 扫描异常
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_DIR="$PROJECT_ROOT/.write-locks"
SIGNALS_DIR="$PROJECT_ROOT/.codex/signals"

if [[ ! -d "$LOCK_DIR" ]]; then
  echo "{\"cleaned\":0,\"status\":\"skip\",\"reason\":\"lock_dir_not_found\"}"
  exit 0
fi

CLEANED=0
ERRORS=0

for lockfile in "$LOCK_DIR"/*; do
  [[ -f "$lockfile" ]] || continue

  # 读取 PID
  PID=$(python3 -c "
import json
try:
    with open('$lockfile') as f:
        d = json.load(f)
        print(d.get('pid', ''))
except:
    print('')
" 2>/dev/null || echo "")

  if [[ -n "$PID" ]]; then
    # 检查 PID 是否存活 (kill -0 只检查进程存在性，不发送信号)
    if ! kill -0 "$PID" 2>/dev/null; then
      LOCK_NAME=$(basename "$lockfile")
      rm -f "$lockfile"
      echo "CLEANED orphan lock: $LOCK_NAME (PID $PID)"
      ((CLEANED++))
    fi
  else
    # 无 PID 字段或读取失败 → 锁文件损坏，删除
    rm -f "$lockfile"
    ((CLEANED++))
  fi
done

# 通过 D214 发射信号
STATUS="green"
REASON="all_healthy"
if [[ $CLEANED -gt 0 ]]; then
  STATUS="yellow"
  REASON="${CLEANED} orphan locks cleaned"
fi

mkdir -p "$SIGNALS_DIR"
python3 -c "
import json, datetime
signal = {
    'component': 'write-lock',
    'status': '$STATUS',
    'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
    'reason': '$REASON',
    'p0_count': 0,
    'p1_count': 0,
    'p2_count': 0,
}
with open('$SIGNALS_DIR/write-lock.json', 'w') as f:
    json.dump(signal, f, indent=2)
" 2>/dev/null || true

echo "{\"cleaned\":$CLEANED,\"status\":\"$STATUS\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"
