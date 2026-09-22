#!/usr/bin/env bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════
# check-pr-budget.sh — D734 PR 预算门禁（冲突概率 ∝ 改动大小 × 分支存活时间）
#
# 背景（派单 §二）: D721 一个 PR 背三类门禁问题挂半天；K3 审计分支落后 main
#   差点回退他人成果。大 PR + 长存活分支 = 冲突源，也是 D734 自己要禁止的形态。
#
# 契约（铁律 47）:
#   @input  — 选项:
#               --base <ref>        对比基线（默认 origin/main）
#               --max-files <N>     变更文件数上限（默认 12）
#               --max-behind <N>    落后基线提交数告警阈值（默认 20）
#               --files "<f1> <f2>" 显式变更集（测试注入；缺省用 git 算 base...HEAD）
#               --yaml <PATH>       ownership.yaml 注入缝（同 --files 风格；**缺省空** = 用
#                                   check-ownership.py 自身默认，不改变既有解析行为）
#               --pr-body <FILE>    D911 B3 声明源①: PR 正文文件；**缺省回退 GITHUB_EVENT_PATH**
#                                   的 pull_request.body（同 D708 merge_writeset_gate.py:280 语义）
#               --decl-file <PATH>  D911 B3 声明源②: env-free 的已提交 task brief；
#                                   **未给时走认领制指针**（不钉死具体 brief 路径 —— 钉死会让
#                                   他人/陈旧 brief 的残留条目放行本 PR = fail-open 面）:
#                                   读 .claude/current-brief[.<session>] 得 brief 文件名 →
#                                   .claude/task-briefs/<名> 存在才用；指针缺失/指向不存在 → 无源②
#                                   （走严格，绝不回落固定路径）；`--decl-file ""` = 显式关闭该源
#               --quiet             只输出结论行
#   @output — stdout 逐项 ✅/⚠️/❌ 点名: ① 文件数 ② 域（调 check-ownership.py）
#             ③ 落后基线提交数；❌ 行点名具体超标项
#             D911 B3 代行放行时**逐条打印**: `↪ 代行放行: <路径> 归属=<原域>（standby 授权代行）
#             ｜声明源=<源>` + `理由: <理由>`；**声明源三处可见**（逐条行 / ✅ ② 汇总行 / 末行 PASS）
#             —— 绿腿证据必须可见，K3 要能看出是哪份文件放行的
#   @exit   — 0 = 在预算内（可含 ⚠️ 落后告警，不阻断）
#             1 = 超预算（文件数超上限 或 变更跨域 或 跨域但代行未逐条声明）
#             2 = 检查执行失败（git 不可用 / 域校验器不可用 / 变更集算不出 /
#                 standby 段结构非法 / 代行回执解析异常）—— fail-closed
#   @degraded — 基线 ref 全链不可解析（origin/main→main→origin/HEAD 均无）→ **显式 ⚠️ 留痕 +
#               跳过（exit 0）**，不 exit 2：沿用 pre-push 门禁 0-1 对「fetch 失败」的既有语义
#               （显式提示不静默跳过），避免环境性缺 ref 把所有 PR 误打成红；
#               域校验器缺失/python 不可用 → exit 2（这两类是检查本身坏了，不与通过混同）
#               D911 B3 另两条: ① 代行声明源全不可得 → 显式 ⚠️ + **不放行任何被代行文件**
#               （fail-closed，绝不默认放行；铁律 11 不静默）；② 代行回执与域校验器自报数不符
#               （输出格式漂移）→ ⚠️ + exit 2（宁可阻断，不可静默放行）
#   @error  — 不抛；全部经退出码表达（ctrl-tower 模式 1）
#
# D911 B3 — standby 代行通道（缺陷②D733「无代行」根治；派单 §一 切片 B 的 B3）:
#   问题: win 离线期（创始人 2026-09-20 口令）合法 PR 携带被代行域文件 → ② 判「变更跨域」硬红，
#         而 PR 正文里的声明在 CI 不可达（Iron laws job 零参调用）→ **门禁阻止修复门禁**。
#   解法（不新增机制，只把判据钉死）:
#     · 授权来源 = ownership.yaml 的 `standby:` 段，**由 check-ownership.py 判定**
#       （本脚本不自行解析 ownership.yaml —— 拒绝第二个 standby 解析器 = 单点真相）；
#       候选代行对只取「本次变更集里实际出现的域」的两两组合，故单域写集永不进此通道。
#     · 放行前**必须**有 `## 代行声明` 段 + 逐条 `路径 — 理由`（无理由不生效）；
#       无该段 / 有未声明条目 → **仍硬阻断 exit 1**。
#     · 放行的每条**逐条打印**（路径 + 归属 + 理由），不静默。
#     · win 回归 = 删 `standby:` 段：域校验器逐条打印「不代行」→ 本脚本回退严格（可执行验证）。
#
# 决策（派单要求「接线取舍理由写进 PR 描述」）:
#   接线选 pre-commit 组而非 CI quality job —— 派单红区已列 .github/workflows/ci.yml
#   （#520 刚改过，避免撞车），故 CI 侧不可用；本组按 V5.0.0「本地软提示 + CI 权威」
#   用 soft_check（本地不阻断、CI strict 转硬），条件跳过保持 <1s。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OWNERSHIP="$SCRIPT_DIR/check-ownership.py"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
# D911 B3 声明源②: 已提交的 task brief（.claude/task-briefs/** 落 D860 治理豁免前缀 →
# 零 ≤12 预算摩擦、不新增文件）。CI 侧更常用的是声明源① (GITHUB_EVENT_PATH 里的 PR 正文)。
# **不钉死任何具体 brief 路径** —— 钉死 = 过段时间用「他人/陈旧 brief 里残留的条目」放行本 PR
# （依赖不相干文件放行 = fail-open 面）。缺省改为走**认领制指针** `.claude/current-brief`：
# 见 resolve_decl_file()（优先级: 显式 > 认领指针 > 无 → 严格）。

