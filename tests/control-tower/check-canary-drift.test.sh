#!/bin/bash
# D313 M5 UTF-8 强制
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
# ═════════════════════════════════════════════════════════════════
# check-canary-drift.test.sh — D526 建立 / D858 加固: CI canary 密封清单对账
#
# 覆盖矩阵（铁律 48 三路径 + 接线）:
#   正常 — 漂移存在（新测试不在清单）→ 告警出现 + ::warning + exit 0（不阻断）
#   通过 — 清单补齐 → 告警消失（✅ 零漂移）
#   边界 — 幽灵清单项（清单有文件无）→ ghost 告警；.ts 测试不计 canary 漂移
#   降级 — ci.yml 缺失 → 显式跳过 + exit 0
#   接线 — ci.yml canary 步骤调用本脚本（真实接线断言）
#   F5 真机 — 本仓库真实 ci.yml → exit 0（存量漂移仅告警）
#   F6 P1-glob 物理展开 — glob 命中文件计入清单：清单项数 == 物理命中数（从文件系统推导）
#                         且被覆盖的 2 条不出现在漂移清单，假覆盖 0，exit 0
#   F7 P1 反证（先红后绿）— 删 glob 行（模拟接入被回退）+ 注释仍声明 → exit 1
#                         + ::error title=canary-fake-coverage；恢复 glob 行 → exit 0
#   F8 L4-1 注释声明 > 物理展开 — 声明 2 条、glob 仅命中 1 条 → exit 1 + 点名未覆盖那条
#   F9 注释不产生覆盖 — 仅注释声明、无可执行项 → 该文件既进漂移（S3）又进假覆盖（S2）→ exit 1
#   F10 P2 独立通道 — GITHUB_STEP_SUMMARY 写入 + stdout 重定向到 /dev/null → 摘要仍完整
#   H1 C2 行尾注释声明未覆盖 — `run-tests …aa.test.sh  # 覆盖 …bb.test.sh` → exit 1 + 点名 bb
#                              且行尾注释不产生覆盖（清单项数 = 代码段 1 项）
#   H2 C1 引号内 `#` — `echo "a#b" tests/x/x.test.sh`（该文件是唯一测试）→ 路径仍算覆盖、
#                      不计漂移、不误报假覆盖、exit 0（旧 sed 口径会把它判成漂移）
#   H3 C2 行尾注释 glob 不产生覆盖 — 注释里 `# 覆盖 tests/project/*.test.sh` 但代码段只覆盖 aa
#                      → 清单 1 项（非 2）；bb 同时进漂移（S3）+ 假覆盖（S2）→ exit 1
#   H4 降级 fail-closed — ① 注入缝 `SYNO_AWK_BIN=`（确定性，跨平台同结果）：exit 2 +
#                          `::error title=canary-exec` + 显式人读文案 + 无 canary-fake-coverage；
#                          `SYNO_AWK_BIN=/不存在` 同样 fail-closed（防坏路径静默降级）。
#                       ② 受限 PATH 探针降级为「可证伪才断言」（D520/D506）：仅当实测
#                          `PATH=noawk command -v awk` 失败且沙箱工具链齐备才断言 exit 2；
#                          否则显式 SKIP 打印原因、不计失败（Git Bash/Windows 常不成立）
#   R1 注释起点对齐真实 shell 词边界 — `echo hi;#tests/op/op1.test.sh`：真实 shell 里 `;#` 后是注释
#                      → 清单 1 项（该路径不产生覆盖）→ op1 进 DECLARED 未覆盖 → 假覆盖 exit 1
#   R2 词边界不得过度扩大（对照片）— `x=y#z …` / `echo \# …` / `y="${z#p}" …` 三类仍算代码
#                      → 清单 3 项、零漂移、假覆盖 0、exit 0（真实 shell 佐证 cmd 会被执行）
#   R3 双引号内 `\"` 转义 — `echo "a\" #tests/esc/e1.test.sh" …` → 引号不提前闭合、路径不被截断
#                      → 清单 1 项、不误报假覆盖、exit 0（V2 口径此处误红 exit 1）
# 沙箱: SYNO_TESTS_DIR/SYNO_CI_YML/GITHUB_STEP_SUMMARY 注入临时目录；H4 另用受限 PATH
# 口径: 期望值一律从物理事实推导（禁止把"注释声明条数"当清单数——那正是假绿口径）
# ═════════════════════════════════════════════════════════════════
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DRIFT="$REPO/scripts/control-tower/check-canary-drift.sh"
PASS=0; FAIL=0
ok() { echo "  ✅ $1"; PASS=$((PASS+1)); }
no() { echo "  ❌ $1"; FAIL=$((FAIL+1)); }
TMPD="$(mktemp -d)"; trap 'rm -rf "$TMPD"' EXIT
BASH_BIN="$(command -v bash)"   # H4 受限 PATH 场景下必须用绝对路径调用 bash

