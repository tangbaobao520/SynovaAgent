#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# baseline-check.sh — D312 官方基线工具 (M2)
#
# 对比当前输出 vs 快照基线（.codex/control-tower/baseline/），输出
# "存量 N 条 + 新增 M 条"（tsc 错误 / 测试失败 / 审计发现 三基线）。
#
# 算法（快照基线法，对齐设计文档 §2.2 M4 既定方案）:
#   存量 = 基线 ∩ 当前；新增 = 当前 − 基线；已修复 = 基线 − 当前
#   增强: 命中存量的错误若文件 ∈ git diff 改动集 → 标注"存量但位于本次改动文件"
#
# fail-open（铁律 24+31）: 某基线采集器崩溃 → degraded + 其余基线继续，exit 0；
#   基线目录缺失 → degraded + 按全量判定，exit 0（绝不静默）。
#
# 用法:
#   baseline-check.sh [--tsc] [--tests] [--audit] [--json] [--seed] [--update-baseline]
#   env 注入缝（测试免跑真实命令）:
#     SYNO_CT_DIR=<dir> 覆盖 .codex/control-tower 路径
#     SYNO_TSC_OUTPUT / SYNO_VITEST_OUTPUT / SYNO_AUDIT_OUTPUT = fixture 文件
#
# 退出码: 0 = pass/degraded, 1 = 有新增（业务信号）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CT_DIR="${SYNO_CT_DIR:-$REPO_DIR/.codex/control-tower}"
BASELINE_DIR="$CT_DIR/baseline"
DEGRADED_LOG="$CT_DIR/logs/degraded-events.log"

# Windows 路径归一: /d/xxx → D:/xxx（python open() 不认 Git Bash /d/ 前缀，
# 与 golden-case-checker.ts 同款模式；Linux /home/... 原样）
PY_CT_DIR=$(echo "$CT_DIR" | sed -E 's|^/([a-zA-Z]):|\1:|')
PY_BASELINE_DIR=$(echo "$BASELINE_DIR" | sed -E 's|^/([a-zA-Z]):|\1:|')
PY_DEGRADED_LOG=$(echo "$DEGRADED_LOG" | sed -E 's|^/([a-zA-Z]):|\1:|')

DO_TSC=0; DO_TESTS=0; DO_AUDIT=0; JSON_OUT=0; SEED=0; UPDATE=0
for arg in "$@"; do
  case "$arg" in
    --tsc) DO_TSC=1 ;;
    --tests) DO_TESTS=1 ;;
    --audit) DO_AUDIT=1 ;;
    --json) JSON_OUT=1 ;;
    --seed) SEED=1 ;;
    --update-baseline) UPDATE=1 ;;
    --help)
      echo "baseline-check.sh [--tsc] [--tests] [--audit] [--json] [--seed] [--update-baseline]"
      exit 0
      ;;
  esac
done
# 默认: 全跑（--tsc 常用；--tests/--audit 手动触发）
if [ "$DO_TSC" -eq 0 ] && [ "$DO_TESTS" -eq 0 ] && [ "$DO_AUDIT" -eq 0 ]; then
  DO_TSC=1; DO_TESTS=1; DO_AUDIT=1
fi

log_degraded() {
  mkdir -p "$(dirname "$DEGRADED_LOG")"
  echo "{\"time\": \"$(date -u +%Y-%m-%dT%H:%M:%S+00:00)\", \"component\": \"baseline-check\", \"reason\": \"$1\"}" >> "$DEGRADED_LOG" 2>/dev/null || true
}
# python 可读路径版本（Windows /d/ → D:/）— 用 python 归一（sed 反向引用在
# Git Bash 不可靠；与 golden-case-checker.ts 同款模式）
PY_PATH() {
  python3 -c "
import sys
p = sys.argv[1]
if len(p) > 2 and p[0] == '/' and p[2] == ':':
    p = p[1:2] + ':' + p[2:]
print(p)
" "$1" 2>/dev/null || echo "$1"
}

