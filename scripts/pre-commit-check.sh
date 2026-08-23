#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.5.1 — pre-commit 12 组硬阻断 (全部 <10s) + 免疫系统
#
# v3.6 → v3.8 核心变化 (2026-06-23):
#   + plan.json 支持: 分阶段任务可 deferred wiring/test_pairing 检查
#   + 双日志: pre-commit-failures.log (门禁正常拒绝) vs bypass.log (--no-verify 绕过)
#   + as any 跳过注释行 (不再把 "Iron law #38: as any = 0" 误报为违规)
#   + bash 退位: 只做物理验证 (符号存在? 文件存在? 语法合法?)
#   + agent 进位: 语义判断 (调用链正确? 降级诚实? 阶段合理?)
#
# 13 组:
#   1. 类型安全 + 硬编码数据    (as any 跳过注释行 + 硬编码业务字段)
#   2. 测试质量                  (catch 无 log + 测试配对[可 deferred] + 桩测试)
#   3. Secrets                   (全工作区 + .claude/ + 暂存区 + .env)
#   4. 接线完整性               (new export 有调用方[可 deferred] + 接线深度)
#   5. 架构边界 + 桥接文件      (跨层引用 + 铁律 46/47)
#   6. Task Brief                (存在 + 6 核心字段: Q0/Q1/Q2/Q3/架构层/Done)
#   7. 架构合规                  (DiagnosticModule + 专家配置 + 数据流)
#   8. 文件驱动架构完整性       (manifest/tags/回归/目录/feature-flag)
#   9. 契约门禁 NEW (D257)       (.codex/contracts/*.json 声明 vs staged 比对)
#  13. 技能同步一致性            (.claude/skills ↔ .dsh/skills 漂移, 调用 sync-dsh-skills.sh --check)
#
# 设计哲学:
#   bash 只回答"物理事实" — 符号被引用过吗？文件存在吗？
#   agent 自检回答"语义判断" — 引用在正确的调用链中吗？
#   plan.json 声明"架构步骤" — 这个文件接线在后续阶段
# ═══════════════════════════════════════════════════════════════════════════════
set +e

HARD_FAIL=0
WARN_COUNT=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

hard_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    echo "$matches" | head -8 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
  fi
}

soft_pass() {
  local name="$1"
  echo -e "  ${GREEN}✅ ${name}${RESET}"
}

warn_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处  [警告]${RESET}"
    echo "$matches" | head -5 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    WARN_COUNT=$((WARN_COUNT + 1))
  fi
}

# V3.8: plan.json 感知的"硬阻断或降级警告"检查
# 如果文件在 plan.json 中声明了 defer → 降级为警告，不阻断
plan_aware_check() {
  local name="$1" matches="$2" deferred_list="$3"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -eq 0 ]; then
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    return
  fi
  # 检查是否所有匹配都在 deferred 列表中
  local non_deferred=""
  while IFS= read -r match_line; do
    [ -z "$match_line" ] && continue
    local match_file=$(echo "$match_line" | grep -oP '^[^:]+' | head -1)
    if [ -n "$deferred_list" ] && echo "$deferred_list" | grep -qF "$match_file" 2>/dev/null; then
      continue  # 在 defer 列表中 → 跳过
    fi
    non_deferred="${non_deferred}${match_line}\n"
  done <<< "$matches"
  if [ -z "$non_deferred" ]; then
    # 全部被 deferred → 警告不阻断
    echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处 (plan.json deferred)  [警告]${RESET}"
    echo "$matches" | head -3 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    WARN_COUNT=$((WARN_COUNT + 1))
  else
    echo -e "  ${RED}❌ ${name}: $(echo -e "$non_deferred" | grep -c .) 处  [硬阻断]${RESET}"
    echo -e "$non_deferred" | head -5 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
  fi
}

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"


# ═══ D201 L3: bypass 阻断 — 今日任何绕过记录 → 硬阻断 ═══
# D421 (CT-29 熔断去锁死): 单点 detected-bypass 误报不再无条件锁死全线——
#   缺省仍硬阻断, 但 SYNO_GATEKEEPER_ACK=1 表示人工已复核该绕过记录 → 降级为告警放行。
#   与组 7c 共享同一逃生舱语义 (逃生舱写入 degraded-events.log, 铁律 11)。
BYPASS_LOG="$ROOT/.claude/bypass.log"
# 方案1挪CI(D467)后：本地 pre-commit 软提示 + CI 权威，本地 --no-verify 不再是"绕过"（CI 兜底）。
# GATEKEEPER 检测"本地 --no-verify"只在本地跑；CI 上跳过（否则 CI 检测 git 跟踪的本地 bypass.log 痕迹 → 自阻断）。
if [ -f "$BYPASS_LOG" ] && [ "${GITHUB_ACTIONS:-}" != "true" ]; then
  TODAY=$(date +%Y-%m-%d)
  # V4.5.1: 只匹配 detected-bypass 行。COMMITTED 行是正常提交成功标记，不是绕过。
  BYPASS_COUNT=$(grep -c "${TODAY}.*detected-bypass" "$BYPASS_LOG" 2>/dev/null | tr -d '\n\r' || echo 0)
  if [ "$BYPASS_COUNT" -gt 0 ]; then
    echo "[GATEKEEPER] 检测到今日 ${BYPASS_COUNT} 次 --no-verify 绕过记录"
    if [ "${SYNO_GATEKEEPER_ACK:-0}" = "1" ]; then
      echo "[GATEKEEPER] 已人工确认 (SYNO_GATEKEEPER_ACK=1) — 降级为告警放行本次提交"
      echo "[GATEKEEPER] 绕过根因仍需修复; 今日记录将在次日自动清零"
      mkdir -p "$ROOT/.codex/control-tower/logs"
      echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"component\": \"gatekeeper\", \"reason\": \"SYNO_GATEKEEPER_ACK=1 放行 ${BYPASS_COUNT} 次 detected-bypass\"}" >> "$ROOT/.codex/control-tower/logs/degraded-events.log" 2>/dev/null || true
    else
      echo "[GATEKEEPER] 请使用: git synova-commit --task-id <D#> --agent claude-code --message '...'"
      echo "[GATEKEEPER] 若该记录系误报且已人工复核, 可用 SYNO_GATEKEEPER_ACK=1 放行本次"
      echo "[GATEKEEPER] 修复导致绕过的根因后，bypass.log 中今日记录将在次日自动清零"
      exit 1
    fi
  fi
fi
# V4.5.1: 缓存 git diff 结果 — 本机每次 git 调用 ~1s，脚本内 10+ 次调用是超时主因
# D387 (CT-34): 测试注入缝 (只读, 默认真实 git, fail-closed)
# D390 (CT-P1-1, K3 D387 P1-1): 武装守卫 — 注入缝仅 SYNO_TEST_ARM=1 时生效。
# 生产环境缝关闭: 组合 SYNO_SECRETS_ROOT 的无痕迹全 13 组旁路被堵死
# (K3 实测: SYNO_GIT_CACHED_*=docs/x.md + SYNO_SECRETS_ROOT=/tmp/empty → 全部门禁跳过且零审计)。
if [ "${SYNO_TEST_ARM:-0}" = "1" ]; then
  # 测试/审计注入缝 (SYNO_TEST_ARM=1 双确认才可注入)
  GIT_CACHED_NAMES="${SYNO_GIT_CACHED_NAMES:-$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)}"
  GIT_CACHED_ALL_NAMES="${SYNO_GIT_CACHED_ALL_NAMES:-$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)}"
  GIT_CACHED_ADDED_NAMES="${SYNO_GIT_CACHED_ADDED_NAMES:-$(git -c core.quotepath=false diff --cached --name-only --diff-filter=A 2>/dev/null || true)}"
  GIT_CACHED_DIFF="${SYNO_GIT_CACHED_DIFF:-$(git diff --cached 2>/dev/null || true)}"
else
  # 生产路径: 真实 git (注入缝变量被忽略, fail-closed)
  # CI gap 补齐 (2026-08-21): 仅 GITHUB_ACTIONS 环境 + SYNO_DIFF_BASE 注入时，
  # 用 base...HEAD 替代 --cached，让 CI 空暂存下增量检查仍查"本次 PR 变更"（否则空跑假绿）。
  # 本地环境 GITHUB_ACTIONS 非 true → 忽略 SYNO_DIFF_BASE（堵注入缝旁路，D390 教训）。
  if [ "${GITHUB_ACTIONS:-}" = "true" ] && [ -n "${SYNO_DIFF_BASE:-}" ]; then
    _DIFF_RANGE="${SYNO_DIFF_BASE}...HEAD"
    GIT_CACHED_NAMES="$(git -c core.quotepath=false diff --name-only --diff-filter=ACMR "$_DIFF_RANGE" 2>/dev/null || true)"
    GIT_CACHED_ALL_NAMES="$(git -c core.quotepath=false diff --name-only --diff-filter=ACMR "$_DIFF_RANGE" 2>/dev/null || true)"
    GIT_CACHED_ADDED_NAMES="$(git -c core.quotepath=false diff --name-only --diff-filter=A "$_DIFF_RANGE" 2>/dev/null || true)"
    GIT_CACHED_DIFF="$(git diff "$_DIFF_RANGE" 2>/dev/null || true)"
  else
    GIT_CACHED_NAMES="$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
    GIT_CACHED_ALL_NAMES="$(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)"
    GIT_CACHED_ADDED_NAMES="$(git -c core.quotepath=false diff --cached --name-only --diff-filter=A 2>/dev/null || true)"
    GIT_CACHED_DIFF="$(git diff --cached 2>/dev/null || true)"
  fi
fi

STAGED=$(echo "$GIT_CACHED_NAMES" | grep '\.ts$' | grep -v node_modules || true)

