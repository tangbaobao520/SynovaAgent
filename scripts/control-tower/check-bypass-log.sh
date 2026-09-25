#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-bypass-log.sh — D331 (L4-2 / P1-2): bypass.log 执行证据链对账
#
# 背景: D329 的 dc369fd 经 git commit --amend 重提交 — synova-commit 的 pathspec
# 提交（-- "${FILES[@]}"）不含删除/改回，配套变更须 amend 并入；amend 绕过了
# synova-commit 的 COMMITTED 记录写入，导致版本锚点 tag 与执行证据链同时断裂
# （tag V4.7.1 孤儿 f685fa0 + dc369fd 无 bypass.log 记录），无人发现（无对账方）。
#
# 对账: 对比 <base>..HEAD 全部提交与 .claude/bypass.log 的 HASH 条目；
#       缺失 → 列出 + exit 1（新提交硬要求）；全部有记录 → exit 0。
#
# 用法: bash check-bypass-log.sh [base-ref]
#       默认 base: origin/feat/prompt-architecture（D311 改基约定）
# 注入: SYNO_BASE_REF 环境变量覆盖（测试隔离；显式给出则必须可解析）
# 豁免: 历史提交一次性补记（D331 已对 ea1cb71/dc369fd 回填）；对账从 D331 起强制
# 降级: 日志缺失 → exit 1（执行证据链缺失显式列出）；base 不可解析且非显式
#       → fetch 一次后仍不可用 → 显式跳过 exit 2（fail-closed，不当作通过 — D414/U1c 修复 M1 假 PASS）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
# 注入缝（测试隔离；未设即生产路径）: SYNO_LEGACY_BYPASS_LOG 与 bypass-ledger.sh 同名同义
LOG="${SYNO_LEGACY_BYPASS_LOG:-$ROOT/.claude/bypass.log}"
# D735 Stage 2（D970）: 账本**不随仓走** —— 旧路径已出库（.gitignore 忽略 + git rm --cached，
#   文件保留在磁盘）。对账来源 = 冻结归档 + 旧路径（若本机仍存在）+ 全部 per-session
#   （见 bypass-ledger.sh sources）。
#   ⚠️ 语义 / exit code / fail-closed **不变**: 0=全有记录 / 1=有提交缺记录或证据链整体不可读 /
#      2=base 或 git log 不可用（fail-closed，不当作通过）。
LEDGER_SH="$ROOT/scripts/control-tower/bypass-ledger.sh"
LEDGER_SOURCES="$LOG"
if [ -f "$LEDGER_SH" ]; then
  _SRC_OUT="$(bash "$LEDGER_SH" sources 2>/dev/null)" || _SRC_OUT="$LOG"  # swallow-ok: 解析器失败即回退旧路径（显式赋值，非静默跳过对账）
  [ -n "$_SRC_OUT" ] && LEDGER_SOURCES="$_SRC_OUT"
fi
# 至少一个来源真实存在，否则对账无据可依（fail-closed）
_source_exists() {
  local f
  # shellcheck disable=SC2086  # 有意分词: LEDGER_SOURCES 是换行分隔的多文件列表
  for f in $LEDGER_SOURCES; do [ -f "$f" ] && return 0; done
  return 1
}
BASE="${SYNO_BASE_REF:-${1:-origin/feat/prompt-architecture}}"

# D513/③(Win 37dc1cae 根因): 防御性刷新 base —— `git push <URL>` 不更新本地
# remote-tracking ref，BASE 解析到陈旧 ref → merge-base 化失效 → 对账范围扩大 →
# 补记循环（Win 实测 11 条）。fetch 最新 tracking ref 后再对账；失败不阻断（显式
# 降级——本地 ref 至少是最新的已知态，比静默用陈旧 ref 强）。
_base_remote="${BASE%%/*}"
_base_branch="${BASE#*/}"
if [ -n "$_base_remote" ] && [ "$_base_remote" != "$_base_branch" ] && [ "${SYNO_BASE_REF:-}" = "" ]; then
  # D515 项9: fetch 失败不再纯静默 — 显式提示 tracking ref 可能陈旧（Codex P10）
  if ! git fetch --no-tags "$_base_remote" "$_base_branch" --quiet 2>/dev/null; then  # swallow-ok: 失败走下方显式降级提示
    echo "⚠ fetch 失败——base 可能陈旧（push URL 不更新 tracking ref）；建议 git fetch origin 后重试"  # swallow-ok: 降级用本地 ref（铁律 11 显式）
  fi
fi
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RESET='\033[0m'

# ⚠️ 本判据**过宽**已修（D970 verifier 退回 ①）: 「来源不可读」只有在**确有待对账提交**时才是
#   fail-closed 触发条件；空范围是 vacuous pass，与来源可读性无关。见下方 RANGE 计算之后的判定。

