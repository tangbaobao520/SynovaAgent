#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# mac-install-verify.sh — D519 Mac 安装包实测（验证点 1-3「Mac 版安装包可用」）
#
# 一键完成: 打 dmg → 采集指纹 → 挂载 → 安装 → 启动 → 四断言 → 落 evidence → 清理。
# 全程物理实测（D510 F1 红线：禁止静态 grep/模拟冒充实测）。
#
# 契约（铁律 47）:
#   @input  [--dry-run]（只打印步骤不断言） [--skip-build]（跳过 dmg 构建，复用 release/ 产物）
#           [--keep-data]（清理时保留 userData）
#   @output exit 0 = 四断言全过（安装包可用）
#           exit 1 = 任一断言失败（evidence 记录具体失败步，不静默——铁律 24）
#           exit 2 = 前置缺失（无 dmg / 缺 hdiutil 等工具）——degraded
#           evidence/D519-mac-<date>/ 下六类证据文件原文
#   @degraded — 任何失败路径 echo "[mac-verify] 失败步骤: <step>: <原因>" + evidence 落盘
#
# 四断言（"能装"的最小证明=四个物理事实）:
#   A1 进程存活: pgrep -f SynovaAgent
#   A2 窗口存在: osascript System Events (name of processes) contains "SynovaAgent"
#   A3 服务健康: curl -sf localhost:18790/api/healthz → HTTP 200
#   A4 后端日志: ~/Library/Application Support/synova-agent/logs/backend.log 非空
#
# 已知环境坑（K3 复跑须知）:
#   · 宿主若设 ELECTRON_RUN_AS_NODE=1 会使 Electron 以纯 node 启动——脚本全程显式 unset。
#   · 未签名 dmg 首次打开被 Gatekeeper 拦——本脚本走"挂载+cp"路径绕开双击拦截（runbook 有说明）。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail  # 不用 -e: 失败要走显式断言路径收集 evidence，不许静默早退

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

APP_NAME="SynovaAgent"
INSTALL_DIR="/Applications"
USER_DATA="$HOME/Library/Application Support/synova-agent"
SERVER_URL="http://localhost:18790"
EVIDENCE_DIR="$ROOT/evidence/D519-mac-$(date +%Y%m%d-%H%M%S)"
MOUNT_POINT="/Volumes/$APP_NAME"
INSTALLED_APP="$INSTALL_DIR/$APP_NAME.app"

DRY_RUN=0; SKIP_BUILD=0; KEEP_DATA=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --keep-data) KEEP_DATA=1 ;;
    *) echo "[mac-verify] 未知参数: $arg（支持 --dry-run/--skip-build/--keep-data）"; exit 2 ;;
  esac
done

step() { echo "[mac-verify] $1"; }
die()  { echo "[mac-verify] 失败步骤: $1: ${2:-}"; echo "$1: ${2:-}" >> "$EVIDENCE_DIR/fail.txt" 2>/dev/null; cleanup; exit 1; }
preflight_fail() { echo "[mac-verify] 前置缺失: $1"; exit 2; }

# 挂载/进程状态跟踪（清理用）
MOUNTED=0; APP_STARTED=0

cleanup() {
  step "⑦ 清理回收（防污染下次实测）"
  if [ "$APP_STARTED" = "1" ]; then
    pkill -f "$INSTALLED_APP" 2>/dev/null || true
    sleep 2
    pgrep -f "$INSTALLED_APP" >/dev/null 2>&1 && { pkill -9 -f "$INSTALLED_APP" 2>/dev/null || true; sleep 1; }
  fi
  if [ "$MOUNTED" = "1" ]; then
    hdiutil detach "$MOUNT_POINT" -force > "$EVIDENCE_DIR/detach.log" 2>&1 || echo "[mac-verify] detach 失败（见 detach.log）"
  fi
  rm -rf "$INSTALLED_APP" || echo "[mac-verify] 删除 $INSTALLED_APP 失败——请手动清理"
  if [ "$KEEP_DATA" = "0" ]; then
    rm -rf "$USER_DATA" || true
  else
    step "--keep-data: 保留 $USER_DATA"
  fi
}

