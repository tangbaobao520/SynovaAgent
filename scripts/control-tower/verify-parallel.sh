#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# verify-parallel.sh — D311 并行声明物理验证 (M1 多会话协调)
#
# 背景 (D286/D292 事故): dev doc 头部声明 "并行: D286 (packages/), D300 (scripts/)
# — 零共享文件"，但 D286 实际改 15 个 src/ 文件 → 声明不可信，必须比对写集表。
#
# 功能: 解析 dev doc 写集表（### N 写集 标题下的 markdown 表），两两比对零交集。
#   有交集 → exit 1（业务阻断，输出重叠文件）；无交集 → exit 0。
#   fail-open: doc 缺失/无写集表/解析异常 → SKIP + degraded-events.log + exit 0。
#
# 用法:
#   verify-parallel.sh --doc-a <path> --doc-b <path> [--json]
#   verify-parallel.sh --check-declared <doc> [--json]   # 解析头部 并行: D# (范围) 声明
#   verify-parallel.sh --scan-today [--json]             # 今日全部 dev doc 两两比对
#
# 退出码 (CT-28 三态化): 0 = pass/skip, 1 = block (有交集), 2 = degraded (内核执行异常/用法错误)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CT_DIR="$REPO_DIR/.codex/control-tower"
DEGRADED_LOG="$CT_DIR/logs/degraded-events.log"
IMPL_DIR="$REPO_DIR/docs/plans/codex/implementation"

JSON_OUT="no"

# ── 参数解析 ──
MODE=""
DOC_A=""
DOC_B=""
CI_PR_BASE="origin/main"   # D540: --ci-pr 默认基准 ref（可被 --ci-pr <base> 覆盖）
for arg in "$@"; do
  case "$arg" in
    --doc-a) MODE="pair"; DOC_A="${2:-}"; shift 2 ;;
    --doc-b) DOC_B="${2:-}"; shift 2 ;;
    --check-declared) MODE="declared"; DOC_A="${2:-}"; shift 2 ;;
    --scan-today) MODE="today" ;;
    --ci-pr) MODE="ci-pr"; CI_PR_BASE="${2:-origin/main}"; shift 2 ;;
    --json) JSON_OUT="yes" ;;
    *) : ;;
  esac
done

log_degraded() {
  mkdir -p "$(dirname "$DEGRADED_LOG")"
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)\", \"component\": \"verify-parallel\", \"reason\": \"$1\"}" >> "$DEGRADED_LOG" 2>/dev/null || true
}

emit_json() { # emit_json <status> <doc_a> <doc_b> <overlap_csv> <detail>
  if [ "$JSON_OUT" = "yes" ]; then
    cat <<EOF
{"component": "verify-parallel", "status": "$1", "doc_a": "$2", "doc_b": "$3", "overlap": [$4], "reason": "$5"}
EOF
  fi
}

fail_open_skip() { # fail_open_skip <doc> <reason>
  echo "  ⚠️  SKIP $1 — $2 (fail-open)" >&2
  log_degraded "$1: $2"
  emit_json "skip" "$1" "" "[]" "$2"
}

# D513/②(Win 8f33e82a): PYBIN 三级探测替换裸 python3 —— Win Git Bash 无
# python3（仅 python/py）→ exit 127 degraded → pre-push 拦截（D329/D330 已修
# commit-msg/resolver 两处，本文件是第三处漏网）。探测后试运行验证可用性（D330）。
PYBIN=""
for _c in python3 python py; do
  if command -v "$_c" >/dev/null 2>&1 && "$_c" -c "import sys" >/dev/null 2>&1; then
    PYBIN="$_c"; break
  fi
done
if [ -z "$PYBIN" ]; then
  echo "⚠ D513: python 不可用（python3/python/py 均无）— 写集比对降级跳过（显式提示，不静默）" >&2
fi