# PLATFORM-CHECKLIST #1: PYBIN 三级探测（禁裸 python3 —— Win 部分机器无 python3.exe）
PYBIN=""
for _c in python3 python py; do  # PYBIN 三级探测（PLATFORM-CHECKLIST #1；本行含 PYBIN 标记供 D520 平台扫描识别）
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then PYBIN="$_c"; break; fi
done

BASE="origin/main"
MAX_FILES=12
MAX_BEHIND=20
FILES_OVERRIDE=""
QUIET=0
YAML=""            # D911 B3 注入缝: 空 = 用 check-ownership.py 自身默认
PR_BODY_ARG=""     # D911 B3 声明源①: 空 = 回退 GITHUB_EVENT_PATH（同 D708:291）
DECL_FILE=""       # D911 B3 声明源②: 空 + DECL_FILE_SET=0 → 走认领指针（resolve_decl_file）
DECL_FILE_SET=0
WAIVE_NOTE=""      # 放行摘要（带声明源），供 ✅ ② 行与 PASS 行回显

while [ $# -gt 0 ]; do
  case "$1" in
    --base)       BASE="${2:-}"; shift 2 ;;
    --max-files)  MAX_FILES="${2:-}"; shift 2 ;;
    --max-behind) MAX_BEHIND="${2:-}"; shift 2 ;;
    --files)      FILES_OVERRIDE="${2:-}"; shift 2 ;;
    --yaml)       YAML="${2:-}"; shift 2 ;;
    --pr-body)    PR_BODY_ARG="${2:-}"; shift 2 ;;
    --decl-file)  DECL_FILE="${2:-}"; DECL_FILE_SET=1; shift 2 ;;
    --quiet)      QUIET=1; shift ;;
    *) echo "❌ check-pr-budget: 未知参数 $1" >&2; exit 2 ;;
  esac
done

# D911 B3: 注入缝组装（空串 = 不传该参数，保持子命令自身默认 —— 与 --files 注入缝同风格）
YAML_ARGS=""
[ -n "$YAML" ] && YAML_ARGS="--yaml $YAML"

# PLATFORM-CHECKLIST #2: 数字入算术前二次清洗（CRLF + 非数字）
_clean_num() { local n="${1:-}"; n="$(printf '%s' "$n" | tr -d '\r\n')"; printf '%s' "${n//[^0-9]/}"; }
MAX_FILES="$(_clean_num "$MAX_FILES")"; MAX_FILES="${MAX_FILES:-12}"
MAX_BEHIND="$(_clean_num "$MAX_BEHIND")"; MAX_BEHIND="${MAX_BEHIND:-20}"