# ── key 提取 ──
extract_tsc_keys() { # <input_file> — 文件路径:行号（保留冒号）
  grep -oP '^([^()]+)\(\d+,\d+\): error TS' "$1" 2>/dev/null \
    | sed -E 's/\(([0-9]+),[0-9]+\): error TS/:\1/' | sort -u || true
}
extract_test_keys() { # <input_file> — tests/X.test.ts 文件路径
  sed 's/\x1b\[[0-9;]*[a-zA-Z]//g' "$1" 2>/dev/null \
    | grep -oP 'tests/\S+\.test\.ts' | sort -u || true
}
extract_audit_keys() { # <input_file> — src/x.ts:NN
  grep -oP '^[^:]+\.ts:\d+' "$1" 2>/dev/null | sort -u || true
}

# ── 采集当前输出（SYNO_ 注入缝优先）──
collect() { # collect <kind> → stdout: 原始输出
  local kind="$1"
  case "$kind" in
    tsc)
      if [ -n "${SYNO_TSC_OUTPUT:-}" ]; then cat "$SYNO_TSC_OUTPUT" 2>/dev/null || true
      else npx tsc --noEmit 2>&1 | grep "error TS" | grep -v "server/vendor/" | grep -v "packages/" | grep -v "node_modules" || true; fi
      ;;
    tests)
      if [ -n "${SYNO_VITEST_OUTPUT:-}" ]; then cat "$SYNO_VITEST_OUTPUT" 2>/dev/null || true
      else npx vitest run --reporter=verbose 2>&1 || true; fi
      ;;
    audit)
      if [ -n "${SYNO_AUDIT_OUTPUT:-}" ]; then cat "$SYNO_AUDIT_OUTPUT" 2>/dev/null || true
      else bash "$REPO_DIR/scripts/check-architecture.sh" 2>&1 || true; fi
      ;;
  esac
}