# ── 核心: python3 写集解析与比对 ──
# CT-28 (D422): block 判定直传 devdoc_writeset.py 的 exit code（内核本有三态）,
#               弃 grep '"status": "block"' 文本匹配（格式漂移即静默放行 M1）。
compare_docs() { # compare_docs <doc-a> <doc-b> → 0 pass/skip, 1 block, 2 degraded
  local da="$1" db="$2"
  if [ ! -f "$da" ]; then fail_open_skip "$da" "doc 不存在"; return 0; fi
  if [ ! -f "$db" ]; then fail_open_skip "$db" "doc 不存在"; return 0; fi

  # V5.0.1 (Win 反馈, 2026-08-24): 已完成任务文档豁免——写集全部已在 origin/main 的任务
  # 视为已交付，后续任务继承/修订其写集是串行演进，不是并行冲突（D481 已合并、
  # D483 修订其 auth.integration.test.ts 被 --scan-today 误判重叠的实证）。
  # origin/main 不可解析 → 不豁免（fail-closed，保持原判定）。
  if git -C "$REPO_DIR" rev-parse --verify -q origin/main >/dev/null 2>&1; then
    local _doc _files _f _missing
    for _doc in "$da" "$db"; do
      _files=$($PYBIN "$SCRIPT_DIR/devdoc_writeset.py" --extract "$_doc" 2>/dev/null | "$PYBIN" -c "import json,sys
try:
  d=json.load(sys.stdin)
  print(chr(10).join(d.get('entries',[])))
except Exception:
  pass" 2>/dev/null || true)
      [ -z "$_files" ] && continue
      _missing=0
      while IFS= read -r _f || [ -n "$_f" ]; do
        [ -z "$_f" ] && continue
        git -C "$REPO_DIR" cat-file -e "origin/main:$_f" 2>/dev/null || { _missing=1; break; }
      done <<< "$_files"
      if [ "$_missing" -eq 0 ]; then
        echo "  ⏭ 跳过已完成任务文档（写集全部已在 origin/main）: $_doc" >&2
        emit_json "skip" "$da" "$db" "[]" "已完成任务文档（写集已在 origin/main）"
        return 0
      fi
    done
  fi

  local result py_exit st reason
  result=$($PYBIN "$SCRIPT_DIR/devdoc_writeset.py" --overlap-a "$da" --overlap-b "$db" 2>&1)
  py_exit=$?

  if [ "$py_exit" -eq 1 ]; then
    # block: 有交集（业务判定，不属 fail-open）
    echo "  ❌ 并行声明与实际写集不符 — 重叠文件:"
    echo "$result" | "$PYBIN" -c "import json,sys; d=json.load(sys.stdin); [print(f\"     - {o}\") for o in d.get('overlap',[])]" 2>/dev/null || echo "$result"
    echo "     ($da vs $db)"
    emit_json "block" "$da" "$db" "$(echo "$result" | "$PYBIN" -c "import json,sys; print(','.join('\"%s\"'%o for o in json.load(sys.stdin).get('overlap',[])))" 2>/dev/null || echo "")" "写集重叠"
    return 1
  fi
  if [ "$py_exit" -ne 0 ]; then
    # 内核执行异常 (exit 非 0/1) — degraded, 不静默当通过
    echo "  ⚠️  devdoc_writeset.py 执行异常 (exit=$py_exit) — degraded" >&2
    log_degraded "devdoc_writeset.py exit=$py_exit ($da/$db)"
    emit_json "degraded" "$da" "$db" "[]" "内核执行异常 exit=$py_exit"
    return 2
  fi

  st=$(echo "$result" | "$PYBIN" -c "import json,sys; print(json.load(sys.stdin).get('status','pass'))" 2>/dev/null || echo "pass")
  if [ "$st" = "skip" ]; then
    reason=$(echo "$result" | "$PYBIN" -c "import json,sys; print(json.load(sys.stdin).get('reason',''))" 2>/dev/null || echo "解析跳过")
    fail_open_skip "$da/$db" "$reason"
    return 0
  fi
  echo "  ✅ 写集零交集"
  emit_json "pass" "$da" "$db" "[]" ""
  return 0
}

# D540: compare_writesets_ci — CI/PR 模式下的纯写集比对（不做 V5.0.1 已完成任务豁免——
#   CI 要拦的是「本 PR 写集 vs 已合任务写集」的重叠；若沿用豁免，已合 doc 恒被跳过，
#   对比恒过，失去 CI 物理拦截意义）。与 compare_docs 的区别只在「不豁免」。
#   @input  <doc-a> <doc-b> 均须为可读文件（已合 doc 已物化到临时文件）
#   @output 0 = 无交集 / 1 = 写集重叠（业务阻断）/ 2 = 内核异常 degraded
compare_writesets_ci() {
  local da="$1" db="$2"
  if [ ! -f "$da" ]; then fail_open_skip "$da" "doc 不存在"; return 0; fi
  if [ ! -f "$db" ]; then fail_open_skip "$db" "doc 不存在"; return 0; fi
  local result py_exit st reason
  result=$($PYBIN "$SCRIPT_DIR/devdoc_writeset.py" --overlap-a "$da" --overlap-b "$db" 2>&1)
  py_exit=$?
  if [ "$py_exit" -eq 1 ]; then
    # block: 有交集（业务判定）
    echo "  ❌ 并行声明与实际写集不符 — 重叠文件:"
    echo "$result" | "$PYBIN" -c "import json,sys; d=json.load(sys.stdin); [print(f\"     - {o}\") for o in d.get('overlap',[])]" 2>/dev/null || echo "$result"
    echo "     ($da vs $db)"
    emit_json "block" "$da" "$db" "$(echo "$result" | "$PYBIN" -c "import json,sys; print(','.join('\"%s\"'%o for o in json.load(sys.stdin).get('overlap',[])))" 2>/dev/null || echo "")" "写集重叠"
    return 1
  fi
  if [ "$py_exit" -ne 0 ]; then
    # 内核执行异常 (exit 非 0/1) — degraded, 不静默当通过
    echo "  ⚠️  devdoc_writeset.py 执行异常 (exit=$py_exit) — degraded ($da/$db)" >&2
    log_degraded "devdoc_writeset.py exit=$py_exit ($da/$db)"
    emit_json "degraded" "$da" "$db" "[]" "内核执行异常 exit=$py_exit"
    return 2
  fi
  st=$(echo "$result" | "$PYBIN" -c "import json,sys; print(json.load(sys.stdin).get('status','pass'))" 2>/dev/null || echo "pass")
  if [ "$st" = "skip" ]; then
    reason=$(echo "$result" | "$PYBIN" -c "import json,sys; print(json.load(sys.stdin).get('reason',''))" 2>/dev/null || echo "解析跳过")
    fail_open_skip "$da/$db" "$reason"
    return 0
  fi
  echo "  ✅ 写集零交集 ($(basename "$da") vs $(basename "$db"))"
  emit_json "pass" "$da" "$db" "[]" ""
  return 0
}

# ── 今日文件筛选 (D366) — 必须在模式分发之前定义: 分支内的定义只在分支执行时生效 ──
# D366: 按文件名日期判断"今日" — 替代 find 按 mtime 的今日判定 (git pull/checkout 刷 mtime 不可靠)
# 用法: today_files_by_prefix <dir>   # brief: YYYY-MM-DD 文件名前缀 (扫描 *.md)
#       today_files_by_suffix <dir>   # dev doc: -YYYYMMDD.md 文件名后缀 (扫描 SYNOVA-IMPL-*.md)
# 性能: 纯 bash for+case 零子进程 — grep|head 每文件 3 spawn × 349 brief = Windows 分钟级 (实测回退)
# 注意: glob 硬编码在函数内 — 变量中的 * 不会被路径名展开 (实测), 字面 glob 才展开
TODAY_DASH=$(date +%Y-%m-%d)
TODAY_COMPACT=$(date +%Y%m%d)
today_files_by_prefix() {
  local dir="$1" f b
  dir="${dir%/}"
  [ -d "$dir" ] || return 0
  for f in "$dir"/*.md; do
    [ -e "$f" ] || continue
    b=${f##*/}
    case "$b" in
      "${TODAY_DASH}"-*) echo "$f" ;;
    esac
  done
  return 0
}
today_files_by_suffix() {
  local dir="$1" f b
  dir="${dir%/}"
  [ -d "$dir" ] || return 0
  for f in "$dir"/SYNOVA-IMPL-*.md; do
    [ -e "$f" ] || continue
    b=${f##*/}
    case "$b" in
      *-${TODAY_COMPACT}.md) echo "$f" ;;
    esac
  done
  return 0
}

