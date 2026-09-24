#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# install-dsh-preset.test.sh — DSH 预设一键安装脚本测试（P3: preset 落位 + 漂移检查）
#
# 覆盖（铁律 48: 正常/降级/边界; 铁律 0-2: red→green）:
#   1. 首次安装: 复制 standard 预设 + persona 行替换 + preset.yml 替换（正常）
#   2. --check 安装后 → exit 0（正常）
#   3. 已安装 persona 被改 → --check exit 1 + 点名文件（边界）
#   4. 未安装 → --check exit 1 "未安装"（边界）
#   5. 源预设无 persona 行 → exit 2 降级 + 显式日志（降级, D328: 不产出坏预设）
#   6. DSH home 不可写 → exit 2 降级（降级）
#   7. 重复安装幂等 → 两次 exit 0, 最终状态一致（正常）
#   8. 仓库 persona-block.yml 存在且以 "- id: persona" 开头（生产接线）
#
# 隔离: mktemp 沙箱 + --home/--standard-from 测试注入, 不碰真实 ~/.dsh。
# 用法: bash tests/control-tower/install-dsh-preset.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
# 注入缝（仅元变异 M1/M4 用）: 变异体在 /tmp 副本运行，靠本缝指回真实仓库（红证只落 /tmp，不入仓库）
REPO_DIR="${SYNO_IDP_REPO_DIR:-$REPO_DIR}"
INSTALL="$REPO_DIR/scripts/control-tower/install-dsh-preset.sh"
DRAFT="$REPO_DIR/docs/synova/coordination/dsh-preset-draft"
# 注入标记（**拼接构造**：夹具源码内不出现该标记的字面量 →
#   仓库内 grep 该字面量命中 0；红证只存在于 /tmp 沙箱副本）
MARKER="INJECTED""-RED"
MARKER_LINE="      # ${MARKER} persona-drift-marker"

# T3c 期望值 —— **M4 变异点**（变异用 `s|^EXPECT_MARKERS=1$|EXPECT_MARKERS=0|`；置 0 后 T3c 必须失败 = 防恒真）
# 注意：本行**不得带行尾注释**，否则锚定 `$` 的变异 sed 不命中（M4 会假绿）。
EXPECT_MARKERS=1

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got> <want> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3"; else fail "$3 (got exit=$1, want exit=$2)"; fi
}
assert_grep() { # <file> <pattern> <msg>
  if grep -q "$2" "$1" 2>/dev/null; then pass "$3"; else fail "$3 (grep 未命中: $2)"; fi
}
assert_eq_int() { # <got> <want> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3"; else fail "$3 (got=$1, want=$2)"; fi
}

# ── T3/T3c 注入实现（**与文案无关**的结构锚）──────────────────────────────────
#   锚: `- id: persona` 起、下一条 `- id: ` 止（EOF 兜底）—— 与 install-dsh-preset.sh
#   extract_persona 同款边界规则；D926 重写文案后旧字面量判据失效，故本注入不依赖任何文案串。
#   $2 = inside（默认，块内＝判据面内）/ outside（块外，仅 M2 判别性用）
_inject_impl() {
  OUTSIDE="$2" MARKER_LINE="$MARKER_LINE" python3 - "$1" <<'PY'
import os
import sys
path = sys.argv[1]
lines = open(path, encoding="utf-8").read().splitlines()
start = next((i for i, l in enumerate(lines) if l.strip() == "- id: persona"), None)
if start is None:
    sys.exit(3)
end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("- id: ")), len(lines))
if os.environ.get("OUTSIDE") == "outside":
    at = min(end + 1, len(lines))      # 块外：越过终止 `- id: ` 行（EOF 则追加到文件尾）
else:
    at = start + 1                     # 块内：persona 块首行之后（= 判据面内）
lines.insert(at, os.environ["MARKER_LINE"])
open(path, "w", encoding="utf-8").write("\n".join(lines) + "\n")
PY
}
inject_persona_drift() { # <cordis-file> [inside|outside]
  local f="$1" where="${2:-inside}"
  _inject_impl "$f" "$where"        # M1-MUTATION-POINT（变异: 本行整行替换为 `return 0` ⇒ no-op）
}

# ── 判据面探针（**独立复刻**被测脚本的结构锚，不调用其内部函数）: 输出 persona 块 ──
extract_persona_probe() {
  python3 - "$1" <<'PY'
import sys
lines = open(sys.argv[1], encoding="utf-8").read().splitlines()
start = next((i for i, l in enumerate(lines) if l.strip() == "- id: persona"), None)
if start is None:
    sys.exit(3)
end = next((i for i in range(start + 1, len(lines)) if lines[i].startswith("- id: ")), len(lines))
sys.stdout.write("\n".join(lines[start:end]) + "\n")
PY
}

