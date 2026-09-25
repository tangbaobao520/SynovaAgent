#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# task-id-watermark-probe.test.sh — task-id-watermark-probe.sh 配对测试（U7/CT-40）
#
# 覆盖矩阵（铁律 48: 正常 / 降级 / 边界 三路径）:
#   正常  ① 水位与实测一致 → exit 0
#   降级  ② 水位文件缺失 → exit 2（fail-closed）
#         ③ 水位文件存在但无机器可读声明行 → exit 2
#   边界  ④ 声明低于实测 → DRIFT exit 1（撞号风险方向）
#         ⑤ 余量恰等于保留窗口 → exit 0
#         ⑥ 余量超保留窗口 1 → DRIFT exit 1（防手改虚高）
#         ⑦ 扫描面零号 → exit 2（零号不可判定为一致）
#         ⑧ --face refs 忽略本地工作树 / union 纳入本地（判别性）
#         ⑨ --emit 刷新声明值且保留 MANUAL 段（幂等可复跑）
#         ⑩ --emit 后自校验通过
#   接线  ⑪ 探针落在 scripts/control-tower/probes/*-probe.sh（daily-cto-board 通用 runner 的发现面）
#
# 零真实仓库污染: 全部在 mktemp -d 沙箱内 git init；trap 清理；不写仓库任何文件。
# 方言无关: 无 sed -i / 无 GNU \+ / PYBIN 三级探测（禁裸 python3）。
# ═══════════════════════════════════════════════════════════════════════════════
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PROBE="$ROOT/scripts/control-tower/probes/task-id-watermark-probe.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ✅ $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  ❌ $1"; }

assert_eq() { # assert_eq <名称> <实际> <期望>
  if [ "$2" = "$3" ]; then ok "$1（= $2）"; else bad "$1: 期望 '$3'，实际 '$2'"; fi
}
assert_contains() { # assert_contains <名称> <文本> <片段>
  case "$2" in
    *"$3"*) ok "$1" ;;
    *) bad "$1: 输出未包含 '$3'" ;;
  esac
}

SB="$(mktemp -d "${TMPDIR:-/tmp}/d1013-wm.XXXXXX")" || { echo "❌ mktemp 失败"; exit 1; }
cleanup() { rm -rf "$SB"; }
trap cleanup EXIT

mk_repo() { # mk_repo <目录> <D号...>  —— 建沙箱 git 仓并把 task-state 卡提交进去
  d="$1"; shift
  mkdir -p "$d/task-state"
  git -C "$d" init -q >/dev/null 2>&1 || true
  for n in "$@"; do
    printf '{"task_id":"D%s","title":"sandbox"}\n' "$n" > "$d/task-state/D${n}.json"
  done
  git -C "$d" add -A >/dev/null 2>&1 || true
  # 身份走 -c 一次性注入（PLATFORM-CHECKLIST §6: 禁 git config 持久写入）
  git -C "$d" -c user.email=test@test.local -c user.name=d1013-test \
      commit -qm "seed task-state" >/dev/null 2>&1 || true
}

write_wm() { # write_wm <文件> <号>
  printf '# 号段水位\n\n声明水位: D%s\n' "$2" > "$1"
}

echo "── task-id-watermark-probe 配对测试 ──"
echo "  探针: ${PROBE}"
if [ ! -f "$PROBE" ]; then
  echo "  ❌ 探针不存在"
  exit 1
fi

# ── ① 正常路径 ──
R1="$SB/r1"
mk_repo "$R1" 5
W1="$SB/w1.md"
write_wm "$W1" 5
OUT1="$(bash "$PROBE" --repo-root "$R1" --watermark "$W1" 2>&1)"
RC1=$?
assert_eq "① 一致时 exit 0" "$RC1" "0"
assert_contains "① 输出含『水位一致』" "$OUT1" "水位一致"
assert_contains "① 输出含实测值" "$OUT1" "实测最大号 = D5"

# ── ④ 边界: 声明低于实测 → DRIFT ──
W4="$SB/w4.md"
write_wm "$W4" 4
OUT4="$(bash "$PROBE" --repo-root "$R1" --watermark "$W4" 2>&1)"
RC4=$?
assert_eq "④ 声明<实测 exit 1" "$RC4" "1"
assert_contains "④ 输出含 DRIFT" "$OUT4" "DRIFT"

# ── ② 降级: 水位文件缺失 → exit 2 ──
OUT2="$(bash "$PROBE" --repo-root "$R1" --watermark "$SB/does-not-exist.md" 2>&1)"
RC2=$?
assert_eq "② 水位缺失 exit 2（fail-closed）" "$RC2" "2"
assert_contains "② 输出含 fail-closed" "$OUT2" "fail-closed"

