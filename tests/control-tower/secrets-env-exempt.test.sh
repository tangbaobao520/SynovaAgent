#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# secrets-env-exempt.test.sh — Secrets 门禁 .env 本地密钥库豁免测试（D370）
#
# 背景: 2026-08-14 23:04 起 .env（gitignored 本地密钥库, 产品运行依赖真实密钥）触发
# 全工作区扫描硬阻断 → 所有提交被误拦（上一 session WIP 卡死实证）。
# 修复: 未跟踪 + gitignored 的 .env = 正常运行状态 → 豁免;
#       被 git 跟踪的 .env / 源码硬编码 / 暂存 .env → 仍硬阻断（泄漏路径不变）。
#
# 覆盖（铁律 48: 正常/降级/边界; 铁律 0-2: red→green）:
#   1. gitignored+未跟踪 .env 含真实形态密钥 → exit 0（正常: 本地密钥库豁免）
#   2. 同一 .env 被 git 跟踪 → exit 1（边界: 跟踪即泄漏风险）
#   3. 源码硬编码 sk- 密钥 → exit 1（边界: 保护不回退）
#   4. .claude/settings.local.json 含密钥 → exit 1（边界: .claude/ 专项保护保持）
#   5. .env 被暂存 → exit 1（边界: 暂存检查保持）
#   6. 生产接线: pre-commit-check.sh 调用 check-secrets.sh（wire check）
#
# 隔离: mktemp 沙箱仓库 + SYNO_SECRETS_ROOT 测试注入, 零真实目录零网络。
# 用法: bash tests/control-tower/secrets-env-exempt.test.sh
# 退出码: 0 = 全部通过
# ═══════════════════════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
CHECK="$REPO_DIR/scripts/check-secrets.sh"
PRECOMMIT="$REPO_DIR/scripts/pre-commit-check.sh"

PASS=0
FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
assert_exit() { # <got> <want> <msg>
  if [ "$1" -eq "$2" ]; then pass "$3"; else fail "$3 (got exit=$1, want exit=$2)"; fi
}

# ── 沙箱仓库 ──
SANDBOX=$(mktemp -d /tmp/sec-env.XXXXXX)
trap 'rm -rf "$SANDBOX"' EXIT
git -C "$SANDBOX" init -q 2>/dev/null || git init -q "$SANDBOX"
git -C "$SANDBOX" config user.email t@t
git -C "$SANDBOX" config user.name t
printf '.env\n.claude/settings.local.json\n' > "$SANDBOX/.gitignore"
printf 'const x = 1;\n' > "$SANDBOX/src.ts"

# 真实形态密钥（不轮换任何真实密钥 — 纯测试合成串）
FAKE_KEY="sk-abcdefghijklmnopqrstuvwx"

RUN_CHECK() { SYNO_SECRETS_ROOT="$SANDBOX" bash "$CHECK" 2>&1; }

# ── T1: gitignored + 未跟踪 .env 含密钥 → exit 0（正常: 豁免）──
printf 'DEEPSEEK_API_KEY=%s\n' "$FAKE_KEY" > "$SANDBOX/.env"
OUT1=$(RUN_CHECK)
EXIT1=$?
assert_exit "$EXIT1" 0 "T1: 未跟踪 .env 豁免 exit 0"
echo "$OUT1" | grep -q "工作区无真实凭证" && pass "T1: 输出确认无违规" || fail "T1: 输出异常: $OUT1"

# ── T2: .env 被 git 跟踪 → exit 1（边界: 跟踪即泄漏风险）──
git -C "$SANDBOX" add -f .env 2>/dev/null # swallow-ok: 测试沙箱 git 噪声静默
OUT2=$(RUN_CHECK)
EXIT2=$?
assert_exit "$EXIT2" 1 "T2: 被跟踪 .env 阻断 exit 1"
git -C "$SANDBOX" rm --cached -q .env 2>/dev/null # swallow-ok: 测试沙箱 git 噪声静默

# ── T3: 源码硬编码密钥 → exit 1（边界: 保护不回退）──
printf 'const key = "%s";\n' "$FAKE_KEY" > "$SANDBOX/src.ts"
OUT3=$(RUN_CHECK)
EXIT3=$?
assert_exit "$EXIT3" 1 "T3: 源码硬编码阻断 exit 1"

# ── T4: .claude/settings.local.json 含密钥 → exit 1（边界: .claude/ 专项保护保持）──
printf 'const clean = 1;\n' > "$SANDBOX/src.ts"
mkdir -p "$SANDBOX/.claude"
printf '{"DEEPSEEK_API_KEY": "%s"}\n' "$FAKE_KEY" > "$SANDBOX/.claude/settings.local.json"
OUT4=$(RUN_CHECK)
EXIT4=$?
assert_exit "$EXIT4" 1 "T4: .claude/ 密钥阻断 exit 1"
rm -rf "$SANDBOX/.claude"

# ── T5: .env 被暂存 → exit 1（边界: 暂存检查保持）──
git -C "$SANDBOX" add -f .env 2>/dev/null # swallow-ok: 测试沙箱 git 噪声静默
OUT5=$(RUN_CHECK)
EXIT5=$?
assert_exit "$EXIT5" 1 "T5: 暂存 .env 阻断 exit 1"
git -C "$SANDBOX" rm --cached -q .env 2>/dev/null # swallow-ok: 测试沙箱 git 噪声静默

# ── T6: 生产接线（wire check）──
if grep -q "check-secrets.sh" "$PRECOMMIT"; then
  pass "T6: pre-commit-check.sh 物理调用 check-secrets.sh"
else
  fail "T6: pre-commit-check.sh 零调用 — Secrets 组未接线"
fi

# ── 汇总 ──
echo ""
echo "═══════════════════════════════════════"
echo "  PASS=$PASS  FAIL=$FAIL"
echo "═══════════════════════════════════════"
[ "$FAIL" -eq 0 ]
