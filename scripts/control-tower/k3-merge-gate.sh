#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# k3-merge-gate.sh — D923: K3 必经合并门禁（判定器）
#
# 政策（类目映射，外置可审）: scripts/control-tower/k3-gate-policy.yaml
# 说明文档: docs/synova/coordination/门禁说明-K3必经门禁-20260923.md
#
# 语义（CTO 裁定 3）:
#   · 命中三类路径的变更 → 必须有 K3 结论；PASS → 绿
#   · CONDITIONAL PASS / FAIL / NOT-AUDITABLE → 红 + 附理由（"有条件通过 = 未通过"）
#   · 非 K3 结论（tag 锚点/DONE/CTO 人工验收）→ 红（NOT_K3）
#   · 无结论 → 红 + "K3 排队中"提示（fail-closed）
#   · 非三类路径 → 20% 抽样，**永不阻断，只记录**
#
# 契约:
#   @input   — [--base <ref> --head <ref> --pr <号>]（PR 模式，CI 用）
#              | [--dir <路径>]（全扫盘点模式）
#              [--state-dir <目录>]（task-state/ 所在根；夹具注入用，默认仓库根）
#              [--policy <文件>] [--verbose]
#              注入缝（测试）: SYNO_K3_GREP / SYNO_K3_GIT
#   @output  — stdout: 判定摘要 + 命中清单 + 三路 D# 归因；末行
#              "K3-GATE: PASS | REJECT(<原因码>) | DEGRADED"
#              ::notice / ::warning 注解（可归因）
#   @exit    — 0 = 通过（绿）；1 = 拒绝（红）；2 = 检查执行失败/降级（fail-closed，绝不等同通过）
#              ⚠️ 裁定 3：**三类路径命中时，即使整体降级也必须是红（非 0）**——
#                 实现方式：降级路径若已判定三类命中，则 exit 1（先红后降级提示）
#   @degraded— 结论源/仓库/policy 不可读 → stderr "degraded: <原因>" + ::warning
#              + 追加 <state-dir>/.codex/control-tower/logs/degraded-events.log（铁律 11）
#   @error   — .code = K3_GATE_SCAN_UNAVAILABLE | K3_GATE_POLICY_UNREADABLE | K3_GATE_STATE_UNREADABLE
#              .phase = 'scan'|'policy'|'state' ; .retryable = 布尔（铁律 32）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

MODE="diff"
BASE_REF=""; HEAD_REF=""; PR_NUM=""; TARGET_DIR="$REPO_DIR"; STATE_DIR="$REPO_DIR"
POLICY_FILE="$SCRIPT_DIR/k3-gate-policy.yaml"; VERBOSE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --base)      BASE_REF="${2:-}"; shift 2 ;;
    --head)      HEAD_REF="${2:-}"; shift 2 ;;
    --pr)        PR_NUM="${2:-}"; shift 2 ;;
    --dir)       MODE="full"; TARGET_DIR="${2:-}"; shift 2 ;;
    --state-dir) STATE_DIR="${2:-}"; shift 2 ;;
    --policy)    POLICY_FILE="${2:-}"; shift 2 ;;
    --verbose)   VERBOSE=1; shift ;;
    -h|--help)   sed -n '5,42p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

GREP_BIN="${SYNO_K3_GREP:-grep}"
GIT_BIN="${SYNO_K3_GIT:-git}"
PYBIN=""
for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && PYBIN="$c" && break; done

DEGRADED=0
degrade() { # <code> <原因> [phase]
  local code="$1" reason="$2" phase="${3:-scan}"
  DEGRADED=1
  echo "degraded: $reason (code=$code phase=$phase retryable=false)" >&2
  echo "::warning title=K3门禁降级::$reason (code=$code)"
  mkdir -p "$STATE_DIR/.codex/control-tower/logs" 2>/dev/null || true
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)\", \"component\": \"k3-merge-gate\", \"code\": \"$code\", \"reason\": \"$reason\"}" \
    >> "$STATE_DIR/.codex/control-tower/logs/degraded-events.log" 2>/dev/null || true
}

