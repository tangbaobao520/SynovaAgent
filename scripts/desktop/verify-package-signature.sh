#!/usr/bin/env bash
# verify-package-signature.sh — D713: 桌面端打包产物签名门禁（macOS 专用）
#
# 背景（2026-09-13，创始人报告"打都打不开"）：
#   dmg/zip 内的 SynovaAgent.app **无 Contents/_CodeSignature 封印** → macOS 拒绝启动
#   （codesign --verify 报 "code has no resources but signature indicates they must be present"）。
#   根因：build-synova.cjs 无签名配置，app-builder-lib@25.1.8 在无证书时只 log skip（out/macPackager.js:202-211）。
#   本脚本是**出货前的物理门禁**：产物签名不合格 → 非 0 退出，坏包不得进入分发。
#
# 契约:
#   @input  — --app <path.app> | --dmg <path.dmg> | --all [--dir <release 目录>]
#   @output — 逐项 ✅/❌ 明细 + 汇总；exit 0 全部通过 / 1 发现未签名或封印破损 / 2 执行失败（fail-closed）
#   @degraded — 非 macOS 平台 → 明确提示并 exit 2（不静默放行）
#   @error  — 路径不存在 / dmg 挂载失败 / codesign 不可用 → exit 2
#
# 用法:
#   bash scripts/desktop/verify-package-signature.sh --app release/mac-arm64/SynovaAgent.app
#   bash scripts/desktop/verify-package-signature.sh --dmg release/SynovaAgent-0.1.0-arm64.dmg
#   bash scripts/desktop/verify-package-signature.sh --all

set -u

export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

MODE=""
TARGET=""
REL_DIR="release"

while [ $# -gt 0 ]; do
  case "$1" in
    --app) MODE="app"; TARGET="${2:-}"; shift 2 ;;
    --dmg) MODE="dmg"; TARGET="${2:-}"; shift 2 ;;
    --all) MODE="all"; shift ;;
    --dir) REL_DIR="${2:-release}"; shift 2 ;;
    *) echo "degraded: 未知参数 $1（用法见脚本头）" >&2; exit 2 ;;
  esac
done

if [ -z "$MODE" ]; then
  echo "degraded: 必须指定 --app <path> | --dmg <path> | --all" >&2
  exit 2
fi

# 平台守卫（macOS 专用；非 darwin 明确 fail-closed，不静默通过）
if [ "$(uname -s)" != "Darwin" ]; then
  echo "degraded: 本门禁仅适用于 macOS（当前 $(uname -s)）——签名语义不可移植，拒绝给出绿色结论" >&2
  exit 2
fi

if ! command -v codesign >/dev/null 2>&1; then
  echo "degraded: codesign 不可用（Xcode CLT 缺失？）" >&2
  exit 2
fi

FAIL_COUNT=0
ERR_COUNT=0

# check_app <app 路径>  → 0 通过 / 1 未签名或封印坏 / 2 执行失败
check_app() {
  local app="$1"
  if [ ! -d "$app" ]; then
    echo "  ❌ 路径不存在或不是目录: $app"
    return 2
  fi
  local seal="$app/Contents/_CodeSignature/CodeResources"
  if [ ! -f "$seal" ]; then
    echo "  ❌ 缺签名封印（无 Contents/_CodeSignature/CodeResources）: $app"
    echo "     → macOS 将拒绝启动（提示『已损坏』）；修法: codesign --force --deep --sign - \"$app\" 后重新打包"
    return 1
  fi
  if ! codesign --verify --deep --strict "$app" >/tmp/vps-codesign.log 2>&1; then
    echo "  ❌ codesign --verify 失败: $app"
    head -2 /tmp/vps-codesign.log | sed 's/^/     /'
    return 1
  fi
  echo "  ✅ 签名封印有效: $app"
  return 0
}

