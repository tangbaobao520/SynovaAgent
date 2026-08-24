#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# Loop Engineering V4.5.1 — pre-commit 12 组硬阻断 (全部 <10s) + 免疫系统
# D515 / V5.0.0: 提交端硬阻断收敛到 4 道质量根（as any / 测试配对+expect / Secrets /
#   接线物理事实）+ 特例 G12d 生成物单点（D458）与 G13 技能同步（D370）保持硬阻断。
#   其余检查 hard_check → soft_check：判定代码与输出原样保留（--check 报告与 K3
#   审计依赖），只是本地不再阻断——CI Iron Laws job 为权威（ci.yml 已有）。
#   保留理由（防未来误删）：G12d 防 CI 单点产物污染（D429/D452/D455 实证）、
#   G13 防双目录漂移（误报率低、命中即真事故）。
#   命中统计（项4）：hard_check/soft_check 每次触发追加 JSONL 到 .claude/gate-hits.log，
#   由 scripts/control-tower/gate-stats.sh 汇总（月度清理数据地基）。
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
SOFT_COUNT=0
SOFT_COUNT=0
SOFT_COUNT=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; RESET='\033[0m'

hard_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${RED}❌ ${name}: ${count} 处  [硬阻断]${RESET}"
    echo "$matches" | head -8 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    HARD_FAIL=$((HARD_FAIL + 1))
    log_gate "$name" hit
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    log_gate "$name" miss
  fi
}

soft_pass() {
  local name="$1"
  echo -e "  ${GREEN}✅ ${name}${RESET}"
}

# D515 项4: 门禁命中统计 — 每次检查触发追加 JSONL 到 .claude/gate-hits.log
# 契约(铁律47): @input $1=检查点名 $2=hit|miss; @output 追加 JSONL 行
# @degraded 写失败静默（统计非门禁，不阻断提交——但 GATE_HITS_LOG 默认在仓库内可写）
log_gate() {
  local g="$1" r="$2"
  [ -z "$g" ] && return 0
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"gate\": \"${g}\", \"result\": \"${r}\", \"branch\": \"${_GATE_BRANCH}\"}" >> "${GATE_HITS_LOG}" 2>/dev/null || true  # swallow-ok: 统计写失败不阻断提交
}

# D515 项3 / V5.0.0: 软提示检查 — 输出格式与 hard_check 一致（报告完整，--check/K3 可见），
# 但只计 SOFT_COUNT 不计 HARD_FAIL：本地不阻断，CI Iron Laws job 为权威。
soft_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处  [V5 软提示——CI 为权威，本地不阻断]${RESET}"
    echo "$matches" | head -8 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    if [ "${SYNO_CI:-0}" = "1" ]; then
    HARD_FAIL=$((HARD_FAIL + 1))  # D516 CI strict
  else
    SOFT_COUNT=$((SOFT_COUNT + 1))
  fi
    log_gate "$name" hit
  else
    echo -e "  ${GREEN}✅ ${name}${RESET}"
    log_gate "$name" miss
  fi
}

# D515 项3: par_collect 类软门禁失败时统一提示（判定脚本输出原样打印，不阻断）
v5_soft() {
  # D516/K3 P0-1: SYNO_CI strict 模式——CI 上（SYNO_CI=1）软提示转硬阻断。
  # 这才是"本地减负 + CI 权威"的物理落地：本地快速通过（软提示），CI 同一检查
  # 变硬（K3 D515 审计实证：无此转换则约 20 项检查本地+CI 双放行=门禁虚设，
  # D503 P0-1 同型复发）。ci.yml Iron Laws job 注入 SYNO_CI: "1"。
  if [ "${SYNO_CI:-0}" = "1" ]; then
    echo -e "  ${RED}❌ ${1}: 检查未过 [CI strict——本地软提示在 CI 上为硬阻断]${RESET}"
    HARD_FAIL=$((HARD_FAIL + 1))
    log_gate "$1" hit
    return
  fi
  echo -e "  ${YELLOW}⚠️  ${1}: 检查未过 [V5 软提示——CI 为权威(SYNO_CI)，本地不阻断]${RESET}"
  SOFT_COUNT=$((SOFT_COUNT + 1))
  log_gate "$1" hit
}

