#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# install-chronicle-schedule.sh — 月报定时安装器（治理机制 #4 闭环）
#
# 契约（铁律 47 契约优先）:
#   输入:  --install = 实际安装；缺省 = dry-run（只打印将执行的命令，不执行）
#   输出:  平台 + 安装命令；--install 成功 exit 0，失败 exit 1
#   平台:  Windows (schtasks) / Linux (crontab) / macOS (crontab；launchd 可手动适配)
#   说明:  Windows 的 schtasks 命令建议以管理员运行；实际调度周期 = 每月 1 日 09:00
# ═══════════════════════════════════════════════════════════════════════════════
set +e
ROOT="${DOC_TRUTH_ROOT:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}" # swallow-ok:
WRAP="$ROOT/scripts/doc-system/chronicle-monthly-wrapper.sh"

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) PLAT=windows ;;
  Darwin) PLAT=macos ;;
  *) PLAT=linux ;;
esac

case "$PLAT" in
  windows)
    # 注意: schtasks 需要 Windows 路径；此处给 MSYS 路径，管理员手动改盘符亦可
    CMD="schtasks /Create /TN \"Synova-Chronicle-Monthly\" /SC MONTHLY /D 1 /TR \"bash $WRAP\" /F"
    ;;
  linux)
    CMD="(crontab -l 2>/dev/null; echo '0 9 1 * * bash $WRAP') | crontab -" # swallow-ok:
    ;;
  macos)
    CMD="(crontab -l 2>/dev/null; echo '0 9 1 * * bash $WRAP') | crontab -" # swallow-ok:
    ;;
esac

echo "平台: $PLAT"
echo "每月 1 日 09:00 调用: $WRAP"
echo "安装命令: $CMD"
if [ "$1" = "--install" ]; then
  eval "$CMD"
  if [ $? -eq 0 ]; then echo "✅ 定时任务已安装"; exit 0; else echo "❌ 安装失败（检查权限/路径）"; exit 1; fi
else
  echo "（dry-run：加 --install 执行安装）"
  exit 0
fi
