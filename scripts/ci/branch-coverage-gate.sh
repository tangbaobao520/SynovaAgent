#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# branch-coverage-gate.sh — D704 (K3 W-3) 改动文件 branch 覆盖准出门禁
#
# 契约（铁律 47）:
#   @input  $1 = vitest json-summary 报告路径（默认 coverage/coverage-summary.json）
#           $2 = 改动文件清单文件路径（每行一个，缺省 = git diff --name-only
#                --diff-filter=d origin/main...HEAD）
#           env BRANCH_COVERAGE_MIN    阈值，默认 80；仅 ^[0-9]+([.][0-9]+)?$ 合法，
#                                      非法值 fail-closed exit 1（不静默回退）
#           env BRANCH_COVERAGE_ROOT   改动文件解析根（默认 $PWD；CI = 仓库根；
#                                      测试注入沙箱根）
#   @output 逐文件判定行（✓ 达标 / ☑ 豁免+理由 / ✗ 点名+原因）+ 末行摘要
#   @exit   0 = 全部达标（或无 src/**/*.ts 判定对象）；1 = 任一失败（fail-closed）：
#             报告缺失 / JSON 损坏 / 改动文件 branches < 阈值 / 不在报告（按 0%）/
#             报告条目缺 branches 字段（按 0%）/ 阈值 env 非法
#   @degraded 工作区不存在的改动文件（已删除）→ 打印跳过行，不参与判定（铁律 11 不静默）
#
# 豁免语法: 改动文件内任意行含 `branch-coverage-exempt: <理由>` → 跳过该文件并
#           打印理由（不静默）。豁免是显式声明，闸门输出必须可见。
#
# coverage.exclude 镜像（同步源: vitest.config.ts coverage.exclude，改动彼处必须
# 同步此处，反之亦然）: src/tui/** src/tools/** src/skills/** src/monitoring/**
# src/cli.ts src/setup.ts —— 这些文件不在 vitest 报告中属预期，不判 0%。
#
# 实证依据（clone 全量 --coverage 实跑 580 文件, 2026-09-13）:
#   json-summary key 为平台相关绝对路径（Win 反斜杠 / CI POSIX）→ 本脚本归一化
#   （反斜杠→斜杠、大小写折叠）后按「仓库相对路径后缀」匹配；零分支文件 pct=100。
#
# 消费方: .github/workflows/ci.yml coverage 准出步骤（D704）
# ═══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

REPORT="${1:-coverage/coverage-summary.json}"
LIST_ARG="${2:-}"
MIN="${BRANCH_COVERAGE_MIN:-80}"
ROOT="${BRANCH_COVERAGE_ROOT:-$PWD}"

# python 解析（json-summary 是 JSON，bash 无解析能力）；双候选回退，全缺 → fail-closed
PYBIN="$(command -v python3 || command -v python || true)"
if [ -z "$PYBIN" ]; then
  echo "✗ [D704] python 不可用（json-summary 需 JSON 解析）→ fail-closed" >&2
  exit 1
fi