echo "── PR 预算门禁（D734）: 基线=$BASE 上限=${MAX_FILES} 文件 / 落后阈值=${MAX_BEHIND} ──"

# ── 取变更集（缺省 git 算；--files 为测试注入缝）──
BEHIND=""
if [ -n "$FILES_OVERRIDE" ]; then
  FILES="$(printf '%s\n' "$FILES_OVERRIDE" | tr ' ' '\n' | sed '/^$/d')"
else
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "❌ 检查执行失败: 非 git 仓库且未提供 --files（fail-closed）" >&2
    exit 2
  fi
  # 基线解析链（origin/main 首选；独立 clone / 浅克隆下回退）。全不可解析 → **显式降级跳过**，
  # 不 exit 2 —— 沿用 pre-push 门禁 0-1 对「fetch 失败」的既有语义（显式提示 + 不静默跳过），
  # 避免环境性缺 ref 把所有 PR 误打成红（fail-open 但留痕；铁律 11 不静默）。
  BASE_RESOLVED=""
  for _cand in "$BASE" origin/main main origin/HEAD; do
    if git rev-parse --verify --quiet "$_cand" >/dev/null 2>&1; then BASE_RESOLVED="$_cand"; break; fi
  done
  if [ -z "$BASE_RESOLVED" ]; then
    echo "  ⚠️  degraded: 基线不可解析（尝试过 $BASE / origin/main / main / origin/HEAD）"
    echo "      → 跳过 PR 预算检查（先 git fetch origin；此处显式留痕，不静默放过）"
    exit 0
  fi
  [ "$BASE_RESOLVED" != "$BASE" ] && echo "  ⚠️  基线 $BASE 不可解析 → 回退用 $BASE_RESOLVED"
  BASE="$BASE_RESOLVED"
  FILES="$(git -c core.quotepath=false diff --name-only --diff-filter=ACMR "$BASE...HEAD" 2>/dev/null)" || {
    echo "❌ 检查执行失败: 无法计算 $BASE...HEAD 变更集（fail-closed）" >&2; exit 2; }
  # ③ 落后基线提交数（只有真 git 模式才算得出来）
  BEHIND="$(git rev-list --count "HEAD..$BASE" 2>/dev/null)" || BEHIND=""
  BEHIND="$(_clean_num "$BEHIND")"
fi
FILES="$(printf '%s' "$FILES" | sed '/^$/d')"

# ── D860 治理产物豁免口径（F9/F12 治本）──
# 规则: 治理前缀（brief/卡/Note/规格/自验证据）且扩展名属治理产物（md/json/yaml/yml/txt）
#        → 不计入 ≤12 文件预算（交付文件才计数）。
# 反例防线: 同前缀下的**代码文件**（.ts/.sh/.py 等）不豁免——伪装成治理产物的代码仍被计数。
GOV_PREFIX_RE='^(\.claude/task-briefs/|task-state/|memory/notes/|docs/plans/|docs/synova/product-lines/evidence/)'
GOV_EXT_RE='\.(md|json|ya?ml|txt)$'
COUNTED=""
EXEMPT_N=0
while IFS= read -r _f; do
  [ -z "$_f" ] && continue
  if printf '%s' "$_f" | grep -qE "$GOV_PREFIX_RE" && printf '%s' "$_f" | grep -qE "$GOV_EXT_RE"; then
    EXEMPT_N=$((EXEMPT_N + 1))
  else
    COUNTED="${COUNTED}${_f}
"
  fi
done <<EOF
$FILES
EOF
COUNTED="$(printf '%s' "$COUNTED" | sed '/^$/d')"
if [ "$EXEMPT_N" -gt 0 ]; then
  echo "  ℹ️  D860 治理产物豁免: ${EXEMPT_N} 件不计预算（brief/卡/Note/规格/自验证据，代码文件仍计数）"
fi
N_FILES=0
[ -n "$COUNTED" ] && N_FILES="$(printf '%s\n' "$COUNTED" | grep -c . | tr -d '\r\n')"
N_FILES="$(_clean_num "$N_FILES")"; N_FILES="${N_FILES:-0}"

FAILED=0

# ── ① 变更文件数 ≤ 上限 ──
if [ "$N_FILES" -le "$MAX_FILES" ]; then
  echo "  ✅ ① 变更文件数 $N_FILES ≤ 上限 $MAX_FILES"
