#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# install-dsh-preset.sh — DSH 预设一键落位 + 漂移检查（P3: preset 入仓多机同步）
#
# 背景 (2026-08-15 创始人批准 P0-P3): synova-dsh 预设（DSH 纪律模式）落位在
# ~/.dsh/.agent-presets/（仓库外、git 外），新机器靠手工 cp + 手工编辑 YAML →
# 多机漂移风险。本脚本把落位变成可复现命令，--check 模式把漂移变成可检测事实。
#
# 契约 (铁律 47):
#   @input  — --install（落位）| --check（漂移校验）
#             --home <path>         DSH home（默认 $DSH_HOME 或 ~/.dsh）— 测试注入
#             --standard-from <path> standard 预设源目录（默认自动探测）— 测试注入
#   @output — --install: 落位路径 + persona/preset.yml 替换摘要；
#             --check: 一致 → "SYNC-OK" exit 0
#   @exit   — 0 = 成功/一致；1 = 漂移或未安装（--check）；2 = 降级（源缺失/不可写/
#             persona 行未找到 — D328 三态：失败≠通过，绝不产出坏预设）
#   @degraded — exit 2 + stderr "degraded: <原因>"（铁律 11 显式降级）
#   @error  — .code=DSH_PRESET_ERROR .phase=install|check .retryable=true
#
# 行为: ① 复制 standard 预设目录 ② 用仓库 persona-block.yml 替换 persona 行
#       ③ 用仓库 preset.yml 替换显示元信息 ④ 写 .synova-preset-version 来源标记
# 幂等: 整目录确定性替换, 重复 --install 结果一致。
# 用法: bash scripts/control-tower/install-dsh-preset.sh --install|--check
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DRAFT="$REPO_DIR/docs/synova/coordination/dsh-preset-draft"
PERSONA_BLOCK="$DRAFT/persona-block.yml"
PRESET_YML="$DRAFT/preset.yml"

MODE=""
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
STD_SRC=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install) MODE="install" ;;
    --check) MODE="check" ;;
    --home) DSH_HOME="$2"; shift ;;
    --standard-from) STD_SRC="$2"; shift ;;
    *) echo "未知参数: $1（用法: --install|--check [--home PATH] [--standard-from PATH]）" >&2; exit 2 ;;
  esac
  shift
done
[ -n "$MODE" ] || { echo "必须指定 --install 或 --check" >&2; exit 2; }

degrade() { # <原因> — 降级: 显式日志 + exit 2
  echo "degraded: $1 (code=DSH_PRESET_ERROR, phase=$MODE, retryable=true)" >&2
  exit 2
}

TARGET="$DSH_HOME/.agent-presets/synova-dsh"

# ── 探测 standard 预设源（测试注入优先, 再环境变量, 再 npm 全局, 再常见路径）──
if [ -z "$STD_SRC" ]; then
  for cand in \
    "$DSH_INSTALL_DIR/config/agent-presets/standard" \
    "$(npm root -g 2>/dev/null || true)/@deepseek-ai/dsh/config/agent-presets/standard" \
    "$HOME/.nvm/current/lib/node_modules/@deepseek-ai/dsh/config/agent-presets/standard"; do
    if [ -d "$cand" ] && [ -f "$cand/agent.cordis.yml" ]; then STD_SRC="$cand"; break; fi
  done
fi
[ -d "$STD_SRC" ] || degrade "standard 预设源未找到（--standard-from 注入或 $DSH_INSTALL_DIR/npm root -g 探测）"
[ -f "$STD_SRC/agent.cordis.yml" ] || degrade "standard 预设源缺 agent.cordis.yml: $STD_SRC"
[ -f "$PERSONA_BLOCK" ] || degrade "仓库 persona-block.yml 缺失: $PERSONA_BLOCK"
[ -f "$PRESET_YML" ] || degrade "仓库 preset.yml 缺失: $PRESET_YML"

# ── persona 块提取/替换（python 状态机: 顶层 "- id: " 边界）──
extract_persona() { # <cordis-file> — 输出 persona 块到 stdout; 无 persona 行 exit 3
python3 - "$1" << 'PY'
import sys
lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
start = next((i for i, l in enumerate(lines) if l.strip() == "- id: persona"), None)
if start is None:
    sys.exit(3)
end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("- id: ")), len(lines))
sys.stdout.write("\n".join(lines[start:end]) + "\n")
PY
}

