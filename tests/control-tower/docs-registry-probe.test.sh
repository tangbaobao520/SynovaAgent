#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# docs-registry-probe.test.sh — docs-registry-probe.sh 配对测试（U7/CT-40）
#
# 覆盖矩阵（铁律 48: 正常 / 降级 / 边界 三路径）:
#   正常  ① 面内文档全部已登记 → exit 0
#   降级  ② 台账缺失 → exit 2（fail-closed）
#         ③ 判定面内零文档 → exit 2（零面不可判定为一致）
#         ④ 非 git 目录 → exit 2
#   边界  ⑤ 面内新增未登记文档 → DRIFT exit 1 且**逐条点名**
#         ⑥ EXCLUDE 生效（audit-reports 下的未登记 .md 不计入）→ exit 0
#         ⑦ basename 命中即视为已登记（与登记门禁同款语义）→ exit 0
#         ⑧ --list 只打印清单、不打印报告体
#         ⑨ --prefixes 覆盖判定面生效（面外面文档不计入）
#   接线  ⑩ 探针落在 scripts/control-tower/probes/*-probe.sh（daily-cto-board 通用 runner 的发现面）
#
# 零真实仓库污染: 全部在 mktemp -d 沙箱内 git init + git add；trap 清理；不写仓库任何文件。
# 方言无关: 无 sed -i / 无 GNU \+ / PYBIN 三级探测（禁裸 python3）。
# ═══════════════════════════════════════════════════════════════════════════════
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PROBE="$ROOT/scripts/control-tower/probes/docs-registry-probe.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ❌ $1"; }
assert_eq() { if [ "$2" = "$3" ]; then ok "$1（= $2）"; else bad "$1: 期望 '$3'，实际 '$2'"; fi; }
assert_contains() { case "$2" in *"$3"*) ok "$1" ;; *) bad "$1: 输出未包含 '$3'" ;; esac; }

SB="$(mktemp -d "${TMPDIR:-/tmp}/d973-dr.XXXXXX")" || { echo "❌ mktemp 失败"; exit 1; }
trap 'rm -rf "$SB"' EXIT

mk_repo() { # mk_repo <目录> —— 建沙箱 git 仓
  d="$1"
  mkdir -p "$d"
  git -C "$d" init -q >/dev/null 2>&1 || true
}

add_doc() { # add_doc <目录> <相对路径> —— 写入文件并 git add（ls-files 需在索引中）
  d="$1"; rel="$2"
  mkdir -p "$d/$(dirname "$rel")"
  printf '# stub for probe test\n' > "$d/$rel"
  git -C "$d" add -A >/dev/null 2>&1 || true
}

echo "── docs-registry-probe 配对测试 ──"
echo "  探针: ${PROBE}"
if [ ! -f "$PROBE" ]; then
  echo "  ❌ 探针不存在"
  exit 1
fi

# ── ① 正常：面内文档已登记 ──
R1="$SB/r1"
mk_repo "$R1"
add_doc "$R1" "docs/authority/PRD.md"
add_doc "$R1" "docs/synova/coordination/CTO-看板-自动.md"
printf 'documents:\n  - id: DOC-0001\n    type: prd\n    path: docs/authority/PRD.md\n    status: draft\n    owner: DSH\n  - id: DOC-0002\n    type: status\n    path: docs/synova/coordination/CTO-看板-自动.md\n    status: active\n    owner: mac\n' > "$R1/docs/authority/DOCS-REGISTRY.yaml"
OUT1="$(bash "$PROBE" --repo-root "$R1" --registry "$R1/docs/authority/DOCS-REGISTRY.yaml" 2>&1)"
RC1=$?
assert_eq "① 全部已登记 exit 0" "$RC1" "0"
assert_contains "① 输出含一致" "$OUT1" "登记一致"
assert_contains "① 输出面内计数" "$OUT1" "面内文档数 = 2"