echo "=== D526: canary 漂移告警 ==="

# ── 接线: ci.yml canary 步骤真实调用 ──
grep -q "check-canary-drift.sh" "$REPO/.github/workflows/ci.yml" \
  && ok "接线: ci.yml canary 步骤调用漂移检查" || no "ci.yml 未接漂移检查"
[ -x "$DRIFT" ] && ok "脚本存在且可执行" || no "脚本缺失/不可执行"

# ── 沙箱 fixture: 测试目录 + 清单 ──
TD="$TMPD/tests/control-tower"; mkdir -p "$TD"
YML="$TMPD/ci.yml"
printf 'run: |\n  for t in \\\n    tests/control-tower/alpha.test.sh \\\n    tests/control-tower/beta.test.sh; do\n' > "$YML"
printf '#!/bin/bash\n' > "$TD/alpha.test.sh"
printf '#!/bin/bash\n' > "$TD/beta.test.sh"
printf '#!/bin/bash\n' > "$TD/gamma.test.sh"    # 漂移项
printf '#!/bin/bash\n' > "$TD/delta.test.ts"    # .ts 不计 canary

# ── 正常: 漂移存在 → 告警 + exit 0 ──
OUT=$(SYNO_TESTS_DIR="$TMPD/tests" SYNO_CI_YML="$YML" bash "$DRIFT" 2>&1); rc=$?
[ "$rc" -eq 0 ] && ok "漂移场景 exit 0（告警不阻断）" || no "应 exit 0, 实际 $rc"
echo "$OUT" | grep -q "gamma.test.sh" && ok "漂移项被点名（gamma）" || no "未点名漂移项"
echo "$OUT" | grep -q "::warning title=canary-drift" && ok "::warning 注解输出（CI 可见）" || no "缺 ::warning"
echo "$OUT" | grep -q "delta.test.ts" && no ".ts 被误计入 canary 漂移" || ok ".ts 不计 canary 漂移（runner 语义正确）"

# ── 通过: 清单补齐 → 告警消失 ──
printf 'run: |\n  for t in \\\n    tests/control-tower/alpha.test.sh \\\n    tests/control-tower/beta.test.sh \\\n    tests/control-tower/gamma.test.sh; do\n' > "$YML"
OUT2=$(SYNO_TESTS_DIR="$TMPD/tests" SYNO_CI_YML="$YML" bash "$DRIFT" 2>&1); rc2=$?
[ "$rc2" -eq 0 ] && echo "$OUT2" | grep -q "零漂移" && ok "清单补齐 → 零漂移 ✅" || no "补齐后仍告警: $(echo "$OUT2" | grep ⚠ | head -2)"

# ── 边界: 幽灵清单项 ──
rm "$TD/beta.test.sh"
OUT3=$(SYNO_TESTS_DIR="$TMPD/tests" SYNO_CI_YML="$YML" bash "$DRIFT" 2>&1)
echo "$OUT3" | grep -q "幽灵清单项" && echo "$OUT3" | grep -q "beta.test.sh" \
  && ok "幽灵清单项被点名（beta）" || no "幽灵项未检出"

# ── 降级: ci.yml 缺失 ──
OUT4=$(SYNO_TESTS_DIR="$TMPD/tests" SYNO_CI_YML="$TMPD/missing.yml" bash "$DRIFT" 2>&1); rc4=$?
[ "$rc4" -eq 0 ] && echo "$OUT4" | grep -q "跳过" && ok "ci.yml 缺失 → 显式跳过 + exit 0" || no "降级路径异常: rc=$rc4"

