#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# Loop Engineering V5.3 — pre-commit 本地精简版（D962 2a① 重写）
# 本地 10 条目: #46 GATEKEEPER+fastlane / #11家 CT-34 早退 / #17 主树占用 /
#   #33 绕过审计 / #3 硬编码(改判保留) / #30 DiagnosticModule / #38 G10 / #39 G11 /
#   gate-hits 钩子 / D943 断面(×3 不删)。34 项迁 CI: SYNO_CI=1 走 §CI 权威区（双端单一实现）。
# 修复: D260 死分支赋值；CP3 ||true→三态；组7a 正则保全；PYBIN 全局化；
#   G12 \$ 逃逸 bug（恒绿 fail-open）。三态: 0过/1拦/2降级登记。
# ═══════════════════════════════════════════════════════════════
set +e
HARD_FAIL=0; WARN_COUNT=0; SOFT_COUNT=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

log_gate() {  # 契约(铁律47): @input 检查名+hit|miss; @output JSONL→gate-hits（旁路4数据源）
  local g="$1" r="$2"; [ -z "$g" ] && return 0
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"gate\": \"${g}\", \"result\": \"${r}\", \"branch\": \"${_GATE_BRANCH}\"}" >> "${GATE_HITS_LOG}" 2>/dev/null || true  # swallow-ok: 统计非门禁
}
_emit_matches() {  # FIX-015: CI 下不截断（原 head -8 使第 9 行起 CI 不可见）+ ::error 注解带失败断言原文
  local m="$1" name="${2:-}" n="${3:-8}"
  if [ "${GITHUB_ACTIONS:-}" = "true" ]; then
    echo "$m" | while read -r l; do [ -n "$l" ] && echo "     ${l}"; done
    [ -n "$name" ] && echo "::error title=IronLaws:${name}::$(echo "$m" | head -1 | tr -d '%' | cut -c1-280)"
  else
    echo "$m" | head -"$n" | while read -r l; do [ -n "$l" ] && echo "     ${l}"; done
  fi
}
hard_check() {  # @三态 1: 命中即 HARD_FAIL（本地硬拦）
  local name="$1" matches="$2" count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    _emit_matches "$matches" "$name" 8
    HARD_FAIL=$((HARD_FAIL + 1)); log_gate "$name" hit
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"; log_gate "$name" miss
  fi
}
soft_check() {  # @三态 1: 本地软 / SYNO_CI=1 转硬（D516；D542 CI 下必显 ❌）
  local name="$1" matches="$2" count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    if [ "${SYNO_CI:-0}" = "1" ]; then
      echo -e "  ${RED}❌ ${name}: ${count} 处  [CI strict——软提示转硬]${RESET}"
      HARD_FAIL=$((HARD_FAIL + 1))
    else
      echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处  [V5 软提示——CI 为权威]${RESET}"
      SOFT_COUNT=$((SOFT_COUNT + 1))
    fi
    _emit_matches "$matches" "$([ "${SYNO_CI:-0}" = "1" ] && echo "$name")" 8
    log_gate "$name" hit
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"; log_gate "$name" miss
  fi
}
warn_check() {  # CI 也转硬（D542）
  local name="$1" matches="$2" count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    if [ "${SYNO_CI:-0}" = "1" ]; then
      echo -e "  ${RED}❌ ${name}: ${count} 处  [CI strict]${RESET}"; HARD_FAIL=$((HARD_FAIL + 1))
    else
      echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处  [警告]${RESET}"; WARN_COUNT=$((WARN_COUNT + 1))
    fi
    _emit_matches "$matches" "$([ "${SYNO_CI:-0}" = "1" ] && echo "$name")" 5
    log_gate "$name" hit
  fi
}
soft_pass() { echo -e "  ${GREEN}✅ $1${RESET}"; }

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
GATE_HITS_LOG="${SYNO_GATE_HITS_LOG:-$ROOT/.claude/gate-hits.log}"
_GATE_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
PYBIN=""
for _c in python3 python py; do  # PYBIN 三级探测（PLATFORM-CHECKLIST #1，禁裸 python3）
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done