# ── ⑤ 边界：面内新增未登记文档 → DRIFT ──
add_doc "$R1" "docs/synova/product-lines/evidence/D999-未登记.md"
OUT5="$(bash "$PROBE" --repo-root "$R1" --registry "$R1/docs/authority/DOCS-REGISTRY.yaml" 2>&1)"
RC5=$?
assert_eq "⑤ 有未登记 exit 1" "$RC5" "1"
assert_contains "⑤ 输出含 DRIFT" "$OUT5" "DRIFT"
assert_contains "⑤ 逐条点名未登记文件" "$OUT5" "D999-未登记.md"

# ── ⑦ 边界：目录条目（尾 /）覆盖其下文档 → 已登记 ──
printf 'documents:\n  - id: DOC-0001\n    type: prd\n    path: docs/authority/PRD.md\n    status: draft\n    owner: DSH\n  - id: DOC-0002\n    type: status\n    path: docs/synova/coordination/CTO-看板-自动.md\n    status: active\n    owner: mac\n  - id: DOC-0003\n    type: status\n    path: docs/synova/product-lines/evidence/\n    status: archived\n    owner: mac\n' > "$R1/docs/authority/DOCS-REGISTRY.yaml"
OUT7="$(bash "$PROBE" --repo-root "$R1" --registry "$R1/docs/authority/DOCS-REGISTRY.yaml" 2>&1)"
RC7=$?
assert_eq "⑦ 目录条目覆盖其下文档 → exit 0" "$RC7" "0"

# ── ⑦b 边界：仅正文提及 basename ≠ 已登记（反「子串误判」）──
# 依据 D973 实证: 子串匹配会让 `evidence/README.md` 因 D:/ 遗留条目里的 "README.md" 子串被误判已登记
printf 'documents:\n  - id: DOC-0001\n    type: prd\n    path: docs/authority/PRD.md\n    status: draft\n    owner: DSH\n  - id: DOC-0002\n    type: status\n    path: docs/synova/coordination/CTO-看板-自动.md\n    status: active\n    owner: mac\n  # 正文提及 D999-未登记.md 但未声明其 path\n' > "$R1/docs/authority/DOCS-REGISTRY.yaml"
OUT7B="$(bash "$PROBE" --repo-root "$R1" --registry "$R1/docs/authority/DOCS-REGISTRY.yaml" 2>&1)"
RC7B=$?
assert_eq "⑦b 仅正文提及 ≠ 已登记 → exit 1" "$RC7B" "1"
assert_contains "⑦b 输出仍点名该文件" "$OUT7B" "D999-未登记.md"

# ── ⑥ 边界：EXCLUDE 生效（audit-reports 不计入面）──
R6="$SB/r6"
mk_repo "$R6"
add_doc "$R6" "docs/authority/PRD.md"
add_doc "$R6" "docs/synova/audit-reports/未登记的审计报告.md"
printf 'documents:\n  - id: DOC-0001\n    type: prd\n    path: docs/authority/PRD.md\n    status: draft\n    owner: DSH\n' > "$R6/docs/authority/DOCS-REGISTRY.yaml"
OUT6="$(bash "$PROBE" --repo-root "$R6" --registry "$R6/docs/authority/DOCS-REGISTRY.yaml" 2>&1)"
RC6=$?
assert_eq "⑥ audit-reports 被排除 → exit 0" "$RC6" "0"
assert_contains "⑥ 面内只计 1 份" "$OUT6" "面内文档数 = 1"

# ── ⑨ 边界：--prefixes 覆盖判定面 ──
OUT9="$(bash "$PROBE" --repo-root "$R6" --registry "$R6/docs/authority/DOCS-REGISTRY.yaml" --prefixes "docs/synova/audit-reports/" 2>&1)"
RC9=$?
assert_eq "⑨ 面板改到 audit-reports 后 exit 2（EXCLUDE 使其为零面）" "$RC9" "2"

