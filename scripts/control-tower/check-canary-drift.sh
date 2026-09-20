#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# check-canary-drift.sh — D526 建立 / D858 加固: CI canary 密封清单漂移对账
#
# 问题: CI canary 只覆盖密封清单 N 项，仓库测试文件 M 个——M-N 漂移零感知
#   （D525 的 synova-commit.test.sh 红态漏网即此因）。
#
# D858 加固（K3 D854 审计 §6 P1 + L4-1 + §5 P2）:
#   P1   覆盖语义物理化——覆盖只来自**代码段**的可执行项（字面路径 + glob）；
#        glob 按文件系统物理展开（nullglob 语义；零命中不得当"已覆盖"）。
#        此前 LISTED 对 ci.yml 全文 grep → 注释文本即可充当"已覆盖"证据，
#        glob 段被删而注释留存时 drift 静默（D526 要防的镜像形态）。
#   L4-1 假覆盖 fail-closed——注释声明（整行注释 + **行尾注释段**）的测试路径/glob
#        未被物理覆盖 → ::error + exit 1。
#   P2   独立通道——GITHUB_STEP_SUMMARY 非空可写时追加 markdown 摘要：CI 绿腿把 stdout
#        重定向到 /tmp 且仅失败时 cat 的形态下，告警仍可达观察者（K3 §5 P2）。
#   D858-V2（T2 自验 C1/C2 闭环）:
#     C1 引号感知切分——不再用 `sed 's/#.*$//'`（会把引号内 `#` 之后的真实路径删掉 → 误红）。
#     C2 行尾注释段进 DECLARED——行尾注释里的声明不再是无信号的纯文本通道。
#
# 契约 (铁律 47):
#   @input  — 无参；注入缝: SYNO_TESTS_DIR（测试目录，默认 tests/）、
#             SYNO_CI_YML（canary 清单来源，默认 .github/workflows/ci.yml）、
#             GITHUB_STEP_SUMMARY（CI 独立通道；未设 → 不写，本地零副作用）
#   @output — (a) 漂移清单（仓库有、可执行覆盖未含的 .test.sh）
#             (b) 幽灵清单项（覆盖集合含、文件不存在）
#             (c) 假覆盖清单（注释声明未被物理覆盖）— D858/L4-1
#             (d) ::warning（漂移/幽灵）/ ::error（假覆盖）注解
#             (e) GITHUB_STEP_SUMMARY markdown 摘要 — D858/P2
#   @exit   — 0 = 无假覆盖（漂移/幽灵仅告警——存量漂移不阻断）；1 = 假覆盖（fail-closed）
#   @degraded — ci.yml/测试目录缺失 → 显式提示跳过 + exit 0（铁律 11 显式，非静默）
#               awk 不可用 → 显式 ⚠ + 退回引号无关旧切分（C1/C2 在该路径不生效）
#   @deps   — bash + POSIX 工具（awk/grep/sed/find/sort/cut/head/tr/dirname）；零新依赖
# 覆盖语义规范 S1-S6: .claude/task-briefs/2026-09-21-D858-canary-glob-coverage.md
# 范围: tests/ 下全部 *.test.*（.sh/.ts/.py）与 canary 可执行覆盖集合对账。
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
TESTS_DIR="${SYNO_TESTS_DIR:-$ROOT/tests}"
CI_YML="${SYNO_CI_YML:-$ROOT/.github/workflows/ci.yml}"
YELLOW='\033[1;33m'; GREEN='\033[0;32m'; RED='\033[0;31m'; RESET='\033[0m'

if [ ! -f "$CI_YML" ]; then
  echo -e "${YELLOW}⚠ canary 清单来源缺失: ${CI_YML} — 漂移检查跳过（铁律 11 显式）${RESET}"
  exit 0
fi
if [ ! -d "$TESTS_DIR" ]; then
  echo -e "${YELLOW}⚠ 测试目录缺失: ${TESTS_DIR} — 漂移检查跳过（铁律 11 显式）${RESET}"
  exit 0
fi