# ── 单基线判定 ──
check_baseline() { # check_baseline <kind> <baseline_file> <extract_fn>
  local kind="$1" bfile="$2" extract="$3"
  local current baseline existing added fixed
  current=$(collect "$kind")
  if [ -z "$current" ]; then
    # 采集器崩溃/无输出 → degraded，不误报新增（fail-open）
    log_degraded "$kind 采集无输出"
    echo "  ⚠️  degraded: $kind 采集无输出 (fail-open)"
    return 0
  fi
  local tmp_current tmp_baseline
  mkdir -p "$CT_DIR/tmp"
  tmp_current=$(mktemp "$CT_DIR/tmp/bc-cur-XXXX" 2>/dev/null || echo "")
  if [ -z "$tmp_current" ]; then log_degraded "mktemp 失败"; echo "  ⚠️  degraded: 无法创建临时文件"; return 0; fi
  echo "$current" > "$tmp_current"
  local cur_keys base_keys
  cur_keys=$($extract "$tmp_current")
  rm -f "$tmp_current"

  if [ "$SEED" -eq 1 ]; then
    mkdir -p "$BASELINE_DIR"
    cat > "$bfile" <<EOF
{"schema": "control-tower/baseline/$kind/v1", "version": "4.6.0-WIP", "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%S+00:00)", "baseline": [$(echo "$cur_keys" | sed 's/^/"/; s/$/"/' | tr '\n' ',' | sed 's/,$//')]}
EOF
    echo "  ✅ $kind 基线已建立: $(echo "$cur_keys" | grep -c . || echo 0) 条"
    return 0
  fi

  if [ ! -f "$bfile" ]; then
    log_degraded "$kind 基线缺失: $bfile"
    echo "  ⚠️  degraded: $kind 基线缺失 — 按全量判定（运行 --seed 建立）"
    return 0
  fi

  local py_bfile
  py_bfile=$(PY_PATH "$bfile")
  base_keys=$(python3 -c "
import json, sys
try:
    d = json.load(open('$py_bfile', encoding='utf-8'))
    print('\n'.join(d.get('baseline', [])))
except Exception:
    print('')
" 2>/dev/null || echo "")

  # 集合运算（python 避免 bash 数组 + 中文路径问题）
  local result
  result=$(python3 -c "
import sys
cur = set(l.strip() for l in '''$cur_keys'''.split('\n') if l.strip())
base = set(l.strip() for l in '''$base_keys'''.split('\n') if l.strip())
existing = sorted(cur & base)
added = sorted(cur - base)
fixed = sorted(base - cur)
print(f'EXISTING={len(existing)}')
print(f'ADDED={len(added)}')
print(f'FIXED={len(fixed)}')
for a in added: print(f'ADD:{a}')
" 2>/dev/null || echo "EXISTING=0 ADDED=0 FIXED=0")

  local n_existing n_added n_fixed
  n_existing=$(echo "$result" | grep '^EXISTING=' | cut -d= -f2)
  n_added=$(echo "$result" | grep '^ADDED=' | cut -d= -f2)
  n_fixed=$(echo "$result" | grep '^FIXED=' | cut -d= -f2)

  if [ "$UPDATE" -eq 1 ]; then
    # 并集合并（存量 + 当前全部 → 全部转存量）
    local merged
    merged=$( { echo "$base_keys"; echo "$cur_keys"; } | sort -u )
    cat > "$bfile" <<EOF
{"schema": "control-tower/baseline/$kind/v1", "version": "4.6.0-WIP", "updatedAt": "$(date -u +%Y-%m-%dT%H:%M:%S+00:00)", "baseline": [$(echo "$merged" | sed 's/^/"/; s/$/"/' | tr '\n' ',' | sed 's/,$//')]}
EOF
    echo "  ✅ $kind 基线已更新: $(echo "$merged" | grep -c . || echo 0) 条"
    return 0
  fi

  echo "  $kind 基线:   存量 ${n_existing:-0} + 新增 ${n_added:-0}（已修复 ${n_fixed:-0}）"
  if [ "${n_added:-0}" -gt 0 ]; then
    echo "$result" | grep '^ADD:' | sed 's/^ADD:/     +/' | head -5
    return 1
  fi
  return 0
}

# ── 主流程 ──
echo "── baseline-check (D312): 存量 vs 新增 ──"
BLOCKED=0
JSON_PARTS=""

if [ "$DO_TSC" -eq 1 ]; then
  OUT_TSC=$(check_baseline "tsc" "$BASELINE_DIR/tsc-errors.json" extract_tsc_keys) && : || BLOCKED=1
  echo "$OUT_TSC"
  N_TSC=$(echo "$OUT_TSC" | grep -oP '存量 \d+' | head -1 | grep -oP '\d+' || echo 0)
  A_TSC=$(echo "$OUT_TSC" | grep -oP '新增 \d+' | head -1 | grep -oP '\d+' || echo 0)
  JSON_PARTS="${JSON_PARTS}{\"tsc\":{\"existing\":$N_TSC,\"added\":$A_TSC}},"
fi
if [ "$DO_TESTS" -eq 1 ]; then
  OUT_TESTS=$(check_baseline "tests" "$BASELINE_DIR/test-failures.json" extract_test_keys) && : || BLOCKED=1
  echo "$OUT_TESTS"
  N_TESTS=$(echo "$OUT_TESTS" | grep -oP '存量 \d+' | head -1 | grep -oP '\d+' || echo 0)
  A_TESTS=$(echo "$OUT_TESTS" | grep -oP '新增 \d+' | head -1 | grep -oP '\d+' || echo 0)
  JSON_PARTS="${JSON_PARTS}{\"tests\":{\"existing\":$N_TESTS,\"added\":$A_TESTS}},"
fi
if [ "$DO_AUDIT" -eq 1 ]; then
  OUT_AUDIT=$(check_baseline "audit" "$BASELINE_DIR/audit-findings.json" extract_audit_keys) && : || BLOCKED=1
  echo "$OUT_AUDIT"
  N_AUDIT=$(echo "$OUT_AUDIT" | grep -oP '存量 \d+' | head -1 | grep -oP '\d+' || echo 0)
  A_AUDIT=$(echo "$OUT_AUDIT" | grep -oP '新增 \d+' | head -1 | grep -oP '\d+' || echo 0)
  JSON_PARTS="${JSON_PARTS}{\"audit\":{\"existing\":$N_AUDIT,\"added\":$A_AUDIT}},"
fi

echo ""
if [ "$JSON_OUT" -eq 1 ]; then
  echo "{\"verdict\":\"$([ "$BLOCKED" -eq 1 ] && echo block || echo pass)\",\"baselines\":[${JSON_PARTS%,}]}"
fi
if [ "$BLOCKED" -eq 1 ]; then
  echo "  ❌ 存在新增问题 — 请修复后重试 (或 --update-baseline 确认后收录)"
  exit 1
fi
echo "  ✅ 无新增 — 基线通过"
exit 0