# ── #46 GATEKEEPER 前置: 当日 detected-bypass 硬拦（ACK=1 人工复核降级 D421）──
BYPASS_LOG="$ROOT/.claude/bypass.log"
if [ -f "$BYPASS_LOG" ] && [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  TODAY=$(date +%Y-%m-%d)
  BYPASS_COUNT=$(grep -c "${TODAY}.*detected-bypass" "$BYPASS_LOG" 2>/dev/null | tr -d '\n\r' || echo 0)
  BYPASS_COUNT=${BYPASS_COUNT//[^0-9]/}; [ -z "$BYPASS_COUNT" ] && BYPASS_COUNT=0
  if [ "$BYPASS_COUNT" -gt 0 ]; then
    echo "[GATEKEEPER] 检测到今日 ${BYPASS_COUNT} 次 --no-verify 绕过记录"
    if [ "${SYNO_GATEKEEPER_ACK:-0}" = "1" ]; then
      echo "[GATEKEEPER] 已人工确认 — 降级为告警放行本次提交"; mkdir -p "$ROOT/.codex/control-tower/logs"
      echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"component\": \"gatekeeper\", \"reason\": \"ACK=1 放行 ${BYPASS_COUNT} 次 detected-bypass\"}" >> "$ROOT/.codex/control-tower/logs/degraded-events.log" 2>/dev/null || true  # swallow-ok: 降级登记
    else
      echo "[GATEKEEPER] 请使用: git synova-commit --task-id <D#> ...；误报复核可用 SYNO_GATEKEEPER_ACK=1"
      exit 1
    fi
  fi
fi

# ── diff 缓存（D390 武装注入缝: 仅 SYNO_TEST_ARM=1 可注入；CI 用 base...HEAD）──
if [ "${SYNO_TEST_ARM:-0}" = "1" ]; then
  GIT_CACHED_NAMES="${SYNO_GIT_CACHED_NAMES:-$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)}"
  GIT_CACHED_ALL_NAMES="${SYNO_GIT_CACHED_ALL_NAMES:-$GIT_CACHED_NAMES}"
  GIT_CACHED_ADDED_NAMES="${SYNO_GIT_CACHED_ADDED_NAMES:-$(git -c core.quotepath=false diff --cached --name-only --diff-filter=A 2>/dev/null || true)}"
  GIT_CACHED_DIFF="${SYNO_GIT_CACHED_DIFF:-$(git diff --cached 2>/dev/null || true)}"
else
  _DIFFARGS=(--name-only --diff-filter=ACMR)
  if [ "${GITHUB_ACTIONS:-}" = "true" ] && [ -n "${SYNO_DIFF_BASE:-}" ]; then
    _R="${SYNO_DIFF_BASE}...HEAD"; GIT_CACHED_NAMES="$(git -c core.quotepath=false diff "${_DIFFARGS[@]}" "$_R" 2>/dev/null || true)"
    GIT_CACHED_ADDED_NAMES="$(git -c core.quotepath=false diff --name-only --diff-filter=A "$_R" 2>/dev/null || true)"
    GIT_CACHED_DIFF="$(git diff "$_R" 2>/dev/null || true)"
  else
    GIT_CACHED_NAMES="$(git -c core.quotepath=false diff --cached "${_DIFFARGS[@]}" 2>/dev/null || true)"
    GIT_CACHED_ADDED_NAMES="$(git -c core.quotepath=false diff --cached --name-only --diff-filter=A 2>/dev/null || true)"
    GIT_CACHED_DIFF="$(git diff --cached 2>/dev/null || true)"
  fi
  GIT_CACHED_ALL_NAMES="$GIT_CACHED_NAMES"
fi
# D962 死分支修复: G10/G11 数据源赋值（原 CHANGED_FILES/STAGED_FILES 全脚本零赋值→恒跳过）
CHANGED_FILES="$GIT_CACHED_ALL_NAMES"; STAGED_FILES="$GIT_CACHED_ALL_NAMES"; STAGED_ALL="$GIT_CACHED_ALL_NAMES"

# ── FIX-015: 「代码字面量」类判定的**按路径**自伤排除（hunk 级 `+++ b/<path>`）──
# 根因（#803 CI 实测 12 处 100% 自伤）: 这些判定扫 $GIT_CACHED_DIFF（本 PR 全 diff），而
#   检查脚本自身的正则/标签/注解、测试夹具的**故意注入**、文档对规则的**引用**，本身就含这些
#   字面量 ⇒ 检查在自己的 diff 上自伤报红（B 类生产真红 = 0 处）。
# 规则: 只有**源面代码文件**的 added 行参与判定；本脚本自身 / tests/** / *.test.* /
#   docs/** / memory/** / .claude/** / task-state/** / *.md|txt|html 一律按路径排除。
# 禁行内字面量白名单（那会把真注入一起放过）——排除只按文件路径，且是 hunk 级。
_SELF_REL="${BASH_SOURCE[0]}"
case "$_SELF_REL" in
  "$ROOT"/*) _SELF_REL="${_SELF_REL#"$ROOT"/}" ;;
esac
code_added_lines() {  # @output 仅「源面代码文件」的 added 行（含前导 +）
  awk -v self="$_SELF_REL" '
    /^\+\+\+ / {
      p=$2; sub(/^b\//, "", p)
      skip = (p==self) || (p=="/dev/null") \
          || (p ~ /(^|\/)tests\//) || (p ~ /\.test\.[A-Za-z]+$/) \
          || (p ~ /(^|\/)(docs|memory|\.claude|task-state)\//) \
          || (p ~ /\.(md|txt|html)$/)
      next
    }
    skip { next }
    /^\+\+\+/ { next }
    /^\+/ { print }
  ' <<< "$GIT_CACHED_DIFF"
}

# ── #11家 CT-34 纯文档早退（豁免，仅 Secrets + 骨架D547 + Notes D472 硬拦）──
DOC_PREFIX_RE='^(docs/.*\.(md|html|txt)$|\.claude/task-briefs/.*\.(md|html|txt)$|memory/.*\.(md|html|txt)$|task-state/.*\.(json|md)$|[^/]+\.(md|html|txt)$)'
# 空暂存=fail-closed 不豁免；非空且全部命中文档前缀=纯文档
DOC_ONLY=0
if [ -n "$STAGED_ALL" ] && [ -z "$(echo "$STAGED_ALL" | grep -vE "$DOC_PREFIX_RE" || true)" ]; then DOC_ONLY=1; fi
if [ "$DOC_ONLY" -eq 1 ]; then
  echo "  纯文档提交 (CT-34): 豁免 — 仅 Secrets + Notes"
  EXEMPT_LOG="${SYNO_EXEMPT_LOG:-$ROOT/.claude/exempt.log}"; mkdir -p "$(dirname "$EXEMPT_LOG")" 2>/dev/null || true
  echo "$(date +%Y-%m-%dT%H:%M:%S%z) | EXEMPT | staged=$(echo "$STAGED_ALL" | tr '\n' ',' | sed 's/,$//')" >> "$EXEMPT_LOG" 2>/dev/null || true  # swallow-ok: 豁免审计登记
  if bash "$ROOT/scripts/check-secrets.sh" 2>&1; then
    # D547 骨架 brief 硬拦并入早退路径（纯 brief 提交走不到 CI 区——结构性不可达洞）
    SKEL_EARLY=$(echo "$STAGED_ALL" | grep '^\.claude/task-briefs/.*\.md$' || true)
    for bf in $SKEL_EARLY; do
      if [ -f "$ROOT/$bf" ] && grep -q '认领: <agent>\|<本任务在哪一层' "$ROOT/$bf" 2>/dev/null; then
        echo -e "  ${RED}❌ 骨架 brief 占位符未填（D547）: ${bf} [硬阻断]${RESET}"; exit 1
      fi
    done
    NOTES_TOUCHED_DOC=$(echo "$STAGED_ALL" | grep -E '^memory/notes/proposed/' || true)
    if [ -n "$NOTES_TOUCHED_DOC" ]; then
      if bash "$ROOT/scripts/control-tower/check-notes-lifecycle.sh"; then
        soft_pass "Notes 迁移门禁: proposed/ 无僵尸条目"
      else
        echo -e "  ${RED}❌ Notes 迁移门禁: proposed/ 僵尸条目 [硬阻断]${RESET}"; exit 1
      fi
    fi
    echo -e "  ${GREEN}✅ 纯文档提交豁免检查完成 (CT-34)${RESET}"; exit 0
  else
    echo -e "  ${RED}❌ Secrets 扫描失败 — 提交已拒绝${RESET}"; exit 1
  fi
fi

# ── fastlane 通道（bypass.log 单文件补记，唯一信号源=环境变量——D414 坑: 禁裸看暂存区防误触发）──
if [ "${SYNO_FASTLANE:-0}" = "1" ]; then
  log_gate "fastlane-bypass-only" hit
  if bash "$ROOT/scripts/check-secrets.sh" 2>&1; then
    echo -e "  ${GREEN}✅ Secrets 通过 — 纯补记放行${RESET}"; exit 0
  else
    echo -e "  ${RED}❌ Secrets 失败 — 拒绝${RESET}"; exit 1
  fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering V5.3 — pre-commit 本地精简版 (D962 2a①)"
echo "═══════════════════════════════════════════════════════════"

# ── #17 主树占用检测（D537 #2 / M8: 本地并行语义，CI 单 runner 无意义）──
_PAR_BLOCK_MSG=""
if [ "${SYNO_SKIP_PARALLEL_GUARD:-0}" != "1" ] && [ "${SYNO_SKIP_PARALLEL_WARN:-0}" != "1" ]; then
  case "$(git rev-parse --git-dir 2>/dev/null || echo '')" in
    *"/.git/worktrees/"*) : ;;
    *)
      _MAIN_DIRTY="$(git -C "$ROOT" status --porcelain 2>/dev/null | head -1 || true)"
      if [ -n "$_MAIN_DIRTY" ] && [ -f "$ROOT/scripts/control-tower/session_registry.py" ]; then
        _ACT_JSON=$("$PYBIN" "$ROOT/scripts/control-tower/session_registry.py" list --active 2>/dev/null </dev/null || true)
        if [ -n "$_ACT_JSON" ]; then
          _ACT_N=$(echo "$_ACT_JSON" | "$PYBIN" -c "
import json,sys,os,datetime
d=json.load(sys.stdin); now=datetime.datetime.now(datetime.timezone.utc)
w=int(os.environ.get('SYNO_PARALLEL_WINDOW','1800'))
def r(s):
    try:
        t=datetime.datetime.fromisoformat(s.get('last_seen_at',''))
        return (now-t.replace(tzinfo=t.tzinfo or datetime.timezone.utc)).total_seconds()<w
    except Exception: return False
print(sum(1 for s in d.get('sessions',[]) if r(s)))
" 2>/dev/null | tr -d '\r\n' || echo "")
          _ACT_N="${_ACT_N//[^0-9]/}"
          if [ -n "$_ACT_N" ] && [ "$_ACT_N" -gt 1 ]; then
            _PAR_BLOCK_MSG="主树脏且 ${_ACT_N} 个活跃 session — 并行互踩风险（M8）: python3 scripts/control-tower/worktree-manager.py create <任务名>"
          fi
        else
          echo -e "  ${YELLOW}⚠️  主树占用检测: registry 不可读 — 降级放行（铁律 11）${RESET}"
        fi
      fi
      ;;
  esac
fi
hard_check "主树占用检测 (D537 #2): 主树脏 + 多活跃 session" "${_PAR_BLOCK_MSG:-}"

# ── #33 绕过审计 7c（D438 强弱信号分离; 本地语义）──
POSSIBLE_COUNT=0; BYPASS_COUNT=0
if [ -f "$BYPASS_LOG" ]; then
  BYPASS_COUNT=$(grep -cE "$(date +%Y-%m-%d).*detected-bypass" "$BYPASS_LOG" 2>/dev/null | tr -d '\n\r' || echo 0)
  POSSIBLE_COUNT=$(grep -cE "$(date +%Y-%m-%d).*possible-bypass" "$BYPASS_LOG" 2>/dev/null | tr -d '\n\r' || echo 0)
  BYPASS_COUNT=${BYPASS_COUNT//[^0-9]/}; POSSIBLE_COUNT=${POSSIBLE_COUNT//[^0-9]/}
  [ -z "$BYPASS_COUNT" ] && BYPASS_COUNT=0; [ -z "$POSSIBLE_COUNT" ] && POSSIBLE_COUNT=0
fi
if [ "${BYPASS_COUNT:-0}" -ge 3 ]; then
  if [ "${SYNO_GATEKEEPER_ACK:-0}" = "1" ]; then
    echo -e "  ${YELLOW}⚠️  绕过审计: 今日 ${BYPASS_COUNT} 次 — 已人工确认 [告警]${RESET}"
  else
    soft_check "绕过审计: 24h 内 --no-verify ${BYPASS_COUNT} 次 — 已超限" "连续绕过（第 3 次起须修根因；误报可用 SYNO_GATEKEEPER_ACK=1）"
  fi
elif [ "${BYPASS_COUNT:-0}" -ge 2 ]; then
  echo -e "  ${YELLOW}⚠️  绕过审计: 今日 ${BYPASS_COUNT} 次 — 警告${RESET}"
elif [ "${POSSIBLE_COUNT:-0}" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠️  绕过审计: possible-bypass ${POSSIBLE_COUNT} 次（弱信号，U1 推送对账兜底）[告警不阻断]${RESET}"
else
  soft_pass "绕过审计"
fi

# ── #3 硬编码业务数据（CTO 改判保留·本地; linter 化前过渡）──
HARDCODE_DATA=""
STAGED_HTML=$(echo "$STAGED_ALL" | grep -E '\.(html|ts)$' | grep -v node_modules | grep -v '\.test\.' || true)
if [ -n "$STAGED_HTML" ]; then
  for hf in $STAGED_HTML; do
    [ -z "$hf" ] && continue; [ ! -f "$hf" ] && continue
    DEPS=$(grep -n "'marketing'\|'sales'\|'finance'\|'研发部'\|'市场部'\|'销售部'" "$hf" 2>/dev/null | grep -v "import\|export\|//\|/\*\|^\s*\*\|token.split\|dept.*=\|LAYER_EXPERTS\|experts:\|'org'\|'tech'\|'strategy'\|'knowledge'\|'business_model'\|'finance'\|'marketing'\|'sales'\|: \[" | head -3 || true)
    [ -n "$DEPS" ] && HARDCODE_DATA="${HARDCODE_DATA}  ${hf}: 可能硬编码业务数据\n"
  done
fi
soft_check "硬编码业务数据/类型 (#3 保留·本地)" "${HARDCODE_DATA:-}"

# ── #30 禁止新 DiagnosticModule（FIX-015: 判定面 = 源面代码 added 行，按路径排除自伤面）──
NEW_DIAG=$(code_added_lines | grep "DiagnosticModule" | grep -Ev "//|@deprecated|import type|hard_check|禁止新 DiagnosticModule|不要再使用 DiagnosticModule" || true)
soft_check "禁止 DiagnosticModule: 新模块须实现 Sentinel 接口" "${NEW_DIAG:-}"

# ── #38 G10 / #39 G11（D260 CP3 — 死分支已修活，首次真实执行）──
MISMATCH=""
CRITERIA_MAP="$ROOT/.codex/criteria-code-map.json"
BRIEF_FILE=$(echo "$CHANGED_FILES" | grep -m1 "\.claude/task-briefs/" || true)
if [ -f "$CRITERIA_MAP" ] && [ -n "$BRIEF_FILE" ] && [ -f "$ROOT/$BRIEF_FILE" ]; then
  CRITERIA=$(grep -oE '#CRITERIA[[:space:]]*[:=：][[:space:]]*[A-D]' "$ROOT/$BRIEF_FILE" 2>/dev/null | sed -E 's/.*[=:：][[:space:]]*//' | head -1 || true)
  if [ -n "$CRITERIA" ]; then
    CRITERIA_GLOBS=$("$PYBIN" -c "
import json
try: print('\n'.join(json.load(open('$CRITERIA_MAP')).get('criteria',{}).get('$CRITERIA',{}).get('glob',[])))
except Exception: pass
" 2>/dev/null || true)
    REGEX_GLOBS=$(echo "$CRITERIA_GLOBS" | sed 's/\*/.*/g; s/?/./g' | grep -v '^$' | paste -sd'|' -)
    if [ -n "$REGEX_GLOBS" ]; then
      for sf in $STAGED_FILES; do
        [ -n "$sf" ] && ! echo "$sf" | grep -qE "($REGEX_GLOBS)" && MISMATCH="${MISMATCH}  $sf (不在条件 $CRITERIA 映射区域)\n"
      done
      if [ -n "$MISMATCH" ]; then warn_check "G10: 条件区域不匹配" "$MISMATCH"; else soft_pass "G10: 条件区域检查通过 ($CRITERIA)"; fi
    else soft_pass "G10: 条件 $CRITERIA 无映射区域(跳过)"
    fi
  else soft_pass "G10: 无条件归属(跳过)"
  fi
else soft_pass "G10: 无 task brief 变更或无映射(跳过)"
fi
HAS_E2E=0; HAS_TESTS=0
BRIEF_ID=$(echo "$STAGED_FILES" | grep -oE '\.claude/task-briefs/[^.]+' | sed -E 's|^\.claude/task-briefs/||' | head -1 || true)
if [ -n "$BRIEF_ID" ] && [ -f "$ROOT/.claude/task-briefs/${BRIEF_ID}.md" ]; then
  HAS_E2E=$(grep -c "端到端\|e2e\|curl.*200\|HTTP.*200" "$ROOT/.claude/task-briefs/${BRIEF_ID}.md" 2>/dev/null | tr -d '\n\r' || echo 0)
  HAS_TESTS=$(echo "$STAGED_FILES" | grep -c "\.test\.ts" 2>/dev/null | tr -d '\n\r' || true)
  HAS_E2E=${HAS_E2E//[^0-9]/}; HAS_TESTS=${HAS_TESTS//[^0-9]/}
  [ -z "$HAS_E2E" ] && HAS_E2E=0; [ -z "$HAS_TESTS" ] && HAS_TESTS=0
  if [ "${HAS_E2E:-0}" -gt 0 ] && [ "${HAS_TESTS:-0}" -eq 0 ]; then
    warn_check "G11: 声明端到端验收但无测试文件" "$BRIEF_ID 声明端到端验收，暂存区无测试文件"
  else
    soft_pass "G11: 测试覆盖检查通过"
  fi
else
  soft_pass "G11: 无 task brief 变更(跳过)"
fi

# ── Secrets 全路径（#11 CI 权威侧; 保留脚本单点）──
if bash "$ROOT/scripts/check-secrets.sh" 2>&1 >/dev/null; then
  soft_pass "Secrets 扫描（全工作区）"
else
  echo -e "  ${RED}❌ Secrets 扫描失败${RESET}"; HARD_FAIL=$((HARD_FAIL + 1)); log_gate "Secrets 扫描" hit
fi

# ═════ CI 权威区（SYNO_CI=1 才执行；本地零成本跳过 <1s）═══════
# 迁 CI 34 项回归集紧凑内联（铁律38/桥接/接线/D296/D547）；完整 13 组语义由 iron-laws ::error 承担。
if [ "${SYNO_CI:-0}" = "1" ]; then
  echo -e "${CYAN}── CI 权威区（D962 迁移判定）──${RESET}"
  # 铁律38: as any / as never / as unknown as（跳注释行；FIX-015: 判定面 = 源面代码 added 行）
  M=$(code_added_lines | grep -E 'as (any|never)\b|as unknown as' | grep -vE '^\+\s*(//|/\*|\*|#)' || true)
  soft_check "as any / as never / as unknown as 零容忍（铁律38）" "$M"
  # 铁律46: engine-core 引用（白名单外; 含相对路径三重匹配）
  BRIDGE_FAIL=""
  for file in $(echo "$STAGED_ALL" | grep -E '^(src|packages)/.*\.ts$' | grep -v '\.test\.' | grep -vE 'src/init/engine-context\.ts|src/l4/graph-bridge\.ts|src/l4/diagnosis-graph-query\.ts' || true); do
    [ -f "$file" ] && grep -qE "packages/engine-core|\.\./engine-core|\.\./\.\./engine-core" "$file" 2>/dev/null && BRIDGE_FAIL="${BRIDGE_FAIL}  ${file}: 引用 engine-core (铁律46)\n"
  done
  soft_check "铁律46: 桥接/包级 engine-core 引用" "${BRIDGE_FAIL:-}"
  # 接线（铁律4/5: 新 export 须被引用——物理事实）
  NEW_IMPL=$(echo "$GIT_CACHED_ADDED_NAMES" | grep -E "^src/|^extensions/" | grep "\.ts$" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v "types\.ts$\|index\.ts$\|helpers\.ts$" || true)
  UNWIRED=""
  for file in $NEW_IMPL; do
    [ -f "$file" ] || continue
    for name in $(grep -oE 'export (function|class|const) [A-Za-z_][A-Za-z0-9_]*' "$file" 2>/dev/null | sed -E 's/^export (function|class|const) //' || true); do
      echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated' && continue
      WIRED=$(grep -rn "\b${name}\b" src/ --include="*.ts" 2>/dev/null | grep -v "export.*${name}" | grep -v "$file" | grep -v "\.test\." | head -1 || true)
      [ -z "$WIRED" ] && UNWIRED="${UNWIRED}${file}: export ${name} — 未被引用\n"
    done
  done
  soft_check "接线审计: 新 export 必须被引用 (铁律4/5)" "${UNWIRED:-}"
  # D296/D749 G12 认领制写集（brief_parser 单源 + D506 ±1 天窗 + 认领制 v2）
  SCOPE_TSV=$(mktemp); EXCL_TSV=$(mktemp)
  for B in $("$PYBIN" -c "
import datetime,glob
t=datetime.date.today()
print('\n'.join(f for k in (-1,0,1) for f in glob.glob('.claude/task-briefs/%s-*.md' % (t+datetime.timedelta(days=k)).isoformat())))
" 2>/dev/null); do
    [ -f "$B" ] || continue
    "$PYBIN" "$ROOT/scripts/control-tower/brief_parser.py" --q2-include "$B" 2>/dev/null | sed "s|^|$(basename "$B")\\t|" >> "$SCOPE_TSV" || true
    "$PYBIN" "$ROOT/scripts/control-tower/brief_parser.py" --q2-exclude "$B" 2>/dev/null | sed "s|^|$(basename "$B")\\t|" >> "$EXCL_TSV" || true
  done
  SCOPE_VIOLATION=$(STAGED_ALL="$STAGED_ALL" SCOPE_TSV="$SCOPE_TSV" EXCL_TSV="$EXCL_TSV" "$PYBIN" -c "
import os, re
def load(p):
    out = []
    try:
        for line in open(p, encoding='utf-8'):
            if '\t' in line:
                b, q = line.rstrip('\n').split('\t', 1)
                if q: out.append((b, q))
    except OSError: pass
    return out
scope, excl = load(os.environ['SCOPE_TSV']), load(os.environ['EXCL_TSV'])
m = lambda path, pat: re.search(r'(^|/)' + re.escape(pat) + r'$', path)
skip_re = re.compile(r'\.claude/|scripts/workflow/|\.codex/|memory/|docs/|task-state/.*\.(json|md)$|\.github/')
code_re = re.compile(r'\.(ts|tsx|js|jsx|json|py|sh)\$')
viol = []
for sf in (x.strip() for x in os.environ['STAGED_ALL'].split('\n')):
    if not sf or skip_re.search(sf) or not code_re.search(sf): continue
    claim = [b for b, p in scope if m(sf, p)]
    if not claim: viol.append('  %s (不在 Q2 范围内)' % sf); continue
    for b, ex in excl:
        if b in claim and m(sf, ex):
            viol.append('  %s (Q2 排除项禁止修改: %s, 来自 %s)' % (sf, ex, b)); break
print('\n'.join(viol))
" 2>/dev/null || true)
  rm -f "$SCOPE_TSV" "$EXCL_TSV"
  if [ -n "$SCOPE_VIOLATION" ]; then
    soft_check "G12: Q2 范围一致性（D296/D749）" "$SCOPE_VIOLATION"
  else
    soft_pass "G12: 所有文件均在 Q2 范围内"
  fi
  # D547 骨架 brief 占位符（第三次复发 → 物理硬阻断）
  SKEL_BRIEF=""
  for bf in $(echo "$STAGED_ALL" | grep -E '^\.claude/task-briefs/.*\.md$' || true); do
    [ -f "$ROOT/$bf" ] && grep -q '认领: <agent>\|<本任务在哪一层' "$ROOT/$bf" 2>/dev/null && SKEL_BRIEF="${SKEL_BRIEF}  ${bf}（骨架占位符未填）\n"
  done
  hard_check "骨架 brief 占位符检测（D547）" "${SKEL_BRIEF:-}"
fi

# ── D943: DSH 断面一致性（唯一源 DSH-断面.json；条件块外防 M1；--no-tree-check——带树校验归 daily-cto-board）──
if [ -z "$PYBIN" ]; then
  soft_check "DSH 断面一致性 (D943): 无可用 python（fail-closed，不静默跳过）" "1"
elif [ ! -f "$ROOT/scripts/control-tower/check-dsh-anchor.py" ]; then
  soft_check "DSH 断面一致性 (D943): 门禁脚本缺失 scripts/control-tower/check-dsh-anchor.py" "1"
else
  _DSH_ANCHOR_OUT="$("$PYBIN" "$ROOT/scripts/control-tower/check-dsh-anchor.py" --repo "$ROOT" --no-tree-check 2>&1)"
  _DSH_ANCHOR_RC=$?
  if [ "$_DSH_ANCHOR_RC" -eq 0 ]; then _DSH_ANCHOR_HITS=""; else _DSH_ANCHOR_HITS="$(printf '%s' "$_DSH_ANCHOR_OUT" | tail -8) (rc=$_DSH_ANCHOR_RC)"; fi
  soft_check "DSH 断面一致性 (D943)" "${_DSH_ANCHOR_HITS}"
fi

# ── CP3 检查点（三态化: python 失败→显式降级登记，替换原 || true 吞错）──
G10_FAIL=$([ -n "$MISMATCH" ] && echo "true" || echo "false")
G11_FAIL=$([ "${HAS_E2E:-0}" -gt 0 ] && [ "${HAS_TESTS:-0}" -eq 0 ] && echo "true" || echo "false")
CP3_STATUS="pass"; CP3_REASON="全部通过"
if [ "$G10_FAIL" = "true" ]; then CP3_STATUS="warn"; CP3_REASON="有条件区域不匹配"; fi
if [ "$G11_FAIL" = "true" ]; then CP3_STATUS="warn"; CP3_REASON="有验收无测试"; fi
mkdir -p "$ROOT/.codex/checkpoints"
if "$PYBIN" -c "
import json
d = {'name':'CP3: 预提交检查','status':'$CP3_STATUS','reason':'$CP3_REASON','checkedAt':'$(date -u +%Y-%m-%dT%H:%M:%SZ)'}
open('$ROOT/.codex/checkpoints/cp3-commit-check.json','w').write(json.dumps(d))
"; then
  :
else
  CP3_STATUS="degraded"
  echo -e "  ${YELLOW}⚠️  CP3 检查点写入失败 — 降级登记（铁律 11，不静默）${RESET}"
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"component\": \"cp3-checkpoint\", \"reason\": \"python 写入失败，CP3=$CP3_STATUS 未落盘\"}" >> "$ROOT/.codex/control-tower/logs/degraded-events.log" 2>/dev/null || true  # swallow-ok: 降级登记
  WARN_COUNT=$((WARN_COUNT + 1))
fi

# ═══════════ 结果 ═══════════
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$HARD_FAIL" -gt 0 ]; then
  echo -e "  ${RED}❌ ${HARD_FAIL} 组未通过 — 提交已拒绝${RESET}"
  [ "${GITHUB_ACTIONS:-}" = "true" ] && echo "::error title=IronLaws:提交已拒绝::${HARD_FAIL} 组未通过（详见上方 ❌ 行）"
  _TAIL="exit 1"
else
  echo -e "  ${GREEN}✅ 本地清单通过（D962 2a① 终态；33 项判定见 CI iron-laws）${RESET}"
  _TAIL="exit 0"
fi
[ "$WARN_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠️  ${WARN_COUNT} 项警告${RESET}"
[ "$SOFT_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠ V5: ${SOFT_COUNT} 项软提示——CI 为权威${RESET}"
echo "═══════════════════════════════════════════════════════════"; echo ""; $_TAIL
