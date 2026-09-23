#!/bin/bash
# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═══════════════════════════════════════════════════════════════════════════════
# check-subprocess-protocol.sh — D924: 子进程输出协议检查器
#
# 背景: 子进程（curl 等）的 stdout 被当成**多语义通道**使用——把元数据（HTTP 状态码）
#   以哨兵标记追加到负载流（响应体）尾部，再用字符串分割还原。响应体一旦含该标记即解析错乱。
#   活证据（修复前）: scripts/golden-scenarios/common/assert.ts:101 / :109（见规范 §2）。
#
# 规范全文: docs/synova/coordination/规范-子进程输出协议-20260923.md
#
# 契约:
#   @input   — [--dir <路径>]（默认 = 脚本所在仓库根）; [--baseline <文件>]（默认 control-tower 下同名 .txt）;
#              [--verbose] 打印扫描文件清单
#              注入缝（测试用）: SYNO_SUBPROC_GREP / SYNO_SUBPROC_FIND 覆盖二进制路径
#   @output  — stdout: 命中清单（VIOLATION <文件>:<行> <规则> <说明>）+ 末行
#              "SUBPROCESS-PROTOCOL: OK|VIOLATION(n)"；--verbose 时附文件清单与计数
#   @exit    — 0 = 通过（无新增违规）; 1 = 命中违规（业务阻断）;
#              2 = 检查执行失败/降级（fail-closed，**绝不等同通过**，D328 三态）
#   @degraded— 扫描器不可用（不存在/不可执行/试运行失败）→ exit 2 + stderr "degraded: <原因>"
#              + 追加 <扫描根>/.codex/control-tower/logs/degraded-events.log（铁律 11 显式降级，不静默）
#   @error   — .code = SUBPROCESS_SCAN_UNAVAILABLE | SUBPROCESS_BASELINE_UNREADABLE
#              .phase = 'scan' | 'baseline' ; .retryable = 布尔
#
# 判定规则（二元判据，非空洞 grep）:
#   R1 哨兵混流     — 同一行含 curl 的写出口旗标（-w / --write-out）且引号内出现自定义哨兵
#                     （双下划线包裹的大写标识符）⇒ 元数据被拼进负载流
#   R2 哨兵分割解析 — 同一行按自定义哨兵做字符串分割（点 split / awk -F / IFS）⇒
#                     依赖"负载里不含哨兵"这一不可控假设
#   排除面（否则误报）:
#     EX1 —— 行含 bash here-string 记号: 那是**输入重定向**，不是子进程 stdout 捕获
#     EX2 —— 行含 -o / --output 旗标（R1 专用）: 负载已分流到文件，stdout 只剩元数据 = **合规形态**
#   本脚本自身与规范文档不命中: 规则用"哨兵"一词描述，不含字面触发串（自扫零命中，见夹具 §正常路径）
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

TARGET_DIR="$REPO_DIR"
BASELINE_FILE="$SCRIPT_DIR/subprocess-protocol-baseline.txt"
VERBOSE=0

while [ $# -gt 0 ]; do
  case "$1" in
    --dir)      TARGET_DIR="${2:-}"; shift 2 ;;
    --baseline) BASELINE_FILE="${2:-}"; shift 2 ;;
    --verbose)  VERBOSE=1; shift ;;
    -h|--help)  sed -n '5,42p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 2 ;;
  esac
done

GREP_BIN="${SYNO_SUBPROC_GREP:-grep}"
FIND_BIN="${SYNO_SUBPROC_FIND:-find}"

# 不变量: 哨兵 = 双下划线包裹的大写标识符
SENTINEL_ERE='__[A-Z][A-Z0-9_]*__'
# R1: curl 写出口模板含哨兵（元数据混入负载流）
PAT_R1="curl[^|]*(-w|--write-out)[^|]*['\"][^'\"]*${SENTINEL_ERE}"
# 排除 EX2: 同行出现 -o / --output 旗标（负载已分流 = 合规）
PAT_EX2="(^|[^[:alnum:]_])-o([[:space:]]|['\"]|$)|--output([[:space:]]|=|['\"]|$)"
# R2: 按哨兵做字符串分割解析
PAT_R2="\\.split\\(['\"][^'\"]*${SENTINEL_ERE}|awk[^|]*-F['\"]?[^'\"]*${SENTINEL_ERE}|IFS=['\"]?${SENTINEL_ERE}"

# ─── 降级探测（D328 P1-1: 只探存在性不探可用性 → 损坏 shim 静默漏拦） ───
degrade() {
  local code="$1" reason="$2"
  echo "degraded: $reason (code=$code phase=scan retryable=false)" >&2
  mkdir -p "$TARGET_DIR/.codex/control-tower/logs" 2>/dev/null || true
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)\", \"component\": \"check-subprocess-protocol\", \"code\": \"$code\", \"reason\": \"$reason\"}" \
    >> "$TARGET_DIR/.codex/control-tower/logs/degraded-events.log" 2>/dev/null || true
  exit 2
}

if ! command -v "$GREP_BIN" >/dev/null 2>&1; then
  degrade SUBPROCESS_SCAN_UNAVAILABLE "grep 不可用: $GREP_BIN"
fi
if ! command -v "$FIND_BIN" >/dev/null 2>&1; then
  degrade SUBPROCESS_SCAN_UNAVAILABLE "find 不可用: $FIND_BIN"
fi
# 试运行: 探可用性而非存在性（损坏 shim / 架构不符 / 权限缺失）
# 不吞 stderr: 损坏 shim 的报错应当可见（degrade 同时给出结构化降级码）
if ! printf 'probe\n' | "$GREP_BIN" -q 'probe'; then
  degrade SUBPROCESS_SCAN_UNAVAILABLE "grep 试运行失败（存在但不可用）: $GREP_BIN"