# 路径规约: 相对 TESTS_DIR 的父目录（默认即仓库根 → "tests/..."，与清单同形；
#   注入缝下同样成立——前缀取 dirname(TESTS_DIR) 而非 git ROOT）
_BASE="$(dirname "${TESTS_DIR%/}")"

# ── S1 唯一覆盖来源: 每行切出的**代码段**（D858-V2 C1/C2）──
#   逐字符引号跟踪（POSIX awk；macOS BSD awk 与 Git Bash awk 均可用）把每行切成两段：
#     代码段（引号外 + 引号内一律算代码）→ 覆盖来源（S1）
#     整行注释 / 行尾注释段            → DECLARED（S2；不产生覆盖，S1c）
#   `#` 仅在**引号外**且位于行首或前置空白时才算注释起点（`x=y#z` 不是注释）。
#   单引号用 sprintf("%c", 39) 生成——不依赖 awk 的八进制转义（gawk/mawk/BSD awk 一致）。
#   C1: 旧 `sed -E 's/#.*$//'` 无引号感知——引号内 `#` 之后的真实路径被一并删掉 → 假覆盖误红。
#   C2: 旧口径只收整行注释——行尾注释里的声明既不覆盖也不报红（纯文本通道残留）。
_SPLIT_AWK='
{ line = $0; n = length(line); code = ""; cmt = ""; q = ""; i = 1; sq = sprintf("%c", 39)
  while (i <= n) {
    c = substr(line, i, 1)
    if (q != "") { code = code c; if (c == q) q = ""; i++; continue }
    if (c == "\"" || c == sq) { q = c; code = code c; i++; continue }
    if (c == "#" && (i == 1 || substr(line, i-1, 1) == " " || substr(line, i-1, 1) == "\t")) {
      cmt = substr(line, i); break
    }
    code = code c; i++
  }
  print "E" code; print "D" cmt
}'
_AWK_BIN="$(command -v awk || true)"
if [ -n "$_AWK_BIN" ]; then
  _SPLIT="$("$_AWK_BIN" "$_SPLIT_AWK" "$CI_YML")"
  EXEC_LINES="$(printf '%s\n' "$_SPLIT" | grep '^E' | cut -c2-)"
  DECL_LINES="$(printf '%s\n' "$_SPLIT" | grep '^D' | cut -c2-)"
else
  # awk 不可用 → 显式降级（铁律 11：不静默）。退回旧口径：行尾注释整体丢弃
  #   → C1（引号内 #）/ C2（行尾声明）在本路径不生效；该降级有测试覆盖（H4）
  echo -e "${YELLOW}⚠ awk 不可用: 注释切分降级为引号无关的旧口径（行尾注释不参与声明校验，D858-V2 C1/C2 不生效）${RESET}"
  EXEC_LINES="$(grep -vE '^[[:space:]]*#' "$CI_YML" | sed -E 's/#.*$//')"
  DECL_LINES="$(grep -E '^[[:space:]]*#' "$CI_YML")"
fi
# 令牌: tests/ 相对路径，以 .test.sh 结尾，字面或含 glob 元字符（* 在 ERE 字符类内为字面量）
_TOKEN_RE='tests/[A-Za-z0-9_/*.-]+\.test\.sh'
EXEC_ITEMS="$(printf '%s\n' "$EXEC_LINES" | grep -oE "$_TOKEN_RE" | sort -u)"
DECL_ITEMS="$(printf '%s\n' "$DECL_LINES" | grep -oE "$_TOKEN_RE" | sort -u)"

# ── S1b glob → 文件系统物理展开（nullglob；零命中 → 空，绝不当"已覆盖"）──
#   注: 不启用 globstar（macOS /bin/bash 3.2 无此选项，启用会导致 mac/CI 行为分叉）
#   → `**` 按 bash 默认等同 `*`（单层）。本卡真实形态为单层 glob
#   （tests/project/*.test.sh）；递归 glob 若日后需要另卡。
_is_glob() { case "$1" in *'*'*|*'?'*|*'['*) return 0 ;; *) return 1 ;; esac; }
_expand_glob() {
  _pat="$1"; _out=""
  _saved=0; shopt -q nullglob && _saved=1
  shopt -s nullglob
  for _f in "$_BASE"/$_pat; do
    [ -f "$_f" ] || continue
    _out="${_out}${_f#"$_BASE"/}"$'\n'
  done
  [ "$_saved" = 1 ] || shopt -u nullglob
  printf '%s' "$_out"
}