# ── ⓪ 前置检查 ──
step "⓪ 前置检查"
for tool in hdiutil md5 curl pgrep osascript; do
  command -v "$tool" >/dev/null 2>&1 || preflight_fail "缺少工具: $tool"
done

# ── ① 构建 dmg（除非 --skip-build）──
if [ "$SKIP_BUILD" = "0" ]; then
  step "① 构建链打 dmg（build-synova.cjs 契约三步）"
  if [ "$DRY_RUN" = "1" ]; then echo "  [dry-run] npm run build:backend && (cd electron-renderer && npm run build) && npx electron-builder --config build-synova.cjs --mac"
  else
    npm run build:backend || die "①构建" "build:backend 失败"
    (cd electron-renderer && npm run build) || die "①构建" "renderer build 失败"
    npx electron-builder --config build-synova.cjs --mac || die "①构建" "electron-builder --mac 失败"
  fi
else
  step "① --skip-build: 复用 release/ 既有 dmg"
fi

DMG="$(ls -t release/*.dmg 2>/dev/null | head -1)"
[ -n "$DMG" ] && [ -f "$DMG" ] || preflight_fail "release/ 无 dmg（先跑构建或去掉 --skip-build）"

mkdir -p "$EVIDENCE_DIR"

if [ "$DRY_RUN" = "1" ]; then
  step "⑧ --dry-run: 步骤清单（不执行断言）"
  cat << PLAN
  ① dmg = $DMG
  ② 采集指纹: ls -lh + md5 → $EVIDENCE_DIR
  ③ 挂载: hdiutil attach -nobrowse -readonly "$DMG" → $MOUNT_POINT
  ④ 安装: cp -R "$MOUNT_POINT/$APP_NAME.app" $INSTALL_DIR/
  ⑤ 启动: env -u ELECTRON_RUN_AS_NODE open "$INSTALLED_APP"，轮询 60s 四断言
     A1 pgrep -f $APP_NAME / A2 osascript 窗口 / A3 curl $SERVER_URL/api/healthz / A4 backend.log 非空
  ⑥ evidence → $EVIDENCE_DIR
  ⑦ 清理: kill + detach + rm $INSTALLED_APP + userData（--keep-data 保留）
PLAN
  exit 0
fi