# ── 模式分发 ──
echo "── verify-parallel (D311): 并行声明物理验证 ──"

BLOCKED=0
DEGRADED=0

# CT-28: compare_docs 三态 rc → BLOCKED(1)/DEGRADED(2) 归位（0 由 || 短路跳过）
handle_compare() {
  case "${1:-0}" in
    1) BLOCKED=1 ;;
    2) DEGRADED=1 ;;
  esac
  return 0
}

if [ "$MODE" = "pair" ]; then
  compare_docs "$DOC_A" "$DOC_B" || handle_compare $?

elif [ "$MODE" = "declared" ]; then
  # 解析头部 "并行: D286 (范围), D300 (范围)" 声明
  if [ ! -f "$DOC_A" ]; then fail_open_skip "$DOC_A" "doc 不存在"; exit 0; fi
  echo "  解析声明: $DOC_A"
  # 提取 D\d+ 列表
  DEPS=$(grep -oE "D[0-9]+" "$DOC_A" | sort -u || true)
  SELF=$(basename "$DOC_A" | grep -oE "D[0-9]+" | head -1 || true)
  for dep in $DEPS; do
    [ "$dep" = "$SELF" ] && continue
    DEP_DOC=$(ls "$IMPL_DIR"/SYNOVA-IMPL-${dep}-*.md 2>/dev/null | head -1 || true)
    if [ -z "$DEP_DOC" ]; then
      echo "  ⚠️  声明依赖 $dep 的 dev doc 不存在 — 跳过 (fail-open)" >&2
      log_degraded "声明依赖 $dep dev doc 缺失"
      continue
    fi
    compare_docs "$DOC_A" "$DEP_DOC" || handle_compare $?
  done