# ── 覆盖集合 LISTED（S1）: 字面可执行项 + glob 物理命中文件 ──
LISTED=""
while IFS= read -r _it; do
  [ -n "$_it" ] || continue
  if _is_glob "$_it"; then
    _hits="$(_expand_glob "$_it")"
    [ -n "$_hits" ] && LISTED="${LISTED}${_hits}"
  else
    LISTED="${LISTED}${_it}"$'\n'
  fi
done <<< "$EXEC_ITEMS"
LISTED="$(printf '%s' "$LISTED" | sort -u)"

# 全部测试文件（.test.sh/.test.ts/.test.py，排除 node_modules）
ALL=$(find "$TESTS_DIR" -name '*.test.*' -not -path '*/node_modules/*' 2>/dev/null | sed "s|^$_BASE/||" | sort -u)

LIST_N=$(printf '%s\n' "$LISTED" | grep -c . || true)
ALL_N=$(printf '%s\n' "$ALL" | grep -c . || true)

# 漂移 = 在仓库但不在覆盖集合（只对 .test.sh 报——.ts/.py 走 vitest/pytest 不属 canary 语义）
DRIFT=""
while IFS= read -r t; do
  [ -z "$t" ] && continue
  case "$t" in
    *.test.sh)
      printf '%s\n' "$LISTED" | grep -qxF "$t" || DRIFT="${DRIFT}  $t\n" ;;
    *) : ;;  # .ts/.py 由各自 runner 覆盖，不计 canary 漂移
  esac
done <<< "$ALL"

# 反向漂移 = 覆盖集合里有但文件已删/改名（防幽灵清单项）
GHOST=""
while IFS= read -r t; do
  [ -z "$t" ] && continue
  [ -f "$_BASE/$t" ] || GHOST="${GHOST}  $t\n"   # 注入缝下同样以 _BASE 为根
done <<< "$LISTED"

# ── S2/L4-1 假覆盖 = 注释声明（DECLARED）未被物理覆盖（fail-closed）──
FAKE=""
while IFS= read -r _it; do
  [ -n "$_it" ] || continue
  if _is_glob "$_it"; then
    _hits="$(_expand_glob "$_it")"
    if [ -z "$_hits" ]; then
      FAKE="${FAKE}  ${_it}（glob 零命中，无物理覆盖）\n"
    else
      while IFS= read -r _h; do
        [ -n "$_h" ] || continue
        printf '%s\n' "$LISTED" | grep -qxF "$_h" || FAKE="${FAKE}  ${_h}\n"
      done <<< "$_hits"
    fi
  else
    printf '%s\n' "$LISTED" | grep -qxF "$_it" || FAKE="${FAKE}  ${_it}\n"
  fi
done <<< "$DECL_ITEMS"

# 计数（DRIFT/GHOST/FAKE 以字面 \n 拼接——printf %b 展开后再计数/取首行）
N=0; GHOST_N=0; FAKE_N=0
[ -n "$DRIFT" ] && N=$(printf '%b' "$DRIFT" | grep -c . || true)
[ -n "$GHOST" ] && GHOST_N=$(printf '%b' "$GHOST" | grep -c . || true)
[ -n "$FAKE" ] && FAKE_N=$(printf '%b' "$FAKE" | grep -c . || true)

echo ""
echo "── canary 漂移对账 (D526) ──"
echo "  测试文件总数: $ALL_N | canary 清单: $LIST_N 项"
if [ -n "$DRIFT" ]; then
  echo -e "${YELLOW}⚠ 漂移: $N 个 .test.sh 不在 CI canary 清单（红态无防线感知——评估纳入或确认排除）:${RESET}"
  printf '%b' "$DRIFT"
  # CI 上进 GitHub warnings 面板（本地输出无害）
  FIRST=$(printf '%b' "$DRIFT" | head -3 | tr '\n' ',' | tr -d '%' | cut -c1-250)
  echo "::warning title=canary-drift::${N} 个测试不在 CI canary 清单: ${FIRST}"
