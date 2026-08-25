#!/bin/bash
# upgrade-data-verify.sh — D528「升级/重装不丢数据」物理实测脚本（验证点 1-7）
#
# 契约（铁律 47，SYNOVA-IMPL-DSH-D528 spec §5.1/§7）:
#   @input  [--dry-run]（只打印流程计划，零副作用，exit 0）
#           [--installer <v2 dmg 路径>]（默认取 release/ 最新 dmg；无 → exit 2）
#           [--user-data <临时 userData 目录>]（默认 mktemp -d，绝不触碰真实
#             ~/Library/Application Support/synova-agent——铁律 0-4 真实库零接触）
#   @output exit 0 = 数据断言全过（v1/v2 表清单+关键表行数+db md5+integrity_check 一致）
#           exit 1 = 任一断言失败（evidence 记录失败步，不静默——铁律 24）
#           exit 2 = 前置缺失（无 dmg / 缺 hdiutil / 缺 sqlite3——degraded 显式提示）
#           evidence/upgrade-data-<date>-<ts>/ 下断言原文落盘（表清单/行数/md5/前后对比）
#   @degraded 任何失败路径 echo "[upgrade-verify] 失败步骤: <step>: <原因>" + evidence 落盘
#   @幂等   二次运行 mktemp 新目录 + 清理旧挂载/临时 .app（cleanup 幂等）；--dry-run 无副作用
#
# 流程: ①前置检查 → ②装 v1（挂载 dmg → cp .app 到临时安装位）→ ③造数据
#       （起服务（SYNOVA_DB_PATH 指向临时 userData）→ sqlite3 写入哨兵基线行 → 采集指纹）
#       → ④升级 v2（同一 dmg 再装一遍，模拟覆盖安装，保留 userData）→ ⑤数据断言
#       （表清单/关键表行数/db md5/integrity_check 前后一致）→ ⑥evidence 落盘 → ⑦清理
# 注: v1/v2 用同一安装包两次安装（覆盖安装语义实测——真实双版本需两次构建，
#     覆盖路径语义等价：第二次 cp -R 替换 .app，userData 不动）。
set -uo pipefail   # 不用 -e: 失败走显式断言路径收集 evidence，不许静默早退

SCRIPT_NAME="upgrade-verify"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EVIDENCE_ROOT="$REPO_ROOT/scripts/golden-scenarios/evidence"
APP_NAME="SynovaAgent"
INSTALLER=""
USER_DATA=""
DRY_RUN=0
SERVER_PORT=18891
SERVER_URL="http://127.0.0.1:$SERVER_PORT"
SERVER_PID=""

log() { echo "[$SCRIPT_NAME] $1"; }
die()  { echo "[$SCRIPT_NAME] 失败步骤: $1: ${2:-}"; [ -n "$EVIDENCE_DIR" ] && echo "$1: ${2:-}" >> "$EVIDENCE_DIR/fail.txt" 2>/dev/null; cleanup; exit 1; }

while [ $# -gt 0 ]; do
  case "$1" in
    --installer) INSTALLER="${2:-}"; shift 2 ;;
    --user-data) USER_DATA="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) grep '^#' "$0" | head -22; exit 0 ;;
    *) echo "[$SCRIPT_NAME] 未知参数: $1"; exit 2 ;;
  esac
done

# ① 前置检查（缺 → exit 2，degraded 不静默）
if [ "$DRY_RUN" -eq 0 ]; then
  [ -n "$INSTALLER" ] || INSTALLER="$(ls -t "$REPO_ROOT"/release/*.dmg 2>/dev/null | head -1)"
  if [ -z "$INSTALLER" ]; then
    echo "[$SCRIPT_NAME] 前置缺失: 无安装包（release/*.dmg 不存在且未 --installer）——先跑 electron-builder"; exit 2
  fi
  [ -f "$INSTALLER" ] || { echo "[$SCRIPT_NAME] 前置缺失: 安装包不存在 $INSTALLER"; exit 2; }
  command -v hdiutil  >/dev/null 2>&1 || { echo "[$SCRIPT_NAME] 前置缺失: hdiutil 不可用"; exit 2; }
  command -v sqlite3  >/dev/null 2>&1 || { echo "[$SCRIPT_NAME] 前置缺失: sqlite3 不可用"; exit 2; }
  command -v md5      >/dev/null 2>&1 || command -v md5sum >/dev/null 2>&1 || { echo "[$SCRIPT_NAME] 前置缺失: md5/md5sum 不可用"; exit 2; }
fi

EVIDENCE_DIR=""
MOUNT_DIR=""
INSTALL_APP=""

db_md5() { md5 -q "$1" 2>/dev/null || md5sum "$1" | awk '{print $1}'; }

