#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# check-main-green.sh — D653: 合入即绿门禁（拦住"新红进入 main"）
#
# 背景: D593 在 main 留红测试。check-ci-stale-red.sh 只事后告警 run 级红灯超时，
#       拦不住"新红悄悄进 main"（红常态化 = 信号失效, CT-39 同型 M1）。
#       机制: 基线快照存 git（tests/control-tower/main-red-baseline.txt），
#       当前红 − 基线 − 豁免 > 0 → 新增匿名红 → 点名阻断 + 写 CTO 待办。
#
# 契约 (铁律 47):
#   @input  --current <file>   当前失败测试文件列表（每行一个 tests/**.test.ts）
#           --from-log <file>  vitest verbose 输出（解析 " FAIL " 行, CI test job 用）
#           --self-check       校验基线+豁免文件格式（pre-commit 组 15, 触碰时跑）
#           --baseline <path>  --exemptions <path>（注入缝, 默认 tests/control-tower/main-red-*.txt）
#           --todo <path>      待办文件路径（注入缝, 默认 docs/synova/coordination/MAIN-RED-NEW.md）
#   @output — 新增匿名红清单（点名）+ 统计; 无新增 → "MAIN-GREEN-OK"
#   @exit   — 0 无新增匿名红（新增但已豁免 = 有归属, 放行并提示）
#             1 新增匿名红（无豁免登记）→ 阻断 + 写 CTO 待办（带 FIRST_SEEN, 超 24h 标升级）
#             2 降级（基线缺失/不可读——没基线就无法判定"新增", fail-closed）
#   @degraded — 基线/豁免文件缺失或不可读 → exit 2 + stderr "degraded: <原因>"（铁律 11）
#
# 用法: bash scripts/control-tower/check-main-green.sh --current <file>
# 集成: ① ci.yml test job 失败分支（--from-log, 新增匿名红 = 新红入 main → 阻断）
#       ② pre-commit-check.sh 组 15（--self-check, 基线/豁免被触碰时校验格式）
#       ③ gen-cto-health.py / cron（独立巡检, 待办 24h 升级）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${SYNO_REPO_ROOT:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
BASELINE="$ROOT/tests/control-tower/main-red-baseline.txt"
EXEMPTIONS="$ROOT/tests/control-tower/main-red-exemptions.txt"
TODO_FILE="$ROOT/docs/synova/coordination/MAIN-RED-NEW.md"
MODE=""
CURRENT_FILE=""
FROM_LOG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --self-check) MODE="self" ;;
    --current) MODE="current"; CURRENT_FILE="${2:-}"; shift ;;
    --from-log) MODE="log"; FROM_LOG="${2:-}"; shift ;;
    --baseline) BASELINE="${2:-}"; shift ;;
    --exemptions) EXEMPTIONS="${2:-}"; shift ;;
    --todo) TODO_FILE="${2:-}"; shift ;;
    *) echo "degraded: 未知参数 $1（用法: check-main-green.sh --current <file>|--from-log <file>|--self-check）" >&2; exit 2 ;;
  esac
  shift
done

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

# ── self-check: 基线/豁免格式校验（pre-commit 组 15 触碰时跑）──
if [ "$MODE" = "self" ]; then
  SELF_HITS=""
  # 基线: 非注释行必须是 tests/**.test.ts 形态
  if [ ! -f "$BASELINE" ]; then
    echo "degraded: 基线文件缺失 ${BASELINE}（合入即绿无基线 = 门禁失效）" >&2
    exit 2
  fi
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in \#*) continue ;; esac
    echo "$line" | grep -qE '^tests/[A-Za-z0-9._/-]+\.test\.ts$' || \
      SELF_HITS="${SELF_HITS}基线非法行: ${line}"$'\n'
  done < "$BASELINE"
  # 豁免: 非注释行必须 <路径> # <归属说明>
  if [ -f "$EXEMPTIONS" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in \#*) continue ;; esac
      echo "$line" | grep -qE '^tests/\S+\.test\.ts\s+#\s+\S+' || \
        SELF_HITS="${SELF_HITS}豁免非法行(需 <路径> # <任务号/理由>): ${line}"$'\n'
    done < "$EXEMPTIONS"
  fi
  if [ -n "$SELF_HITS" ]; then
    echo -e "${RED}❌ D653 self-check: 基线/豁免文件格式非法${NC}"
    echo "$SELF_HITS" | grep -v '^$' | sed 's/^/  - /'
    exit 1
  fi
  echo "MAIN-GREEN-OK: 基线/豁免文件格式合法（D653 self-check 通过）"
  exit 0
fi

# ── 基线加载（缺失 = 无法判定新增 = fail-closed 降级）──
if [ ! -r "$BASELINE" ]; then
  echo "degraded: 基线文件不可读 ${BASELINE}（无法判定新增红, fail-closed）" >&2
  exit 2
fi
grep -vE '^\s*#|^\s*$' "$BASELINE" | sort -u > /dev/null 2>&1 || true
BASELINE_SET=$(grep -vE '^\s*#|^\s*$' "$BASELINE" 2>/dev/null | sort -u)
[ -n "${EXEMPTIONS:-}" ] && [ -f "$EXEMPTIONS" ] && \
  EXEMPT_SET=$(grep -vE '^\s*#|^\s*$' "$EXEMPTIONS" 2>/dev/null | awk -F' #' '{print $1}' | sort -u) || EXEMPT_SET=""

# ── 当前红列表 ──
case "$MODE" in
  current)
    [ -z "$CURRENT_FILE" ] && { echo "degraded: --current 需要文件参数" >&2; exit 2; }
    [ -r "$CURRENT_FILE" ] || { echo "degraded: 当前红列表不可读 $CURRENT_FILE" >&2; exit 2; }
    CURRENT_SET=$(grep -vE '^\s*#|^\s*$' "$CURRENT_FILE" | sort -u)
    ;;
  log)
    [ -z "$FROM_LOG" ] && { echo "degraded: --from-log 需要文件参数" >&2; exit 2; }
    [ -r "$FROM_LOG" ] || { echo "degraded: vitest 输出不可读 $FROM_LOG" >&2; exit 2; }
    # 剥 ANSI 后提取 FAIL 行的测试文件（与 ci.yml test job 同款提取）
    CURRENT_SET=$(sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$FROM_LOG" | grep " FAIL " | grep -oE 'tests/\S+\.test\.ts' | sort -u)
    ;;
  *)
    echo "degraded: 缺模式参数（--current <file>|--from-log <file>|--self-check）" >&2
    exit 2
    ;;