# ── 沙箱: fake DSH home + fake standard 预设 ──
TMP=$(mktemp -d /tmp/idp-preset.XXXXXX)
HOME_MOCK="$TMP/dsh-home"
STD_MOCK="$TMP/standard"
mkdir -p "$HOME_MOCK" "$STD_MOCK"
trap 'rm -rf "$TMP"' EXIT

cat > "$STD_MOCK/preset.yml" << 'YAML'
name: standard
description: fake standard preset
YAML
cat > "$STD_MOCK/agent.cordis.yml" << 'YAML'
# fake standard agent.cordis.yml
- id: persona
  name: '@deepseek-ai/dsh-persona'
  config:
    text: |-
      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.
- id: tool-bash
  name: '@deepseek-ai/dsh-tool-bash'
YAML

RUN() { bash "$INSTALL" --home "$HOME_MOCK" --standard-from "$STD_MOCK" "$@"; }
INSTALLED="$HOME_MOCK/.agent-presets/synova-dsh"

# ── T1: 首次安装（正常路径）──
OUT1=$(RUN --install 2>&1)
EXIT1=$?
assert_exit "$EXIT1" 0 "T1: --install exit 0"
[ -f "$INSTALLED/agent.cordis.yml" ] && pass "T1: agent.cordis.yml 已落位" || fail "T1: agent.cordis.yml 缺失"
assert_grep "$INSTALLED/agent.cordis.yml" "SynovaAgent 仓库的 DeepSeek Harness" "T1: persona 已替换为仓库版"
assert_grep "$INSTALLED/agent.cordis.yml" "tool-bash" "T1: 非 persona 行原样保留"
assert_grep "$INSTALLED/preset.yml" "纪律模式" "T1: preset.yml 已替换为仓库版"
[ -f "$INSTALLED/.synova-preset-version" ] && pass "T1: 版本标记已写" || fail "T1: 版本标记缺失"

# ── T11: devdoc 预设同步落位（多预设注册表, 2026-08-15 加入）──
# D922（2026-09-23）: synova-devdoc 退役（创始人批准 B 案）→ T11 断言改为「退役语义」三件：
#   ① 默认安装集**不再**装 devdoc（退役生效）② 退役在注册表以注释留痕（可逆）③ 能力已技能化保留
DEVDOC_INSTALLED="$HOME_MOCK/.agent-presets/synova-devdoc"
[ ! -f "$DEVDOC_INSTALLED/agent.cordis.yml" ] && pass "T11: devdoc 默认不再安装（退役生效）" || fail "T11: devdoc 仍被安装（退役未生效）"
grep -qE '^# *synova-devdoc\|' "$(cd "$SCRIPT_DIR/../.." && pwd)/scripts/control-tower/install-dsh-preset.sh" \
  && pass "T11: 退役在注册表留痕（注释行，可逆）" || fail "T11: 退役无留痕（不可逆）"
RP="$(cd "$SCRIPT_DIR/../.." && pwd)"; [ -f "$RP/.claude/skills/dev-doc-spec/SKILL.md" ] && [ -f "$RP/.dsh/skills/dev-doc-spec/SKILL.md" ] \
  && pass "T11: 能力技能化保留（dev-doc-spec 双写齐备）" || fail "T11: 能力未保留（skill 缺失）"

# ── T2: --check 安装后 → exit 0（正常）──
OUT2=$(RUN --check 2>&1)
EXIT2=$?
assert_exit "$EXIT2" 0 "T2: --check 一致 exit 0"
echo "$OUT2" | grep -qi "SYNC-OK" && pass "T2: 输出含 SYNC-OK" || fail "T2: 无 SYNC-OK 标记"

# ── T3（**承重 / LOAD-BEARING**）: persona 漂移 → --check exit 1 + 点名 ──
#   注入 = 结构锚（块内插标记行），与文案无关；D926 重写后仍成立。
inject_persona_drift "$INSTALLED/agent.cordis.yml"
T3_INJECT_RC=$?
OUT3=$(RUN --check 2>&1)
EXIT3=$?
assert_exit "$EXIT3" 1 "T3(承重): 结构锚注入 persona 漂移 → --check exit 1"
echo "$OUT3" | grep -q "agent.cordis.yml" && pass "T3(承重): 输出点名 agent.cordis.yml" || fail "T3(承重): 未点名漂移文件"
echo "T3 LOAD-BEARING: inject=structural(块内) inject_rc=${T3_INJECT_RC} check_rc=${EXIT3} 点名=$(printf '%s\n' "$OUT3" | grep -c 'agent.cordis.yml' || true)"