else
  echo "  ❌ ① 变更文件数 $N_FILES > 上限 $MAX_FILES —— 拆 PR（禁调高上限）"
  FAILED=1
fi

# ═══════════════════════════════════════════════════════════════
# D911 B3 声明源② 解析（**认领制指针**，不钉死任何具体 brief 路径）
#   优先级: ① 显式 --decl-file <path> → 调用方原样使用（空串 = 显式关闭该源）
#           ② 未给 → 读 .claude/current-brief（认领制指针；存在 session 专属
#              .claude/current-brief.<DSH_SESSION_ID> 时优先 —— 与
#              scripts/pre-commit-check.sh:1207-1218、task-start.sh:159-171 同一读法）
#              内容 = brief **文件名** → 拼 .claude/task-briefs/<名> → **存在才用**
#           ③ 都不可得 → 明确「无声明源②」→ 严格（**绝不回落任何固定路径** ——
#              钉死路径会让「他人/陈旧 brief 里残留的条目」放行本 PR = fail-open 面）
#   @input  — 无（用全局 REPO_ROOT / DSH_SESSION_ID）
#   @output — 成功 → 设全局 DECL_FILE + stdout ℹ️（点名解析到的文件）；失败 → stdout ℹ️/⚠️ 明示原因
#   @degraded — 指针缺失/为空/指向不存在的 brief → 返回 1 且**显式打印**（不静默；铁律 11）
#   返回 0 = 已解析出可用声明源②；1 = 无声明源②（调用方须走严格，不得默认放行）
# ═══════════════════════════════════════════════════════════════
resolve_decl_file() {
  local cb="$REPO_ROOT/.claude/current-brief"
  if [ -n "${DSH_SESSION_ID:-}" ] && [ -f "$REPO_ROOT/.claude/current-brief.$DSH_SESSION_ID" ]; then
    cb="$REPO_ROOT/.claude/current-brief.$DSH_SESSION_ID"
  fi
  if [ ! -f "$cb" ]; then
    echo "     ℹ️ 声明源②: 未给 --decl-file，且认领指针缺失（.claude/current-brief[.<session>] 不存在）→ 无声明源②"
    return 1
  fi
  local name cand
  name="$(tr -d '[:space:]' < "$cb")"
  if [ -z "$name" ]; then
    echo "     ⚠️ 声明源②: 认领指针为空（$(basename "$cb")）→ 无声明源②"
    return 1
  fi
  cand="$REPO_ROOT/.claude/task-briefs/$name"
  if [ ! -f "$cand" ]; then
    echo "     ⚠️ 声明源②: 认领指针指向「${name}」，但 .claude/task-briefs/${name} 不存在 → 无声明源②（不回落固定路径）"
    return 1
  fi
  DECL_FILE="$cand"
  echo "     ℹ️ 声明源②: 认领指针 → ${name}（文件存在；声明条目以本文件为准）"
  return 0
}