esac

# ── 新增 = 当前 − 基线; 匿名 = 新增 − 豁免 ──
NEW_ANON=$(comm -23 <(echo "$CURRENT_SET") <(echo "$BASELINE_SET"$'\n'"$EXEMPT_SET" | sort -u))
NEW_EXEMPT=$(comm -23 <(echo "$CURRENT_SET") <(echo "$BASELINE_SET" | sort -u) | comm -12 - <(echo "$EXEMPT_SET" | sort -u))

if [ -z "$NEW_ANON" ]; then
  [ -n "$NEW_EXEMPT" ] && echo -e "${YELLOW}ℹ D653: 新增红 ${NEW_EXEMPT//$'\n'/ } 已登记豁免（有归属, 放行）${NC}"
  echo "MAIN-GREEN-OK: 无新增匿名红（D653 通过; 基线 $(echo "$BASELINE_SET" | grep -c .) 条 + 豁免 $(echo "$EXEMPT_SET" | grep -c .) 条）"
  exit 0
fi

# ── 匿名红: 点名 + 写 CTO 待办（仿 CT-39 CI-STALE-RED 模式, 带 FIRST_SEEN 24h 升级）──
echo -e "${RED}❌ D653: 新增匿名红进入 main（无豁免登记 = 无归属）${NC}"
echo "$NEW_ANON" | sed 's/^/  - /'
NOW_EPOCH=$(date +%s)
FIRST_SEEN="首次发现 $(date '+%Y-%m-%d %H:%M')"
if [ -f "$TODO_FILE" ]; then
  FS_EPOCH=$(stat -f %m "$TODO_FILE" 2>/dev/null || stat -c %Y "$TODO_FILE" 2>/dev/null || echo "$NOW_EPOCH")
  AGE_H=$(( (NOW_EPOCH - FS_EPOCH) / 3600 ))
  FIRST_SEEN="首次发现 $(date -r "$TODO_FILE" '+%Y-%m-%d %H:%M' 2>/dev/null || date '+%Y-%m-%d %H:%M')（已 ${AGE_H}h）"
  [ "$AGE_H" -ge 24 ] && echo -e "${RED}🚨 该匿名红已挂账 ${AGE_H}h（≥24h 未认领）——入 CTO 待办升级${NC}"
fi
if [ "$MODE" != "check-only" ] && [ ! -f "$TODO_FILE" ]; then
  {
    echo "# main 新增匿名红待办（D653 自动生成）"
    echo ""
    echo "> ${FIRST_SEEN} | 合入即绿门禁检出无归属新增红"
    echo ""
    echo "## 匿名红清单"
    echo ""
    echo "$NEW_ANON" | sed 's/^/- /'
    echo ""
    echo "## 该做什么"
    echo ""
    echo "1. CTO/交付方认领: 修复，或登记豁免 tests/control-tower/main-red-exemptions.txt（带任务号/理由）"
    echo "2. 匿名红挂账 ≥24h 未认领 → 升级（本文件 mtime 即 FIRST_SEEN）"
    echo "3. 红线: 红常态化 = 信号失效（M1 同型）。要么修，要么显式豁免，绝不无视。"
  } > "$TODO_FILE" 2>/dev/null || true
  [ -f "$TODO_FILE" ] && echo "待办已写: $TODO_FILE"
fi
exit 1
