#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# install-dsh-preset.sh — DSH 预设一键落位 + 漂移检查（P3: preset 入仓多机同步）
#
# 背景 (2026-08-15 创始人批准 P0-P3): DSH 预设（纪律模式 / dev-doc 撰写）落位在
# ~/.dsh/.agent-presets/（仓库外、git 外），新机器靠手工 cp + 手工编辑 YAML →
# 多机漂移风险。本脚本把落位变成可复现命令，--check 模式把漂移变成可检测事实。
#
# 契约 (铁律 47):
#   @input  — --install（落位）| --check（漂移校验）
#             [<preset-id>...]   缺省 = 注册表内全部预设（synova-dsh synova-devdoc）
#             --home <path>         DSH home（默认 $DSH_HOME 或 ~/.dsh）— 测试注入
#             --standard-from <path> standard 预设源目录（默认自动探测）— 测试注入
#   @output — --install: 每预设一行落位路径 + 替换摘要；
#             --check: 一致 → "SYNC-OK" exit 0
#   @exit   — 0 = 成功/一致；1 = 漂移或未安装（--check）；2 = 降级（源缺失/不可写/
#             persona 行未找到 — D328 三态：失败≠通过，绝不产出坏预设）
#   @degraded — exit 2 + stderr "degraded: <原因>"（铁律 11 显式降级）
#   @error  — .code=DSH_PRESET_ERROR .phase=install|check .retryable=true
#
# 行为: 对每个预设 ① 复制 standard 预设目录 ② 用仓库 persona-block.yml 替换 persona 行
#       ③ 用仓库 preset.yml 替换显示元信息 ④ 写 .synova-preset-version 来源标记
# 幂等: 整目录确定性替换, 重复 --install 结果一致。
# 用法: bash scripts/control-tower/install-dsh-preset.sh --install|--check [<preset-id>...]
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── 预设注册表: <id>|<草稿目录(相对仓库根)> — 新增预设在此加一行 ──
PRESET_REGISTRY="
synova-dsh|docs/synova/coordination/dsh-preset-draft
synova-devdoc|docs/synova/coordination/dsh-devdoc-draft
"

MODE=""
DSH_HOME="${DSH_HOME:-$HOME/.dsh}"
STD_SRC=""
IDS=""
while [ $# -gt 0 ]; do
  case "$1" in
    --install) MODE="install" ;;
    --check) MODE="check" ;;
    --home) DSH_HOME="$2"; shift ;;
    --standard-from) STD_SRC="$2"; shift ;;
    -h|--help) echo "用法: $0 --install|--check [--home PATH] [--standard-from PATH] [<preset-id>...]"; exit 0 ;;
    --*) echo "未知参数: $1" >&2; exit 2 ;;
    *) IDS="$IDS $1" ;;
  esac
  shift
done
[ -n "$MODE" ] || { echo "必须指定 --install 或 --check" >&2; exit 2; }

degrade() { # <原因> — 降级: 显式日志 + exit 2
  echo "degraded: $1 (code=DSH_PRESET_ERROR, phase=$MODE, retryable=true)" >&2
  exit 2
}

# ── 临时文件统一累积清理（循环内多次调用不互相覆盖 trap）──
TMPFILES=""
cleanup() { local f; for f in $TMPFILES; do rm -f "$f"; done; }
trap cleanup EXIT

# ── 解析选中的预设列表: 输出 "id|draft_dir" 每行 ──
selected_presets() {
  while IFS='|' read -r pid pdraft; do
    [ -z "$pid" ] && continue
    if [ -z "$IDS" ]; then
      echo "$pid|$pdraft"
    else
      for want in $IDS; do
        [ "$want" = "$pid" ] && echo "$pid|$pdraft"
      done
    fi
  done <<< "$PRESET_REGISTRY"
}

# ── 探测 standard 预设源（测试注入优先, 再环境变量, 再 npm 全局, 再常见路径）──
# 注: ${DSH_INSTALL_DIR:-} 默认空串 — set -u 下直接 $DSH_INSTALL_DIR 会 unbound variable
if [ -z "$STD_SRC" ]; then
  for cand in \
    "${DSH_INSTALL_DIR:-}/config/agent-presets/standard" \
    "$(npm root -g 2>/dev/null || true)/@deepseek-ai/dsh/config/agent-presets/standard" \
    "$HOME/.nvm/current/lib/node_modules/@deepseek-ai/dsh/config/agent-presets/standard"; do
    if [ -d "$cand" ] && [ -f "$cand/agent.cordis.yml" ]; then STD_SRC="$cand"; break; fi
  done
fi
[ -d "$STD_SRC" ] || degrade "standard 预设源未找到（--standard-from 注入或 ${DSH_INSTALL_DIR:-DSH_INSTALL_DIR}/npm root -g 探测）"
[ -f "$STD_SRC/agent.cordis.yml" ] || degrade "standard 预设源缺 agent.cordis.yml: $STD_SRC"

# ── persona 块提取（python 状态机: 顶层 "- id: " 边界, splitlines 兼容 CRLF）──
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