# ═══════════════════════════════════════════════════════════════
# D911 B3: standby 代行放行判定（跨域的唯一放行通道）
#   授权来源 = check-ownership.py 的 standby 段 —— 本脚本**不自行解析 ownership.yaml**
#   （拒绝第二个 standby 解析器 = 单点真相；域是否被授权代行由域校验器判定）。
#   候选代行对只取「本次变更集里实际出现的域」的两两组合 → 单域写集（含纯 win）永不进本函数。
#   声明判据 **同 D708 `## 写集豁免`**（merge_writeset_gate.py:246-264 语义，按本脚本三态重写，
#   不 import 跨切片代码）—— 段标题 / 收段 / 条目分隔 / 条目前缀四者**逐字同尺**：
#   `^#{2,4}\s*代行声明`（`\s*` 含零空格）｜收段 `^#{1,4}\s`｜仅 `- ` 开头｜`\s+[—–-]{1,2}\s+` 分隔。
#   **但「理由是否有效」刻意严一格**（要求含 字母/数字/记号 字符）—— 这是补 D708:261
#   `parts[1].strip()` 挡不住「纯标点理由」的洞，**不是**两侧口径分叉（防后人误以为不一致）。
#   返回: 0 = 已放行（逐条 路径/归属/理由 已打印）
#         1 = 未放行（阻断；理由已打印）
#         2 = 代行判定本身不可信 → 调用方 exit 2（fail-closed，绝不与「放行」混同）
# ═══════════════════════════════════════════════════════════════
try_standby_lift() {
  local doms d p pairs
  doms="$(printf '%s\n' "$DOMAIN_OUT" | grep -vE '^[[:space:]]' | grep -vE '^(⚠️|·|✅|❌)' \
          | awk 'NF>=2 {print $1}' | sort -u | tr '\n' ' ')"
  pairs=""
  for d in $doms; do
    for p in $doms; do
      [ "$d" = "$p" ] && continue
      pairs="$pairs --proxy $d=$p"
    done
  done
  if [ -z "$pairs" ]; then
    echo "     → 无候选代行对（域集合解析为空）→ 严格判定"
    return 1
  fi

  local LIFT_OUT LIFT_EXIT
  LIFT_OUT="$("$PYBIN" "$OWNERSHIP" $YAML_ARGS $pairs $COUNTED 2>&1)"; LIFT_EXIT=$?
  if [ "$LIFT_EXIT" -eq 2 ]; then
    echo "  ❌ 检查执行失败: 代行判定 exit=2（fail-closed；standby 段结构非法 / 域校验器报错）" >&2
    printf '%s\n' "$LIFT_OUT" | sed 's/^/     /' >&2
    return 2
  fi
  if [ "$LIFT_EXIT" -ne 0 ]; then
    local _rej _prx
    _rej="$(printf '%s\n' "$LIFT_OUT" | grep -c '^⚠️  --proxy' | tr -d '\r\n')"
    _prx="$(printf '%s\n' "$LIFT_OUT" | grep -c '^↪' | tr -d '\r\n')"
    if [ "${_prx:-0}" -gt 0 ]; then
      # 有授权对，但变更集里还夹着**代行范围之外**的域 → 整 PR 仍阻断（不放行任何被代行文件）
      printf '%s\n' "$LIFT_OUT" | grep -E '^↪' | sed 's/^/     /'
      echo "     → 代行已授权 ${_prx} 件，但仍存在代行范围之外的域 → 仍阻断（standby 不掩盖真跨域）"
      printf '%s\n' "$LIFT_OUT" | grep -E '^❌ FAIL' | sed 's/^/     /'
    elif [ "${_rej:-0}" -gt 0 ]; then
      printf '%s\n' "$LIFT_OUT" | grep -E '^⚠️  --proxy' | sed 's/^/     /'
      echo "     → 无授权代行对 → 严格判定（standby 段未覆盖本次跨域；删段即严格，无需改脚本）"
    else
      printf '%s\n' "$LIFT_OUT" | grep -E '^❌ FAIL' | sed 's/^/     /'
      echo "     → 代行不成立 → 严格判定（域校验器未授权任何代行对）"
    fi
    return 1
  fi

  # 回执自校验: 域校验器自报的「代行 N」必须 == 解析到的 ↪ 行数；否则 = 输出格式漂移 → fail-closed
  local N_SAY N_LINE
  N_SAY="$(printf '%s\n' "$LIFT_OUT" | grep -oE '代行 [0-9]+' | tail -1 | grep -oE '[0-9]+' | tr -d '\r\n')"
  N_LINE="$(printf '%s\n' "$LIFT_OUT" | grep -c '^↪' | tr -d '\r\n')"
  if [ -z "$N_SAY" ] || [ -z "$N_LINE" ] || [ "$N_SAY" != "$N_LINE" ] || [ "$N_LINE" -eq 0 ]; then
    echo "  ⚠️  代行回执解析异常（域校验器自报 代行=${N_SAY:-?}，本脚本解析 ↪ 行=${N_LINE:-?}）"
    echo "     → fail-closed: 不静默放行（宁可阻断；请核对 check-ownership.py 的输出格式契约）"
    return 2
  fi

  # 被代行文件清单（原域:路径）+ 逐条声明判定（匹配语义同 D708 matches(): 精确 / 目录前缀 / glob）
  local PARG _l _r _pair _p
  PARG=""
  while IFS= read -r _l; do
    [ -z "$_l" ] && continue
    _r="${_l#*代行 }"; _pair="${_r%%[[:space:]]*}"
    _p="${_r#"$_pair"}"; _p="${_p#"${_p%%[![:space:]]*}"}"
    [ -n "$_p" ] && PARG="$PARG ${_pair%%→*}:$_p"
  done <<EOF
$(printf '%s\n' "$LIFT_OUT" | grep '^↪')
EOF

  # 声明源②: 显式给了 --decl-file 就用给的；**没给则走认领指针**（绝不回落固定路径）
  if [ "$DECL_FILE_SET" -eq 0 ]; then
    resolve_decl_file || DECL_FILE=""
  fi

  local PN_OUT
  PN_OUT="$("$PYBIN" - "$PR_BODY_ARG" "$DECL_FILE" $PARG <<'PY'
# D911 B3 `## 代行声明` 段解析 + 逐条匹配（同 merge_writeset_gate.py:246-264 语义，不 import 跨切片代码）。
# 输出协议（TAB 分隔）: SRC/NOHDR/WAIVE/DENY/BAD/UNUSED/SOURCES —— 由 shell 侧决定退出码。
import json, os, pathlib, re, sys, unicodedata

HEAD = re.compile(r"^#{2,4}\s*代行声明")            # 同 D708:246（\s* = 零或多个空白）
NEXT_H = re.compile(r"^#{1,4}\s")                  # 同 D708:257 收段
SEP = re.compile(r"\s+[—–-]{1,2}\s+")              # 同 D708:260 分隔


def clean(raw):
    """条目路径清洗（同 merge_writeset_gate._clean_entry）。"""
    s = raw.strip()
    m = re.match(r"^\[([^\]]+)\]\([^)]*\)$", s)
    if m:
        s = m.group(1)
    s = s.strip("`").strip()
    s = re.sub(r"\s*[（(]\s*\d+\s*[^）)]*[）)]\s*$", "", s)
    s = re.sub(r"\s+L\d+\s*$", "", s)
    return s.strip("`").strip().rstrip("/")


def reason_ok(text):
    """理由有效性判据 —— **刻意比 D708 严一格，不是口径分叉**。

    D708 `scan_exempt_section`（merge_writeset_gate.py:261）只判 `parts[1].strip()` 非空，
    **挡不住「纯标点/纯符号」理由**（如 `- path ——` / `- path — ...` 会被当成有效理由）——
    那是 D708 的已知洞。B3 卡面要求「理由为空 / 仅标点 / 仅空白 → 该条不生效」，
    故这里要求理由至少含一个 字母/数字/记号 类字符（Unicode 类别 L/N/M）。
    段标题 / 收段 / 条目分隔仍与 D708 逐字同尺（见本段 HEAD/NEXT_H/SEP）。
    """
    return any(unicodedata.category(ch)[0] in "LNM" for ch in text)


def matches(path, entry):
    """条目匹配: 精确 / 目录前缀 / glob（同 D708 matches()）。"""
    if not entry:
        return False
    if path == entry or path.startswith(entry + "/"):
        return True
    if any(ch in entry for ch in "*?["):
        import fnmatch
        return fnmatch.fnmatchcase(path, entry)
    return False


def scan(text, label):
    """扫一个来源的 `## 代行声明` 段 → (entries, malformed, found)。"""
    entries, malformed = [], []
    in_sec, found = False, False
    for line in (text or "").splitlines():
        if HEAD.match(line):
            in_sec, found = True, True
            continue
        if in_sec and NEXT_H.match(line):
            break
        if in_sec and line.strip().startswith("- "):      # 同 D708:259（仅 `- ` 条目）
            parts = SEP.split(line.strip()[2:], 1)        # 同 D708:260
            if len(parts) != 2 or not parts[1].strip():   # 同 D708:261 无理由不生效
                malformed.append((label, line.strip(), "无「— 理由」分隔/理由为空"))
                continue
            path_ = clean(parts[0])
            reason = " ".join(parts[1].split())
            if not path_:
                malformed.append((label, line.strip(), "路径为空"))
            elif not reason_ok(reason):
                malformed.append((label, line.strip(), "理由仅标点/空白 = 无理由"))
            else:
                entries.append((path_, reason, label))
    return entries, malformed, found


pr_arg = sys.argv[1] if len(sys.argv) > 1 else ""
decl_arg = sys.argv[2] if len(sys.argv) > 2 else ""
proxied = []
for item in sys.argv[3:]:
    owner, _, path_ = item.partition(":")
    if owner and path_:
        proxied.append((owner, path_))

srcs = []
if pr_arg:
    try:
        srcs.append(("--pr-body", pathlib.Path(pr_arg).read_text(encoding="utf-8", errors="replace")))
    except OSError:
        print("SRC\t--pr-body\tunreadable\t%s" % pr_arg)
else:
    ev = os.environ.get("GITHUB_EVENT_PATH", "")
    if ev and os.path.exists(ev):
        try:
            data = json.loads(pathlib.Path(ev).read_text(encoding="utf-8", errors="replace"))
            srcs.append(("github-pr-body", str((data.get("pull_request") or {}).get("body") or "")))
        except (OSError, ValueError):
            print("SRC\tgithub-pr-body\tunparseable\t%s" % ev)
    else:
        print("SRC\tpr-body\tunavailable\t--pr-body 未给且无 GITHUB_EVENT_PATH")
if decl_arg:
    _dp = pathlib.Path(decl_arg)
    if _dp.is_file():
        try:
            # 源标签带文件名 —— 放行回执里必须能看出「是哪份文件放行的」（K3 可核）
            srcs.append(("decl-file:" + _dp.name, _dp.read_text(encoding="utf-8", errors="replace")))
        except OSError:
            print("SRC\tdecl-file\tunreadable\t%s" % decl_arg)
    else:
        print("SRC\tdecl-file\tmissing\t%s" % decl_arg)

entries, malformed = [], []
for label, text in srcs:
    _e, _m, _found = scan(text, label)
    entries.extend(_e)
    malformed.extend(_m)
    if not _found:
        print("NOHDR\t%s" % label)

hit_entries = set()
results = []
for owner, path_ in proxied:
    hit = None
    for ep, er, el in entries:
        if matches(path_, ep):
            hit = (ep, er, el)
            break
    if hit:
        hit_entries.add(hit[0])
        results.append(("WAIVE", path_, owner, hit[1], hit[2]))
    else:
        results.append(("DENY", path_, owner, "", ""))
# 先报「为何不生效」，再报逐条判定 —— 让阻断理由在读到时已可见
for label, raw, why in malformed:
    print("BAD\t%s\t%s\t%s" % (label, why, raw.replace("\t", " ")))
for ep, _er, el in entries:
    if ep not in hit_entries:
        print("UNUSED\t%s\t%s" % (ep, el))
for kind, path_, owner, reason, label in results:
    if kind == "WAIVE":
        print("WAIVE\t%s\t%s\t%s\t%s" % (path_, owner, reason, label))
    else:
        print("DENY\t%s\t%s" % (path_, owner))
print("SOURCES\t%d" % len(srcs))
PY
)"

  local WAIVED=0 DENIED=0 SRC_N="" k a b c d5
  local SRC_USED=""
  # 注意（D370）: 变量紧邻全角标点必须用 ${} 显式边界 —— `$c）` 会被解析成变量名 `c）`。
  while IFS=$'\t' read -r k a b c d5; do
    case "$k" in
      SRC)     echo "     ℹ️ 声明源 ${a}: ${b}${c:+（${c}）}" ;;
      NOHDR)   echo "     ℹ️ 声明源 ${a}: 读到文本但无「## 代行声明」段" ;;
      WAIVE)   echo "  ↪ 代行放行: ${a}  归属=${b}（standby 授权代行）｜声明源=${d5}"
               echo "       理由: ${c}"
               WAIVED=$((WAIVED + 1))
               SRC_USED="${SRC_USED}${d5}