# check_dmg <dmg 路径> → 0/1/2（挂载 → 校验内部 app → 卸载）
check_dmg() {
  local dmg="$1"
  if [ ! -f "$dmg" ]; then
    echo "  ❌ dmg 不存在: $dmg"
    return 2
  fi
  local mnt_line dev mnt rc=0
  mnt_line=$(hdiutil attach "$dmg" -nobrowse -readonly 2>&1) || {
    echo "  ❌ dmg 挂载失败: $dmg"
    printf '%s\n' "$mnt_line" | head -2 | sed 's/^/     /'
    return 2
  }
  # 挂载点可能含空格（卷名如 "SynovaAgent 0.1.0-arm64"）→ 必须按 tab 取最后一段，
  # 不能用 [^ ]+（2026-09-13 实测：按空格截断导致假阴性，误判好包为未签名）
  dev=$(printf '%s\n' "$mnt_line" | awk -F'\t' '/\/Volumes\//{print $1; exit}')
  mnt=$(printf '%s\n' "$mnt_line" | awk -F'\t' '/\/Volumes\//{print $NF; exit}')
  if [ -z "$mnt" ]; then
    echo "  ❌ dmg 挂载点解析失败: $dmg"
    [ -n "$dev" ] && hdiutil detach "$dev" -quiet 2>/dev/null || true
    return 2
  fi
  local app
  app=$(find "$mnt" -maxdepth 2 -name "*.app" -print -quit 2>/dev/null)
  if [ -z "$app" ]; then
    echo "  ❌ dmg 内未找到 .app: $dmg（挂载点: $mnt）"
    rc=1
  else
    check_app "$app" || rc=$?
  fi
  [ -n "$dev" ] && hdiutil detach "$dev" -quiet 2>/dev/null || hdiutil detach "$mnt" -quiet 2>/dev/null || true
  return $rc
}

case "$MODE" in
  app)
    check_app "$TARGET"; rc=$?
    [ $rc -eq 1 ] && FAIL_COUNT=$((FAIL_COUNT+1))
    [ $rc -eq 2 ] && ERR_COUNT=$((ERR_COUNT+1))
    ;;
  dmg)
    check_dmg "$TARGET"; rc=$?
    [ $rc -eq 1 ] && FAIL_COUNT=$((FAIL_COUNT+1))
    [ $rc -eq 2 ] && ERR_COUNT=$((ERR_COUNT+1))
    ;;
  all)
    if [ ! -d "$REL_DIR" ]; then
      echo "degraded: 产物目录不存在: $REL_DIR" >&2
      exit 2
    fi
    echo "── 校验 $REL_DIR 下的 app bundle ──"
    while IFS= read -r app; do
      [ -n "$app" ] || continue
      check_app "$app"; rc=$?
      [ $rc -eq 1 ] && FAIL_COUNT=$((FAIL_COUNT+1))
      [ $rc -eq 2 ] && ERR_COUNT=$((ERR_COUNT+1))
    done < <(find "$REL_DIR" -maxdepth 3 -name "*.app" -type d 2>/dev/null)
    echo "── 校验 $REL_DIR 下的 dmg ──"
    while IFS= read -r dmg; do
      [ -n "$dmg" ] || continue
      check_dmg "$dmg"; rc=$?
      [ $rc -eq 1 ] && FAIL_COUNT=$((FAIL_COUNT+1))
      [ $rc -eq 2 ] && ERR_COUNT=$((ERR_COUNT+1))
    done < <(find "$REL_DIR" -maxdepth 1 -name "*.dmg" -type f 2>/dev/null)
    ;;
esac

echo "───────────────────────────────"
if [ "$ERR_COUNT" -gt 0 ]; then
  echo "❌ 校验执行失败 $ERR_COUNT 项（fail-closed，不得视为通过）"
  exit 2
fi
if [ "$FAIL_COUNT" -gt 0 ]; then
  echo "❌ 签名门禁未通过：$FAIL_COUNT 项未签名/封印破损 —— 该产物装完打不开，禁止分发"
  exit 1
fi
echo "✅ 签名门禁通过：全部产物封印有效（codesign --verify --deep --strict）"
exit 0