command -v "$GREP_BIN" >/dev/null 2>&1 || { degrade K3_GATE_SCAN_UNAVAILABLE "grep 不可用: $GREP_BIN"; echo "K3-GATE: DEGRADED"; exit 2; }
printf 'probe\n' | "$GREP_BIN" -q 'probe' || { degrade K3_GATE_SCAN_UNAVAILABLE "grep 试运行失败: $GREP_BIN"; echo "K3-GATE: DEGRADED"; exit 2; }
[ -n "$PYBIN" ] || { degrade K3_GATE_SCAN_UNAVAILABLE "python3 不可用（读 policy / task-state 必需）"; echo "K3-GATE: DEGRADED"; exit 2; }
[ -f "$POLICY_FILE" ] || { degrade K3_GATE_POLICY_UNREADABLE "policy 不存在: $POLICY_FILE" policy; echo "K3-GATE: DEGRADED"; exit 2; }
[ -d "$STATE_DIR/task-state" ] || { degrade K3_GATE_STATE_UNREADABLE "task-state 目录不存在: $STATE_DIR/task-state" state; echo "K3-GATE: DEGRADED"; exit 2; }

# ── 取变更集 ────────────────────────────────────────────────────────────────
FILES_LIST="$(mktemp)"; trap 'rm -f "$FILES_LIST"' EXIT
if [ "$MODE" = "full" ]; then
  ( cd "$TARGET_DIR" && "$GIT_BIN" ls-files ) > "$FILES_LIST" 2>/dev/null || {
    degrade K3_GATE_SCAN_UNAVAILABLE "git ls-files 失败: $TARGET_DIR"; echo "K3-GATE: DEGRADED"; exit 2; }
else
  [ -n "$BASE_REF" ] && [ -n "$HEAD_REF" ] || { degrade K3_GATE_SCAN_UNAVAILABLE "PR 模式需 --base 与 --head"; echo "K3-GATE: DEGRADED"; exit 2; }
  "$GIT_BIN" -C "$TARGET_DIR" rev-parse --verify "$BASE_REF" >/dev/null 2>&1 || { degrade K3_GATE_SCAN_UNAVAILABLE "base 无法解析: $BASE_REF"; echo "K3-GATE: DEGRADED"; exit 2; }
  "$GIT_BIN" -C "$TARGET_DIR" rev-parse --verify "$HEAD_REF" >/dev/null 2>&1 || { degrade K3_GATE_SCAN_UNAVAILABLE "head 无法解析: $HEAD_REF"; echo "K3-GATE: DEGRADED"; exit 2; }
  "$GIT_BIN" -C "$TARGET_DIR" -c core.quotepath=false diff --name-only --diff-filter=AM "$BASE_REF".."$HEAD_REF" 2>/dev/null > "$FILES_LIST" || {
    degrade K3_GATE_SCAN_UNAVAILABLE "git diff 失败: $BASE_REF..$HEAD_REF"; echo "K3-GATE: DEGRADED"; exit 2; }
fi
CHANGED=$(wc -l < "$FILES_LIST" | tr -d ' \n\r'); [ -z "$CHANGED" ] && CHANGED=0

# ── policy 抽取（无 pyyaml：定向抽取本检查器需要的少数键）───────────────
POLICY_OUT="$("$PYBIN" - "$POLICY_FILE" "$FILES_LIST" <<'PY' 2>/dev/null  # swallow-ok: 抽取失败→空值→下方显式判 degraded（不静默、不放行）
import re, sys
pol, flist = sys.argv[1], sys.argv[2]
txt = open(pol, encoding='utf-8').read()
def sect(name):
    m = re.search(rf"^  {name}:\n(.*?)(?=^  [A-Za-z_]+:|\Z)", txt, re.M | re.S)
    return m.group(1) if m else ""
def globs(block):
    m = re.search(r"^    globs:\n((?:      - .*\n)+)", block, re.M)
    return [l.strip()[2:].strip().strip('"') for l in m.group(1).splitlines()] if m else []
def exact(block):
    m = re.search(r"^    exact_files:\n((?:      - .*\n)+)", block, re.M)
    return [l.strip()[2:].strip().strip('"') for l in m.group(1).splitlines()] if m else []
