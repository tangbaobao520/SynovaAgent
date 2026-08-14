#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# backup-db.test.sh — D335 异地备份脚本测试
#
# 覆盖（铁律 48: 正常/降级/边界; 铁律 0-2: red→green）:
#   1. 正常备份 → 副本存在且 integrity_check=ok（red: 无脚本 → 127）
#   2. 副本可被 sqlite3 正常打开查询（数据真实可读）
#   3. 轮转: RETENTION=2 时第 3 份落盘后旧份被删 → 剩 2 份
#   4. 源 db 缺失 → exit 1 + 显式错误（非静默）
#   5. 目标目录不可创建 → exit 1 + 显式错误
#   6. 日志: backup.log 追加 BACKUP_OK 记录
#
# 隔离: SYNO_BACKUP_DIR 注入临时目录；SYNO_BACKUP_RETENTION 控制轮转份数。
# 用法: bash tests/control-tower/backup-db.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
BACKUP="$REPO_DIR/scripts/backup/backup-db.sh"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got> <want> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3"; else fail "$3 (got exit=$1, want exit=$2)"; fi
}

TMP=$(mktemp -d /tmp/bdb.XXXXXX)
DEST="$TMP/dest"
SRC="$TMP/src.db"

echo "=== D335 backup-db.sh 测试 ==="

# 造测试库
sqlite3 "$SRC" "CREATE TABLE t(id INTEGER PRIMARY KEY, name TEXT); INSERT INTO t VALUES(1,'synova');" 2>/dev/null # swallow-ok: 测试沙箱造库

# 1. 正常备份
SYNO_BACKUP_DIR="$DEST" bash "$BACKUP" "$SRC" "$DEST" > /tmp/bdb-out.txt 2>&1
EC=$?
assert_exit "$EC" 0 "1. 正常备份 → exit 0"
COPIED=$(ls -1 "$DEST"/synova-backup-*.db 2>/dev/null | wc -l | tr -d ' ') # swallow-ok: 无备份时 ls 非零属正常
[ "${COPIED:-0}" -ge 1 ] && pass "   副本已落盘 ($COPIED 份)" || fail "   副本缺失"

# 2. 副本可读 + integrity
INTEGRITY=$(sqlite3 "$(ls -1t "$DEST"/synova-backup-*.db | head -1)" 'PRAGMA integrity_check;' 2>/dev/null | head -1) # swallow-ok: 校验失败由断言暴露
[ "$INTEGRITY" = "ok" ] && pass "2. 副本 integrity_check=ok" || fail "2. 副本完整性校验失败: $INTEGRITY"
ROW=$(sqlite3 "$(ls -1t "$DEST"/synova-backup-*.db | head -1)" "SELECT name FROM t WHERE id=1;" 2>/dev/null) # swallow-ok: 查询失败由断言暴露
[ "$ROW" = "synova" ] && pass "   副本数据可读 (t.name=synova)" || fail "   副本数据不可读: ${ROW:-<empty>}"

# 3. 轮转: RETENTION=2, 跑 3 次 → 剩 2 份
for i in 1 2 3; do
  sleep 1  # 时间戳秒级唯一
  SYNO_BACKUP_DIR="$DEST" SYNO_BACKUP_RETENTION=2 bash "$BACKUP" "$SRC" "$DEST" > /dev/null 2>&1
done
CNT=$(ls -1 "$DEST"/synova-backup-*.db 2>/dev/null | wc -l | tr -d ' ') # swallow-ok: 无备份时 ls 非零属正常
[ "$CNT" = "2" ] && pass "3. 轮转保留 2 份 (实际 $CNT)" || fail "3. 轮转失败: 实际 $CNT 份 (期望 2)"

# 4. 源缺失 → 显式错误
SYNO_BACKUP_DIR="$DEST" bash "$BACKUP" "$TMP/nonexistent.db" "$DEST" > /tmp/bdb-out4.txt 2>&1
EC=$?
assert_exit "$EC" 1 "4. 源 db 缺失 → exit 1"
grep -q "不存在" /tmp/bdb-out4.txt && pass "   有显式错误信息" || fail "   缺显式错误信息（静默）"

# 5. 目标不可创建 → 显式错误
SYNO_BACKUP_DIR="/proc/nonexistent/dir" bash "$BACKUP" "$SRC" "/proc/nonexistent/dir" > /tmp/bdb-out5.txt 2>&1
EC=$?
assert_exit "$EC" 1 "5. 目标目录不可创建 → exit 1"

# 6. 日志记录
grep -q "BACKUP_OK" "$DEST/backup.log" 2>/dev/null && pass "6. backup.log 含 BACKUP_OK 记录" || fail "6. backup.log 缺记录"

rm -rf "$TMP" /tmp/bdb-out*.txt
echo ""
echo "结果: $PASS 通过 / $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