" ;;
      DENY)    echo "  ❌ 代行未声明: ${a}（归属=${b}）—— 需在「## 代行声明」逐条列: - ${a} — <理由>"
               DENIED=$((DENIED + 1)) ;;
      BAD)     echo "     ⚠️ 代行声明条目不生效（${b}）: ${c}" ;;
      UNUSED)  echo "     ℹ️ 代行声明未命中本次被代行文件（不生效）: ${a}" ;;
      SOURCES) SRC_N="$a" ;;
      *)       : ;;
    esac
  done <<EOF
$PN_OUT
EOF

  if [ "${SRC_N:-0}" -eq 0 ]; then
    echo "     ⚠️  代行声明源不可得（--pr-body / GITHUB_EVENT_PATH / --decl-file 均未读到文本）"
    echo "        → fail-closed: 不放行任何被代行文件（不默认放行）"
  fi
  if [ "$DENIED" -gt 0 ]; then
    echo "  ❌ ② 变更跨域且代行未完成声明 —— 被代行域文件 $DENIED 件未逐条声明（无理由不生效）"
    return 1
  fi
  if [ "$WAIVED" -gt 0 ]; then
    # 声明源必须随放行一起可见（绿腿证据可见）—— 逐条行 + 汇总行 + 末行 PASS 三处都点名
    local SRC_TXT
    SRC_TXT="$(printf '%s' "$SRC_USED" | sed '/^$/d' | sort -u | tr '\n' ',' || true)"
    SRC_TXT="${SRC_TXT%,}"
    WAIVE_NOTE="；代行放行 ${WAIVED} 件（声明源: ${SRC_TXT}）"
    echo "  ✅ ② 代行放行 ${WAIVED} 件（声明源: ${SRC_TXT}；standby 授权 + 逐条声明，逐条见上）"
  fi
  return 0
}