# ── 真机自检: 机制在真实仓库工作（存量漂移 47 项是 D526 要曝光的现状，非本批清理项；
#    全量密封化是 K3 P2-4 单独立项——本批只纳入 hermetic 的 synova-commit + 本测试）──
OUT5=$(bash "$DRIFT" 2>&1); rc5=$?
[ "$rc5" -eq 0 ] && ok "真机自检: exit 0（告警不阻断）" || no "真机 exit=$rc5"
if echo "$OUT5" | grep -q "::warning title=canary-drift"; then
  ok "真机自检: 存量漂移被曝光（::warning 可见——D526 交付即此可见性）"
elif echo "$OUT5" | grep -q "零漂移"; then
  ok "真机自检: 零漂移"
else
  no "真机输出异常"
fi

# ═════════════════════════════════════════════════════════════════
# F6-F10 (D858): 覆盖语义物理展开 + 假覆盖 fail-closed + 独立通道
# ═════════════════════════════════════════════════════════════════
GD="$TMPD/glob/tests/project"; mkdir -p "$GD"
GYML="$TMPD/glob/ci.yml"
printf '#!/bin/bash\nexit 0\n' > "$GD/aa.test.sh"
printf '#!/bin/bash\nexit 0\n' > "$GD/bb.test.sh"
# 期望值从文件系统推导（不是写死 2，更不是把注释声明条数当清单数）
GLOB_HITS=$(ls "$GD"/*.test.sh | wc -l | tr -d ' \n')
printf 'run: |\n  # 当前覆盖（canary 对账用）：tests/project/aa.test.sh、\n  #   tests/project/bb.test.sh\n  PROJECT_TESTS=(tests/project/*.test.sh)\n' > "$GYML"

# ── F6: glob 物理展开 → 命中文件计入清单，2 条不漂移，exit 0 ──
OUT6=$(SYNO_TESTS_DIR="$TMPD/glob/tests" SYNO_CI_YML="$GYML" bash "$DRIFT" 2>&1); rc6=$?
echo "$OUT6" | grep -q "canary 清单: ${GLOB_HITS} 项" \
  && ok "F6 glob 物理展开: 清单项数 = 物理命中数（${GLOB_HITS}）" \
  || no "F6 清单项数非物理命中数（应 ${GLOB_HITS}）: $(echo "$OUT6" | grep 'canary 清单' | head -1)"
[ "$rc6" -eq 0 ] && ok "F6 glob 命中被物理覆盖 → exit 0" || no "F6 应 exit 0, 实际 $rc6"
if echo "$OUT6" | grep -q "tests/project/aa.test.sh" || echo "$OUT6" | grep -q "tests/project/bb.test.sh"; then
  no "F6 物理覆盖的 2 条出现在输出（漂移/假覆盖）"
else
  ok "F6 物理覆盖的 2 条不在漂移清单"
fi
echo "$OUT6" | grep -q "canary-fake-coverage" && no "F6 误报假覆盖" || ok "F6 假覆盖 0"

# ── F7: 删 glob 行（模拟接入被回退）+ 注释仍声明 → 假覆盖报红（先红）──
GYML_NOGLOB="$TMPD/glob/ci-noglob.yml"
grep -v 'PROJECT_TESTS=' "$GYML" > "$GYML_NOGLOB"
OUT7=$(SYNO_TESTS_DIR="$TMPD/glob/tests" SYNO_CI_YML="$GYML_NOGLOB" bash "$DRIFT" 2>&1); rc7=$?
[ "$rc7" -eq 1 ] && ok "F7 先红: 删 glob 行 + 注释仍声明 → exit 1（fail-closed）" || no "F7 应 exit 1, 实际 $rc7"
echo "$OUT7" | grep -q "::error title=canary-fake-coverage" && ok "F7 ::error title=canary-fake-coverage 输出" || no "F7 缺 ::error"
echo "$OUT7" | grep -q "tests/project/aa.test.sh" && ok "F7 点名未物理覆盖的 aa.test.sh" || no "F7 未点名 aa"
echo "$OUT7" | grep -q "tests/project/bb.test.sh" && ok "F7 点名未物理覆盖的 bb.test.sh" || no "F7 未点名 bb"

# ── F6 后绿: 恢复 glob 行 → exit 0，2 条不在漂移清单 ──
OUT7B=$(SYNO_TESTS_DIR="$TMPD/glob/tests" SYNO_CI_YML="$GYML" bash "$DRIFT" 2>&1); rc7b=$?
[ "$rc7b" -eq 0 ] && ok "F6 后绿: 恢复 glob 行 → exit 0" || no "F6 后绿应 exit 0, 实际 $rc7b"
if echo "$OUT7B" | grep -q "tests/project/aa.test.sh" || echo "$OUT7B" | grep -q "tests/project/bb.test.sh"; then
  no "F6 后绿: 2 条仍在漂移清单（漂移未消除）"
else
  ok "F6 后绿: 2 条不在漂移清单"
fi

# ── F8: 注释声明 2 条，glob 仅展开 1 条 → exit 1 + 点名未覆盖那条 ──
G8="$TMPD/glob8/tests/project"; mkdir -p "$G8"
printf '#!/bin/bash\nexit 0\n' > "$G8/aa.test.sh"
printf '#!/bin/bash\nexit 0\n' > "$G8/bb.test.sh"
Y8="$TMPD/glob8/ci.yml"
printf 'run: |\n  # 声明覆盖：tests/project/aa.test.sh、tests/project/bb.test.sh\n  PROJECT_TESTS=(tests/project/a*.test.sh)\n' > "$Y8"
OUT8=$(SYNO_TESTS_DIR="$TMPD/glob8/tests" SYNO_CI_YML="$Y8" bash "$DRIFT" 2>&1); rc8=$?
[ "$rc8" -eq 1 ] && ok "F8 注释声明 > 物理展开 → exit 1" || no "F8 应 exit 1, 实际 $rc8"
echo "$OUT8" | grep -q "::error title=canary-fake-coverage" && ok "F8 ::error 注解输出" || no "F8 缺 ::error"
echo "$OUT8" | grep -q "tests/project/bb.test.sh" && ok "F8 点名未覆盖的 bb.test.sh" || no "F8 未点名 bb"

# ── F9: 注释不产生覆盖（无可执行项）→ 漂移 + 假覆盖双命中 → exit 1 ──
G9="$TMPD/glob9/tests/project"; mkdir -p "$G9"
printf '#!/bin/bash\nexit 0\n' > "$G9/cc.test.sh"
Y9="$TMPD/glob9/ci.yml"
printf 'run: |\n  # 覆盖：tests/project/cc.test.sh\n  echo no-executable-items\n' > "$Y9"
OUT9=$(SYNO_TESTS_DIR="$TMPD/glob9/tests" SYNO_CI_YML="$Y9" bash "$DRIFT" 2>&1); rc9=$?
[ "$rc9" -eq 1 ] && ok "F9 注释不产生覆盖 → exit 1" || no "F9 应 exit 1, 实际 $rc9"
if echo "$OUT9" | grep -q "⚠ 漂移" && echo "$OUT9" | grep -q "tests/project/cc.test.sh"; then
  ok "F9 该文件同时进漂移（S3）"
else
  no "F9 漂移未检出"
fi
echo "$OUT9" | grep -q "::error title=canary-fake-coverage" && ok "F9 该文件同时进假覆盖（S2）" || no "F9 假覆盖未检出"

# ── F10: P2 独立通道 — stdout 重定向到 /dev/null，摘要仍落盘 ──
SUM10="$TMPD/sum.md"
GITHUB_STEP_SUMMARY="$SUM10" SYNO_TESTS_DIR="$TMPD/glob9/tests" SYNO_CI_YML="$Y9" bash "$DRIFT" >/dev/null 2>&1; rc10=$?
[ "$rc10" -eq 1 ] && ok "F10 stdout 重定向仍 exit 1（假覆盖）" || no "F10 rc=$rc10"
[ -s "$SUM10" ] && ok "F10 summary 文件非空（不依赖 stdout）" || no "F10 summary 未写入"
grep -q "漂移" "$SUM10" && ok "F10 summary 含漂移文本" || no "F10 summary 缺漂移文本"
grep -q "假覆盖" "$SUM10" && ok "F10 summary 含假覆盖文本" || no "F10 summary 缺假覆盖文本"
grep -q "canary 清单" "$SUM10" && ok "F10 summary 含清单计数" || no "F10 summary 缺计数"

# ═════════════════════════════════════════════════════════════════
# H1-H4 (D858-V2): 引号感知切分（C1）+ 行尾注释声明（C2）+ awk 降级
# ═════════════════════════════════════════════════════════════════

# ── H1: 行尾注释里的声明未被物理覆盖 → 假覆盖 fail-closed（C2 闭环）──
H1D="$TMPD/h1/tests/project"; mkdir -p "$H1D"
printf '#!/bin/bash\nexit 0\n' > "$H1D/aa.test.sh"
printf '#!/bin/bash\nexit 0\n' > "$H1D/bb.test.sh"
H1Y="$TMPD/h1/ci.yml"
printf 'run: |\n  run-tests tests/project/aa.test.sh   # 覆盖 tests/project/bb.test.sh\n' > "$H1Y"
OUTH1=$(SYNO_TESTS_DIR="$TMPD/h1/tests" SYNO_CI_YML="$H1Y" bash "$DRIFT" 2>&1); rch1=$?
[ "$rch1" -eq 1 ] && ok "H1 行尾注释声明未覆盖 → exit 1（C2）" || no "H1 应 exit 1, 实际 $rch1"
echo "$OUTH1" | grep -q "::error title=canary-fake-coverage" && ok "H1 ::error title=canary-fake-coverage 输出" || no "H1 缺 ::error"
echo "$OUTH1" | grep -q "tests/project/bb.test.sh" && ok "H1 点名行尾注释声明的 bb.test.sh" || no "H1 未点名 bb"
echo "$OUTH1" | grep -q "canary 清单: 1 项" \
  && ok "H1 行尾注释不产生覆盖（清单项数 = 代码段 1 项）" \
  || no "H1 清单项数非 1: $(echo "$OUTH1" | grep 'canary 清单' | head -1)"

# ── H2: 引号内 `#` 不是注释起点 → 其后真实路径仍算覆盖（C1 闭环）──
H2D="$TMPD/h2/tests/x"; mkdir -p "$H2D"
printf '#!/bin/bash\nexit 0\n' > "$H2D/x.test.sh"
H2Y="$TMPD/h2/ci.yml"
printf 'run: |\n  echo "a#b" tests/x/x.test.sh\n' > "$H2Y"
OUTH2=$(SYNO_TESTS_DIR="$TMPD/h2/tests" SYNO_CI_YML="$H2Y" bash "$DRIFT" 2>&1); rch2=$?
[ "$rch2" -eq 0 ] && ok "H2 引号内 # 不误切注释 → exit 0（C1）" || no "H2 应 exit 0, 实际 $rch2"
echo "$OUTH2" | grep -q "canary 清单: 1 项" \
  && ok "H2 引号内 # 之后的路径仍算覆盖（清单 1 项）" \
  || no "H2 路径被误删（清单非 1 项）: $(echo "$OUTH2" | grep 'canary 清单' | head -1)"
echo "$OUTH2" | grep -q "零漂移" && ok "H2 该路径未被误判漂移" || no "H2 该路径被误判漂移"
echo "$OUTH2" | grep -q "canary-fake-coverage" && no "H2 误报假覆盖（C1 未闭合）" || ok "H2 不误报假覆盖"

# ── H3: 行尾注释里的 glob 不产生覆盖（代码段未覆盖者同时进漂移 S3 + 假覆盖 S2）──
H3D="$TMPD/h3/tests/project"; mkdir -p "$H3D"
printf '#!/bin/bash\nexit 0\n' > "$H3D/aa.test.sh"
printf '#!/bin/bash\nexit 0\n' > "$H3D/bb.test.sh"
H3Y="$TMPD/h3/ci.yml"
printf 'run: |\n  run-tests tests/project/aa.test.sh   # 覆盖 tests/project/*.test.sh\n' > "$H3Y"
OUTH3=$(SYNO_TESTS_DIR="$TMPD/h3/tests" SYNO_CI_YML="$H3Y" bash "$DRIFT" 2>&1); rch3=$?
[ "$rch3" -eq 1 ] && ok "H3 行尾注释 glob 未全覆盖 → exit 1" || no "H3 应 exit 1, 实际 $rch3"
echo "$OUTH3" | grep -q "canary 清单: 1 项" \
  && ok "H3 行尾注释 glob 不产生覆盖（清单 1 项，非物理命中 2 项）" \
  || no "H3 注释 glob 被当覆盖: $(echo "$OUTH3" | grep 'canary 清单' | head -1)"
if echo "$OUTH3" | grep -q "⚠ 漂移" && echo "$OUTH3" | grep -q "tests/project/bb.test.sh"; then
  ok "H3 bb 进漂移（S3：注释 glob 未覆盖它）"
else
  no "H3 bb 未进漂移"
fi
if echo "$OUTH3" | grep -q "❌ 假覆盖" && echo "$OUTH3" | grep -q "tests/project/bb.test.sh"; then
  ok "H3 bb 进假覆盖（S2）"
else
  no "H3 bb 未进假覆盖"
fi

# ── H4: awk 不可用 → fail-closed exit 2（三态；受限 PATH，铁律 11 不静默）──
NB="$TMPD/noawk"; mkdir -p "$NB"
for b in grep sed find sort cut head tr dirname; do
  [ -e "$NB/$b" ] || ln -s "$(command -v "$b")" "$NB/$b"
done
# ── H4-a 确定性：注入缝 SYNO_AWK_BIN（空串）→ awk 不可用分支。macOS/Linux/Windows 同结果 ──
OK_H4=1
OUT4A=$(SYNO_AWK_BIN= SYNO_TESTS_DIR="$TMPD/h3/tests" SYNO_CI_YML="$H3Y" bash "$DRIFT" 2>&1); rc4a=$?
[ "$rc4a" -eq 2 ] && ok "H4 注入缝 SYNO_AWK_BIN=（空）→ exit 2（三态 fail-closed，既非 0 也非 1）" || { no "H4 应 exit 2, 实际 $rc4a"; OK_H4=0; }
echo "$OUT4A" | grep -q "::error title=canary-exec" && ok "H4 ::error title=canary-exec 注解输出" || { no "H4 缺 ::error title=canary-exec"; OK_H4=0; }
echo "$OUT4A" | grep -q "awk 不可用" && ok "H4 显式人读文案（不静默）" || { no "H4 缺人读文案"; OK_H4=0; }
echo "$OUT4A" | grep -q "canary-fake-coverage" && no "H4 降级路径误报假覆盖（应走执行失败通道）" || ok "H4 降级走执行失败通道（非假覆盖通道）"
# 反面对照：同一 H3 夹具在 awk 可用（未设缝）时是 exit 1（假覆盖）——降级后必须变 2 而不是变 0
INJ_SPLIT=$(SYNO_AWK_BIN= SYNO_TESTS_DIR="$TMPD/h3/tests" SYNO_CI_YML="$H3Y" bash "$DRIFT" 2>&1 | grep -c "canary 清单" || true)
[ "$INJ_SPLIT" -eq 0 ] && ok "H4 降级路径不做覆盖判定（无 清单 输出，不产生伪结论）" || { no "H4 降级仍输出判定结果"; OK_H4=0; }
[ "$OK_H4" -eq 1 ] && ok "H4 降级 fail-closed（注入缝确定性：同一夹具不再由 exit 1 退化为 0）"
# 注入缝第二形态：指向不可执行路径 → 同样 fail-closed（防止「设了但指向坏路径」静默降级）
OUT4B=$(SYNO_AWK_BIN=/nonexistent-dir-xyz/awk SYNO_TESTS_DIR="$TMPD/h3/tests" SYNO_CI_YML="$H3Y" bash "$DRIFT" 2>&1); rc4b=$?
[ "$rc4b" -eq 2 ] && ok "H4 SYNO_AWK_BIN 指向不可执行路径 → exit 2" || no "H4 坏路径应 exit 2, 实际 $rc4b"
echo "$OUT4B" | grep -q "canary-fake-coverage" && no "H4 坏路径误报假覆盖" || ok "H4 坏路径不误报假覆盖"

# ── H4-b 受限 PATH 探针（D520/D506「可证伪才断言」；Git Bash/Windows 上常不成立 → SKIP 不计失败）──
if [ "${SYNO_AWK_BIN+set}" = "set" ]; then
  echo "  ⚠ SKIP: 受限 PATH 探针不适用（外层已设 SYNO_AWK_BIN）——该语义由 H4-a 注入缝确定性覆盖"
elif [ -n "$(PATH="$NB" command -v awk || true)" ]; then
  echo "  ⚠ SKIP: 本平台受限 PATH 无法屏蔽 awk（Git Bash/Windows 常见）——该路径由 SYNO_AWK_BIN 注入确定性覆盖，不计失败"
else
  NB_TOOLS_OK=1
  for b in grep sed find sort cut head tr dirname; do
    [ -x "$NB/$b" ] || NB_TOOLS_OK=0
  done
  if [ "$NB_TOOLS_OK" -ne 1 ]; then
    echo "  ⚠ SKIP: 本平台受限 PATH 沙箱工具链未装齐（ln -s 不可用或工具缺失）——该路径由 SYNO_AWK_BIN 注入确定性覆盖，不计失败"
  else
    OUT4C=$(PATH="$NB" SYNO_TESTS_DIR="$TMPD/h3/tests" SYNO_CI_YML="$H3Y" "$BASH_BIN" "$DRIFT" 2>&1); rc4c=$?
    [ "$rc4c" -eq 2 ] && ok "H4 受限 PATH 真屏蔽 awk → exit 2（探针与注入缝同结论）" || no "H4 受限 PATH 应 exit 2, 实际 $rc4c"
    echo "$OUT4C" | grep -q "::error title=canary-exec" && ok "H4 受限 PATH 路径输出 ::error title=canary-exec" || no "H4 受限 PATH 缺 ::error"
  fi
fi

# ═════════════════════════════════════════════════════════════════
# R1-R2 (D858-V3): 注释起点对齐真实 shell 词边界（R1）+ 不得过度扩大（R2 对照片）
# ═════════════════════════════════════════════════════════════════

# ── R1: `;#` 之后是注释（真实 shell 语义）→ 其路径进 DECLARED 不覆盖 → 假覆盖 exit 1 ──
R1D="$TMPD/r1"; mkdir -p "$R1D/tests/op"
printf '#!/bin/bash\nexit 0\n' > "$R1D/tests/op/ok.test.sh"
printf '#!/bin/bash\nexit 0\n' > "$R1D/tests/op/op1.test.sh"
cat > "$R1D/ci.yml" <<'YML'
run: |
  run-tests tests/op/ok.test.sh
  echo hi;#tests/op/op1.test.sh
  # 覆盖 tests/op/ok.test.sh
YML
# 真实 shell 佐证（规则来自 shell 词法，不是本脚本的私设）
R1REAL=$(bash -c 'echo hi;#echo NOPE' 2>&1)
[ "$R1REAL" = "hi" ] && ok "R1 真实 shell 佐证: \`;#\` 之后是注释（bash -c 'echo hi;#echo NOPE' 只输出 hi）" || no "R1 真实 shell 佐证失败: [$R1REAL]"
OUTR1=$(SYNO_TESTS_DIR="$R1D/tests" SYNO_CI_YML="$R1D/ci.yml" bash "$DRIFT" 2>&1); rcr1=$?
[ "$rcr1" -eq 1 ] && ok "R1 \`;#\` 路径未被当覆盖 → exit 1（假覆盖 fail-closed）" || no "R1 应 exit 1, 实际 $rcr1"
echo "$OUTR1" | grep -q "canary 清单: 1 项" \
  && ok "R1 清单项数 = 代码段 1 项（\`;#\` 后的路径不产生覆盖）" \
  || no "R1 清单项数异常: $(echo "$OUTR1" | grep 'canary 清单' | head -1)"
echo "$OUTR1" | grep -q "::error title=canary-fake-coverage" && echo "$OUTR1" | grep -q "tests/op/op1.test.sh" \
  && ok "R1 点名 op1（注释声明未被物理覆盖）" || no "R1 未点名 op1"
echo "$OUTR1" | grep -q "tests/op/ok.test.sh" && no "R1 合法声明（ok 已物理覆盖）被误报" || ok "R1 整行注释里的合法声明不误报"

# ── R2 对照片: 真实 shell 词边界不得过度扩大（`x=y#z` / `\#` / `${x#p}` 三类仍是代码）──
R2D="$TMPD/r2"; mkdir -p "$R2D/tests/word" "$R2D/tests/hash" "$R2D/tests/brace"
printf '#!/bin/bash\nexit 0\n' > "$R2D/tests/word/op2.test.sh"
printf '#!/bin/bash\nexit 0\n' > "$R2D/tests/hash/h.test.sh"
printf '#!/bin/bash\nexit 0\n' > "$R2D/tests/brace/b.test.sh"
cat > "$R2D/ci.yml" <<'YML'
run: |
  x=y#z tests/word/op2.test.sh
  echo \# tests/hash/h.test.sh
  y="${z#p}" tests/brace/b.test.sh
YML
R2REAL=$(bash -c 'x=y#z echo EXECUTED' 2>&1)
[ "$R2REAL" = "EXECUTED" ] && ok "R2 真实 shell 佐证: \`x=y#z cmd\` 执行 cmd（# 在词中→字面量）" || no "R2 真实 shell 佐证失败: [$R2REAL]"
OUTR2=$(SYNO_TESTS_DIR="$R2D/tests" SYNO_CI_YML="$R2D/ci.yml" bash "$DRIFT" 2>&1); rcr2=$?
[ "$rcr2" -eq 0 ] && ok "R2 三类形态均未被当注释 → exit 0" || no "R2 应 exit 0, 实际 $rcr2"
echo "$OUTR2" | grep -q "canary 清单: 3 项" \
  && ok "R2 清单 3 项（x=y#z / \\# / \${x#p} 三类全计入覆盖）" \
  || no "R2 清单项数异常: $(echo "$OUTR2" | grep 'canary 清单' | head -1)"
for _p in op2 h b; do
  echo "$OUTR2" | grep -q "/${_p}\.test\.sh" && no "R2 ${_p}.test.sh 被误当注释（进了漂移/假覆盖）" || ok "R2 ${_p}.test.sh 未被误当注释"
done
echo "$OUTR2" | grep -q "canary-fake-coverage" && no "R2 误报假覆盖" || ok "R2 假覆盖 0"

# ═════════════════════════════════════════════════════════════════
# R3 (D858-V3): 双引号内 `\"` 转义 → 引号不提前闭合 → 不误红
# ═════════════════════════════════════════════════════════════════
R3D="$TMPD/r3"; mkdir -p "$R3D/tests/esc"
printf '#!/bin/bash\nexit 0\n' > "$R3D/tests/esc/e1.test.sh"
cat > "$R3D/ci.yml" <<'YML'
run: |
  echo "a\" #tests/esc/e1.test.sh" >/dev/null && bash tests/esc/e1.test.sh
YML
OUTR3=$(SYNO_TESTS_DIR="$R3D/tests" SYNO_CI_YML="$R3D/ci.yml" bash "$DRIFT" 2>&1); rcr3=$?
[ "$rcr3" -eq 0 ] && ok "R3 双引号内 \\\" 转义 → 不误红 exit 0" || no "R3 应 exit 0, 实际 $rcr3"
echo "$OUTR3" | grep -q "canary 清单: 1 项" \
  && ok "R3 e1 计入清单（路径未被注释截断）" \
  || no "R3 清单项数异常: $(echo "$OUTR3" | grep 'canary 清单' | head -1)"
echo "$OUTR3" | grep -q "canary-fake-coverage" && no "R3 误报假覆盖" || ok "R3 不误报假覆盖"
echo "$OUTR3" | grep -q "tests/esc/e1.test.sh" && no "R3 e1 出现在漂移/假覆盖清单" || ok "R3 e1 未进漂移清单"

echo ""
echo "结果: $PASS 通过, $FAIL 失败"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