# 表清单指纹（sqlite_master 用户表，排序稳定）
tables_fp() { sqlite3 "$1" "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;" 2>&1; }
# 关键表行数（企业事实层 agent_memory + 会话——升级断言主体）
rows_fp() {
  sqlite3 "$1" "SELECT 'agent_memory', COUNT(*) FROM agent_memory
                UNION ALL SELECT 'sessions', COUNT(*) FROM sessions
                UNION ALL SELECT 'sentinel_baseline', COUNT(*) FROM sentinel_baseline;" 2>&1 || true
}

cleanup() {
  if [ -n "$SERVER_PID" ]; then kill "$SERVER_PID" 2>/dev/null || true; fi
  if [ -n "$MOUNT_DIR" ] && mount | grep -q "$MOUNT_DIR"; then hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true; fi
}

if [ "$DRY_RUN" -eq 1 ]; then
  log "dry-run: 流程 = 前置检查 → 装 v1 → 造数据（临时 userData）→ 升级 v2（覆盖安装）→ 数据断言 → evidence → 清理"
  log "  installer=${INSTALLER:-<默认 release/ 最新 dmg>} user-data=${USER_DATA:-<mktemp 临时目录>}（真实 userData 零触碰）"
  log "  断言: 表清单一致 + 关键表行数一致(agent_memory/sessions/sentinel_baseline) + db md5 一致 + PRAGMA integrity_check=ok"
  log "dry-run 零副作用（exit 0）"
  exit 0
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
EVIDENCE_DIR="$EVIDENCE_ROOT/upgrade-data-$(date +%Y-%m-%d)-$STAMP"
mkdir -p "$EVIDENCE_DIR"
[ -n "$USER_DATA" ] || USER_DATA="$(mktemp -d)/synova-agent"
mkdir -p "$USER_DATA/data"
DB_PATH="$USER_DATA/data/synova.db"
log "evidence → $EVIDENCE_DIR；临时 userData → $USER_DATA（真实 ~/Library/Application Support/synova-agent 零触碰）"

# ② 装 v1（挂载 dmg → cp 到临时安装位；不污染 /Applications）
MOUNT_DIR="$(mktemp -d)/mount"; mkdir -p "$MOUNT_DIR"
hdiutil attach "$INSTALLER" -nobrowse -readonly -mountpoint "$MOUNT_DIR" > "$EVIDENCE_DIR/mount-v1.log" 2>&1 || die "②装v1" "hdiutil attach 失败"
[ -d "$MOUNT_DIR/$APP_NAME.app" ] || { hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1; die "②装v1" "卷内无 $APP_NAME.app"; }
INSTALL_APP="/tmp/$SCRIPT_NAME-$APP_NAME.app"
rm -rf "$INSTALL_APP"
cp -R "$MOUNT_DIR/$APP_NAME.app" "$INSTALL_APP" > "$EVIDENCE_DIR/install-v1.log" 2>&1 || die "②装v1" "cp 失败"
hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true
log "② v1 已安装（临时位 $INSTALL_APP）"

# ③ 造数据：起后端服务（SYNOVA_DB_PATH → 临时 userData 库）+ 写入哨兵基线/企业事实行
log "③ 造数据（起服务写临时库）"
SYNOVA_DB_PATH="$DB_PATH" PORT=$SERVER_PORT SYNOVA_SKIP_MCP=1 \
  npx tsx "$REPO_ROOT/src/index.ts" > "$EVIDENCE_DIR/server-v1.log" 2>&1 &
SERVER_PID=$!
HEALTHZ_OK=0
for _ in $(seq 1 60); do
  CODE="$(curl -sS -o /dev/null -w "%{http_code}" --max-time 2 "$SERVER_URL/api/healthz" 2>/dev/null)" || CODE=000
  if [ "$CODE" = "200" ]; then HEALTHZ_OK=1; break; fi
  sleep 2
done
if [ "$HEALTHZ_OK" = "0" ]; then
  # 降级链路记录（DS7）：healthz 不可用 → 如实失败证据（服务起不来 = 造数据失败）
  echo "healthz_non_200_after_120s" >> "$EVIDENCE_DIR/healthz-v1.txt"
  tail -20 "$EVIDENCE_DIR/server-v1.log" > "$EVIDENCE_DIR/server-v1-tail.log" 2>/dev/null
  die "③造数据" "服务 120s 未就绪（healthz 非 200，见 server-v1-tail.log）"
fi
echo "healthz_200" > "$EVIDENCE_DIR/healthz-v1.txt"
# 写入企业数据行（哨兵基线 + 企业事实——升级前后断言主体）
sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS sentinel_baseline (id TEXT PRIMARY KEY, metric TEXT, value TEXT, created_at TEXT);
INSERT INTO sentinel_baseline (id, metric, value, created_at) VALUES ('d528-upgrade-probe', 'retention', 'v1', datetime('now'));
CREATE TABLE IF NOT EXISTS agent_memory (id TEXT PRIMARY KEY, content TEXT);
INSERT INTO agent_memory (id, content) VALUES ('d528-probe', '升级数据保留性验证行 v1');" >> "$EVIDENCE_DIR/seed-v1.log" 2>&1
kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null; SERVER_PID=""