# 阈值合法性: 非法 env 必须 fail-closed（静默回退默认 = 门禁口径被注入方偷换）
if ! [[ "$MIN" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "✗ [D704] BRANCH_COVERAGE_MIN 非法（$MIN）→ fail-closed" >&2
  exit 1
fi

# 报告存在性: 缺失即红（fail-closed）——没有报告 = 没有证据 = 不准出
if [ ! -f "$REPORT" ]; then
  echo "✗ [D704] coverage 报告缺失: $REPORT → fail-closed（先跑 npx vitest run --coverage --coverage.reporter=json-summary）" >&2
  exit 1
fi

# 改动清单: 显式入参优先；缺省走 git diff（排除已删除文件，删除无需覆盖）
CLEANUP_LIST=0
if [ -n "$LIST_ARG" ]; then
  LIST_FILE="$LIST_ARG"
else
  LIST_FILE="$(mktemp)"
  CLEANUP_LIST=1
  if ! git diff --name-only --diff-filter=d origin/main...HEAD > "$LIST_FILE" 2>/dev/null; then
    echo "✗ [D704] 无法获取改动清单（git diff origin/main...HEAD 失败；缺 origin/main ref?）→ fail-closed" >&2
    rm -f "$LIST_FILE"
    exit 1
  fi
fi

RC=0
# swallow-ok: python exit 1 是判定失败（业务信号），经 || RC=$? 显式承接不触发 set -e
"$PYBIN" - "$REPORT" "$LIST_FILE" "$MIN" "$ROOT" <<'PYEOF' || RC=$?
import json, os, sys

report_path, list_path, min_s, root = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
MIN = float(min_s)

try:
    with open(report_path, encoding="utf-8") as f:
        report = json.load(f)
except Exception as e:  # JSON 损坏/编码失败 → fail-closed（铁律 24: 不空吞，显式红）
    print(f"✗ [D704] coverage 报告损坏（fail-closed）: {report_path} — {e}")
    sys.exit(1)
if not isinstance(report, dict) or not report:
    print(f"✗ [D704] coverage 报告结构非法（fail-closed）: {report_path}")
    sys.exit(1)

# key 索引: 归一化（反斜杠→斜杠、小写）后按仓库相对路径后缀匹配
# （实证: vitest json-summary key 为平台相关绝对路径）
index = []
for k, v in report.items():
    if k == "total":
        continue
    index.append((k.replace("\\", "/").lower().rstrip("/"), v))

def find_entry(rel):
    n = rel.lower()
    for nk, v in index:
        if nk == n or nk.endswith("/" + n):
            return v
    return None

# coverage.exclude 六组镜像（同步源: vitest.config.ts coverage.exclude）
EXCLUDED_PREFIXES = ("src/tui/", "src/tools/", "src/skills/", "src/monitoring/")
EXCLUDED_EXACT = ("src/cli.ts", "src/setup.ts")

with open(list_path, encoding="utf-8") as f:
    raw = [ln.strip().replace("\\", "/") for ln in f]
files, seen = [], set()
for p in raw:
    if not p or p.startswith("#"):
        continue
    while p.startswith("./"):
        p = p[2:]
    if p not in seen:
        seen.add(p)
        files.append(p)

judged = [p for p in files
          if p.startswith("src/") and p.endswith(".ts")
          and not p.startswith(EXCLUDED_PREFIXES) and p not in EXCLUDED_EXACT]

if not judged:
    print("— [D704] 改动清单无 src/**/*.ts 判定对象（非 src 路径或 coverage.exclude 六组镜像全跳过）→ 准出通过（vacuous）")
    sys.exit(0)

fails, passes = [], 0
for rel in judged:
    disk = os.path.join(root, rel)
    if not os.path.isfile(disk):
        # git diff --diff-filter=d 已排删除；显式清单中的消失文件同样跳过（降级可见）
        print(f"— [D704] {rel} 工作区不存在（已删除）→ 跳过")
        continue
    try:
        with open(disk, encoding="utf-8", errors="replace") as f:
            text = f.read()
    except OSError as e:
        print(f"— [D704] {rel} 读取失败（{e}）→ 跳过")
        continue
    if "branch-coverage-exempt:" in text:
        reason = ""
        for line in text.splitlines():
            if "branch-coverage-exempt:" in line:
                reason = line.split("branch-coverage-exempt:", 1)[1].strip()
                break
        print(f"☑ [D704 豁免] {rel}: {reason or '(未写理由)'}")
        continue
    entry = find_entry(rel)
    if entry is None:
        fails.append((rel, "未被任何测试加载（不在 coverage 报告中）→ 按 0% 判定"))
        continue
    br = entry.get("branches")
    if not isinstance(br, dict):
        fails.append((rel, "coverage 报告条目缺 branches 字段 → 按 0% 判定"))
        continue
    pct = br.get("pct", 0)
    try:
        pct = float(pct)
    except (TypeError, ValueError):
        fails.append((rel, f"branches.pct 非法（{pct!r}）→ 按 0% 判定"))
        continue
    if pct < MIN:
        fails.append((rel, f"branches {pct:g}% < 阈值 {MIN:g}%"))
    else:
        passes += 1
        print(f"✓ [D704] {rel} branches {pct:g}% ≥ {MIN:g}%")

if fails:
    print(f"✗ [D704] branch 覆盖准出失败: {len(fails)} 文件不达标（阈值 ≥ {MIN:g}%）:")
    for rel, why in fails:
        print(f"    - {rel}: {why}")
    sys.exit(1)
print(f"✅ [D704] branch 覆盖准出通过: {passes} 改动文件全达标（阈值 ≥ {MIN:g}%）")
sys.exit(0)
PYEOF

[ "$CLEANUP_LIST" -eq 1 ] && rm -f "$LIST_FILE"
exit "$RC"