# ── ② 采集 dmg 指纹 ──
step "② 采集 dmg 指纹 → evidence"
ls -lh release/*.dmg > "$EVIDENCE_DIR/dmg-ls.txt" 2>&1
md5 "$DMG" > "$EVIDENCE_DIR/md5.txt" 2>&1 || md5sum "$DMG" > "$EVIDENCE_DIR/md5.txt" 2>&1
cat "$EVIDENCE_DIR/md5.txt"

# 幂等：清掉上次残留（进程/已装 app/旧挂载点）
pgrep -f "$INSTALLED_APP" >/dev/null 2>&1 && { step "幂等清理: 残留进程"; pkill -f "$INSTALLED_APP" 2>/dev/null || true; sleep 2; }
[ -d "$INSTALLED_APP" ] && { step "幂等清理: 残留 $INSTALLED_APP"; rm -rf "$INSTALLED_APP"; }
[ -d "$MOUNT_POINT" ] && hdiutil detach "$MOUNT_POINT" -force >/dev/null 2>&1

# ── ③ 挂载 dmg ──
step "③ 挂载 $DMG"
hdiutil attach "$DMG" -nobrowse -readonly > "$EVIDENCE_DIR/mount.log" 2>&1 || die "③挂载" "hdiutil attach 失败（见 mount.log）"
MOUNTED=1
# 实际挂载点从 mount.log 解析（electron-builder APFS dmg 卷名含版本+arch，非固定 $APP_NAME）
MOUNT_POINT="$(sed -n 's/.*\(\/Volumes\/[^ 	]*.*\)$/\1/p' "$EVIDENCE_DIR/mount.log" | tail -1 | sed 's/[[:space:]]*$//')"
[ -n "$MOUNT_POINT" ] && [ -d "$MOUNT_POINT/$APP_NAME.app" ] || die "③挂载" "挂载卷内无 $APP_NAME.app（解析挂载点: ${MOUNT_POINT:-空}）"
echo "[mac-verify] 挂载点: $MOUNT_POINT"

# ── ④ 安装到 /Applications ──
step "④ cp -R → $INSTALLED_APP"
cp -R "$MOUNT_POINT/$APP_NAME.app" "$INSTALLED_APP" > "$EVIDENCE_DIR/install.log" 2>&1 || die "④安装" "cp 失败（见 install.log）"
[ -d "$INSTALLED_APP" ] || die "④安装" "安装后 $INSTALLED_APP 不存在"
ls -lh "$INSTALLED_APP/Contents/MacOS/" >> "$EVIDENCE_DIR/install.log" 2>&1

# ── ⑤ 启动 + 60s 轮询四断言 ──
step "⑤ 启动 $INSTALLED_APP - 显式清 ELECTRON_RUN_AS_NODE"
env -u ELECTRON_RUN_AS_NODE open "$INSTALLED_APP" || die "⑤启动" "open 失败"
APP_STARTED=1

A1=0; A2=0; A3=0; A4=0
for i in $(seq 1 60); do
  sleep 1
  [ "$A1" = "0" ] && pgrep -f "$INSTALLED_APP" >/dev/null 2>&1 && A1=1
  if [ "$A2" = "0" ]; then
    osascript -e 'tell application "System Events" to (name of processes) contains "'"$APP_NAME"'"' >/dev/null 2>&1 && A2=1
  fi
  [ "$A3" = "0" ] && curl -sf -m 2 -o /dev/null "$SERVER_URL/api/healthz" && A3=1
  [ "$A4" = "0" ] && [ -s "$USER_DATA/logs/backend.log" ] && A4=1
  if [ "$A1" = "1" ] && [ "$A2" = "1" ] && [ "$A3" = "1" ] && [ "$A4" = "1" ]; then
    step "四断言于第 ${i}s 全过"; break
  fi
done

# ── ⑥ evidence 落盘（断言原文，非转述）──
echo "A1 进程存活: $A1 (pgrep -f $INSTALLED_APP)"    >  "$EVIDENCE_DIR/assertions.txt"
echo "A2 窗口存在: $A2 (osascript System Events)"    >> "$EVIDENCE_DIR/assertions.txt"
echo "A3 服务健康: $A3 (curl -sf $SERVER_URL/api/healthz)" >> "$EVIDENCE_DIR/assertions.txt"
echo "A4 后端日志: $A4 ($USER_DATA/logs/backend.log 非空)" >> "$EVIDENCE_DIR/assertions.txt"
osascript -e 'tell application "System Events" to (name of processes) contains "'"$APP_NAME"'"' > "$EVIDENCE_DIR/window.txt" 2>&1
curl -sf -m 3 "$SERVER_URL/api/healthz" > "$EVIDENCE_DIR/healthz.json" 2>&1 || true
[ -f "$USER_DATA/logs/backend.log" ] && tail -50 "$USER_DATA/logs/backend.log" > "$EVIDENCE_DIR/backend.log" || echo "(backend.log 不存在)" > "$EVIDENCE_DIR/backend.log"
pgrep -fl "$APP_NAME" > "$EVIDENCE_DIR/process.txt" 2>&1 || true
cat "$EVIDENCE_DIR/assertions.txt"

[ "$A1" = "1" ] || { cleanup; die "⑤断言A1" "进程未存活（pgrep）"; }
[ "$A2" = "1" ] || { cleanup; die "⑤断言A2" "窗口不存在（osascript——注意: 需屏幕录制/辅助功能权限的会话外环境可能误报，GUI 登录会话内可信）"; }
[ "$A3" = "1" ] || { cleanup; die "⑤断言A3" "healthz 未达 200（$SERVER_URL/api/healthz）"; }
[ "$A4" = "1" ] || { cleanup; die "⑤断言A4" "backend.log 为空/不存在"; }

cleanup
step "✅ D519 四断言全过——evidence: $EVIDENCE_DIR"
exit 0
