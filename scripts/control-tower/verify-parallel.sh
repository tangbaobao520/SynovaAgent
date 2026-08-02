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
# 退出码: 0 = pass/skip/degraded, 1 = block (有交集)
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

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
for arg in "$@"; do
  case "$arg" in
    --doc-a) MODE="pair"; DOC_A="${2:-}"; shift 2 ;;
    --doc-b) DOC_B="${2:-}"; shift 2 ;;
    --check-declared) MODE="declared"; DOC_A="${2:-}"; shift 2 ;;
    --scan-today) MODE="today" ;;
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

# ── 核心: python3 写集解析与比对 ──
compare_docs() { # compare_docs <doc-a> <doc-b> → exit 1 on overlap
  local da="$1" db="$2"
  if [ ! -f "$da" ]; then fail_open_skip "$da" "doc 不存在"; return 0; fi
  if [ ! -f "$db" ]; then fail_open_skip "$db" "doc 不存在"; return 0; fi

  local result py_exit
  result=$(
    python3 - "$da" "$db" 2>&1 <<'PYEOF'
import json, re, sys
from pathlib import Path

def extract_write_set(path: str):
    """解析 dev doc 写集表: ### N 写集 标题下第一个 markdown 表的第一列。"""
    try:
        text = Path(path).read_text(encoding="utf-8", errors="replace")
    except OSError:
        return None, f"读取失败: {path}"
    lines = text.splitlines()
    in_table = False
    entries = []
    for line in lines:
        if re.match(r"^#{2,4}\s*\d+(\.\d+)*\s*写集", line):
            in_table = True
            continue
        if in_table and re.match(r"^\s*\|[-:\s|]+\|\s*$", line):
            continue  # 分隔行
        if in_table and line.strip().startswith("|"):
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if len(cells) >= 1 and cells[0] and not cells[0].startswith("文件"):
                entries.append(cells[0])
            continue
        if in_table and line.strip().startswith("|") is False:
            if not line.strip() or line.strip().startswith("#"):
                in_table = False
    if not entries:
        return None, f"无写集表: {path}"
    return entries, None

def clean_entry(raw: str) -> str:
    """清洗第一列: 链接/行号/计数/反斜杠/绝对前缀 → 归一化路径。"""
    e = raw.strip()
    # markdown 链接 [text](url) → text
    m = re.match(r"^\[([^\]]+)\]", e)
    if m:
        e = m.group(1)
    # 去行号 (path L750)
    e = re.sub(r"\s+L\d+$", "", e)
    # 去计数注释 (N 个 / N 修改)
    e = re.sub(r"\s*\(\d+\s*[个修改新建删除]+\)\s*$", "", e)
    # 反斜杠 → 正斜杠; 小写 (Windows FS 大小写不敏感)
    e = e.replace("\\", "/").lower()
    # 去绝对前缀 (D:\...\synova-agent\ 或 /d/.../synova-agent/)
    e = re.sub(r"^[a-z]:[/\\].*?synova-agent[/\\]", "", e)
    e = re.sub(r"^/+.*?synova-agent/", "", e)
    return e.strip()

def is_dir_entry(e: str) -> bool:
    return e.endswith("/")

def overlap(a_entries, b_entries):
    a = [clean_entry(x) for x in a_entries if clean_entry(x)]
    b = [clean_entry(x) for x in b_entries if clean_entry(x)]
    hits = []
    for x in a:
        for y in b:
            if x == y:
                hits.append(x)
            elif is_dir_entry(x) and y.startswith(x):
                hits.append(f"{x} vs {y}")
            elif is_dir_entry(y) and x.startswith(y):
                hits.append(f"{y} vs {x}")
    return list(dict.fromkeys(hits))

ea, err_a = extract_write_set(sys.argv[1])
if err_a:
    print(json.dumps({"status": "skip", "doc_a": sys.argv[1], "reason": err_a}))
    sys.exit(0)
eb, err_b = extract_write_set(sys.argv[2])
if err_b:
    print(json.dumps({"status": "skip", "doc_b": sys.argv[2], "reason": err_b}))
    sys.exit(0)
hits = overlap(ea, eb)
if hits:
    print(json.dumps({"status": "block", "doc_a": sys.argv[1], "doc_b": sys.argv[2], "overlap": hits, "count_a": len(ea), "count_b": len(eb)}))
    sys.exit(1)
print(json.dumps({"status": "pass", "doc_a": sys.argv[1], "doc_b": sys.argv[2], "overlap": [], "count_a": len(ea), "count_b": len(eb)}))
sys.exit(0)
PYEOF
  )
  py_exit=$?

  if [ "$py_exit" -eq 1 ]; then
    # block: 有交集（业务判定，不属 fail-open）
    echo "  ❌ 并行声明与实际写集不符 — 重叠文件:"
    echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(f\"     - {o}\") for o in d.get('overlap',[])]" 2>/dev/null || echo "$result"
    echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"     ({d.get('doc_a','')} vs {d.get('doc_b','')})\")" 2>/dev/null || true
    emit_json "block" "$da" "$db" "$(echo "$result" | python3 -c "import json,sys; print(','.join('\"%s\"'%o for o in json.load(sys.stdin).get('overlap',[])))" 2>/dev/null || echo "")" "写集重叠"
    return 1
  fi

  local st
  st=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status','pass'))" 2>/dev/null || echo "pass")
  if [ "$st" = "skip" ]; then
    local reason
    reason=$(echo "$result" | python3 -c "import json,sys; print(json.load(sys.stdin).get('reason',''))" 2>/dev/null || echo "解析跳过")
    fail_open_skip "$da/$db" "$reason"
    return 0
  fi
  echo "  ✅ 写集零交集 ($(echo "$result" | python3 -c "import json,sys; d=json.load(sys.stdin); print(f\"{d.get('count_a',0)} vs {d.get('count_b',0)}\")" 2>/dev/null || echo "?") 条目)"
  emit_json "pass" "$da" "$db" "[]" ""
  return 0
}

# ── 模式分发 ──
echo "── verify-parallel (D311): 并行声明物理验证 ──"

BLOCKED=0

if [ "$MODE" = "pair" ]; then
  compare_docs "$DOC_A" "$DOC_B" || BLOCKED=1

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
    compare_docs "$DOC_A" "$DEP_DOC" || BLOCKED=1
  done

elif [ "$MODE" = "today" ]; then
  # 今日全部 dev doc 两两比对
  TODAY=$(date +%Y-%m-%d)
  DOCS=$(find "$IMPL_DIR" -name "SYNOVA-IMPL-*.md" -newermt "$TODAY 00:00:00" 2>/dev/null | sort || true)
  if [ -z "$DOCS" ]; then
    echo "  ✅ 今日无 dev doc — 跳过"
    exit 0
  fi
  mapfile -t DOC_ARR <<< "$DOCS"
  for ((i = 0; i < ${#DOC_ARR[@]}; i++)); do
    for ((j = i + 1; j < ${#DOC_ARR[@]}; j++)); do
      compare_docs "${DOC_ARR[$i]}" "${DOC_ARR[$j]}" || BLOCKED=1
    done
  done
else
  echo "用法: verify-parallel.sh --doc-a <a> --doc-b <b> | --check-declared <doc> | --scan-today [--json]" >&2
  exit 0
fi

if [ "$BLOCKED" -eq 1 ]; then
  echo ""
  echo "  ❌ 并行声明验证未通过 — 存在写集重叠，禁止并行"
  exit 1
fi
echo "  ✅ 并行声明验证通过"
exit 0