def extra(block):
    m = re.search(r"^    extra_globs:\n(.*?)(?=^    [a-z_]+:|\Z)", block, re.M | re.S)
    return globs("  X:\n" + m.group(1).replace("      globs:", "    globs:")) if m else []
A, B, C = sect("A_security"), sect("B_finance"), sect("C_storage")
pat = ""
m = re.search(r"^      pattern:\s*\"?([^\"\n]+)\"?", C, re.M)
if m: pat = m.group(1).strip()
pats = []
for g in globs(A) + exact(A) + extra(A) + globs(B) + globs(C):
    print("RULE\t" + g)
if pat: print("PICKAXE\t" + pat)
sys.exit(0)
PY
)"
RULE_PATTERNS="$(printf '%s\n' "$POLICY_OUT" | "$GREP_BIN" '^RULE' | cut -f2- || true)"
PICKAXE_PAT="$(printf '%s\n' "$POLICY_OUT" | "$GREP_BIN" '^PICKAXE' | cut -f2- || true)"
if [ -z "$RULE_PATTERNS" ]; then
  degrade K3_GATE_POLICY_UNREADABLE "policy 未抽出任何类目规则（文件损坏或格式变更）: $POLICY_FILE" policy
  echo "K3-GATE: DEGRADED"; exit 2
fi

