#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════
# run-all.sh — GS 场景全量刷新入口（D512）
#
# 契约（dev doc SYNOVA-IMPL-DSH-D512 §3.5，铁律 47）:
#   @input  [--skip=<id,...>] [--dry-run]   （id 形如 gs01，不区分大小写）
#           --skip: 逗号分隔跳过场景（GS-01 等 D510 合并分批；GS-02/04 fail 可单跑复验）
#           --dry-run: 只打印执行计划（顺序 + skip + main sha），不实际跑——测试/CI 安全
#   @output 逐场景调用 GS-XX-*/run.sh（fresh-db → bootstrap → inject → 断言 → evidence）；
#           场景跑完后给该场景最新 evidence JSON 补 main_sha/refreshed_at（向后兼容 schema=1，
#           零改 assert.ts / evidence-writer.py——calc-progress.py 只读既有字段）
#   @exit   0 = 全部执行场景 exit 0；1 = 任一场景 fail（诚实汇总，不掩盖）
#   @degraded 单场景失败/跳过不阻断后续场景；evidence verdict 由 assert.ts 诚实记录
#             （fail 场景 verdict=fail——红线：不假装绿）
#   @error  无（逐场景独立退出码，汇总返回）
#
# 执行顺序（依赖/独立性排序，dev doc §5.2）:
#   GS-03/05 共享模式基准先行 → GS-02/04（独立复验）→ GS-06（loop 依赖）→ GS-07/08 → GS-01 最后
#   （GS-01 与 D510 交叉——D510 未合 main 时调用方应 --skip=gs01）
#
# 铁律 0-4: 场景 run.sh 内部走 fresh-db 临时库（bootstrap.ts 只接受系统临时区），
#           本入口绝不触碰 data/synova.db。
# 用法: bash scripts/golden-scenarios/run-all.sh [--skip=gs01] [--dry-run]
# ═══════════════════════════════════════════════════════════════════════════
# D313 M5 UTF-8 强制（Windows 子进程一致性）
# ⚠️ 绝不 export LC_ALL（2026-08-24 D512 实测）: macOS bash 3.2 在任何 UTF-8 locale 下
# 会把紧邻全角字符的 $var 解析进变量名（"$rc）" → "rc\ufffd: unbound variable" 中止脚本，
# 且 export 会毒化子场景 run.sh 同类写法）。python 子进程用 PYTHONIOENCODING 已够；
# 本脚本所有 $var 后紧跟多字节字符处一律用 ${var} 花括号形式。
export PYTHONIOENCODING=utf-8

set -uo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EVIDENCE_DIR="$SCRIPT_DIR/evidence"

SKIP=""
DRY_RUN=0
MAIN_SHA="$(cd "$SCRIPT_DIR" && git rev-parse --short HEAD 2>/dev/null || echo "unknown")"

# 执行顺序（dev doc §5.2）：共享基准先行，GS-01 最后（D510 交叉分批）
ORDER=(gs03 gs05 gs02 gs04 gs06 gs07 gs08 gs01)

for arg in "$@"; do
  case "$arg" in
    --skip=*) SKIP="${arg#*=}" ;;
    --dry-run) DRY_RUN=1 ;;
    *)
      echo "用法: $0 [--skip=gs01,gs07] [--dry-run]" >&2
      echo "未知参数: $arg" >&2
      exit 2
      ;;
  esac
done

# id（gs03）→ 场景目录（GS-03-capital-cycle）。前缀精确匹配，防 gs01 误配 gs010。
scenario_dir() {
  local id="$1" num
  num="$(echo "$id" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]' | sed 's/^gs0*//')"
  # swallow-ok: 目录探测——无匹配返回空是正常路径（调用方判空处理），非吞错
  printf '%s' "$(ls -d "$SCRIPT_DIR"/GS-*/ 2>/dev/null | grep -E "/GS-0*${num}-[^/]+/$" | head -1)"  # swallow-ok: 探测型——无匹配返回空由调用方判空处理
}

# 给某场景**本次产出**的 evidence JSON 补 main_sha/refreshed_at（向后兼容——不删既有字段）。
# 诚实性守卫（2026-08-24 D512 实测教训：场景中途崩溃未产出新证据时，ls -t 会选中旧证据
# 并把今天的 sha 盖上去 = 伪造新鲜度）：只接受文件名含今天日期的证据，绝不触碰历史证据。
inject_sha() {
  local id="$1" num f today
  num="$(echo "$id" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]' | sed 's/^gs0*//')"
  today="$(date +%Y-%m-%d)"
  # swallow-ok: 证据文件探测——本次未产出时返回空是正常路径（下方显式 ⚠ 提示），非吞错
  f="$(ls -t "$EVIDENCE_DIR"/GS-0*"${num}"-"$today".json 2>/dev/null | head -1)"  # swallow-ok: 探测型——无匹配返回空由下方显式 ⚠ 提示
  [ -z "$f" ] && { echo "  ⚠ $id 本次未产出 $today 证据——不补 main_sha，不触碰历史证据（诚实记录）" >&2; return 0; }
  python3 - "$f" "$MAIN_SHA" <<'PYEOF' || { echo "  ⚠ main_sha 注入失败（degraded——证据本体未动）" >&2; return 0; }
import json, sys, datetime
path, sha = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as fh:
    d = json.load(fh)
d["main_sha"] = sha
d["refreshed_at"] = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
with open(path, "w", encoding="utf-8") as fh:
    json.dump(d, fh, ensure_ascii=False, indent=2)
print(f"  ✓ main_sha={sha} 已注入 {path.rsplit('/', 1)[-1]}")
PYEOF
}

echo "════ GS 场景全量刷新（D512）main=$MAIN_SHA ════"
echo "计划顺序: ${ORDER[*]}"
echo "skip: ${SKIP:-<无>}"

if [ "$DRY_RUN" = 1 ]; then
  echo "[dry-run] 不实际执行。将跳过: ${SKIP:-<无>}"
  exit 0
fi

FAIL=0
RAN=0
for id in "${ORDER[@]}"; do
  case ",$SKIP," in *",$id,"*) echo "⏭ skip $id"; continue ;; esac
  dir="$(scenario_dir "$id")"
  if [ -z "$dir" ]; then
    echo "❌ $id 场景目录未找到（GS-0*-*/ 不存在）"
    FAIL=1
    continue
  fi
  echo "── $id ($(basename "$dir")) ──────────────────────"
  RAN=$((RAN + 1))
  if (cd "$SCRIPT_DIR" && bash "${dir}run.sh"); then
    echo "✅ $id PASS"
    inject_sha "$id"
  else
    rc=$?
    echo "❌ $id FAIL（exit=${rc}）——诚实 RED 记录，不假装绿"
    inject_sha "$id"
    FAIL=1
  fi
done

echo "════ 汇总: 执行 $RAN 个场景，总体 verdict: $([ $FAIL = 0 ] && echo PASS || echo FAIL) ════"
exit $FAIL