fi
if [ -n "$GHOST" ]; then
  echo -e "${YELLOW}⚠ 幽灵清单项（清单有、文件无——改删）:${RESET}"
  printf '%b' "$GHOST"
  echo "::warning title=canary-ghost::CI 清单含不存在文件"
fi
if [ -n "$FAKE" ]; then
  echo -e "${RED}❌ 假覆盖: $FAKE_N 条注释声明的测试不在可执行覆盖集合（D858/L4-1 fail-closed）:${RESET}"
  printf '%b' "$FAKE"
  FAKE_FIRST=$(printf '%b' "$FAKE" | head -3 | tr '\n' ',' | tr -d '%' | cut -c1-250)
  echo "::error title=canary-fake-coverage::${FAKE_N} 条注释声明的测试未被物理覆盖（glob 段被删/未接入？）: ${FAKE_FIRST}"
fi
if [ -z "$DRIFT" ] && [ -z "$GHOST" ] && [ -z "$FAKE" ]; then
  echo -e "${GREEN}✅ canary 清单零漂移（.test.sh 全覆盖或显式排除）${RESET}"
fi

# ── S5/P2 独立通道: GITHUB_STEP_SUMMARY 非空可写 → 追加 markdown 摘要 ──
#   独立于 stdout（CI 绿腿把 stdout 重定向到 /tmp 并仅失败时 cat → 告警会丢）
SUM=""
SUM="${SUM}## canary 漂移对账 (D526/D858)"$'\n'
SUM="${SUM}- 测试文件总数: ${ALL_N} | canary 清单: ${LIST_N} 项"$'\n'
if [ -n "$DRIFT" ]; then
  SUM="${SUM}- ⚠ 漂移: ${N} 个 .test.sh 不在 CI canary 清单（前 10 条）"$'\n'
  while IFS= read -r _d; do
    [ -n "$_d" ] || continue
    SUM="${SUM}  - \`${_d}\`"$'\n'
  done <<< "$(printf '%b' "$DRIFT" | sed -e 's/^  //' | head -10)"
fi
if [ -n "$GHOST" ]; then
  SUM="${SUM}- ⚠ 幽灵清单项: ${GHOST_N} 条（清单有、文件无）"$'\n'
fi
if [ -n "$FAKE" ]; then
  SUM="${SUM}- ❌ 假覆盖: ${FAKE_N} 条注释声明未被物理覆盖（exit 1 fail-closed）"$'\n'
  while IFS= read -r _d; do
    [ -n "$_d" ] || continue
    SUM="${SUM}  - \`${_d}\`"$'\n'
  done <<< "$(printf '%b' "$FAKE" | sed -e 's/^  //' | head -10)"
fi
if [ -z "$DRIFT" ] && [ -z "$GHOST" ] && [ -z "$FAKE" ]; then
  SUM="${SUM}- ✅ 零漂移"$'\n'
fi
#   可写判定看目标目录（GITHUB_STEP_SUMMARY 文件可能尚未创建）；写入失败显式 ⚠，不静默
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  _sum_dir="$(dirname "${GITHUB_STEP_SUMMARY}")"
  if [ -w "$_sum_dir" ]; then
    printf '%s' "$SUM" >> "${GITHUB_STEP_SUMMARY}" \
      && echo "  （摘要已写入 GITHUB_STEP_SUMMARY）" \
      || echo -e "${YELLOW}⚠ GITHUB_STEP_SUMMARY 写入失败: ${GITHUB_STEP_SUMMARY}（铁律 11 显式）${RESET}"
  else
    echo -e "${YELLOW}⚠ GITHUB_STEP_SUMMARY 不可写: ${GITHUB_STEP_SUMMARY} — 摘要仅 stdout（铁律 11 显式）${RESET}"
  fi
fi

# 假覆盖 = fail-closed（唯一新增阻断路径）；漂移/幽灵仍 exit 0
if [ -n "$FAKE" ]; then
  exit 1
fi
exit 0
