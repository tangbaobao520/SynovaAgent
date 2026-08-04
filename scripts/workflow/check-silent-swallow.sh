#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-silent-swallow.sh — D313 M5b 静默吞错扫描器 + M5 UTF-8 强制检查器
#
# 扫描 scripts/ 中 `2>/dev/null` 吞错点（D300 Check4 假绿根因）。
# **是报告器不是修复器** — 622 处不全修，只报告风险分类。
#
# 分类:
#   level-0 安全: 行内 `|| true` + 显式豁免注释 `# swallow-ok:`
#   level-1 警告: 探测类 `if cmd 2>/dev/null` 有 else 分支
#   level-2 高危: `VAR=$(cmd 2>/dev/null)` 无 fallback / `cmd 2>/dev/null || true` 双静默无注释
#
# 模式:
#   check-silent-swallow.sh              # 全量扫描分类报告（exit 0）
#   check-silent-swallow.sh --strict     # scripts/ci/ + control-tower/ 新增 level-2 → exit 1
#   check-silent-swallow.sh --utf8 [file] # UTF-8 合规扫描（.sh 头块 / .py reconfigure）
#   check-silent-swallow.sh --diff       # git diff 新增行扫描（pre-commit 组 2 挂载）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

MODE="scan"
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --strict) MODE="strict" ;;
    --utf8) MODE="utf8" ;;
    --diff) MODE="diff" ;;
    *) [ -z "$TARGET" ] && TARGET="$arg" ;;
  esac
done

# ═══ --utf8: UTF-8 合规扫描 ═══
if [ "$MODE" = "utf8" ]; then
  if [ -n "$TARGET" ]; then
    # 单文件检查
    case "$TARGET" in
      *.sh)
        if grep -q "PYTHONIOENCODING" "$TARGET" 2>/dev/null; then
          echo "[utf8] ✅ $TARGET 带头块"
        else
          echo "[utf8] ❌ $TARGET 缺 PYTHONIOENCODING 头块"
        fi
        ;;
      *.py)
        if grep -q "reconfigure(encoding" "$TARGET" 2>/dev/null; then
          echo "[utf8] ✅ $TARGET 有 reconfigure"
        else
          echo "[utf8] ❌ $TARGET 缺 sys.stdout.reconfigure"
        fi
        ;;
      *)
        # 非脚本文件: 检查 UTF-8 编码合法性
        if python3 -c "
import sys
try:
    data = open('$TARGET', 'rb').read()
    data.decode('utf-8')
    sys.exit(0)
except Exception:
    sys.exit(1)
" 2>/dev/null; then
          echo "[utf8] ✅ $TARGET 是合法 UTF-8"
        else
          echo "[utf8] ❌ $TARGET 非 UTF-8 编码"
        fi
        ;;
    esac
    exit 0
  fi
  # 全量扫描
  MISSING=0
  for f in "$REPO_DIR"/scripts/ci/*.sh "$REPO_DIR"/scripts/control-tower/*.sh "$REPO_DIR"/scripts/workflow/*.sh "$REPO_DIR"/scripts/hooks/*.sh "$REPO_DIR"/scripts/checks/*.sh; do
    [ -f "$f" ] || continue
    if ! grep -q "PYTHONIOENCODING" "$f" 2>/dev/null; then
      echo "[utf8] ❌ $f 缺 PYTHONIOENCODING 头块"
      MISSING=$((MISSING + 1))
    fi
  done
  for f in "$REPO_DIR"/scripts/control-tower/*.py "$REPO_DIR"/scripts/workflow/*.py "$REPO_DIR"/scripts/audit/*.py; do
    [ -f "$f" ] || continue
    if ! grep -q "reconfigure(encoding" "$f" 2>/dev/null; then
      echo "[utf8] ⚠️  $f 缺 sys.stdout.reconfigure（非 CI 门禁可豁免）"
    fi
  done
  if [ "$MISSING" -gt 0 ]; then
    echo "[utf8] ❌ $MISSING 个 .sh 缺头块"
    exit 1
  fi
  echo "[utf8] ✅ 全部 CI .sh 已带头块"
  exit 0
fi

# ═══ --diff: git diff 新增行扫描（pre-commit 组 2 挂载）═══
if [ "$MODE" = "diff" ]; then
  VIOLATIONS=0
  # 只扫描新增的 .sh/.py 文件（避免对 80+ 文件大暂存生成全 diff 拖慢 pre-commit）
  SH_FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null | grep -E '\.sh$' | grep -v 'check-silent-swallow.sh' || true)
  if [ -z "$SH_FILES" ]; then
    echo "[silent-swallow] ✅ 无新增 .sh — 跳过"
    exit 0
  fi
  while IFS= read -r sf; do
    [ -z "$sf" ] && continue
    # 只扫新增行（^+）含 2>/dev/null 且无 fallback/豁免
    DIFF_LINES=$(git diff --cached -- "$sf" 2>/dev/null | grep -E '^\+' | grep '2>/dev/null' || true)
    if [ -n "$DIFF_LINES" ]; then
      while IFS= read -r line; do
        [ -z "$line" ] && continue
        # 豁免: 显式 swallow-ok / 有 fallback (||) / 探测型 (| grep -q 在 if 中)
        if ! echo "$line" | grep -q 'swallow-ok' \
           && ! echo "$line" | grep -qE '2>/dev/null.*(\|\||&&)' \
           && ! echo "$line" | grep -qE '2>/dev/null\s*\|\s*grep -q'; then
          echo "[silent-swallow] ❌ $sf: $line"
          VIOLATIONS=$((VIOLATIONS + 1))
        fi
      done <<< "$DIFF_LINES"
    fi
  done <<< "$SH_FILES"
  if [ "$VIOLATIONS" -gt 0 ]; then
    echo "[silent-swallow] ❌ $VIOLATIONS 处新增静默吞错（如需豁免加 # swallow-ok: 注释）"
    exit 1
  fi
  echo "[silent-swallow] ✅ 无新增静默吞错"
  exit 0
fi

# ═══ 默认: 全量扫描分类报告 ═══
SCAN_DIRS="$REPO_DIR/scripts/ci $REPO_DIR/scripts/control-tower"
[ "$MODE" = "strict" ] && SCAN_DIRS="$REPO_DIR/scripts/ci $REPO_DIR/scripts/control-tower"

L2_COUNT=0
L1_COUNT=0
L0_COUNT=0

for dir in $SCAN_DIRS; do
  for f in "$dir"/*.sh; do
    [ -f "$f" ] || continue
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in
        *"swallow-ok"*) L0_COUNT=$((L0_COUNT + 1)) ;;
        *"2>/dev/null || true"*)
          echo "[level-2] $f: $line"
          L2_COUNT=$((L2_COUNT + 1))
          ;;
        *"2>/dev/null"*)
          if echo "$line" | grep -qE 'VAR=\$\(.*2>/dev/null\)' || echo "$line" | grep -qE '=\$\(.*2>/dev/null.*\)$'; then
            echo "[level-2] $f: $line"
            L2_COUNT=$((L2_COUNT + 1))
          else
            L1_COUNT=$((L1_COUNT + 1))
          fi
          ;;
      esac
    done < "$f"
  done
done

echo "[silent-swallow] 扫描完成: level-0=$L0_COUNT level-1=$L1_COUNT level-2=$L2_COUNT"
if [ "$MODE" = "strict" ] && [ "$L2_COUNT" -gt 0 ]; then
  echo "[silent-swallow] ❌ strict 模式: $L2_COUNT 处 level-2 高危吞错"
  exit 1
fi
exit 0