# D515 项4: 门禁命中统计 — 每次检查触发追加 JSONL 到 .claude/gate-hits.log
# 契约(铁律47): @input $1=检查点名 $2=hit|miss; @output 追加 JSONL 行
# @degraded 写失败静默（统计非门禁，不阻断提交——但 GATE_HITS_LOG 默认在仓库内可写）
# D515 项3 / V5.0.0: 软提示检查 — 输出格式与 hard_check 一致（报告完整，--check/K3 可见），
# 但只计 SOFT_COUNT 不计 HARD_FAIL：本地不阻断，CI Iron Laws job 为权威。
# D515 项3: par_collect 类软门禁失败时统一提示（判定脚本输出原样打印，不阻断）
# D515 项4: 门禁命中统计 — 每次检查触发追加 JSONL 到 .claude/gate-hits.log
# 契约(铁律47): @input $1=检查点名 $2=hit|miss; @output 追加 JSONL 行
# @degraded 写失败静默（统计非门禁，不阻断提交——但 GATE_HITS_LOG 默认在仓库内可写）
# D515 项3 / V5.0.0: 软提示检查 — 输出格式与 hard_check 一致（报告完整，--check/K3 可见），
# 但只计 SOFT_COUNT 不计 HARD_FAIL：本地不阻断，CI Iron Laws job 为权威。
# D515 项3: par_collect 类软门禁失败时统一提示（判定脚本输出原样打印，不阻断）
warn_check() {
  local name="$1" matches="$2"
  local count=0
  [ -n "$matches" ] && count=$(echo "$matches" | grep -c . 2>/dev/null) || count=0
  if [ "$count" -gt 0 ]; then
    echo -e "  ${YELLOW}⚠️  ${name}: ${count} 处  [警告]${RESET}"
    echo "$matches" | head -5 | while read -r line; do [ -n "$line" ] && echo "     ${line}"; done
    if [ "${SYNO_CI:-0}" = "1" ]; then
      HARD_FAIL=$((HARD_FAIL + 1))  # D516 CI strict: 历史 WARN 类在 CI 也转硬
    else
      WARN_COUNT=$((WARN_COUNT + 1))
    fi
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
# D515 项4: 命中统计落点（gitignore 运行态；SYNO_GATE_HITS_LOG 供测试注入）
GATE_HITS_LOG="${SYNO_GATE_HITS_LOG:-$ROOT/.claude/gate-hits.log}"
_GATE_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
# D515 项4: 命中统计落点（gitignore 运行态；SYNO_GATE_HITS_LOG 供测试注入）
GATE_HITS_LOG="${SYNO_GATE_HITS_LOG:-$ROOT/.claude/gate-hits.log}"
_GATE_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
# D515 项4: 命中统计落点（gitignore 运行态；SYNO_GATE_HITS_LOG 供测试注入）
GATE_HITS_LOG="${SYNO_GATE_HITS_LOG:-$ROOT/.claude/gate-hits.log}"
_GATE_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"


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

# ── D515 项2 / V5: 纯补记快速通道 ──
# 仅当 synova-commit 判定 --files 列表唯一且为 .claude/bypass.log 时 export SYNO_FASTLANE=1。
# ⚠️ 不裸看 git diff --cached：D414 会把 bypass.log 自动 add 进正常提交——裸看暂存区
#    会让正常提交误走快速通道 = 质量根被绕过（D515 spec 自查坑）。唯一信号源 = 环境变量。
# Secrets 保留（证据文件也可能泄密）；D331 对账由 pre-push 兜底，无需重复。
if [ "${SYNO_FASTLANE:-0}" = "1" ]; then
  echo ""
  echo "═══════════════════════════════════════════════════════════"
  echo "  ✅ V5 纯补记快速通道：仅 bypass.log + Secrets，跳过 12 组"
  echo "═══════════════════════════════════════════════════════════"
  echo ""
  log_gate "fastlane-bypass-only" hit
  if bash "$ROOT/scripts/check-secrets.sh" 2>&1; then
    echo -e "  ${GREEN}✅ Secrets 扫描通过 — 纯补记提交放行${RESET}"
    exit 0
  else
    echo -e "  ${RED}❌ Secrets 扫描失败 — 提交已拒绝${RESET}"
    exit 1
  fi
fi

# ── D515 项2 / V5: 纯补记快速通道 ──
# 仅当 synova-commit 判定 --files 列表唯一且为 .claude/bypass.log 时 export SYNO_FASTLANE=1。
# ⚠️ 不裸看 git diff --cached：D414 会把 bypass.log 自动 add 进正常提交——裸看暂存区
#    会让正常提交误走快速通道 = 质量根被绕过（D515 spec 自查坑）。唯一信号源 = 环境变量。
# Secrets 保留（证据文件也可能泄密）；D331 对账由 pre-push 兜底，无需重复。

# ── D515 项2 / V5: 纯补记快速通道 ──
# 仅当 synova-commit 判定 --files 列表唯一且为 .claude/bypass.log 时 export SYNO_FASTLANE=1。
# ⚠️ 不裸看 git diff --cached：D414 会把 bypass.log 自动 add 进正常提交——裸看暂存区
#    会让正常提交误走快速通道 = 质量根被绕过（D515 spec 自查坑）。唯一信号源 = 环境变量。
# Secrets 保留（证据文件也可能泄密）；D331 对账由 pre-push 兜底，无需重复。

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
soft_check "硬编码业务数据/类型 (禁止硬编码部门名/可扩展实体列表)" "${HARDCODE_DATA:-}"

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
soft_check "empty catch 无 log (铁律 24+31)" "${EMPTY:-}"

# D313 M5b: 附挂静默吞错扫描（git diff 新增行含 2>/dev/null → 阻断，豁免需 # swallow-ok:）
SILENT_OUT=$(bash "$ROOT/scripts/workflow/check-silent-swallow.sh" --diff 2>&1 || true)
if echo "$SILENT_OUT" | grep -q "❌"; then
  soft_check "静默吞错扫描 (D313 M5b)" "$SILENT_OUT"
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
soft_check "架构边界: 禁止跨层引用 (铁律 39)" "${CROSS_LAYER:-}"

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
soft_check "铁律 46: 桥接文件欺诈 + 包级 engine-core + 壳包检测" "${BRIDGE_FAIL:-}"

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

# D515 项1: 并行隔离软告警 — 主树提交时活跃 session>1（CI 权威原则，本地只告警不阻断；
#   开工端的硬拦截在 task-start.sh——那才是防互踩的第一道闸）
_ACTIVE_SESS_WARN=""
if [ "${SYNO_SKIP_PARALLEL_WARN:-0}" != "1" ]; then
  case "$(git rev-parse --git-dir 2>/dev/null || echo '')" in
    *"/.git/worktrees/"*) : ;;  # worktree 内本就物理隔离，不告警
    *)
      if [ -f "$ROOT/scripts/control-tower/session_registry.py" ]; then
        _ACT_JSON=$(python3 "$ROOT/scripts/control-tower/session_registry.py" list --active 2>/dev/null </dev/null || true)
        if [ -n "$_ACT_JSON" ]; then
          _ACT_N=$(echo "$_ACT_JSON" | python3 -c "import json,sys;print(len(json.load(sys.stdin).get('sessions',[])))" 2>/dev/null | tr -d '\n\r' || echo "")
          if [ -n "$_ACT_N" ] && [ "$_ACT_N" -gt 1 ]; then
            _ACTIVE_SESS_WARN="主树提交时检测到 ${_ACT_N} 个活跃 session — 建议 worktree 物理隔离: python3 scripts/control-tower/worktree-manager.py create <任务名>"
          fi
        else
          _ACTIVE_SESS_WARN="session-registry 不可读 — 并行隔离检查降级（铁律 11，不静默）"
        fi
      fi
      ;;
  esac
fi
warn_check "V5 并行隔离: 活跃 session 数" "${_ACTIVE_SESS_WARN:-}"

