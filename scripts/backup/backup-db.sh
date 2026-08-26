#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# backup-db.sh — D335 synova.db 异地备份（iCloud Drive）
#
# 背景: 2026-08-14 审计发现 synova.db（企业诊断数据）只存在于 Mac 本地磁盘，
#       GitHub 上没有（数据不入 git）；本地 backups/ 也是同盘备份——机器损坏
#       即数据全失。代码有三地备份（GitHub+Mac+Win），数据必须同样有异地副本。
#
# 机制:
#   - sqlite3 ".backup" 生成一致性快照（在线备份，不锁库不损坏）
#   - 先写临时文件再 mv → 原子落盘（防备份写到一半 crash 留坏文件）
#   - 保留最近 RETENTION(14) 份，按文件名时间戳轮转删除旧份
#   - 备份后 PRAGMA integrity_check 验证副本可打开
#   - 追加日志到目标目录 backup.log + stdout（静默降级禁止 — 铁律 11）
#
# 用法: bash backup-db.sh [源db] [目标目录]
#       默认源: <repo>/data/synova.db
#       默认目标: ~/Library/Mobile Documents/com~apple~CloudDocs/SynovaAgent-backups
#       目标注入: SYNO_BACKUP_DIR 环境变量（测试隔离）
# 退出码: 0 = 备份成功 / 1 = 失败（含具体原因）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
RETENTION="${SYNO_BACKUP_RETENTION:-14}"

SRC_DB="${1:-$REPO_ROOT/data/synova.db}"
ICLOUD_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/SynovaAgent-backups"
DEST_DIR="${SYNO_BACKUP_DIR:-$ICLOUD_DIR}"
TIMESTAMP="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
DEST_FILE="$DEST_DIR/synova-backup-$TIMESTAMP.db"
TMP_FILE="$DEST_DIR/.tmp-synova-backup-$TIMESTAMP.db"
LOG_FILE="$DEST_DIR/backup.log"
HEALTH_FILE="$REPO_ROOT/.claude/backup-health.json"

# ── 健康状态落盘（trap EXIT：成功/失败都写，供 CTO 开工 + weekly-selfcheck 读取）──
# 2026-08-27 P0 数据事故教训：备份失败曾静默 7 天无告警 → 状态落盘到仓库内可见位置
write_health() {
  local rc=$?
  if [ "$rc" -eq 0 ] && [ -n "${DEST_FILE:-}" ]; then
    printf '{"status":"ok","last_success":"%s","db_bytes":%s}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      "$(stat -f%z "$DEST_FILE" 2>/dev/null || echo 0)" > "$HEALTH_FILE" 2>/dev/null || true
  else
    printf '{"status":"fail","last_failure":"%s","exit_code":%s}\n' \
      "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rc" > "$HEALTH_FILE" 2>/dev/null || true
  fi
}
trap write_health EXIT

log_msg() { # <msg>
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1"
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $1" >> "$LOG_FILE" 2>/dev/null || true
}

# ── 前置检查 ──
if [[ ! -f "$SRC_DB" ]]; then
  echo -e "${RED}❌ 源数据库不存在: $SRC_DB${RESET}" >&2
  exit 1
fi
if ! command -v sqlite3 >/dev/null 2>&1; then
  echo -e "${RED}❌ sqlite3 不可用 — 无法安全备份（.backup 需 sqlite3）${RESET}" >&2
  exit 1
fi
if [[ ! -d "$DEST_DIR" ]]; then
  if [[ "$DEST_DIR" == "$ICLOUD_DIR" ]] && [[ ! -d "$HOME/Library/Mobile Documents/com~apple~CloudDocs" ]]; then
    echo -e "${YELLOW}⚠️  iCloud Drive 不存在 — 回退本地 offsite 目录（仍在同盘, 仅应急）${RESET}"
    DEST_DIR="$REPO_ROOT/data/backups-offsite"
  fi
  mkdir -p "$DEST_DIR" 2>/dev/null || {
    echo -e "${RED}❌ 目标目录不可创建: $DEST_DIR${RESET}" >&2
    exit 1
  }
fi

# ── 备份（临时文件 → 原子改名）──
if ! sqlite3 "$SRC_DB" ".backup '$TMP_FILE'" 2>/tmp/bss-sqlite-err.txt; then
  echo -e "${RED}❌ 备份失败: sqlite3 .backup 出错${RESET}" >&2
  cat /tmp/bss-sqlite-err.txt >&2 2>/dev/null || true
  rm -f "$TMP_FILE" 2>/dev/null # swallow-ok: 清理半成品备份, 失败无害
  exit 1
fi
mv "$TMP_FILE" "$DEST_FILE" 2>/dev/null || {
  echo -e "${RED}❌ 备份文件落盘失败: $DEST_FILE${RESET}" >&2
  rm -f "$TMP_FILE" 2>/dev/null # swallow-ok: 清理半成品备份, 失败无害
  exit 1
}

# ── 完整性验证（PRAGMA integrity_check 应输出 ok）──
INTEGRITY="$(sqlite3 "$DEST_FILE" 'PRAGMA integrity_check;' 2>/dev/null | head -1 || echo "")"
if [[ "$INTEGRITY" != "ok" ]]; then
  echo -e "${RED}❌ 备份完整性校验失败: ${INTEGRITY:-<empty>} — 副本已删除${RESET}" >&2
  rm -f "$DEST_FILE" 2>/dev/null # swallow-ok: 清理校验失败的副本, 失败无害
  log_msg "INTEGRITY_FAIL $DEST_FILE integrity=$INTEGRITY"
  exit 1
fi

# ── 轮转: 保留最近 RETENTION 份 ──
COUNT=$(ls -1 "$DEST_DIR"/synova-backup-*.db 2>/dev/null | wc -l | tr -d ' ') # swallow-ok: 无历史备份时 ls 返回非零属正常路径
if [[ "$COUNT" -gt "$RETENTION" ]]; then
  ls -1t "$DEST_DIR"/synova-backup-*.db 2>/dev/null | tail -n +$((RETENTION + 1)) | while IFS= read -r old; do # swallow-ok: 同上, ls 空结果正常
    rm -f "$old" 2>/dev/null && log_msg "ROTATED $old"
  done
fi

log_msg "BACKUP_OK $DEST_FILE ($(du -h "$DEST_FILE" 2>/dev/null | cut -f1 || echo '?'))"
echo -e "${GREEN}✅ 备份成功: $DEST_FILE (保留 $RETENTION 份)${RESET}"
exit 0