# 三类匹配：把 policy 的 glob 转成 git-pathspec 语义的 shell 匹配（`**` → 任意层级）
match3() { # <相对路径> → 0=命中三类
  local f="$1"
  while IFS= read -r pat; do
    [ -z "$pat" ] && continue
    case "$pat" in
      *"/**") case "$f" in "$(printf '%s' "${pat%/**}")"/*) return 0 ;; esac ;;
      *\**)
        local core="${pat#\*\*\/}"; core="${core#\*}"
        case "$f" in *"${core%\*}"*) return 0 ;; esac ;;
      *) [ "$f" = "$pat" ] && return 0 ;;
    esac
  done <<< "$RULE_PATTERNS"
  return 1
}

HIT3=""
while IFS= read -r f; do
  [ -z "$f" ] && continue
  match3 "$f" && HIT3="${HIT3}${f}"$'\n'
done < "$FILES_LIST"

HIT3_N=0
[ -n "$HIT3" ] && HIT3_N=$(printf '%s' "$HIT3" | "$GREP_BIN" -c . | tr -d ' \n\r')

# pickaxe：本次 diff 是否增删 DDL 行（只认"本次变更"语义）
PICK_HIT=0
if [ "$MODE" = "diff" ] && [ -n "$PICKAXE_PAT" ]; then
  # 生产口径限定（实测必要）: 不加排除时，D923 证据文档正文含 `CREATE TABLE` 字面量即被误命中
  n=$("$GIT_BIN" -C "$TARGET_DIR" diff -G"$PICKAXE_PAT" --name-only "$BASE_REF".."$HEAD_REF" -- . ':!docs/**' ':!tests/**' ':!*.md' 2>/dev/null | "$GREP_BIN" -c . | tr -d ' \n\r' || true)
  [ -z "$n" ] && n=0; PICK_HIT="$n"
fi
[ "$PICK_HIT" -gt 0 ] && HIT3_N=$((HIT3_N + PICK_HIT))

# ── D# 解析（三路，**必须可归因**）────────────────────────────────────────
BRANCH="$("$GIT_BIN" -C "$TARGET_DIR" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
BRANCH_ARG="${GITHUB_HEAD_REF:-$BRANCH}"
SRC1=""; SRC2=""; SRC3=""
SRC1="$(printf '%s' "$BRANCH_ARG" | "$GREP_BIN" -oiE 'D[0-9]+' | tr 'a-z' 'A-Z' | sort -u | tr '\n' ' ' || true)"
[ -z "$SRC1" ] && SRC1="$(printf '%s' "$BRANCH_ARG" | "$GREP_BIN" -oiE 'D[0-9]+' | tr 'a-z' 'A-Z' | sort -u | tr '\n' ' ' || true)"
# 第二路必须扫**整个变更集**（而非仅三类命中）——brief 文件本身不属三类路径
BRIEF_FILES="$("$GREP_BIN" -E '^\.claude/task-briefs/.*-[Dd][0-9]+-.*\.md$' "$FILES_LIST" || true)"
for bf in $BRIEF_FILES; do
  d="$(basename "$bf" | "$GREP_BIN" -oiE 'D[0-9]+' | head -1 | tr 'a-z' 'A-Z' || true)"; [ -n "$d" ] && SRC2="${SRC2}${d} "
done
SRC2="$(printf '%s' "$SRC2" | tr ' ' '\n' | sort -u | "$GREP_BIN" -v '^$' | tr '\n' ' ' || true)"
if [ -n "${GITHUB_EVENT_PATH:-}" ] && [ -f "${GITHUB_EVENT_PATH:-}" ]; then
  SRC3="$("$PYBIN" -c "
import json,sys,re
try:
    d=json.load(open(sys.argv[1],encoding='utf-8'))
    b=((d.get('pull_request') or {}).get('body') or '')
    print(' '.join(sorted(set(re.findall(r'D[0-9]+', b)))))
except Exception: print('')
" "$GITHUB_EVENT_PATH" 2>/dev/null || true)"
fi
DS="$(printf '%s %s %s' "$SRC1" "$SRC2" "$SRC3" | tr ' ' '\n' | sort -u | "$GREP_BIN" -v '^$' | tr '\n' ' ' || true)"

# ── 结论读取（task-state 优先；报告正文子串兜底）──────────────────────────
read_verdict() { # <D#> → 归一码 或 empty
  local d="$1"
  "$PYBIN" - "$STATE_DIR" "$d" <<'PY' 2>/dev/null  # swallow-ok: 读取失败→空→按 NO_VERDICT 处理（fail-closed 转红，不静默放行）
import json, sys, re, glob, os
state, did = sys.argv[1], sys.argv[2]
card = os.path.join(state, "task-state", f"{did}.json")
card_alt = None
if not os.path.isfile(card):
    for f in glob.glob(os.path.join(state, "task-state", "*.json")):
        try:
            if (json.load(open(f, encoding='utf-8')).get('task_id') or '').strip() == did:
                card_alt = f; break
        except Exception: pass
card = card if os.path.isfile(card) else card_alt
raw = None
if card:
    try: raw = json.load(open(card, encoding='utf-8')).get('audit')
    except Exception: raw = None
v = None
if isinstance(raw, dict): v = raw.get('verdict')
elif isinstance(raw, str): v = raw
M = {
 'PASS':'PASS','pass':'PASS',
 'CONDITIONAL PASS':'CONDITIONAL_PASS','CONDITIONAL_PASS':'CONDITIONAL_PASS',
 'FAIL':'FAIL',
 'NOT-AUDITABLE':'NOT_AUDITABLE','NOT_AUDITABLE':'NOT_AUDITABLE',
 '无 K3（V5.1.3 tag 锚点闭环）':'NOT_K3','DONE':'NOT_K3','CTO 验收通过（非 K3）':'NOT_K3',
}
if v is not None and str(v).strip() in M:
    print(M[str(v).strip()]); raise SystemExit
# 报告正文兜底（既有唯一约定: CONDITIONAL PASS > PASS > FAIL > ?）
for f in sorted(glob.glob(os.path.join(state, 'docs/synova/audit-reports/*.md'))):
    m = re.search(r'D\d+', os.path.basename(f))
    if m and m.group(0) == did:
        try: txt = open(f, encoding='utf-8', errors='replace').read()
        except Exception: continue
        if 'CONDITIONAL PASS' in txt: print('CONDITIONAL_PASS'); raise SystemExit
        if 'PASS' in txt: print('PASS'); raise SystemExit
        if 'FAIL' in txt: print('FAIL'); raise SystemExit
        print('NO_VERDICT'); raise SystemExit
print('NO_VERDICT')
PY
}

echo "[k3-gate] mode=$MODE changed=$CHANGED three_category_hits=$HIT3_N"
echo "[k3-gate] D# 归因 → ①分支名(${BRANCH_ARG})：[${SRC1:-无}] ②brief 文件名：[${SRC2:-无}] ③PR 正文：[${SRC3:-无}] ⇒ 采用：[${DS:-无}]"
[ "$VERBOSE" = "1" ] && [ -n "$HIT3" ] && printf '  三类命中: %s\n' "$(printf '%s' "$HIT3" | tr '\n' ' ')"

if [ "$HIT3_N" -eq 0 ]; then
  # 非三类 → 20% 抽样，**永不阻断，只记录**
  if [ -n "$PR_NUM" ] && [ "$PR_NUM" -eq "$PR_NUM" ] 2>/dev/null; then
    if [ $((PR_NUM % 5)) -eq 0 ]; then
      echo "::notice title=K3抽样::PR #$PR_NUM 抽中 20% 抽样（PR号%5==0）——记录性覆盖，不阻断"
      echo "[k3-gate] 抽样命中（非三类路径）——永不阻断"
    fi
  fi
  [ "$DEGRADED" -eq 1 ] && { echo "K3-GATE: DEGRADED"; exit 2; }
  echo "K3-GATE: PASS"
  exit 0
fi

# 三类命中 → 必须有结论
if [ -z "$DS" ]; then
  echo "::error title=K3门禁::三类路径命中但**三路均未能识别卡号**（分支名/brief 文件名/PR 正文皆无 D#）⇒ 无结论 = 红"
  echo "[k3-gate] 出口：在 PR 正文或分支名写明卡号 D#；或由 CTO 具名豁免（写入卡/PR，可核）"
  echo "K3-GATE: REJECT(NO_CARD_ID)"
  exit 1
fi

WORST=""; REASONS=""
for d in $DS; do
  code="$(read_verdict "$d")"; [ -z "$code" ] && code="NO_VERDICT"
  case "$code" in
    PASS) ;;
    CONDITIONAL_PASS) WORST="REJECT"; REASONS="${REASONS}${d}: CONDITIONAL PASS —— 有条件通过 = 未通过；" ;;
    FAIL)             WORST="REJECT"; REASONS="${REASONS}${d}: FAIL —— K3 判失败；" ;;
    NOT_AUDITABLE)    WORST="REJECT"; REASONS="${REASONS}${d}: NOT-AUDITABLE —— 不可审计 ≠ 通过；" ;;
    NOT_K3)           WORST="REJECT"; REASONS="${REASONS}${d}: 非 K3 结论（tag 锚点/DONE/CTO 人工验收）不得充当 K3 通过；出口：补 K3 结论或 CTO 具名豁免；" ;;
    NO_VERDICT)       WORST="REJECT"; REASONS="${REASONS}${d}: 无 K3 结论 —— K3 排队中；出口：等结论或 CTO 具名豁免；" ;;
    *)                WORST="REJECT"; REASONS="${REASONS}${d}: 未知归一码 $code；" ;;
  esac
done

# 裁定 1 硬要求：归一动作**显式可见**（禁静默归一）——具名列出卡号
for d in $DS; do
  c="$(read_verdict "$d")"
  if [ "$c" = "PASS" ]; then
    raw="$("$PYBIN" -c "
import json,sys,glob,os
state,did=sys.argv[1],sys.argv[2]
for f in glob.glob(os.path.join(state,'task-state','*.json')):
    try: d=json.load(open(f,encoding='utf-8'))
    except Exception: continue
    if (d.get('task_id') or os.path.basename(f)[:-5])==did:
        a=d.get('audit'); v=a.get('verdict') if isinstance(a,dict) else a
        print(v if v is not None else 'null'); break
" "$STATE_DIR" "$d" 2>/dev/null || true)"
    case "$raw" in
      pass) echo "::notice title=K3归一::$d 的 verdict 原值为小写 'pass' —— 已显式归一为 PASS（非静默；待裁定 8 卡回填时统一）" ;;
    esac
  fi
done

if [ "$WORST" = "REJECT" ]; then
  echo "::error title=K3门禁::三类路径命中（${HIT3_N} 项）且卡内无通过级 K3 结论：$REASONS"
  echo "[k3-gate] 三类命中清单：$(printf '%s' "$HIT3" | tr '\n' ' ')"
  echo "K3-GATE: REJECT($REASONS)"
  exit 1
fi

if [ "$DEGRADED" -eq 1 ]; then
  echo "K3-GATE: DEGRADED"; exit 2
fi
echo "K3-GATE: PASS"
exit 0