# ── ② 变更只落在一个域（D733 check-ownership.py 的单域模式）──
if [ ! -f "$OWNERSHIP" ]; then
  echo "❌ 检查执行失败: 域校验器缺失 ${OWNERSHIP}（D734 依赖 D733；fail-closed）" >&2
  exit 2
fi
if [ -z "$PYBIN" ]; then
  echo "❌ 检查执行失败: python 不可用，无法做域校验（fail-closed，不静默放过）" >&2
  exit 2
fi
if [ "$N_FILES" -eq 0 ]; then
  echo "  ✅ ② 无变更文件 → 域校验跳过"
else
  DOMAIN_OUT="$("$PYBIN" "$OWNERSHIP" $YAML_ARGS $COUNTED 2>&1)"; DOMAIN_EXIT=$?
  if [ "$DOMAIN_EXIT" -eq 0 ]; then
    echo "  ✅ ② 变更单域: $(printf '%s\n' "$DOMAIN_OUT" | grep -E '^✅ PASS' | head -1)"
  elif [ "$DOMAIN_EXIT" -eq 1 ]; then
    # 先给物理事实（逐文件归属），再判代行通道；❌ 结论行留到代行判完之后 ——
    # 否则放行成功时会先打一行 ❌（读起来像「先红后绿」的判据漂移，正是本卡要治的病）。
    echo "  ℹ️ ② 域判定: 变更跨域（D733 ownership.yaml）—— 逐文件归属:"
    printf '%s\n' "$DOMAIN_OUT" | grep -E '^(mac|win|k3|⚠️)' | head -12 | sed 's/^/       /'
    # D911 B3: 唯一放行通道 —— standby 授权 + `## 代行声明` 逐条理由；任一不成立 → 仍硬阻断
    _lift_rc=0; try_standby_lift || _lift_rc=$?
    case "$_lift_rc" in
      0) : ;;
      2) exit 2 ;;
      *) echo "  ❌ ② 变更跨域 —— 一个 PR 只许一个域（D733 ownership.yaml；代行通道未成立，理由见上）"
         FAILED=1 ;;
    esac
  else
    echo "❌ 检查执行失败: 域校验器 exit=${DOMAIN_EXIT}（fail-closed）" >&2
    printf '%s\n' "$DOMAIN_OUT" | head -5 | sed 's/^/     /' >&2
    exit 2
  fi
fi

# ── ③ 落后基线提交数（告警，不阻断——防「落后分支直接合」）──
if [ -n "${BEHIND:-}" ]; then
  if [ "$BEHIND" -gt "$MAX_BEHIND" ]; then
    echo "  ⚠️  ③ 分支落后 $BASE 共 $BEHIND 个提交（> ${MAX_BEHIND}）—— 先 rebase/merge 再开 PR"
  else
    echo "  ✅ ③ 落后 $BASE $BEHIND 个提交 ≤ $MAX_BEHIND"
  fi
else
  echo "  ✅ ③ 落后检查跳过（--files 注入模式无 git 上下文）"
fi

if [ "$FAILED" -eq 0 ]; then
  # 放行时末行也带声明源（绿腿证据可见：逐条行 + 汇总行 + 本行三处点名）
  [ "$QUIET" -eq 0 ] && echo "✅ PASS PR 预算内（$N_FILES 文件）${WAIVE_NOTE}"
  exit 0
fi
echo "❌ FAIL PR 超预算 —— 拆 PR，不要调高上限"
exit 1