elif [ "$MODE" = "today" ]; then
  # 今日全部 dev doc 两两比对 — D366: 文件名日期后缀 (mtime 会被 git pull 刷, 不可靠)
  DOCS=$(today_files_by_suffix "$IMPL_DIR" | sort || true)
  if [ -z "$DOCS" ]; then
    echo "  ✅ 今日无 dev doc — 跳过"
    exit 0
  fi
  # bash 3.2 兼容: 数组批量读入命令是 bash 4.0+ 专属，Mac 默认 3.2 无此命令
  DOC_ARR=()
  while IFS= read -r doc_line || [ -n "$doc_line" ]; do
    [ -n "$doc_line" ] && DOC_ARR+=("$doc_line")
  done <<< "$DOCS"
  for ((i = 0; i < ${#DOC_ARR[@]}; i++)); do
    for ((j = i + 1; j < ${#DOC_ARR[@]}; j++)); do
      compare_docs "${DOC_ARR[$i]}" "${DOC_ARR[$j]}" || handle_compare $?
    done
  done

elif [ "$MODE" = "ci-pr" ]; then
  # D540: CI/PR 模式 —— base..HEAD 写集 × origin/main 已合 dev doc 写集比对
  #   用法: verify-parallel.sh --ci-pr <base> (默认 origin/main)
  #   base = 已合 ref; HEAD = PR head。exit 1=写集重叠 / 0=无交集 / 2=内核异常 degraded
  #   fetch-depth:0 依赖: git diff base...HEAD + ls-tree base 需完整历史（ci.yml 已确认）
  if ! git -C "$REPO_DIR" rev-parse --verify -q "$CI_PR_BASE" >/dev/null 2>&1; then
    echo "  ⚠️  基准 $CI_PR_BASE 不可解析 — degraded (fail-closed)" >&2
    log_degraded "ci-pr base $CI_PR_BASE 不可解析"
    emit_json "degraded" "" "" "[]" "base 不可解析"
    exit 2
  fi
  # base..HEAD 中的 dev doc（本 PR 自身 doc）
  PR_DOCS=$(git -C "$REPO_DIR" diff --name-only --diff-filter=d "$CI_PR_BASE"...HEAD 2>/dev/null \
             | grep -E '^docs/plans/codex/implementation/SYNOVA-IMPL-[^/]+\.md$' || true)
  if [ -z "$PR_DOCS" ]; then
    echo "  ✅ 无 dev doc 写集变化（${CI_PR_BASE}..HEAD）— 跳过"
    exit 0
  fi
  TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
  # 物化已合 dev doc 到临时文件（排除 PR 自身 doc = 同路径 = 同一任务演进，非并行冲突）
  MERGED_DOCS=""
  while IFS= read -r mpath || [ -n "$mpath" ]; do
    [ -z "$mpath" ] && continue
    # 排除 PR 自身 doc（同路径 = PR 修订自己的任务 doc，不是与已合任务并行冲突）
    if printf '%s\n' "$PR_DOCS" | grep -qxF "$mpath"; then continue; fi
    local_mtmp="$TMPD/$(basename "$mpath")"
    if git -C "$REPO_DIR" show "$CI_PR_BASE:$mpath" > "$local_mtmp" 2>/dev/null; then
      MERGED_DOCS="$MERGED_DOCS $local_mtmp"
    else
      echo "  ⚠️  物化 $mpath 失败 — degraded" >&2
      log_degraded "ci-pr show $mpath 失败"
      DEGRADED=1
    fi
  done < <(git -C "$REPO_DIR" ls-tree -r --name-only "$CI_PR_BASE" 2>/dev/null \
             | grep -E '^docs/plans/codex/implementation/SYNOVA-IMPL-[^/]+\.md$' || true)
  if [ -z "$MERGED_DOCS" ]; then
    if [ "$DEGRADED" -eq 1 ]; then
      echo "  ⚠️  已合 dev doc 物化全部失败 — degraded" >&2
      exit 2
    fi
    echo "  ✅ 无已合 dev doc 可比对（${CI_PR_BASE}）— 跳过"
    exit 0
  fi
  # 两两比对：本 PR doc vs 已合 doc（compare_writesets_ci —— 无豁免，纯重叠判定）
  while IFS= read -r pdoc || [ -n "$pdoc" ]; do
    [ -z "$pdoc" ] && continue
    for mtmp in $MERGED_DOCS; do
      compare_writesets_ci "$pdoc" "$mtmp" || handle_compare $?
    done
  done <<< "$PR_DOCS"
else
  echo "用法: verify-parallel.sh --doc-a <a> --doc-b <b> | --check-declared <doc> | --scan-today [--json] | --ci-pr <base> [--json]" >&2
  exit 2
fi

if [ "$BLOCKED" -eq 1 ]; then
  echo ""
  echo "  ❌ 并行声明验证未通过 — 存在写集重叠，禁止并行"
  exit 1
fi
if [ "$DEGRADED" -eq 1 ]; then
  echo ""
  echo "  ⚠️  verify-parallel 降级 (内核执行异常) — 见 degraded-events.log" >&2
  exit 2
fi
echo "  ✅ 并行声明验证通过"
exit 0
