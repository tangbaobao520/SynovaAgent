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
INSTALL="$REPO_DIR/scripts/control-tower/install-dsh-preset.sh"
DRAFT="$REPO_DIR/docs/synova/coordination/dsh-preset-draft"

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
DEVDOC_INSTALLED="$HOME_MOCK/.agent-presets/synova-devdoc"
[ -f "$DEVDOC_INSTALLED/agent.cordis.yml" ] && pass "T11: devdoc agent.cordis.yml 已落位" || fail "T11: devdoc agent.cordis.yml 缺失"
assert_grep "$DEVDOC_INSTALLED/agent.cordis.yml" "dev doc 撰写" "T11: devdoc persona 已替换为仓库版"
assert_grep "$DEVDOC_INSTALLED/preset.yml" "dev-doc" "T11: devdoc preset.yml 已替换为仓库版"

# ── T2: --check 安装后 → exit 0（正常）──
OUT2=$(RUN --check 2>&1)
EXIT2=$?
assert_exit "$EXIT2" 0 "T2: --check 一致 exit 0"
echo "$OUT2" | grep -qi "SYNC-OK" && pass "T2: 输出含 SYNC-OK" || fail "T2: 无 SYNC-OK 标记"

# ── T3: persona 漂移 → exit 1 + 点名（边界）──
sed -i '' 's/DeepSeek Harness 编码代理/被篡改的代理/' "$INSTALLED/agent.cordis.yml" 2>/dev/null \
  || sed -i 's/DeepSeek Harness 编码代理/被篡改的代理/' "$INSTALLED/agent.cordis.yml"
OUT3=$(RUN --check 2>&1)
EXIT3=$?
assert_exit "$EXIT3" 1 "T3: persona 漂移 exit 1"
echo "$OUT3" | grep -q "agent.cordis.yml" && pass "T3: 输出点名 agent.cordis.yml" || fail "T3: 未点名漂移文件"

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

# ── 汇总 ──
echo ""
echo "═══════════════════════════════════════"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "═══════════════════════════════════════"
[ "$FAIL" -eq 0 ]