fi
if ! "$FIND_BIN" "$TARGET_DIR" -maxdepth 0 >/dev/null 2>&1; then
  degrade SUBPROCESS_SCAN_UNAVAILABLE "find 试运行失败或目标不可达: $FIND_BIN $TARGET_DIR"
fi
if [ ! -d "$TARGET_DIR" ]; then
  degrade SUBPROCESS_SCAN_UNAVAILABLE "扫描根目录不存在: $TARGET_DIR"
fi

# ─── baseline（ratchet: 只可缩短；键 = <相对路径>:<规则>） ───
BASELINE_KEYS=""
if [ -f "$BASELINE_FILE" ]; then
  BASELINE_KEYS=$(grep -v '^[[:space:]]*#' "$BASELINE_FILE" 2>/dev/null | grep -v '^[[:space:]]*$' | tr -d '\r' || true)
elif [ "$BASELINE_FILE" != "$SCRIPT_DIR/subprocess-protocol-baseline.txt" ]; then
  degrade SUBPROCESS_BASELINE_UNREADABLE "指定的 baseline 不存在: $BASELINE_FILE"
fi

in_baseline() {
  [ -z "$BASELINE_KEYS" ] && return 1
  printf '%s\n' "$BASELINE_KEYS" | grep -Fxq "$1"
}

# ─── 扫描面: 可执行源码（协议只约束代码，不约束文档引用） ───
FILES_LIST="$(mktemp)"
VIOLATION_TMP="$(mktemp)"
trap 'rm -f "$FILES_LIST" "$VIOLATION_TMP"' EXIT

"$FIND_BIN" "$TARGET_DIR" \
  \( -name .git -o -name node_modules -o -name vendor -o -name dist -o -name build -o -name '.synova-wt-*' -o -name '.codex' \) -prune -o \
  -type f \( -name '*.sh' -o -name '*.bash' -o -name '*.ts' -o -name '*.tsx' -o -name '*.js' \
             -o -name '*.mjs' -o -name '*.cjs' -o -name '*.py' -o -name '*.yml' -o -name '*.yaml' \) -print \
  > "$FILES_LIST" 2>/dev/null || degrade SUBPROCESS_SCAN_UNAVAILABLE "find 扫描失败: $TARGET_DIR"

FILE_COUNT=0
if [ -s "$FILES_LIST" ]; then
  FILE_COUNT=$(wc -l < "$FILES_LIST" | tr -d ' \n\r')
fi

ALLOWED=0
VIOLATIONS=0

# record <相对路径> <行号> <规则> <说明>
record() {
  local rel="$1" ln="$2" rule="$3" desc="$4"
  if in_baseline "$rel:$rule"; then
    ALLOWED=$((ALLOWED + 1)); return
  fi
  VIOLATIONS=$((VIOLATIONS + 1))
  printf 'VIOLATION  %s:%s  %s  %s\n' "$rel" "$ln" "$rule" "$desc" >> "$VIOLATION_TMP"
}

# scan_rule <文件> <相对路径> <正则> <规则> <说明> <是否应用 EX2>
scan_rule() {
  local f="$1" rel="$2" pat="$3" rule="$4" desc="$5" use_ex2="$6"
  local hits line ln
  # -H 强制文件名前缀（单文件调用时 grep 默认省略 → 行号会解析错位）
  hits=$("$GREP_BIN" -HInE "$pat" "$f" 2>/dev/null | tr -d '\r' || true)
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    # EX1: here-string 是输入重定向，不是子进程 stdout 捕获
    case "$line" in *'<<<'*) continue ;; esac
    # EX2: 负载已用 -o/--output 分流 → 合规形态
    if [ "$use_ex2" = "1" ] && printf '%s' "$line" | "$GREP_BIN" -qE "$PAT_EX2"; then
      ALLOWED=$((ALLOWED + 1)); continue
    fi
    ln="${line#*:}"; ln="${ln%%:*}"
    record "$rel" "$ln" "$rule" "$desc"
  done <<< "$hits"
}

while IFS= read -r f; do
  [ -z "$f" ] && continue
  rel="${f#"$TARGET_DIR"/}"
  [ "$VERBOSE" = "1" ] && echo "  scan  $rel"
  scan_rule "$f" "$rel" "$PAT_R1" "R1" "哨兵混流: curl 写出口模板含自定义哨兵（负载未分流）" 1
  scan_rule "$f" "$rel" "$PAT_R2" "R2" "哨兵分割解析: 依赖负载不含哨兵的不可控假设" 0
done < "$FILES_LIST"

BASELINE_COUNT=0
if [ -n "$BASELINE_KEYS" ]; then
  BASELINE_COUNT=$(printf '%s\n' "$BASELINE_KEYS" | grep -c . | tr -d ' \n\r' || true)
fi
[ -z "$BASELINE_COUNT" ] && BASELINE_COUNT=0

echo "[subprocess-protocol] dir=$TARGET_DIR files=$FILE_COUNT baseline=$BASELINE_COUNT"

if [ "$VIOLATIONS" -gt 0 ]; then
  cat "$VIOLATION_TMP"
  echo "SUBPROCESS-PROTOCOL: VIOLATION($VIOLATIONS)"
  echo "  修法: 负载与元数据分流——curl -o <临时文件> -w '%{http_code}'，body 读文件；禁止把元数据拼进 stdout 再分割。"
  echo "  规范: docs/synova/coordination/规范-子进程输出协议-20260923.md"
  exit 1
fi

echo "SUBPROCESS-PROTOCOL: OK (files=$FILE_COUNT, violations=0, exempted=$ALLOWED, baseline=$BASELINE_COUNT)"
exit 0