# ═══ CT-34 (D387): 纯文档提交豁免 — 创始人 2026-08-16 决策 ═══
# 文档(docs/、.claude/task-briefs/、memory/、task-state/、根级 *.md/*.html/*.txt)
# 仅为跨机同步信息, 不与代码同跑 13 组门禁。豁免 12 组, 仅保留 Secrets(D312)。
# 白名单 = 目录 + 扩展名双约束:
#   ✅ docs/ 下仅 *.md|*.html|*.txt; .claude/task-briefs/ 下 *.md; memory/ 下 *.md;
#      task-state/ 下 *.json|*.md(任务登记); 根级 *.md|*.html|*.txt
#   ❌ 排除: .claude/skills/、.dsh/skills/(行为配置, D370 有独立同步契约 → 非纯文档,
#      技能提交保持组 13 全门禁; 纯文档提交时 SKILL_FILES_STAGED 为空天然不触发)
#   ❌ 排除: .codex/(契约/映射配置, 组 9 依赖)、.github/(CI 配置, 非同步信息)、
#      .claude/settings.json(含 token 风险, D312)
# 契约 (铁律 47):
#   @input  — $1: STAGED_ALL（git diff --cached --name-only 全暂存文件, 换行分隔）
#   @output — stdout: 1 = 纯文档提交; 0 = 非纯文档（含任一白名单外文件/空输入）
#   @fail-closed — 正则匹配失败/空输入 → 0（走全量 13 组, 不静默放行, D328）
#   @error  — 无异常路径（纯 bash 字符串匹配）
DOC_PREFIX_RE='^(docs/.*\.(md|html|txt)$|\.claude/task-briefs/.*\.(md|html|txt)$|memory/.*\.(md|html|txt)$|task-state/.*\.(json|md)$|[^/]+\.(md|html|txt)$)'
is_doc_only() {
  local staged="$1"
  [ -z "$staged" ] && { echo 0; return; }   # fail-closed: 空暂存 → 非纯文档路径
  local non_doc
  non_doc=$(echo "$staged" | grep -vE "$DOC_PREFIX_RE" || true)
  if [ -z "$non_doc" ]; then echo 1; else echo 0; fi
}
STAGED_ALL=$(echo "$GIT_CACHED_ALL_NAMES" | grep -v node_modules || true)
DOC_ONLY=$(is_doc_only "$STAGED_ALL")