# ── ③ 降级: 无机器可读声明行 → exit 2 ──
W3="$SB/w3.md"
printf '# 号段水位\n\n（只有人工段落，没有声明行）\n' > "$W3"
OUT3="$(bash "$PROBE" --repo-root "$R1" --watermark "$W3" 2>&1)"
RC3=$?
assert_eq "③ 无声明行 exit 2" "$RC3" "2"
assert_contains "③ 输出点名声明行" "$OUT3" "声明水位"

# ── ⑤⑥ 边界: 保留窗口 ──
W5="$SB/w5.md"
write_wm "$W5" 69
OUT5="$(SYNO_WATERMARK_HEADROOM=64 bash "$PROBE" --repo-root "$R1" --watermark "$W5" 2>&1)"
RC5=$?
assert_eq "⑤ 余量=64（窗口内）exit 0" "$RC5" "0"

W6="$SB/w6.md"
write_wm "$W6" 70
OUT6="$(SYNO_WATERMARK_HEADROOM=64 bash "$PROBE" --repo-root "$R1" --watermark "$W6" 2>&1)"
RC6=$?
assert_eq "⑥ 余量=65（超窗口）exit 1" "$RC6" "1"
assert_contains "⑥ 输出含 DRIFT" "$OUT6" "DRIFT"

# ── ⑦ 边界: 扫描面零号 → exit 2 ──
R7="$SB/r7"
mkdir -p "$R7/task-state"
git -C "$R7" init -q >/dev/null 2>&1 || true
W7="$SB/w7.md"
write_wm "$W7" 5
OUT7="$(bash "$PROBE" --repo-root "$R7" --watermark "$W7" 2>&1)"
RC7=$?
assert_eq "⑦ 零号扫描面 exit 2" "$RC7" "2"
assert_contains "⑦ 输出说明零号" "$OUT7" "没有任何"

# ── ⑧ 边界: --face refs 忽略本地工作树（判别性）──
R8="$SB/r8"
mk_repo "$R8" 5
printf '{"task_id":"D999","title":"uncommitted"}\n' > "$R8/task-state/D999.json"
W8="$SB/w8.md"
write_wm "$W8" 5
OUT8R="$(bash "$PROBE" --repo-root "$R8" --watermark "$W8" --face refs 2>&1)"
RC8R=$?
OUT8U="$(bash "$PROBE" --repo-root "$R8" --watermark "$W8" --face union 2>&1)"
RC8U=$?
assert_eq "⑧ --face refs 忽略本地未提交号 → exit 0" "$RC8R" "0"
assert_eq "⑧ --face union 纳入本地未提交号 → exit 1" "$RC8U" "1"

# ── ⑨⑩ --emit: 刷新声明值 + 保留 MANUAL 段 + 自校验 ──
R9="$SB/r9"
mk_repo "$R9" 7
W9="$SB/w9.md"
cat > "$W9" <<'EOF'
# 号段水位

声明水位: D2

<!-- MANUAL:BEGIN -->
人工段标记 D1013-MANUAL-SENTINEL
<!-- MANUAL:END -->
EOF
OUT9="$(bash "$PROBE" --repo-root "$R9" --watermark "$W9" --emit 2>&1)"
RC9=$?
assert_eq "⑨ --emit exit 0" "$RC9" "0"
NEWDECL="$(grep -E '^声明水位: D[0-9]+$' "$W9" | head -1)"
assert_eq "⑨ --emit 刷新声明为实测值" "$NEWDECL" "声明水位: D7"
if grep -qF 'D1013-MANUAL-SENTINEL' "$W9"; then
  ok "⑨ --emit 保留 MANUAL 段"
else
  bad "⑨ --emit 丢了 MANUAL 段"
fi
OUT10="$(bash "$PROBE" --repo-root "$R9" --watermark "$W9" 2>&1)"
RC10=$?
assert_eq "⑩ --emit 后自校验 exit 0" "$RC10" "0"

# ── ⑪ 接线: 探针落在通用 runner 的发现面 ──
case "$PROBE" in
  */scripts/control-tower/probes/*-probe.sh) ok "⑪ 探针路径符合 probes/*-probe.sh 发现面" ;;
  *) bad "⑪ 探针路径不符合发现面: ${PROBE}" ;;
esac

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "✅ 全部通过: $((PASS + FAIL)) 项（$PASS 通过 / 0 失败）"
  exit 0
fi
echo "❌ 失败 $FAIL 项 / 共 $((PASS + FAIL)) 项"
exit 1