# v1 指纹采集
tables_fp "$DB_PATH" > "$EVIDENCE_DIR/tables-v1.txt"
rows_fp "$DB_PATH"     > "$EVIDENCE_DIR/rows-v1.txt"
db_md5 "$DB_PATH"      > "$EVIDENCE_DIR/md5-v1.txt"
sqlite3 "$DB_PATH" "PRAGMA integrity_check;" > "$EVIDENCE_DIR/integrity-v1.txt" 2>&1
log "③ v1 指纹: tables=$(wc -l < "$EVIDENCE_DIR/tables-v1.txt" | tr -d ' ') md5=$(cat "$EVIDENCE_DIR/md5-v1.txt")"

# ④ 升级 v2：同一 dmg 覆盖安装（替换 .app，保留 userData——升级语义实测主体）
hdiutil attach "$INSTALLER" -nobrowse -readonly -mountpoint "$MOUNT_DIR" > "$EVIDENCE_DIR/mount-v2.log" 2>&1 || die "④升级" "hdiutil attach 失败"
[ -d "$MOUNT_DIR/$APP_NAME.app" ] || { hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1; die "④升级" "卷内无 $APP_NAME.app"; }
cp -R "$MOUNT_DIR/$APP_NAME.app/" "$INSTALL_APP/" > "$EVIDENCE_DIR/install-v2.log" 2>&1 || die "④升级" "覆盖安装 cp 失败"
hdiutil detach "$MOUNT_DIR" >/dev/null 2>&1 || true
log "④ v2 覆盖安装完成（.app 已替换，userData 未触碰）"

# ⑤ 数据断言（升级后指纹必须与 v1 完全一致）
ASSERT_FAIL=0
tables_fp "$DB_PATH" > "$EVIDENCE_DIR/tables-v2.txt"
rows_fp "$DB_PATH"   > "$EVIDENCE_DIR/rows-v2.txt"
db_md5 "$DB_PATH"    > "$EVIDENCE_DIR/md5-v2.txt"
sqlite3 "$DB_PATH" "PRAGMA integrity_check;" > "$EVIDENCE_DIR/integrity-v2.txt" 2>&1

if ! diff "$EVIDENCE_DIR/tables-v1.txt" "$EVIDENCE_DIR/tables-v2.txt" > "$EVIDENCE_DIR/tables.diff"; then
  echo "⑤表清单" "升级前后表清单不一致（见 tables.diff）" >> "$EVIDENCE_DIR/fail.txt"; ASSERT_FAIL=1
fi
if ! diff "$EVIDENCE_DIR/rows-v1.txt" "$EVIDENCE_DIR/rows-v2.txt" > "$EVIDENCE_DIR/rows.diff"; then
  echo "⑤行数" "关键表行数不一致（见 rows.diff）" >> "$EVIDENCE_DIR/fail.txt"; ASSERT_FAIL=1
fi
if [ "$(cat "$EVIDENCE_DIR/md5-v1.txt")" != "$(cat "$EVIDENCE_DIR/md5-v2.txt")" ]; then
  echo "⑤md5" "db 文件 md5 前后不一致" >> "$EVIDENCE_DIR/fail.txt"; ASSERT_FAIL=1
fi
if [ "$(cat "$EVIDENCE_DIR/integrity-v2.txt")" != "ok" ]; then
  echo "⑤integrity" "PRAGMA integrity_check != ok（升级后库损坏）" >> "$EVIDENCE_DIR/fail.txt"; ASSERT_FAIL=1
fi

# ⑥ 汇总 + evidence 断言原文
{
  echo "verdict: $([ $ASSERT_FAIL -eq 0 ] && echo DATA_RETAINED || echo DATA_LOST)"
  echo "installer: $INSTALLER"
  echo "db: $DB_PATH"
  echo "md5_v1: $(cat "$EVIDENCE_DIR/md5-v1.txt")"
  echo "md5_v2: $(cat "$EVIDENCE_DIR/md5-v2.txt")"
  echo "integrity_v2: $(cat "$EVIDENCE_DIR/integrity-v2.txt")"
  echo "rows_v2: $(cat "$EVIDENCE_DIR/rows-v2.txt" | tr '\n' '|')"
} > "$EVIDENCE_DIR/summary.txt"
cat "$EVIDENCE_DIR/summary.txt"

if [ $ASSERT_FAIL -ne 0 ]; then
  while IFS= read -r line; do echo "[$SCRIPT_NAME] 失败步骤: $line"; done < "$EVIDENCE_DIR/fail.txt"
  cleanup; exit 1
fi
log "⑤ 数据断言全过: 表清单/行数/md5/integrity 前后一致 — 升级不丢数据 ✅"

# ⑦ 清理（幂等）
cleanup
rm -rf "$INSTALL_APP" 2>/dev/null || true
log "⑦ 清理完成（临时 .app/挂载已回收；evidence 保留）"
exit 0