# ── T3c（**承重 / LOAD-BEARING**）: 落点证明 —— 标记必须落在判据面（persona 块）内 ──
MARKERS=$(extract_persona_probe "$INSTALLED/agent.cordis.yml" | grep -c -- "$MARKER" || true)
assert_eq_int "$MARKERS" "$EXPECT_MARKERS" "T3c(承重): 判据面内 ${MARKER} 计数 == ${EXPECT_MARKERS}"
echo "T3c LOAD-BEARING: extract_persona 面内 ${MARKER}=${MARKERS}（期望 ${EXPECT_MARKERS}）→ 注入落在判据面内"

# ── M2（判别性元变异）: 注入插到**块外** → T3c 面内计数必须为 0（证明 T3c 对落点敏感）──
RUN --install >/dev/null 2>&1
inject_persona_drift "$INSTALLED/agent.cordis.yml" outside
M2_MARKERS=$(extract_persona_probe "$INSTALLED/agent.cordis.yml" | grep -c -- "$MARKER" || true)
if [ "$M2_MARKERS" -eq 0 ]; then
  pass "M2 判别性: 块外注入 → 判据面内计数 0（T3c 依赖真实落点，非恒真）"
else
  fail "M2 判别性失败: 块外注入竟被计入判据面内（got=${M2_MARKERS}）"
fi

# ── T3b（**NEGATIVE-CONTROL / 负控，非承重**）: 旧判据（文案字面量）已死 ──
#   旧 T3 用 `s/DeepSeek Harness 编码代理/被篡改的代理/`；D926 重写后该字面量在 persona-block.yml
#   命中 0 → sed 空转 → --check 仍 exit 0。**本断言不是主判据**，只证明"旧判据失效"；
#   承重 = T3（漂移被抓）+ T3c（落点在判据面内）。
RUN --install >/dev/null 2>&1
OLD_LITERAL_HITS=$(grep -c 'DeepSeek Harness 编码代理' "$INSTALLED/agent.cordis.yml" || true)
sed -i '' 's/DeepSeek Harness 编码代理/被篡改的代理/' "$INSTALLED/agent.cordis.yml" 2>/dev/null \
  || sed -i 's/DeepSeek Harness 编码代理/被篡改的代理/' "$INSTALLED/agent.cordis.yml"
OUT3B=$(RUN --check 2>&1)
EXIT3B=$?
assert_exit "$EXIT3B" 0 "T3b(NEGATIVE-CONTROL): 旧字面量 sed 空转 → --check exit 0（旧判据已死）"
echo "T3b NEGATIVE-CONTROL: 旧字面量现存命中=${OLD_LITERAL_HITS}；sed 后 --check rc=${EXIT3B}（非承重，仅证明旧判据失效）"
RUN --install >/dev/null 2>&1    # 复原，供后续 T7 幂等断言

# ── T4: 未安装 → --check exit 1（边界）──
FRESH_HOME="$TMP/fresh-home"
mkdir -p "$FRESH_HOME"
OUT4=$(bash "$INSTALL" --home "$FRESH_HOME" --standard-from "$STD_MOCK" --check 2>&1)
EXIT4=$?
assert_exit "$EXIT4" 1 "T4: 未安装 --check exit 1"
echo "$OUT4" | grep -q "未安装" && pass "T4: 输出含'未安装'提示" || fail "T4: 无未安装提示"

# ── T5: 源预设无 persona 行 → exit 2 降级（降级, D328 三态）──
BAD_STD="$TMP/bad-standard"
mkdir -p "$BAD_STD"
cat > "$BAD_STD/preset.yml" << 'YAML'
name: standard
YAML
printf -- '- id: tool-bash\n  name: bash\n' > "$BAD_STD/agent.cordis.yml"
OUT5=$(bash "$INSTALL" --home "$TMP/home5" --standard-from "$BAD_STD" --install 2>&1)
EXIT5=$?
assert_exit "$EXIT5" 2 "T5: 无 persona 行 exit 2 (不产出坏预设)"
echo "$OUT5" | grep -qi "degraded\|persona" && pass "T5: 降级有显式日志" || fail "T5: 降级无日志"

# ── T6: DSH home 不可写 → exit 2 降级（降级）──
RO_HOME="$TMP/ro-home"
mkdir -p "$RO_HOME"
chmod 555 "$RO_HOME"
OUT6=$(bash "$INSTALL" --home "$RO_HOME/.agent-presets" --standard-from "$STD_MOCK" --install 2>&1)
EXIT6=$?
chmod 755 "$RO_HOME"
assert_exit "$EXIT6" 2 "T6: home 不可写 exit 2"