# ═══ check 模式 ═══
if [ "$MODE" = "check" ]; then
  if [ ! -f "$TARGET/agent.cordis.yml" ]; then
    echo "未安装: $TARGET/agent.cordis.yml 不存在"
    echo "修复: bash scripts/control-tower/install-dsh-preset.sh --install"
    exit 1
  fi
  DRIFT=""
  # 提取到临时文件再 diff — 命令替换 $(...) 会剥掉尾随换行导致假漂移
  BLOCK_TMP=$(mktemp /tmp/idp-block.XXXXXX)
  trap 'rm -f "$BLOCK_TMP"' EXIT
  extract_persona "$TARGET/agent.cordis.yml" > "$BLOCK_TMP" 2>/dev/null # swallow-ok: 无 persona 行时 exit 3, 由下方 EXIT_P 显式捕获
  EXIT_P=$?
  if [ "$EXIT_P" -ne 0 ]; then
    DRIFT="${DRIFT}  漂移: agent.cordis.yml 无 persona 行（预设结构被破坏）\n"
  elif ! diff -q "$PERSONA_BLOCK" "$BLOCK_TMP" >/dev/null 2>&1; then
    DRIFT="${DRIFT}  漂移: agent.cordis.yml persona 与仓库 persona-block.yml 不一致\n"
  fi
  if ! diff -q "$PRESET_YML" "$TARGET/preset.yml" >/dev/null 2>&1; then
    DRIFT="${DRIFT}  漂移: preset.yml 与仓库不一致\n"
  fi
  if [ -n "$DRIFT" ]; then
    echo "预设漂移检测（已安装 ${TARGET} vs 仓库 ${DRAFT}）:"
    printf "%b" "$DRIFT"
    echo "修复: bash scripts/control-tower/install-dsh-preset.sh --install"
    exit 1
  fi
  echo "SYNC-OK: 已安装预设与仓库一致（${TARGET}）"
  exit 0
fi

# ═══ install 模式 ═══
PARENT="$DSH_HOME/.agent-presets"
mkdir -p "$PARENT" || degrade "DSH home 不可写: $PARENT"
rm -rf "$TARGET"
cp -R "$STD_SRC" "$TARGET" || degrade "复制 standard 预设失败"

# 替换 persona 行 — 先验证源文件有 persona 行（fail-closed: 绝不产出坏预设）
extract_persona "$TARGET/agent.cordis.yml" >/dev/null 2>&1 \
  || { rm -rf "$TARGET"; degrade "standard 预设无 persona 行, 拒绝落位（防产出坏预设）"; }

TMP_CORDIS=$(mktemp /tmp/idp-cordis.XXXXXX)
trap 'rm -f "$TMP_CORDIS"' EXIT
python3 - "$TARGET/agent.cordis.yml" "$PERSONA_BLOCK" "$TMP_CORDIS" << 'PY'
import sys
# splitlines() 不产生尾部空串, 且兼容 Windows CRLF（windows-compat 模式库）
lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
block = open(sys.argv[2], encoding="utf-8").read().splitlines()
start = next((i for i, l in enumerate(lines) if l.strip() == "- id: persona"), None)
if start is None:
    sys.exit(3)
end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("- id: ")), len(lines))
out = lines[:start] + block + lines[end:]
open(sys.argv[3], "w", encoding="utf-8").write("\n".join(out) + "\n")
PY
REPLACED=$?
[ "$REPLACED" -eq 0 ] || { rm -rf "$TARGET"; degrade "persona 行替换失败"; }
mv "$TMP_CORDIS" "$TARGET/agent.cordis.yml"

cp "$PRESET_YML" "$TARGET/preset.yml" || degrade "替换 preset.yml 失败"
printf 'source: %s\ninstalled-at: %s\n' "$REPO_DIR" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$TARGET/.synova-preset-version"

echo "SYNC-OK: 预设已落位 $TARGET"
echo "  - agent.cordis.yml persona ← docs/synova/coordination/dsh-preset-draft/persona-block.yml"
echo "  - preset.yml ← docs/synova/coordination/dsh-preset-draft/preset.yml"
echo "  - 验证: 新开会话 → 设置 → Agent 预设 → 'SynovaAgent 纪律模式'"
exit 0