# ── ⑧ 边界：--list 只改输出形态，**退出码语义与不带 --list 完全一致**（D973 退修）──
add_doc "$R6" "docs/authority/未登记.md"
OUT8="$(bash "$PROBE" --repo-root "$R6" --registry "$R6/docs/authority/DOCS-REGISTRY.yaml" --list 2>&1)"
RC8=$?
assert_eq "⑧ --list 有未登记 → exit 1（与不带 --list 同码）" "$RC8" "1"
assert_contains "⑧ --list 打印未登记路径" "$OUT8" "docs/authority/未登记.md"
case "$OUT8" in
  *"判定面内"*) bad "⑧ --list 不应打印报告体" ;;
  *) ok "⑧ --list 未打印报告体" ;;
esac
# ⑧b --list 在无未登记时 → exit 0 且清单为空
R8B="$SB/r8b"
mk_repo "$R8B"
add_doc "$R8B" "docs/authority/PRD.md"
printf 'documents:\n  - id: DOC-0001\n    type: prd\n    path: docs/authority/PRD.md\n    status: draft\n    owner: DSH\n' > "$R8B/docs/authority/DOCS-REGISTRY.yaml"
OUT8B="$(bash "$PROBE" --repo-root "$R8B" --registry "$R8B/docs/authority/DOCS-REGISTRY.yaml" --list 2>&1)"
RC8B=$?
assert_eq "⑧b --list 无未登记 → exit 0" "$RC8B" "0"
assert_eq "⑧b 清单为空" "$OUT8B" ""
# ⑧c 回归守卫：同一状态下 --list 与不带 --list 必须同码（防「--list 例外」复发）
OUT8N="$(bash "$PROBE" --repo-root "$R6" --registry "$R6/docs/authority/DOCS-REGISTRY.yaml" 2>&1)"
RC8N=$?
assert_eq "⑧c --list 与不带 --list 同码（有未登记 = 1）" "$RC8N" "$RC8"

# ── ② 降级：台账缺失 → exit 2 ──
OUT2="$(bash "$PROBE" --repo-root "$R1" --registry "$SB/does-not-exist.yaml" 2>&1)"
RC2=$?
assert_eq "② 台账缺失 exit 2（fail-closed）" "$RC2" "2"
assert_contains "② 输出含 fail-closed" "$OUT2" "fail-closed"

# ── ③ 降级：判定面内零文档 → exit 2 ──
R3="$SB/r3"
mk_repo "$R3"
printf 'documents: []\n' > "$R3/reg.yaml"
OUT3="$(bash "$PROBE" --repo-root "$R3" --registry "$R3/reg.yaml" 2>&1)"
RC3=$?
assert_eq "③ 零面 exit 2" "$RC3" "2"
assert_contains "③ 输出说明零面" "$OUT3" "零文档"

# ── ④ 降级：非 git 目录 → exit 2 ──
NOGIT="$SB/not-a-repo"
mkdir -p "$NOGIT"
printf 'documents: []\n' > "$R1/../reg4.yaml" 2>/dev/null || true
OUT4="$(bash "$PROBE" --repo-root "$NOGIT" --registry "$R1/docs/authority/DOCS-REGISTRY.yaml" 2>&1)"
RC4=$?
assert_eq "④ 非 git 目录 exit 2" "$RC4" "2"
assert_contains "④ 输出含 fail-closed" "$OUT4" "fail-closed"

# ── ⑩ 接线 ──
case "$PROBE" in
  */scripts/control-tower/probes/*-probe.sh) ok "⑩ 探针路径符合 probes/*-probe.sh 发现面" ;;
  *) bad "⑩ 探针路径不符合发现面: ${PROBE}" ;;
esac

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 全部通过: $((PASS + FAIL)) 项（$PASS 通过 / 0 失败）"
  exit 0
fi
echo "❌ 失败 $FAIL 项 / 共 $((PASS + FAIL)) 项"
exit 1