BASE="${SYNO_BASE_REF:-${1:-origin/feat/prompt-architecture}}"
if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
  if [[ -n "${SYNO_BASE_REF:-}" ]]; then
    echo -e "${RED}❌ base 不可解析: $BASE${RESET}"
    exit 1
  fi
  git fetch origin >/dev/null 2>&1 || true
  if ! git rev-parse --verify "$BASE" >/dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  base 引用缺失 ($BASE) — 对账无法执行（fail-closed，exit 2 不当作通过）${RESET}"
    echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) check-bypass-log degraded: base $BASE 不可解析, 对账跳过" >> "$ROOT/.claude/degraded-events.log" 2>/dev/null || true
    exit 2
  fi
fi

MISSING=""
# D334: --no-merges — PR 工作流下 GitHub 网页合并产生的 merge commit 不经过
# synova-commit（无 COMMITTED 记录），对账只覆盖本地产生的实体提交。
# D414/U1c: git log 失败检测 — 原 `|| true` 会把"git 失败空循环"当成"对账通过"（M1 假 PASS）。
# D451: 豁免"纯补记提交"——只改 .claude/bypass.log 的提交本身就是补记动作，
#   它改的就是证据文件，不能被要求"自己被自己记录"（否则补记→新提交→再缺→死循环）。
# D508: 对账范围 merge-base 化（范围收窄优化）——"$BASE..HEAD" 在 merge main 后
#   会把 main 侧已验提交也落入范围，只制造补记噪音；merge-base 起点后范围=分支自己的
#   新提交，main 引入提交天然排除（merge-base 是其祖先）。
#   如实注记（D561，K3 P1-D508——原注释声称「6+ 次补记循环根治」不实）:
#   merge-base 化只是范围收窄，非根治——已 merge 场景下 merge-base(BASE, HEAD) 收敛到
#   同一点，范围与原语义恒等；补记循环的真根治 = D513 防御性 fetch 刷新（本文件上方，
#   tracking ref 陈旧才是根因）+ D451 纯补记豁免（打断「补记→新提交→再缺」死循环）。
MB=$(git merge-base "$BASE" HEAD 2>/dev/null || echo "")
if [ -n "$MB" ]; then
  RANGE="${MB}..HEAD"
else
  RANGE="$BASE..HEAD"  # 无共同历史 → 回退原语义
fi
GIT_LOG_OUT=$(git log "$RANGE" --format=%H --no-merges 2>&1)
if [ $? -ne 0 ]; then
  echo -e "${RED}❌ git log 执行失败 ($BASE..HEAD) — 对账无法执行（fail-closed, 不当作通过）${RESET}" >&2
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) check-bypass-log degraded: git log $BASE..HEAD 失败" >> "$ROOT/.claude/degraded-events.log" 2>/dev/null || true
  exit 2
fi

# ── D970 语义 1: 空范围 = 无可对账对象 = **vacuous pass**，与来源是否可读**无关** ──
#    （原实现在此之前就要求「至少一个来源可读」⇒ 把「无待对账提交」误判为「整体不可读」，
#      在非本机 worktree（无本机 .sessions 记录）上退化成 exit 1 —— verifier 退回的根因。）
if [ -z "$GIT_LOG_OUT" ]; then
  echo -e "${GREEN}✅ bypass.log 对账通过: ${RANGE} 空集（无待对账提交，vacuous pass）${RESET}"
  exit 0
fi

# ── D970 语义 3: **确有待对账提交** 且 全部来源不可读 → fail-closed（不改既有可观测行为）──
if ! _source_exists; then
  echo -e "${RED}❌ 有待对账提交但执行证据链整体不可读 — 无任何可用来源${RESET}"
  echo "  已查来源: $(printf '%s' "$LEDGER_SOURCES" | tr '\n' ' ')"
  echo "  Stage 2 后账本不随仓走：请确认 .sessions/<sid>/bypass.log 或 docs/authority/bypass-ledger-archive/*.txt 存在；"
  echo "  并确认提交均经 synova-commit（含 COMMITTED 记录）或一次性补记"
  exit 1
fi
for h in $GIT_LOG_OUT; do
  # D451: 纯补记提交（只改 bypass.log）豁免——它是补记动作本身
  _FILES=$(git show --name-only --format="" "$h" 2>/dev/null | grep -v '^$' || true)
  _OTHER=$(echo "$_FILES" | grep -v '^\.claude/bypass\.log$' || true)
  if [ -z "$_OTHER" ]; then
    continue
  fi
  # D735 Stage 1: 在全部来源里找（旧路径 + per-session）；多文件 grep 任一命中即通过
  # shellcheck disable=SC2086  # 有意分词: LEDGER_SOURCES 是换行分隔的多文件列表
  if ! grep -q "$h" $LEDGER_SOURCES 2>/dev/null; then
    SUBJ=$(git log -1 --format=%s "$h" 2>/dev/null || echo "$h")
    MISSING="${MISSING}  $SUBJ [${h:0:8}]\n"
  fi
done

if [[ -n "$MISSING" ]]; then
  echo -e "${RED}❌ bypass.log 缺以下提交记录（执行证据链断裂）:${RESET}"
  printf '%b' "$MISSING"
  echo "  请确认提交经 synova-commit（含 COMMITTED 记录）或一次性补记后再推送"
  exit 1
fi

echo -e "${GREEN}✅ bypass.log 对账通过: ${RANGE} 全部提交有记录${RESET}"
exit 0