# ── 单预设校验 ──
check_one() { # <id> <draft_dir> <target> — 返回 0 一致 / 1 漂移 / 2 降级
  local pid="$1" draft="$2" target="$3"
  local persona_block="$draft/persona-block.yml" preset_yml="$draft/preset.yml"

  if [ ! -f "$target/agent.cordis.yml" ]; then
    echo "未安装: ${target}/agent.cordis.yml 不存在"
    echo "修复: bash scripts/control-tower/install-dsh-preset.sh --install ${pid}"
    return 1
  fi
  local DRIFT=""
  local BLOCK_TMP
  BLOCK_TMP=$(mktemp /tmp/idp-block.XXXXXX)
  TMPFILES="$TMPFILES $BLOCK_TMP"
  extract_persona "$target/agent.cordis.yml" > "$BLOCK_TMP" 2>/dev/null # swallow-ok: 无 persona 行时 exit 3, 由下方 EXIT_P 显式捕获
  local EXIT_P=$?
  if [ "$EXIT_P" -ne 0 ]; then
    DRIFT="${DRIFT}  漂移: agent.cordis.yml 无 persona 行（预设结构被破坏）\n"
  elif ! diff -q "$persona_block" "$BLOCK_TMP" >/dev/null 2>&1; then
    DRIFT="${DRIFT}  漂移: agent.cordis.yml persona 与仓库 persona-block.yml 不一致\n"
  fi
  if ! diff -q "$preset_yml" "$target/preset.yml" >/dev/null 2>&1; then
    DRIFT="${DRIFT}  漂移: preset.yml 与仓库不一致\n"
  fi
  if [ -n "$DRIFT" ]; then
    echo "预设漂移检测（已安装 ${target} vs 仓库 ${draft}）:"
    printf "%b" "$DRIFT"
    echo "修复: bash scripts/control-tower/install-dsh-preset.sh --install ${pid}"
    return 1
  fi
  echo "SYNC-OK: ${pid} 已安装预设与仓库一致（${target}）"
  return 0
}

# ── 单预设落位 ──
install_one() { # <id> <draft_dir> <target> — 返回 0 成功
  local pid="$1" draft="$2" target="$3"
  local persona_block="$draft/persona-block.yml" preset_yml="$draft/preset.yml"

  [ -f "$persona_block" ] || degrade "仓库 persona-block.yml 缺失: ${persona_block}"
  [ -f "$preset_yml" ] || degrade "仓库 preset.yml 缺失: ${preset_yml}"

  local PARENT
  PARENT=$(dirname "$target")
  mkdir -p "$PARENT" || degrade "DSH home 不可写: ${PARENT}"
  rm -rf "$target"
  cp -R "$STD_SRC" "$target" || degrade "复制 standard 预设失败"

  # 替换 persona 行 — 先验证源文件有 persona 行（fail-closed: 绝不产出坏预设）
  extract_persona "$target/agent.cordis.yml" >/dev/null 2>&1 \
    || { rm -rf "$target"; degrade "standard 预设无 persona 行, 拒绝落位（防产出坏预设）"; }

  local TMP_CORDIS
  TMP_CORDIS=$(mktemp /tmp/idp-cordis.XXXXXX)
  TMPFILES="$TMPFILES $TMP_CORDIS"
  python3 - "$target/agent.cordis.yml" "$persona_block" "$TMP_CORDIS" << 'PY'
import sys
lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
block = open(sys.argv[2], encoding="utf-8").read().splitlines()
start = next((i for i, l in enumerate(lines) if l.strip() == "- id: persona"), None)
if start is None:
    sys.exit(3)
end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("- id: ")), len(lines))
out = lines[:start] + block + lines[end:]
open(sys.argv[3], "w", encoding="utf-8").write("\n".join(out) + "\n")
PY
  local REPLACED=$?
  [ "$REPLACED" -eq 0 ] || { rm -rf "$target"; degrade "persona 行替换失败"; }
  mv "$TMP_CORDIS" "$target/agent.cordis.yml"

  cp "$preset_yml" "$target/preset.yml" || degrade "替换 preset.yml 失败"
  printf 'source: %s\ninstalled-at: %s\n' "$REPO_DIR/$draft" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$target/.synova-preset-version"

  echo "SYNC-OK: 预设已落位 ${pid} → ${target}"
  echo "  - agent.cordis.yml persona ← ${persona_block}"
  echo "  - preset.yml ← ${preset_yml}"
  return 0
}

# ── 主流程 ──
OVERALL=0
COUNT=0
while IFS='|' read -r pid pdraft; do
  [ -z "$pid" ] && continue
  COUNT=$((COUNT + 1))
  DRAFT="$REPO_DIR/$pdraft"
  TARGET="$DSH_HOME/.agent-presets/$pid"
  if [ "$MODE" = "check" ]; then
    check_one "$pid" "$DRAFT" "$TARGET" || OVERALL=1
  else
    install_one "$pid" "$DRAFT" "$TARGET" || OVERALL=1
  fi
done < <(selected_presets)

if [ "$COUNT" -eq 0 ]; then
  degrade "没有匹配的预设（可用: synova-dsh synova-devdoc）"
fi

exit "$OVERALL"