# ── T9: DSH_INSTALL_DIR 环境探测路径（不注入 --standard-from, D370 fix: set -u unbound）──
FAKE_INSTALL="$TMP/fake-install"
mkdir -p "$FAKE_INSTALL/config/agent-presets/standard"
cp "$STD_MOCK/preset.yml" "$FAKE_INSTALL/config/agent-presets/standard/preset.yml"
cp "$STD_MOCK/agent.cordis.yml" "$FAKE_INSTALL/config/agent-presets/standard/agent.cordis.yml"
OUT9=$(DSH_INSTALL_DIR="$FAKE_INSTALL" bash "$INSTALL" --home "$TMP/home9" --install 2>&1)
EXIT9=$?
assert_exit "$EXIT9" 0 "T9: DSH_INSTALL_DIR 探测安装 exit 0"
[ -f "$TMP/home9/.agent-presets/synova-dsh/agent.cordis.yml" ] \
  && pass "T9: 探测路径产出预设" || fail "T9: 探测路径无产出"

# ── T10: 无任何探测命中 → exit 2 降级（D328: 不产出半成品）──
# 受限 PATH（无 npm/basename 干扰, windows-compat 模式 2）保证探测确定性失败
OUT10=$(env PATH="/usr/bin:/bin" DSH_INSTALL_DIR="$TMP/不存在" HOME=/nonexistent-home bash "$INSTALL" --home "$TMP/home10" --install 2>&1)
EXIT10=$?
assert_exit "$EXIT10" 2 "T10: 探测全失败 exit 2"
[ ! -e "$TMP/home10/.agent-presets/synova-dsh" ] && pass "T10: 无半成品残留" || fail "T10: 半成品残留"

# ── T7: 重复安装幂等（正常）──
OUT7=$(RUN --install 2>&1)
EXIT7=$?
assert_exit "$EXIT7" 0 "T7: 二次 --install exit 0"
OUT7C=$(RUN --check 2>&1)
assert_exit "$?" 0 "T7: 二次安装后 --check 仍 exit 0"

# ── T8: 仓库 persona-block.yml 生产接线 ──
if [ -f "$DRAFT/persona-block.yml" ] && head -1 "$DRAFT/persona-block.yml" | grep -q -- "- id: persona"; then
  pass "T8: persona-block.yml 存在且首行 - id: persona（安装源）"
else
  fail "T8: persona-block.yml 缺失/格式错"
fi

# ── M1/M4 判别性元变异（变异体在 /tmp 副本运行；红证只落 /tmp，不入仓库）──
#   M1: 注入器置 no-op → 变异体的 T3 必须红（证明 T3 依赖真实注入，不是恒真）。
#   M4: 期望值 EXPECT_MARKERS 1→0 → 变异体的 T3c 必须失败（证明断言与期望值绑定，防恒真）。
if [ "${SYNO_IDP_NO_META:-0}" = "1" ]; then
  echo "  (元变异副本: 跳过 M1/M4 元断言 —— 防递归)"
else
  run_mutant() { # <sed 表达式> → 变异体输出（stdout+stderr）
    local mut="$TMP/fixture-mutant-$$.sh"
    sed "$1" "${BASH_SOURCE[0]}" > "$mut"
    SYNO_IDP_REPO_DIR="$REPO_DIR" SYNO_IDP_NO_META=1 bash "$mut" 2>&1
  }
  M1_OUT="$(run_mutant 's|^  _inject_impl "\$f" "\$where".*|  return 0|')"
  if printf '%s\n' "$M1_OUT" | grep -q '❌ T3(承重)'; then
    pass "M1 判别性: 注入器置 no-op → 变异体 T3 必红（T3 依赖真注入）"
  else
    fail "M1 判别性失败: 注入器 no-op 后 T3 仍绿（T3 未依赖注入）"
  fi
  M4_OUT="$(run_mutant 's|^EXPECT_MARKERS=1$|EXPECT_MARKERS=0|')"
  if printf '%s\n' "$M4_OUT" | grep -q '❌ T3c(承重)'; then
    pass "M4 判别性: 期望值改 0 → 变异体 T3c 必失败（断言与期望绑定，防恒真）"
  else
    fail "M4 判别性失败: 期望值改 0 后 T3c 仍绿（断言可能恒真）"
  fi
fi

# ── 汇总 ──
if [ "$FAIL" -eq 0 ]; then FINAL_EXIT=0; else FINAL_EXIT=1; fi
echo "T3 LOAD-BEARING: T3+T3c 为承重判据；T3b 为 NEGATIVE-CONTROL（非承重）"
echo "=== 结果: PASS=$PASS FAIL=$FAIL exit=$FINAL_EXIT ==="
echo "D922-FIXTURE: preset=install-dsh-preset T3/T3c=承重 T3b=负控 PASS=$PASS FAIL=$FAIL exit=$FINAL_EXIT"
echo ""
echo "═══════════════════════════════════════"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "═══════════════════════════════════════"
[ "$FAIL" -eq 0 ]