# ── CT-34 纯文档提交: 仅 Secrets 扫描, 豁免其余 12 组 ──
# 早退分支置于 par_start 之前: 纯文档提交零 par 启动、秒过 (V4.5.1 性能教训)。
# GATEKEEPER bypass 阻断 (L99-111) 在早退之前 — 绕过审计先于豁免, 不放行 --no-verify 滥用。
if [ "$DOC_ONLY" -eq 1 ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  纯文档提交 (CT-34/D387): 豁免 12 组 — 仅 Secrets 扫描"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  # D390 (CT-P1-1, K3 D387 P1-1): 豁免事件审计落盘 — 无痕迹豁免 = M4 执行证据链断裂。
  # 每次纯文档豁免写 exempt.log（时间戳 + 暂存清单），供审计对账（post-commit/定期）。
  # 路径支持 SYNO_EXEMPT_LOG 注入（测试沙箱，同 SYNO_SECRETS_ROOT 惯例；不构成旁路）。
  EXEMPT_LOG="${SYNO_EXEMPT_LOG:-$ROOT/.claude/exempt.log}"
  mkdir -p "$(dirname "$EXEMPT_LOG")" 2>/dev/null || true
  echo "$(date +%Y-%m-%dT%H:%M:%S%z) | EXEMPT | staged=$(echo "$STAGED_ALL" | tr '\n' ',' | sed 's/,$//')" >> "$EXEMPT_LOG" 2>/dev/null || true
  if bash "$ROOT/scripts/check-secrets.sh" 2>&1; then
    echo -e "  ${GREEN}✅ Secrets 扫描通过${RESET}"
    # D472 复核修复: 纯文档提交也须过迁移门禁 —— proposed/ Note 变更（新建/修改决策 Note）
    # 命中纯文档白名单（memory/.*\.md）会走本早退分支，若不检查则迁移门禁被 CT-34 豁免绕过，
    # "新建 Note"这一 D472 核心场景门禁失效。门禁 <1s，不破坏 CT-34 秒过性能。
    NOTES_TOUCHED_DOC=$(echo "$STAGED_ALL" | grep -E '^memory/notes/proposed/' || true)
    if [ -n "$NOTES_TOUCHED_DOC" ]; then
      if bash "$ROOT/scripts/control-tower/check-notes-lifecycle.sh"; then
        echo -e "  ${GREEN}✅ Notes 迁移门禁: proposed/ 无僵尸条目${RESET}"
      else
        echo -e "  ${RED}❌ Notes 迁移门禁: proposed/ 存在僵尸条目（实现已落地未迁移） [硬阻断]${RESET}"
        echo "  修复: git mv 到 implemented/ 或 rejected/，或删除测试残留"
        exit 1
      fi
    fi
    echo -e "  ${GREEN}✅ 纯文档提交豁免检查完成 (CT-34)${RESET}"
    exit 0
  else
    echo -e "  ${RED}❌ Secrets 扫描失败 — 提交已拒绝${RESET}"
    exit 1
  fi
fi

# ═══ V4.5.1: 慢脚本并行化 — 慢盘上串行 95s → 并行 ~26s ═══
# 环境事实: 本机单文件 I/O ~500ms, python 启动 ~1.5s, git ~1s。
# 9 个外部脚本串行执行累计 ~95s 导致 git commit 120s 超时 → 被迫 --no-verify。
# 解法: 在脚本早期统一后台启动, 在各自原本的调用点 wait + cat 收集。
PAR_DIR="$ROOT/.claude/.precommit-par"
rm -rf "$PAR_DIR" 2>/dev/null
mkdir -p "$PAR_DIR" 2>/dev/null

par_start() {
  local name="$1" script="$2"
  bash "$ROOT/scripts/$script" > "$PAR_DIR/$name.out" 2>&1
  echo $? > "$PAR_DIR/$name.code"
}

par_collect() {
  local name="$1" pid="$2"
  wait "$pid" 2>/dev/null
  local code=0
  [ -f "$PAR_DIR/$name.code" ] && code=$(cat "$PAR_DIR/$name.code" 2>/dev/null | tr -d '\n\r')
  cat "$PAR_DIR/$name.out" 2>/dev/null
  return "${code:-0}"
}

# 后台启动 8 个慢脚本 (validate-expert-config 需即时判断退出码, 保留串行)
( par_start hardcoded check-hardcoded.sh ) &  PAR_HARDCODED=$!
( par_start deprecated-mapping check-deprecated-mapping.sh ) &  PAR_DEPRECATED=$!
( par_start secrets check-secrets.sh ) &  PAR_SECRETS=$!
( par_start plan-integrity check-plan-integrity.sh ) &  PAR_PLAN_INTEGRITY=$!
( par_start verifiable-done check-verifiable-done.sh ) &  PAR_VERIFIABLE=$!
( par_start q0c-tracking check-q0c-tracking.sh ) &  PAR_Q0C=$!
( par_start acceptance-ci check-acceptance-ci.sh ) &  PAR_ACCEPTANCE=$!
( par_start file-driven check-file-driven.sh ) &  PAR_FILE_DRIVEN=$!

# ═══ V3.8: plan.json — 分阶段任务支持 ═══
# Anthropic 原则: 架构步骤不是偷懒。当 plan.json 声明某文件处于 create 阶段
# 且 wiring 标记为 deferred，接线检查对该文件降级为警告。
PLAN_FILE="$ROOT/.claude/plan.json"
DEFERRED_WIRING_FILES=""
DEFERRED_FF_FILES=""
DEFERRED_TEST_FILES=""
PLAN_ACTIVE=0
if [ -f "$PLAN_FILE" ]; then
  # 用 python 解析 JSON 比 bash 可靠
  PLAN_PARSE=$(python3 -c "
import json, sys
try:
  p = json.load(open('$PLAN_FILE'))
  phase = p.get('current_phase', -1)
  if phase < 0: sys.exit(0)
  # 收集当前 phase 之前所有标记为 deferred 的文件
  for ph in p.get('phases', []):
    if ph.get('step', 999) > phase: continue
    checks = ph.get('checks', {})
    files = ph.get('files', [])
    if checks.get('wiring') == 'deferred':
      for f in files: print(f'WIRING:{f}')
    if checks.get('feature_flag') == 'deferred':
      for f in files: print(f'FF:{f}')
    if checks.get('test_pairing') == 'deferred':
      for f in files: print(f'TEST:{f}')
except: pass
" 2>/dev/null)
  if [ -n "$PLAN_PARSE" ]; then
    PLAN_ACTIVE=1
    DEFERRED_WIRING_FILES=$(echo "$PLAN_PARSE" | grep "^WIRING:" | sed 's/^WIRING://')
    DEFERRED_FF_FILES=$(echo "$PLAN_PARSE" | grep "^FF:" | sed 's/^FF://')
    DEFERRED_TEST_FILES=$(echo "$PLAN_PARSE" | grep "^TEST:" | sed 's/^TEST://')
  fi
fi
# STAGED_ALL 已提前定义于 CT-34 (D387) 区块 — 此处不再重复定义
STAGED_SRC=$(echo "$STAGED_ALL" | grep -E '^src/|^tests/|^packages/|^scripts/' | grep -v 'scripts/pre-commit-check.sh\|scripts/check-secrets.sh\|scripts/check-file-driven.sh\|scripts/workflow/' || true)
NEW_IMPL=$(echo "$GIT_CACHED_ADDED_NAMES" | grep -E "^src/|^extensions/" | grep "\.ts$" | grep -v "\.test\." | grep -v "\.d\.ts" | grep -v "types\.ts$\|index\.ts$\|helpers\.ts$" | grep -v "src/sentinel/compute/" || true)

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Loop Engineering V4.5.1 — pre-commit (13 组 + 免疫 + plan-integrity)"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ═══════════════════════════════════════════════════════════════════
# 组 1: 类型安全 + 硬编码数据 (原 1, 10, 13 合并)
#
# Anthropic 决策: 原则 6 "找到根因" — `as any` 不是语法错误，是类型系统的信任崩溃。
#   一次 `as any` 意味着"我不确定这个类型，跳过检查"——而这恰好是所有类型相关 bug
#   的入口。47 次历史事故证明: 零容忍是唯一正确的策略。
#   硬编码业务数据 (部门名/可扩展实体列表) 的根因相同——把应该是数据的东西写成了代码。
#   历史: 47 次 as any 导致运行时崩溃。2026-05 engine-core 拆分中，20 个桥接文件
#         大量使用 as any 绕过类型检查，17 处 CJS require() 在 ESM 下崩溃。
# ═══════════════════════════════════════════════════════════════════
echo -e "${CYAN}── 组 1/13: 类型安全 + 硬编码数据 ──${RESET}"

# 1a. as any 零容忍 — 只拦本次变更新增的 as any（存量独立治理）
# 方案1(挪CI): 本地用暂存区 diff；CI 用 base...HEAD diff（SYNO_DIFF_BASE 注入）
# K3 审计 P1-2 修复：范围覆盖 src/ + packages/（原只查 src/ 漏掉 packages/ 33+ 处）；不查 scripts/ 防自引用误报。
# D501 修复：排除测试/声明文件（.test.ts/.test.tsx/.d.ts）——as-any 审计器自己的测试 fixture 含
#   as any 字符串，D471 引入 packages/test-kit/tests/architecture/05-as-any-audit.test.ts 后 CI 误报 19 处。
#   与 findTsFiles（packages/test-kit/src/security-scanners.ts）排除规则一致：只查生产代码。
# Anthropic 原则: bash 只做模式匹配。新增行 = diff 的 + 行（排除 +++ diff 头）。
if [ -n "${SYNO_DIFF_BASE:-}" ]; then
  AS_ANY_DIFF="$(git diff "$SYNO_DIFF_BASE"...HEAD -- src/ packages/ ':(exclude)**/*.test.ts' ':(exclude)**/*.test.tsx' ':(exclude)**/*.d.ts' 2>/dev/null || true)"
else
  AS_ANY_DIFF="$(git diff --cached -- src/ packages/ ':(exclude)**/*.test.ts' ':(exclude)**/*.test.tsx' ':(exclude)**/*.d.ts' 2>/dev/null || true)"
fi
M=$(echo "$AS_ANY_DIFF" | grep -E '^\+' | grep -v '^+++' | grep -E 'as any\b' | grep -vE '^\+\s*(//|/\*|\*|#)' || true)
hard_check "as any 零容忍（新增，铁律 38；存量独立清理）" "$M"

# 1a-2. from" ???? (D93/D95 ????)
# ??: Claude Code ?????? import ??????? from ?????
# tsc ?????????? token??CI ?????: D93 + D95 ?????
FROM_DAMAGE=$(grep -rn 'from"' src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v ".test." | grep -v ".d.ts" | grep -v '"import.*from"' | grep -v '".*from".*"' || true)
hard_check "from ????: from??????? (D93/D95??)" "${FROM_DAMAGE:-}"


# 1b. 硬编码业务数据 (合并原 10 + 13: 硬编码联合类型/数组/Set/DEFAULT_* + 部门名等)
STAGED_HTML=$(echo "$STAGED_ALL" | grep -E '\.(html|ts)$' | grep -v node_modules | grep -v '\.test\.' || true)
HARDCODE_DATA=""
if [ -n "$STAGED_HTML" ]; then
  for hf in $STAGED_HTML; do
    [ -z "$hf" ] && continue; [ ! -f "$hf" ] && continue
    DEPS=$(grep -n "'marketing'\|'sales'\|'finance'\|'研发部'\|'市场部'\|'销售部'" "$hf" 2>/dev/null | grep -v "import\|export\|//\|/\*\|^\s*\*\|token.split\|dept.*=\|LAYER_EXPERTS\|experts:\|'org'\|'tech'\|'strategy'\|'knowledge'\|'business_model'\|'finance'\|'marketing'\|'sales'\|: \[" | head -3 || true)
    [ -n "$DEPS" ] && HARDCODE_DATA="${HARDCODE_DATA}  ${hf}: 可能硬编码业务数据(如部门名)\n"
  done
fi
# 也跑 check-hardcoded.sh 的联合类型/数组/Set/DEFAULT_* 检测 (不阻断，仅报告)
par_collect hardcoded "$PAR_HARDCODED" || true
hard_check "硬编码业务数据/类型 (禁止硬编码部门名/可扩展实体列表)" "${HARDCODE_DATA:-}"

# V4.5.1: 旧适配器废弃映射检查 (不阻断)
par_collect deprecated-mapping "$PAR_DEPRECATED" || true

# ═══════════════════════════════════════════════════════════════════
# 组 2: 测试质量 (原 2, 4, 12, 17 合并)
#
# Anthropic 决策: 原则 2 "先设计验证标准" — 测试不是写完代码后的负担，是写代码前的规格。
#   空 catch 无 log → 静默降级 → 线上故障无迹可寻。铁律 24+31 禁止。
#   新文件无测试 → 4 次接线失败事故 (组件通过单元测试但从未被生产代码调用)。
#   桩测试 (<3 expect) → 假绿色 CI → 合并后才发现的回归。铁律 36: vitest 零失败。
#   跨模块无集成测试 → bridge/context 类跨层调用，单元测试 mock 一切，集成才是真实。
#   历史: 4 次接线失败 — 新 export 有单元测试但从未被 import。
#         铁律 11 — 静默降级事故 (catch 空吞异常，生产环境无日志)。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 2/13: 测试质量 ──${RESET}"

# 2a. empty catch 无 log
EMPTY=""
if [ -n "$STAGED" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue; [ ! -f "$file" ] && continue
    CATCHES=$(grep -n "catch\s*{" "$file" 2>/dev/null || true)
    if [ -n "$CATCHES" ]; then
      while IFS= read -r cline; do
        linenum=$(echo "$cline" | cut -d: -f1); [ -z "$linenum" ] && continue
        ctx=$(sed -n "${linenum},$((linenum + 2))p" "$file" 2>/dev/null || echo "")
        # V3.8: 空 catch 接收 log.|degraded|throw|/\*|// — 有任一项即非"静默吞异常"
        if ! echo "$ctx" | grep -qE "log\.|logger\.|console\.|degraded|throw\s|/\*|//"; then
          EMPTY="${EMPTY}${file}:${linenum}: 空 catch (无 log/degraded/throw)\n"
        fi
      done <<< "$CATCHES"
    fi
  done <<< "$STAGED"
fi
hard_check "empty catch 无 log (铁律 24+31)" "${EMPTY:-}"

# D313 M5b: 附挂静默吞错扫描（git diff 新增行含 2>/dev/null → 阻断，豁免需 # swallow-ok:）
SILENT_OUT=$(bash "$ROOT/scripts/workflow/check-silent-swallow.sh" --diff 2>&1 || true)
if echo "$SILENT_OUT" | grep -q "❌"; then
  hard_check "静默吞错扫描 (D313 M5b)" "$SILENT_OUT"
else
  soft_pass "静默吞错扫描 (D313 M5b)"
fi

# 2b. 新文件配对测试 (原 4)
MISSING_TEST=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r impl; do
    [ -z "$impl" ] && continue
    # 映射: src/xxx.ts→tests/xxx.test.ts, extensions/sentinels/{name}/aggregate.ts→tests/sentinels/{name}.test.ts, extensions/sentinels/{name}/computes/{fn}.ts→tests/sentinels/{name}/{fn}.test.ts
    test_path=$(echo "$impl" | sed 's|^src/|tests/|; s|^extensions/sentinels/\([^/]*\)/aggregate\.ts$|tests/sentinels/\1.test.ts|; s|^extensions/sentinels/\([^/]*\)/computes/\([^/]*\)\.ts$|tests/sentinels/\1/\2.test.ts|')
    # 追加 .test.ts — 但跳过已以 .test.ts 结尾的路径（extensions 映射已生成 .test.ts）
    if ! echo "$test_path" | grep -q '\.test\.ts$'; then
      test_path="${test_path%.ts}.test.ts"
    fi
    if ! echo "$GIT_CACHED_NAMES" | grep -q "^${test_path}$"; then
      if [ ! -f "$test_path" ]; then
        MISSING_TEST="${MISSING_TEST}${impl} → 缺少 ${test_path}\n"
      fi
    fi
  done <<< "$NEW_IMPL"
fi
# V3.8: plan.json 感知 — deferred test 文件降级为警告
if [ "$PLAN_ACTIVE" -eq 1 ] && [ -n "$DEFERRED_TEST_FILES" ]; then
  plan_aware_check "新文件配对: impl 须同 commit 有 test" "${MISSING_TEST:-}" "$DEFERRED_TEST_FILES"
else
  hard_check "新文件配对: impl 须同 commit 有 test" "${MISSING_TEST:-}"
fi

# 2c. 桩测试 + 跨模块集成测试 (原 12 + 17 合并)
STUB_FAIL=""
INTG_FAIL=""
STAGED_TESTS=$(echo "$GIT_CACHED_ADDED_NAMES" | grep '^tests/.*\.test\.ts$' || true)
if [ -n "$STAGED_TESTS" ]; then
  for tf in $STAGED_TESTS; do
    [ -z "$tf" ] && continue; [ ! -f "$tf" ] && continue
    EXPECT_COUNT=$(grep -c 'expect(' "$tf" 2>/dev/null | tr -d '\n\r' || echo 0)
    if [ "${EXPECT_COUNT:-0}" -lt 3 ]; then
      STUB_FAIL="${STUB_FAIL}  ${tf}: 仅 ${EXPECT_COUNT} 个 expect() — 可能为桩测试（需 ≥3 个）\n"
    fi
  done
fi
if [ -n "$NEW_IMPL" ]; then
  for nf in $NEW_IMPL; do
    [ -z "$nf" ] && continue
    if echo "$nf" | grep -qiE 'bridge|context|inject|dispatch|connect'; then
      INTG_TEST=$(echo "$nf" | sed 's|^src/|tests/|; s|\.ts$|.integration.test.ts|')
      if [ ! -f "$INTG_TEST" ]; then
        INTG_FAIL="${INTG_FAIL}  ${nf}: 跨模块文件缺少集成测试 → ${INTG_TEST}\n"
      fi
    fi
  done
fi
hard_check "桩测试: 新测试需 ≥3 expect()" "${STUB_FAIL:-}"
hard_check "跨模块集成: bridge/context 类需 .integration.test.ts" "${INTG_FAIL:-}"

# 2d. 控制塔脚本测试门禁 (U7 — CT-40: 控制塔最高风险变更须配对测试且测试绿)
#   历史: D393 控制塔脚本改了没测试门禁 → 交付态红灯无物理拦截。
#   逻辑在独立脚本 scripts/control-tower/ct-test-gate.sh（铁律 35 可独立测试）。
#   三态判定（沿用组 13 范式）: 0 过/绿或跳过 / 1 缺配对或测试红 / 2 检查执行失败
CT_GATE_OUT=$(bash "$ROOT/scripts/control-tower/ct-test-gate.sh" 2>&1)
CT_GATE_EXIT=$?
if [ "$CT_GATE_EXIT" -eq 0 ]; then
  soft_pass "控制塔脚本测试门禁 (U7/CT-40)"
elif [ "$CT_GATE_EXIT" -eq 1 ]; then
  hard_check "控制塔脚本测试门禁 (U7/CT-40)" "$CT_GATE_OUT"
else
  hard_check "控制塔脚本测试门禁执行失败 (exit=$CT_GATE_EXIT, D328 三态)" "$CT_GATE_OUT"
fi

# ═══════════════════════════════════════════════════════════════════
# 组 3: Secrets (原 3 — 独立脚本，逻辑复杂不适合合并)
#
# Anthropic 决策: 原则 4 "安全边际" — Secrets 暴露是不可逆事故。
#   一旦 API Key 进入 git 历史，即使后续 commit 删除，仍可通过 git log 恢复。
#   全工作区扫描 (不仅暂存区) 是因为 .env 和 .claude/settings.local.json 可能含真实 Key
#   但从未被 git add——旧门禁漏掉了它们。.claude/ 专项扫描是因为 settings.local.json
#   可能被备份/同步到其他设备。
#   历史: .env 真实 API Key 暴露仓库 + 飞书 App Secret 暴露 (2026-06)。
#         旧门禁只扫暂存区 → 磁盘上的真实 Key 从未被发现，直到被备份软件同步出去。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 3/13: Secrets ──${RESET}"
par_collect secrets "$PAR_SECRETS" || HARD_FAIL=$((HARD_FAIL + 1))

# ═══════════════════════════════════════════════════════════════════
# 组 4: 接线完整性 (原 5, 11 合并)
#
# Anthropic 决策: 原则 5 "逐步验证，不信任声称完成" — "写完了" != "接线了"。
#   铁律 5: 后端能力 ≠ 用户可用的功能。写了代码但没 import → 死代码。
#   接线深度 (原 11): import 了但从未调用 → 空 import 绕过"有调用方"检测。
#   这是 v3.5 新增的第二层防御——agent 会 import 一个函数但不调用它来满足门禁。
#   历史: 4 次接线失败 — 组件通过单元测试但从未被生产代码调用。
#         v3.5 追加拿线深度检查: 开发者 import 了函数但没调用，绕过了原第 5 项。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 4/13: 接线完整性 ──${RESET}"

# 4a. 新 export 被引用 (V3.8 简化: bash 只验证"被引用"这个物理事实)
# Anthropic 原则: bash 退回到物理事实——"这个符号在文件外部出现过吗？"
# 调用链正确性、分阶段接线 → agent 自检和 plan.json 负责。
UNWIRED=""
if [ -n "$NEW_IMPL" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue; [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated' && continue
      # V3.8: 搜索范围扩大——任何 src/ 下的文件引用了就算"已接线"
      WIRED=$(grep -rn "\b${name}\b" src/ --include="*.ts" 2>/dev/null \
        | grep -v "export.*${name}" | grep -v "$file" | grep -v "\.test\." | head -1 || true)
      [ -z "$WIRED" ] && UNWIRED="${UNWIRED}${file}: export ${name} — 未被任何 src/ 文件引用\n"
    done
  done <<< "$NEW_IMPL"
fi
# V3.8: plan.json 感知 — deferred wiring 文件降级为警告
if [ "$PLAN_ACTIVE" -eq 1 ] && [ -n "$DEFERRED_WIRING_FILES" ]; then
  plan_aware_check "接线审计: 新 export 必须被引用" "${UNWIRED:-}" "$DEFERRED_WIRING_FILES"
else
  hard_check "接线审计: 新 export 必须被引用 (物理事实)" "${UNWIRED:-}"
fi

# 4b. 接线深度: import 了但从未调用 (原 11)
DEEP_FAIL=""
if [ -n "$NEW_IMPL" ]; then
  for file in $NEW_IMPL; do
    [ -z "$file" ] && continue; [ ! -f "$file" ] && continue
    EXPORTS=$(grep -oP 'export (function|class|const) \K\w+' "$file" 2>/dev/null || true)
    for name in $EXPORTS; do
      [ -z "$name" ] && continue
      echo "$name" | grep -qi 'mock\|fake\|_internal\|_deprecated' && continue
      CALL_SITES=$(grep -rn "\b${name}\b" src/server.ts src/index.ts src/agent/synova-agent.ts --include="*.ts" 2>/dev/null | grep -v "import.*${name}\b" | grep -v "export.*${name}\b" | grep -v "^\s*//\|^\s*\*" | head -1 || true)
      IMPORT_ONLY=$(grep -rn "import.*\b${name}\b" src/server.ts src/index.ts src/agent/synova-agent.ts --include="*.ts" 2>/dev/null | head -1 || true)
      if [ -z "$CALL_SITES" ] && [ -n "$IMPORT_ONLY" ]; then
        DEEP_FAIL="${DEEP_FAIL}  ${file}: export ${name} — 已 import 但从未调用（空 import 绕过检测）\n"
      fi
    done
  done
fi
hard_check "接线深度: 新 export 必须被调用(非仅 import)" "${DEEP_FAIL:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 5: 架构边界 + 桥接文件 (原 8, 19, 20 合并)
#
# Anthropic 决策: 原则 1 "第一性原理" — 五层架构的边界不是约定，是物理规律。
#   L3 不能直接查 L5 SQLite —— 不是"不应该"，是"语义上不成立"（L3 不知道数据在哪）。
#   铁律 46: 桥接文件 ≠ 迁移。import 代理骗过 tsc，骗不过 grep。
#   铁律 47: "拆完了"必须由 grep 物理证明。声称完成但 grep 有结果 = 没拆完。
#   历史: 2026-05~06 engine-core 拆分欺诈 — 被声称完成 4 次，实际 538 文件原封不动，
#         20 个桥接文件伪装迁移。tsc 零错误（import 路径合法），但运行时 17 处 CJS
#         require() 在 ESM 下崩溃。一个月反复承诺零实质进展。这是 Synova 最严重事故。
#   为什么铁律 47 是警告而非阻断: task brief 可能包含历史遗留声明。但警告让问题
#         始终可见——不可能"没注意到"。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 5/13: 架构边界 + 桥接文件 ──${RESET}"

# 5a. 跨层引用检测 (原 8)
CROSS_LAYER=""
if [ -n "$STAGED_SRC" ]; then
  L1_TO_L4=$(echo "$STAGED_SRC" | grep -E '^src/(routes/|l1/|l1-interaction/)' | xargs grep -l "from '\.\./l4/\|from '\.\./\.\./l4/\|from '\.\./store/\|from '\.\./\.\./store/" 2>/dev/null | grep -v "knowledge-bridge-service\|\.test\." || true)
  [ -n "$L1_TO_L4" ] && CROSS_LAYER="${CROSS_LAYER}L1→L4/L5: ${L1_TO_L4}\n"
  # 修复 (D291): grep -l 输出文件名, "import type" 过滤须作用于代码行 → 逐文件先滤行再判存在
  L2_TO_L5=$(echo "$STAGED_SRC" | grep -E '^src/agent/' | while read -r _sf; do
    grep -E "from '\.\./store/|from '\.\./init/" "$_sf" 2>/dev/null | grep -v "import type\|knowledge-bridge-service\|\.test\." | grep -q . && echo "$_sf"
  done | grep -v "knowledge-bridge-service\|\.test\." || true)
  [ -n "$L2_TO_L5" ] && CROSS_LAYER="${CROSS_LAYER}L2→L5: ${L2_TO_L5}\n"
  L3_TO_ENGINE=$(echo "$STAGED_SRC" | grep -E '^src/sentinel/' | xargs grep -l "from '\.\./\.\./\.\./packages/engine-core/" 2>/dev/null | grep -v "import type\|\.test\.\|src/sentinel/compute/" || true)
  [ -n "$L3_TO_ENGINE" ] && CROSS_LAYER="${CROSS_LAYER}L3→engine-core: ${L3_TO_ENGINE}\n"
fi
hard_check "架构边界: 禁止跨层引用 (铁律 39)" "${CROSS_LAYER:-}"

# 5b. 桥接文件欺诈 + 包级 engine-core 引用 + shell 包检测 (铁律 46 — V4.5.1 全面加固)
BRIDGE_ALLOWED="src/init/engine-context.ts|src/l4/graph-bridge.ts|src/l4/diagnosis-graph-query.ts"
BRIDGE_FAIL=""

# 5b-i: 全仓库扫描（src/ + packages/）— 堵住"藏到 packages/ 目录下"的漏洞
STAGED_ALL_FILES=$(echo "$GIT_CACHED_ALL_NAMES" | grep -E '^(src|packages)/.*\.ts$' | grep -v '\.test\.' || true)
if [ -n "$STAGED_ALL_FILES" ]; then
  for file in $STAGED_ALL_FILES; do
    [ -z "$file" ] && continue
    echo "$file" | grep -qE "$BRIDGE_ALLOWED" && continue
    # 匹配任意形式的 engine-core 引用：包名路径 + 相对路径
    if grep -qE "packages/engine-core|\.\./engine-core|\.\./\.\./engine-core" "$file" 2>/dev/null; then
      BRIDGE_FAIL="${BRIDGE_FAIL}  ${file}: 引用 engine-core (铁律 46 — 含相对路径)\n"
    fi
  done
fi

# 5b-ii: 壳包检测 — packages/*/ 下只有 index.ts 且全部是 export from → 桥接包
# V4.5.1: 单次 find + 单次 grep -l 替代每包 4 次 I/O（13 包 × 4 次 = 26s → <1s）
ALL_PKG_SRC=$(find "$ROOT"/packages/*/src -name "*.ts" ! -name "index.ts" 2>/dev/null || true)
# V4.5.1: awk 单次扫描替代逐文件 grep/wc（8 个匹配包 × 3 次 I/O = 13s → <1s）
SHELL_PKGS=$(awk '
  FNR == 1 { reexport=0; engcore=0 }
  { if ($0 ~ /^export.*from/) reexport=1; if ($0 ~ /engine-core/) engcore=1; lines=FNR }
  ENDFILE { if (reexport && engcore && lines > 0 && lines < 50) print FILENAME }
' "$ROOT"/packages/*/src/index.ts 2>/dev/null || true)
if [ -n "$SHELL_PKGS" ]; then
  while IFS= read -r pkg_idx; do
    [ -z "$pkg_idx" ] && continue
    # 只有 index.ts 一个文件（该包无其他 src 文件）才是壳包
    pkg_dir=$(dirname "$(dirname "$pkg_idx")")
    if echo "$ALL_PKG_SRC" | grep -q "^${pkg_dir}/"; then
      continue  # 包内有其他源文件 → 不是壳包
    fi
    BRIDGE_FAIL="${BRIDGE_FAIL}  $pkg_idx: 壳包 — 仅 ${lines} 行且全部是 export from engine-core (铁律 46)\n"
  done <<< "$SHELL_PKGS"
fi
hard_check "铁律 46: 桥接文件欺诈 + 包级 engine-core + 壳包检测" "${BRIDGE_FAIL:-}"

# 5c. 铁律 47: 声称拆分完须 grep 零旧引用 (原 20 — 警告模式)
TODAY=$(date +%Y-%m-%d)
# D296 认领制: 多 session 并发时用认领本提交文件的 brief (跨 session 污染根治)
BRIEF=$(bash "$ROOT/scripts/workflow/resolve-commit-brief.sh" "$STAGED_ALL" 2>/dev/null || true)
CLEANUP_CLAIM=""
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  if grep -qi "拆分\|迁移\|清理.*完成\|已拆\|已迁移\|已清理" "$BRIEF" 2>/dev/null; then
    CLEANUP_CLAIM="task brief 声称拆分/迁移/清理完成 — 请确认 grep -r 'packages/engine-core' src/ 零结果"
  fi
fi
warn_check "铁律 47: 声称完成须 grep 物理证明" "${CLEANUP_CLAIM:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 6: Task Brief (6 核心字段: Q0审计/Q1调研/Q2范围/Q3验收/架构层/Done)
#
# Anthropic 决策: 原则 0 "协作对齐前置" — task brief 是 agent 和人类的接口契约。
#   没有 brief → agent 会假设共识 → 假设错误 → 做了一堆没人要的东西。
#   v3.8: 6 核心字段 (Q0定位/Q1调研/Q2范围/Q3验收/架构层/Done)，v3.6 曾删到 5 字段，
#   删除"可以后续补充"的部分 (PRD 章节引用、文件位置——已降级为警告)。
#   越少字段 → 越可能被完整填写 → 门禁越有效。
#   历史: 多个 task brief 因 11 字段太重在快速迭代时被跳过 (--no-verify 绕过)。
#         v3.5 的 --no-verify 日志显示 15 次 pre-commit 失败，其中多次是因为
#         task brief 字段不完整而非实质质量问题。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 6/13: Task Brief (6 核心字段) ──${RESET}"

TASK_BRIEF_MISSING=""
TASK_BRIEF_EMPTY=""
if [ -n "$STAGED_SRC" ]; then
  if [ -z "$BRIEF" ]; then
    TASK_BRIEF_MISSING="今日无 task brief。请先运行: bash scripts/workflow/task-start.sh \"任务描述\""
  else
    # v3.9: 兼容 ## Q0: 和 ## Q0 定位: 两种标题格式
    for q in "Q0" "Q1" "Q2" "Q3"; do
      SECTION=$(awk "/^## ${q}(:| )/{found=1; next} /^## /{if(found) exit} found" "$BRIEF" 2>/dev/null)
      FILLED=$(echo "$SECTION" | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)
      if [ -z "$FILLED" ] || [ ${#FILLED} -lt 3 ]; then
        TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  ${q}: 未填写\n"
      fi
    done
    # 架构层: 兼容 ## 本任务在哪一层 和 ## 架构层 两种写法
    LAYER_SECTION=$(awk '/^## (本任务在哪一层|架构层)(:| )/{found=1; next} /^## /{if(found) exit} found' "$BRIEF" 2>/dev/null)
    LAYER_FILLED=$(echo "$LAYER_SECTION" | grep -v "^<!--\|^$" | tr -d "[:space:]" | head -1)
    if [ -z "$LAYER_FILLED" ] || [ ${#LAYER_FILLED} -lt 3 ]; then
      TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  架构层: 未填写\n"
    fi
    # Done 标准专项: 至少一条完成标准
    DONE_SECTION=$(awk "/^## Done 标准/{found=1; next} /^## /{if(found) exit} found" "$BRIEF" 2>/dev/null)
    DONE_CHECKED=$(echo "$DONE_SECTION" | grep -cE '^\s*- \[x\]' || true)
    DONE_EMPTY=$(echo "$DONE_SECTION" | grep -v "^##\|^<!--\|^$" | wc -l)
    if [ "${DONE_CHECKED:-0}" -eq 0 ] && [ "${DONE_EMPTY:-0}" -le 1 ]; then
      TASK_BRIEF_EMPTY="${TASK_BRIEF_EMPTY}  Done 标准: 至少需定义一条完成标准\n"
    fi
  fi
fi
hard_check "Task Brief: 编码变更须有今日 task brief" "${TASK_BRIEF_MISSING:-}"
hard_check "Task Brief: 6 核心字段必须填写 (Q0/Q1/Q2/Q3/架构层/Done)" "${TASK_BRIEF_EMPTY:-}"

# V4.5.1: 时间戳顺序检查 — PreToolUse 发现 brief 未填就写代码时记录证据到 /tmp/
# 此文件在 git 之外，不能被 git checkout 抹掉。必须显式 rm 才能解除阻断。
BEFORE_BRIEF_EVI="/tmp/.synova-before-brief"
BEFORE_BRIEF_MSG=""
if [ -f "$BEFORE_BRIEF_EVI" ]; then
  EVI_CONTENT=$(head -5 "$BEFORE_BRIEF_EVI" 2>/dev/null)
  BEFORE_BRIEF_MSG="代码在 brief 填写前已写入:\n${EVI_CONTENT}\n解决方法: rm ${BEFORE_BRIEF_EVI} && git checkout -- . && bash scripts/workflow/task-start.sh"
fi
hard_check "时间戳顺序: brief 必须早于代码写入" "${BEFORE_BRIEF_MSG:-}"

# D472: Agent Notes 迁移门禁 — proposed/ 有变更时扫僵尸条目（条件触发保持 <1s，V4.5.1 性能纪律）
# 僵尸 = 提取到 D# 且 task-state 该 D# ∈ {impl_done, spec_done}（实现已落地但提案未 git mv）
NOTES_TOUCHED=$(echo "$STAGED_ALL" | grep -E '^memory/notes/proposed/' || true)
if [ -n "$NOTES_TOUCHED" ]; then
  if bash "$ROOT/scripts/control-tower/check-notes-lifecycle.sh"; then
    soft_pass "Notes 迁移门禁: proposed/ 无僵尸条目"
  else
    echo -e "  ${RED}❌ Notes 迁移门禁: proposed/ 存在僵尸条目（实现已落地未迁移） [硬阻断]${RESET}"
    echo "  修复: git mv 到 implemented/ 或 rejected/，或删除测试残留"
    HARD_FAIL=$((HARD_FAIL + 1))
  fi
else
  soft_pass "Notes 迁移门禁: 无 proposed/ 变更（跳过）"
fi

# V4.1: plan-integrity — Q1a/Q1b/Q2 承诺可验证
par_collect plan-integrity "$PAR_PLAN_INTEGRITY" || HARD_FAIL=$((HARD_FAIL + 1))

# V3.9: Done 可证伪性 — 每个 - [x] 必须包含 verify: 命令
par_collect verifiable-done "$PAR_VERIFIABLE" || HARD_FAIL=$((HARD_FAIL + 1))

# V3.9: Q0c 取消跟踪 — 取消的任务必须有 follow_up
par_collect q0c-tracking "$PAR_Q0C" || HARD_FAIL=$((HARD_FAIL + 1))

# V4.5.1 (本体迁移): 禁止旧 SOG 枚举引用潜入 src/
SOG_NODE_REFS=$(grep -rn "SOGNodeType\." src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | head -10 || true)
if [ -n "$SOG_NODE_REFS" ]; then
  echo -e "${RED}  ❌ 旧 SOGNodeType 枚举仍被引用 — 本体迁移未完成${RESET}"
  echo "$SOG_NODE_REFS"
  HARD_FAIL=$((HARD_FAIL + 1))
fi
SOG_EDGE_REFS=$(grep -rn "SOGEdgeType\." src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | head -10 || true)
if [ -n "$SOG_EDGE_REFS" ]; then
  echo -e "${RED}  ❌ 旧 SOGEdgeType 枚举仍被引用 — 本体迁移未完成${RESET}"
  echo "$SOG_EDGE_REFS"
  HARD_FAIL=$((HARD_FAIL + 1))
fi
SOG_IMPORTS=$(grep -rn "from '@synova/sog-core'" src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | head -10 || true)
if [ -n "$SOG_IMPORTS" ]; then
  echo -e "${RED}  ❌ @synova/sog-core 仍被 src/ 引用 — 本体迁移未完成${RESET}"
  echo "$SOG_IMPORTS"
  HARD_FAIL=$((HARD_FAIL + 1))
fi

# v3.6 降级为警告 (原 15: PRD 章节引用, 原 16: 文件位置)
PRD_REF=""
if [ -n "$BRIEF" ] && [ -f "$BRIEF" ]; then
  DONE_SEC=$(sed -n '/^## Done 标准/,/^## /p' "$BRIEF" 2>/dev/null)
  if ! echo "$DONE_SEC" | grep -qE 'sec[0-9]+\.[0-9]+|PRD.*sec' 2>/dev/null; then
    PRD_REF="Done 标准未引用 PRD 章节 - 重大 feature 建议标注 secX.Y"
  fi
fi
warn_check "PRD 对照: Done 标准引用 PRD 章节(可选)" "${PRD_REF:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 7: 架构合规 (原 6, 9, 14, 18 合并)
#
# Anthropic 决策: 原则 3 "安全边际" — --no-verify 是逃生舱，但不能变成常态。
#   DiagnosticModule 禁止: Sentinel 已替代旧的模块注册系统。新模块必须走 Sentinel 接口。
#   专家配置校验: YAML 中的 tool/skill 引用必须真实存在——引用断裂 = 运行时崩溃。
#   --no-verify 审计: 24h 内使用 ≥3 次 → 硬阻断。逃生舱可以临时用，但不能连续用。
#         连续绕过门禁意味着门禁本身有问题（太慢/误杀太多）或开发者有问题（偷懒）。
#   v3.6 把 pre-commit 从 20 项减到 8 组 (<8s) 就是为了消除"门禁太慢"这个绕过理由。
#   数据流自检: 路由文件含硬编码业务数据但无真实 API 调用 → 可能是静态 mock 未被替换。
#   历史: DiagnosticModule 注册表已删除但引用未清理 (agent-tool-registry.ts:386
#         listModules() 运行时崩溃)。--no-verify 在 v2.5 被频繁使用 (38 项检查 90s)。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 7/13: 架构合规 ──${RESET}"

# 7a. DiagnosticModule 禁止 (原 6)
NEW_DIAG=$(echo "$GIT_CACHED_DIFF" | grep "^+.*DiagnosticModule" | grep -Ev "scripts/pre-commit-check.sh|.md|.html|//|@deprecated|import type|^+++|hard_check|禁止新 DiagnosticModule|不要再使用 DiagnosticModule" || true)
hard_check "禁止 DiagnosticModule: 新模块须实现 Sentinel 接口" "${NEW_DIAG:-}"

# 7b. 专家配置校验 (原 9)
if bash "$ROOT/scripts/validate-expert-config.sh" 2>&1; then
  echo -e "  ${GREEN}✅ 专家配置校验${RESET}"
else
  echo -e "  ${RED}❌ 专家配置校验: yaml 引用断裂  [硬阻断]${RESET}"
  HARD_FAIL=$((HARD_FAIL + 1))
fi

# 7c. V3.8 双日志审计 — 门禁故障 vs 人为绕过分离
#   门禁故障日志 → 用于发现门禁本身的 bug（误报率 = 门禁需要修）
#   绕过日志     → 用于发现开发者绕过模式（频繁绕过 = 门禁太重/开发者偷懒）
FAILURE_LOG="$ROOT/.claude/pre-commit-failures.log"
BYPASS_LOG="$ROOT/.claude/bypass.log"

# ── 门禁故障审计 (警告不阻断) ──
FAILURE_COUNT=0
if [ -f "$FAILURE_LOG" ]; then
  YESTERDAY=$(date -d "yesterday" +%Y-%m-%d 2>/dev/null || date +%Y-%m-%d)
  FAILURE_COUNT=$(grep -c "$YESTERDAY\|$(date +%Y-%m-%d)" "$FAILURE_LOG" 2>/dev/null | tr -d '\n\r' || echo 0)
  FAILURE_COUNT=${FAILURE_COUNT//[^0-9]/}
  [ -z "$FAILURE_COUNT" ] && FAILURE_COUNT=0
fi
if [ "${FAILURE_COUNT:-0}" -gt 10 ]; then
  echo -e "  ${YELLOW}⚠️  门禁故障审计: 24h 内 pre-commit 失败 ${FAILURE_COUNT} 次 — 门禁可能太激进 [警告]${RESET}"
  echo "    高失败率意味着门禁本身有 bug 或太敏感。请检查误报来源。"
elif [ "${FAILURE_COUNT:-0}" -gt 0 ]; then
  echo -e "  ${GREEN}✅ 门禁故障审计 (24h: ${FAILURE_COUNT} failures)${RESET}"
else
  echo -e "  ${GREEN}✅ 门禁故障审计${RESET}"
fi

# ── 绕过审计 (硬阻断) ──
# 检测方法: post-commit hook 检测 --no-verify 并写入 bypass.log
# 强弱信号分离 (D438): detected-bypass=强信号(head 不匹配, 真绕过)→阻断;
#   possible-bypass=弱信号(stale marker, 可能慢提交/merge 产物)→只告警, U1 推送对账才是真兜底。
BYPASS_COUNT=0
POSSIBLE_COUNT=0
if [ -f "$BYPASS_LOG" ]; then
  BYPASS_COUNT=$(grep -cE "$(date +%Y-%m-%d).*detected-bypass" "$BYPASS_LOG" 2>/dev/null | tr -d '\n\r' || echo 0)
  POSSIBLE_COUNT=$(grep -cE "$(date +%Y-%m-%d).*possible-bypass" "$BYPASS_LOG" 2>/dev/null | tr -d '\n\r' || echo 0)
  BYPASS_COUNT=${BYPASS_COUNT//[^0-9]/}
  POSSIBLE_COUNT=${POSSIBLE_COUNT//[^0-9]/}
  [ -z "$BYPASS_COUNT" ] && BYPASS_COUNT=0
  [ -z "$POSSIBLE_COUNT" ] && POSSIBLE_COUNT=0
fi
if [ "${BYPASS_COUNT:-0}" -ge 3 ]; then
  if [ "${SYNO_GATEKEEPER_ACK:-0}" = "1" ]; then
    echo -e "  ${YELLOW}⚠️  绕过审计: 24h 内 --no-verify ${BYPASS_COUNT} 次 — 已超限, 但已人工确认 (SYNO_GATEKEEPER_ACK=1)  [告警]${RESET}"
  else
    echo -e "  ${RED}❌ 绕过审计: 24h 内 --no-verify ${BYPASS_COUNT} 次 — 已超限  [硬阻断]${RESET}"
    echo "    连续使用 --no-verify 超过 2 次后，第 3 次起必须修复根因而非绕过"
    echo "    若已人工复核为误报, 可用 SYNO_GATEKEEPER_ACK=1 放行本次"
    HARD_FAIL=$((HARD_FAIL + 1))
  fi
elif [ "${BYPASS_COUNT:-0}" -ge 2 ]; then
  echo -e "  ${YELLOW}⚠️  绕过审计: 24h 内 --no-verify ${BYPASS_COUNT} 次 — 警告${RESET}"
elif [ "${POSSIBLE_COUNT:-0}" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠️  绕过审计: 24h 内 possible-bypass ${POSSIBLE_COUNT} 次（stale marker 弱信号，非强绕过，U1 推送对账兜底）[告警不阻断]${RESET}"
else
  echo -e "  ${GREEN}✅ 绕过审计${RESET}"
fi

# 7d. 数据流自检 (原 18)
STAGED_ROUTES=$(echo "$GIT_CACHED_ALL_NAMES" | grep -E '^src/routes/.*\.ts$' | grep -v '.test.' || true)
DATA_FLOW_FAIL=""
if [ -n "$STAGED_ROUTES" ]; then
  for rf in $STAGED_ROUTES; do
    [ -z "$rf" ] && continue; [ ! -f "$rf" ] && continue
    HAS_API=$(grep -c "fetch(\|await.*import\|getDatabase()\|\.search(\|\.list(\|\.recall(" "$rf" 2>/dev/null | tr -d '\n\r' || echo 0)
    HAS_HARD=$(grep -c "'marketing'\|'sales'\|'finance'\|'研发部'\|'市场部'\|'销售部'" "$rf" 2>/dev/null | tr -d '\n\r' || echo 0)
    if [ "${HAS_API:-0}" -eq 0 ] && [ "${HAS_HARD:-0}" -gt 0 ]; then
      DATA_FLOW_FAIL="${DATA_FLOW_FAIL}  ${rf}: 含硬编码业务数据但无 API 调用 — 可能为静态模板\n"
    fi
  done
fi
hard_check "数据流: 路由文件须含 API 调用证据" "${DATA_FLOW_FAIL:-}"

# ═══════════════════════════════════════════════════════════════════
# 组 8: 🆕 文件驱动架构完整性 (v3.6 新增 — 调用 check-file-driven.sh)
#
# Anthropic 决策: 原则 2 "先设计验证标准" — 这是整个 V3.6 最关键的架构新增。
#   "文件驱动"是 SynovaAgent 的核心架构承诺——新行业/新本体类型/新 LLM/新 IM 平台
#   全部零代码接入。如果这个承诺没有物理执法，它就和被声称完成 4 次的 engine-core
#   拆分一样——只存在于文档里。
#   这组检查的哲学: 不是"相信开发者会遵守文件驱动"，而是"让违反文件驱动在物理上不可能"。
#   详细检查清单见 check-file-driven.sh 头部注释。
#   历史: 这一组阻止的是"未来必然会发生的事故"——基于 engine-core 拆分欺诈的模式推演。
#         同样的模式: 声称文件驱动 → 有人为了方便在 src/ 加了个 enum → 没人发现 →
#         越来越多硬编码回归 → 一年后文件驱动只剩文档里的空壳。
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${CYAN}── 组 8/13: 文件驱动架构完整性 (V3.9) ──${RESET}"
# V3.9: 能力验收 CI — 验收测试必须通过 CI
par_collect acceptance-ci "$PAR_ACCEPTANCE" || HARD_FAIL=$((HARD_FAIL + 1))
par_collect file-driven "$PAR_FILE_DRIVEN" || HARD_FAIL=$((HARD_FAIL + 1))

# ═══ 组 9/12: 契约门禁 (D257) ═══
echo -e "${CYAN}── 组 9/13: 契约门禁 ──${RESET}"
CONTRACT_DIR="$ROOT/.codex/contracts"
CONTRACT_FAIL=""
if [ -d "$CONTRACT_DIR" ] && [ "$(ls -A "$CONTRACT_DIR" 2>/dev/null)" ]; then
  for cf in "$CONTRACT_DIR"/*.json; do
    [ ! -f "$cf" ] && continue
    # 从 contract.json 提取声明产出文件列表
    DECLARED=$(python -c "
import json, sys
try:
    d = json.load(open('$cf'))
    items = d if isinstance(d, list) else [d]
    for i in items:
        fp = i.get('filePath', '')
        if fp: print(fp)
except: pass
" 2>/dev/null || true)
    for df in $DECLARED; do
      [ -z "$df" ] && continue
      if ! echo "$STAGED_ALL" | grep -qF "$df"; then
        CONTRACT_FAIL="${CONTRACT_FAIL}  ${cf##*/}: 声明产出 $df — 不在暂存区\n"
      fi
    done
  done
fi
hard_check "契约门禁: 声明产出须在暂存区" "${CONTRACT_FAIL:-}"

# ═══ 组 10/12: V3 CP3 — 条件区域 + 测试覆盖 (D260) ═══
echo ""
echo -e "${CYAN}── 组 10/13: V3 流水线健康度 ──${RESET}"

CRITERIA_MAP="$ROOT/.codex/criteria-code-map.json"
if [ -f "$CRITERIA_MAP" ]; then
  # V3 CP3-1: G10 条件区域检查 — 暂存的文件是否在声明的条件区域内
  BRIEF_FILE=$(echo "$CHANGED_FILES" | grep -m1 "\.claude/task-briefs/" || true)
  if [ -n "$BRIEF_FILE" ]; then
    BRIEF_PATH="$ROOT/$BRIEF_FILE"
    CRITERIA=$(grep -oP '#CRITERIA\s*[:=]\s*\K[A-D]' "$BRIEF_PATH" 2>/dev/null || true)
    if [ -n "$CRITERIA" ]; then
      # 读取条件代码映射
      CRITERIA_GLOBS=$(python -c "
import json
with open('$CRITERIA_MAP') as f:
    m = json.load(f)
g = m.get('criteria', {}).get('$CRITERIA', {}).get('glob', [])
for gx in g:
    print(gx)
" 2>/dev/null || true)
      REGEX_GLOBS=""
      while IFS= read -r gx; do
        [ -z "$gx" ] && continue
        # 转换 glob 到 grep 正则
        REGEX=$(echo "$gx" | sed 's/\*/.*/g; s/?/./g')
        REGEX_GLOBS="${REGEX_GLOBS}|${REGEX}"
      done <<< "$CRITERIA_GLOBS"
      REGEX_GLOBS="${REGEX_GLOBS#|}"
      if [ -n "$REGEX_GLOBS" ]; then
        MISMATCH=""
        for sf in $STAGED_FILES; do
          if ! echo "$sf" | grep -qE "($REGEX_GLOBS)"; then
            MISMATCH="${MISMATCH}  $sf (不在条件 $CRITERIA 的映射区域内)\n"
          fi
        done
        if [ -n "$MISMATCH" ]; then
          warn_check "G10: 条件区域不匹配" "$MISMATCH"
        else
          soft_pass "G10: 条件区域检查通过 ($CRITERIA)"
        fi
      else
        soft_pass "G10: 条件 $CRITERIA 无映射区域(跳过)"
      fi
    else
      soft_pass "G10: 无条件归属(跳过)"
    fi
  else
    soft_pass "G10: 无 task brief 变更(跳过)"
  fi

  # V3 CP3-2: G11 测试覆盖检查
  HAS_E2E=0; HAS_TESTS=0
  BRIEF_ID=$(echo "$STAGED_FILES" | grep -oP '\.claude/task-briefs/\K[^.]+' | head -1 || true)
  if [ -n "$BRIEF_ID" ]; then
    BRIEF_PATH="$ROOT/.claude/task-briefs/${BRIEF_ID}.md"
    if [ -f "$BRIEF_PATH" ]; then
      HAS_E2E=$(grep -c "端到端\|e2e\|curl.*200\|HTTP.*200" "$BRIEF_PATH" 2>/dev/null | tr -d '\n\r' || true)
      HAS_TESTS=$(echo "$STAGED_FILES" | grep -c "\.test\.ts" 2>/dev/null | tr -d '\n\r' || true)
      if [ "$HAS_E2E" -gt 0 ] && [ "$HAS_TESTS" -eq 0 ]; then
        warn_check "G11: 声明的端到端验收但无测试文件" "$BRIEF_ID 声明了端到端验收，但暂存区无测试文件"
      else
        soft_pass "G11: 测试覆盖检查通过"
      fi
    else
      soft_pass "G11: task brief 不存在(跳过)"
    fi
  else
    soft_pass "G11: 无 task brief 变更(跳过)"
  fi
else
  soft_pass "G10/G11: criteria-code-map.json 不存在(跳过)"
fi

# ═══ 组 12/12: Task Scope 一致性 — 暂存文件 vs Q2 范围 ═══
echo ""
echo -e "${CYAN}── 组 12/13: Task Scope 一致性 ──${RESET}"

TODAY=$(date +%Y-%m-%d)
# 修复 (D291): 组12 只用当前 session 的 brief, 避免并发 session 的 brief 干扰暂存文件匹配
# D296 跨 session 污染根治 (认领制):
#   - 范围 (做什么) 取今日全部 brief 的并集 — 每个 session 的文件由自己的 brief 认领,
#     并发 session 的 brief 不再误伤 (D291 事故: session 提交被另一 session 的 brief 阻断)
#   - 排除 (不做什么) 仅取 current-brief — 他人 brief 的排除项不适用于本 session 的文件
#   - current-brief 缺失/陈旧 → 回退全部 (单 session 语义)
#   - CT-42: session 专属 current-brief（.claude/current-brief.<sid>）优先，无则回退全局
#     写侧 attach.py 已写专属文件（D329），读侧此前漏接 → 并行 session 互相覆盖全局文件
CUR_BRIEF_PATH=""
_CB_SRC="$ROOT/.claude/current-brief"
if [ -n "${DSH_SESSION_ID:-}" ] && [ -f "$ROOT/.claude/current-brief.$DSH_SESSION_ID" ]; then
  _CB_SRC="$ROOT/.claude/current-brief.$DSH_SESSION_ID"
fi
if [ -f "$_CB_SRC" ]; then
  _bname=$(cat "$_CB_SRC" 2>/dev/null | tr -d '[:space:]')  # swallow-ok: current-brief 缺失/读失败 → _bname 空 → 回退认领，非错误吞掉
  _cb_date=$(echo "$_bname" | grep -oP '\d{4}-\d{2}-\d{2}' | head -1 || true)
  if [ -n "$_cb_date" ] && [ "$_cb_date" != "$TODAY" ]; then
    :  # 陈旧的 current-brief，忽略它
  elif [ -n "$_bname" ] && [ -f "$ROOT/.claude/task-briefs/$_bname" ]; then
    CUR_BRIEF_PATH="$ROOT/.claude/task-briefs/$_bname"
  fi
fi
# 认领候选: 今日全部 brief (含并发 session 的) — D366: 文件名日期前缀 (mtime 会被 git pull 刷, 不可靠)
# D366: 按文件名日期判断"今日" — 替代 find 按 mtime 的今日判定
# 用法: today_files_by_prefix <dir>   # brief: YYYY-MM-DD 文件名前缀 (扫描 *.md)
# 性能: 纯 bash for+case 零子进程 — grep|head 每文件 3 spawn × 349 brief = Windows 分钟级 (实测回退)
# 注意: glob 硬编码在函数内 — 变量中的 * 不会被路径名展开 (实测), 字面 glob 才展开
TODAY_DASH=$(date +%Y-%m-%d)
# D503→D506: 时区容差 — brief 认领窗口扩到 ±1 天。Mac(UTC+8) 傍晚建的 brief 日期前缀
# 对 CI runner(UTC) 是"明天"，单日过滤致 G12 在 CI 上无人认领 → 全部误报"不在 Q2 范围"
# （D502 实证：本地 13 组全过、CI 红 7 处）；跨午夜连续作业同理。
# D506 修正（K3 审计 P0-1）: 旧实现把 DAY_WINDOW_DAYS（含 |）放进 case 模式 ——
#   case 的 pattern 在 parse-time 解析，变量展开是 runtime，展开结果里的 | 是字面量
#   不是 alternation → 匹配恒失败 → ALL_TODAY_BRIEFS 空 → G12 整段跳过 soft_pass（fail-open）。
#   改用 [[ $b =~ $RE ]]：=~ 的 RHS 在 runtime 展开后按 ERE 解析，| 作为 alternation 生效
#   （bash 3.x/5.x 一致，K3 审计实测 + CTO 本地独立复现）。
# 一次 python3 算三天 ERE（G12 本就依赖 python3；python 不可用 → 回退单日本地 glob 行为）。
DAY_WINDOW_RE=$(python3 -c "
import datetime
t = datetime.date.today()
print('^(' + '|'.join((t + datetime.timedelta(days=k)).isoformat() for k in (-1, 0, 1)) + ')-')" 2>/dev/null || true)
[ -z "$DAY_WINDOW_RE" ] && DAY_WINDOW_RE="^${TODAY_DASH}-"
today_files_by_prefix() {
  local dir="$1" f b
  dir="${dir%/}"
  [ -d "$dir" ] || return 0
  for f in "$dir"/*.md; do
    [ -e "$f" ] || continue
    b=${f##*/}
    if [[ "$b" =~ $DAY_WINDOW_RE ]]; then
      echo "$f"
    fi
  done
  return 0
}
ALL_TODAY_BRIEFS=$(today_files_by_prefix "$ROOT/.claude/task-briefs/" | sort || true)
[ -z "$ALL_TODAY_BRIEFS" ] && [ -n "$CUR_BRIEF_PATH" ] && ALL_TODAY_BRIEFS="$CUR_BRIEF_PATH"
SCOPE_VIOLATION=""

if [ -n "$ALL_TODAY_BRIEFS" ] && [ -n "$STAGED_ALL" ]; then
  # 认领制 v2 (D296 复查): 每个文件由**认领它的 brief** 判定通过与排除
  #   - 被 ≥1 个今日 brief 认领 → 通过 (除非认领者自身排除它)
  #   - 未被任何 brief 认领 → 阻断 (不在任何任务范围)
  #   - 他人 brief 的排除项不适用于本文件 (场景E: A认领+B排除 → 必须通过)
  # 生成 per-brief TSV: "brief文件名\t路径"
  # 注意: 必须用仓库内路径 — Git Bash mktemp 的 /tmp 路径 Windows python3 无法打开
  SCOPE_TSV="$ROOT/.claude/.g12-scope.tsv"
  EXCL_TSV="$ROOT/.claude/.g12-excl.tsv"
  rm -f "$SCOPE_TSV" "$EXCL_TSV"
  while IFS= read -r BRIEF; do
    [ -z "$BRIEF" ] && continue
    BNAME=$(basename "$BRIEF")
    # D313 M3 同源: G12 awk → brief_parser.py（消灭双副本，语义 = parse_q2）
    python3 "$ROOT/scripts/control-tower/brief_parser.py" --q2-include "$BRIEF" 2>/dev/null \
      | sed "s|^|$BNAME\\t|" >> "$SCOPE_TSV" || true
    python3 "$ROOT/scripts/control-tower/brief_parser.py" --q2-exclude "$BRIEF" 2>/dev/null \
      | sed "s|^|$BNAME\\t|" >> "$EXCL_TSV" || true
  done <<< "$ALL_TODAY_BRIEFS"

  # 检查每个暂存文件 — 修复 (D291): Python 单进程匹配, 替代 12321 次 grep 子进程 (Windows 10+ 分钟 → <1s)
  # D296 认领制 v2: 按 per-brief TSV 判定, 排除只来自认领该文件的 brief
  SCOPE_VIOLATION=$(python3 -c "
import re, sys
staged = '''$STAGED_ALL'''.split('\n')
def load_tsv(path):
    out = []
    try:
        with open(path, encoding='utf-8') as f:
            for line in f:
                line = line.rstrip('\n')
                if '\t' in line:
                    brief, p = line.split('\t', 1)
                    if p:
                        out.append((brief, p))
    except OSError:
        pass
    return out
scope = load_tsv('''$SCOPE_TSV''')
excl = load_tsv('''$EXCL_TSV''')
def matches(path, pat):
    return re.search(r'(^|/)' + re.escape(pat) + r'\$', path) is not None
skip_re = re.compile(r'\.claude/|scripts/workflow/|\.codex/|memory/|docs/|task-state/.*\.(json|md)$|\.github/')
code_re = re.compile(r'\.(ts|tsx|js|jsx|json|py|sh)\$')
viol = []
for sf in staged:
    sf = sf.strip()
    if not sf or skip_re.search(sf) or not code_re.search(sf):
        continue
    # 认领者 = 做什么 覆盖该文件的 brief
    claimants = [b for b, p in scope if matches(sf, p)]
    if not claimants:
        viol.append(f'  {sf} (不在 Q2 范围内)')
        continue
    # 排除只来自认领者自身 — 他人 brief 的排除不适用于本文件 (跨 session 根治)
    for b, ex in excl:
        if b in claimants and matches(sf, ex):
            viol.append(f'  {sf} (Q2 排除项禁止修改: {ex}, 来自认领 brief {b})')
            break
print('\n'.join(viol))
" 2>/dev/null || true)
  rm -f "$SCOPE_TSV" "$EXCL_TSV"
fi

if [ -n "$SCOPE_VIOLATION" ]; then
  hard_check "G12: task brief Q2 范围一致性" "$SCOPE_VIOLATION"
else
  soft_pass "G12: 所有文件均在 Q2 范围内"
fi

# G12d (D458): 生成物单点生成门禁 — session 禁止提交 CI 单点生成的产物
# 背景: founder-console/founder-dashboard/product-progress 由 CI bot（dashboard-auto.yml /
#       product-progress.yml）单点生成 + 裸 git commit 提交。session 手改这些文件会制造
#       并行冲突（D429/D452/D455 多次实证）。CI 走裸 git commit 不触发本门禁，天然放行。
# 规则: 生成物文件处于新增(A)/修改(M)状态 → 阻断；删除(D)不拦（去跟踪/清理合法）。
GENERATED_FILES="app/founder-dashboard.html docs/synova/founder-console.html docs/synova/product-lines/product-progress.json docs/synova/product-lines/product-progress.html docs/synova/product-lines/todos.yaml"
GENERATED_VIOLATION=""
while IFS= read -r line; do
  [ -z "$line" ] && continue
  _status="${line:0:1}"
  _path="${line:3}"
  if echo "$GENERATED_FILES" | grep -qw "$_path" 2>/dev/null && [ "$_status" = "M" -o "$_status" = "A" ]; then
    GENERATED_VIOLATION="${GENERATED_VIOLATION}  $_path (CI 单点生成物，session 禁止提交)\n"
  fi
done <<< "$(git diff --cached --name-status 2>/dev/null)"
if [ -n "$GENERATED_VIOLATION" ]; then
  hard_check "G12d: 生成物单点生成门禁 (D458)" "$GENERATED_VIOLATION"
else
  soft_pass "G12d: 无 session 提交生成物 (CI 单点)"
fi

# D313 M3: 附挂 brief 契约检查（同源解析器 + #CRITERIA + 架构层 + Done）
BRIEF_PARSEABLE_OUT=$(bash "$ROOT/scripts/workflow/check-brief-parseable.sh" "$BRIEF" 2>&1 || true)
if echo "$BRIEF_PARSEABLE_OUT" | grep -q "❌"; then
  hard_check "G12b: brief 可解析性 (D313 M3)" "$BRIEF_PARSEABLE_OUT"
else
  soft_pass "G12b: brief 可解析 (D313 M3)"
fi

# D313 M3b: 附挂 dev doc 写集验证（暂存含 SYNOVA-IMPL-*.md 时）
if echo "$STAGED_ALL" | grep -qE 'docs/plans/codex/implementation/SYNOVA-IMPL-.*\.md'; then
  DEV_DOC_OUT=$(bash "$ROOT/scripts/workflow/check-dev-doc-write-set.sh" 2>&1 || true)
  if echo "$DEV_DOC_OUT" | grep -q "❌"; then
    hard_check "G12c: dev doc 写集验证 (D313 M3b)" "$DEV_DOC_OUT"
  else
    soft_pass "G12c: dev doc 写集验证 (D313 M3b)"
  fi
fi

# U4 (D423): 附挂声称↔证据对照表校验（暂存含 SYNOVA-IMPL-*.md 时；脚本内部按有无「交付声明」节跳过）
CLAIMS_DOCS=$(echo "$STAGED_ALL" | grep -E 'docs/plans/codex/implementation/SYNOVA-IMPL-.*\.md' || true)
if [ -n "$CLAIMS_DOCS" ]; then
  CLAIMS_OUT=$(bash "$ROOT/scripts/control-tower/verify-claims-table.sh" $CLAIMS_DOCS 2>&1)
  CLAIMS_EXIT=$?
  if [ "$CLAIMS_EXIT" -eq 0 ]; then
    soft_pass "G12d: 声称↔证据对照表 (U4 D423)"
  elif [ "$CLAIMS_EXIT" -eq 1 ]; then
    hard_check "G12d: 声称↔证据对照表不完整 (U4 D423)" "$CLAIMS_OUT"
  else
    hard_check "G12d: 声称↔证据校验执行失败 (U4 D423, exit=$CLAIMS_EXIT)" "$CLAIMS_OUT"
  fi
fi

# ═══ 组 13/13: 技能同步一致性 (.claude/skills ↔ .dsh/skills, D370) ═══
# 背景: DSH 技能发现根 .dsh/skills（rank 100）不读 .claude/skills → 单源复制 + 漂移门禁。
# fail-closed (D328): 检查脚本 exit 2 = 检查执行失败 → 同样硬阻断, 不与"通过"混同。
echo ""
echo -e "${CYAN}── 组 13/13: 技能同步一致性 ──${RESET}"
SKILL_FILES_STAGED=$(echo "$STAGED_ALL" | grep -E "\.claude/skills/|\.dsh/skills/" || true)
if [ -n "$SKILL_FILES_STAGED" ]; then
  SKILL_SYNC_OUT=$(bash "$ROOT/scripts/workflow/sync-dsh-skills.sh" --check 2>&1)
  SKILL_SYNC_EXIT=$?
  if [ "$SKILL_SYNC_EXIT" -eq 0 ]; then
    soft_pass "G13: 技能同步一致 ($(echo "$SKILL_SYNC_OUT" | head -1 | sed 's/SYNC-OK: //'))"
  elif [ "$SKILL_SYNC_EXIT" -eq 1 ]; then
    hard_check "G13: 技能漂移 — 运行 bash scripts/workflow/sync-dsh-skills.sh 后重新暂存" "$SKILL_SYNC_OUT"
  else
    hard_check "G13: 技能同步检查执行失败 (exit=$SKILL_SYNC_EXIT, D328 三态)" "$SKILL_SYNC_OUT"
  fi
else
  soft_pass "G13: 无技能文件变更(跳过)"
fi

# V3: 写 CP3 检查点
mkdir -p "$ROOT/.codex/checkpoints"
G10_FAIL=$([ -n "$MISMATCH" ] && echo "true" || echo "false")
G11_FAIL=$([ "$HAS_E2E" -gt 0 ] && [ "$HAS_TESTS" -eq 0 ] && echo "true" || echo "false")
CP3_STATUS="pass"; CP3_REASON="全部通过"
if [ "$G10_FAIL" = "true" ]; then CP3_STATUS="warn"; CP3_REASON="有条件区域不匹配"; fi
if [ "$G11_FAIL" = "true" ]; then CP3_STATUS="warn"; CP3_REASON="有验收无测试"; fi
python -c "
import json, os
d = {'name':'CP3: 预提交检查','status':'$CP3_STATUS','reason':'$CP3_REASON','checkedAt':'$(date -u +%Y-%m-%dT%H:%M:%SZ)'}
os.makedirs('$ROOT/.codex/checkpoints', exist_ok=True)
with open('$ROOT/.codex/checkpoints/cp3-commit-check.json','w') as f:
    json.dump(d, f)
" 2>/dev/null || true

# ═══════════════════════════════════════════════════════════════════
# 结果
# ═══════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$HARD_FAIL" -gt 0 ]; then
  echo -e "  ${RED}❌ ${HARD_FAIL} 组未通过 — 提交已拒绝${RESET}"
  [ "$WARN_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠️  ${WARN_COUNT} 项警告${RESET}"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  exit 1
else
  echo -e "  ${GREEN}✅ 全部 13 组通过${RESET}"
  [ "$WARN_COUNT" -gt 0 ] && echo -e "  ${YELLOW}⚠️  ${WARN_COUNT} 项警告 (不阻断)${RESET}"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  exit 0
fi
