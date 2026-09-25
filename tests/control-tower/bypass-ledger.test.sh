#!/bin/bash
# ═══════════════════════════════════════════════════════════════════════════════
# bypass-ledger.test.sh — D735 Stage 2（bypass 账本出库：归档 + 旧路径(若存在) + per-session）
#
# 覆盖（铁律 48: 正常 / 降级 / 边界）:
#   1. path     — 落点解析（env 优先 / 注入缝覆盖 / 归一）
#   2. append   — 创建目录 + 追加 + 内容正确
#   3. sources  — **归档 + 旧路径 + per-session** 联合、去重、稳定排序；归档缺失退化
#   4. read     — 全来源合并内容
#   5. 降级     — 落点不可写 → exit 2（fail-closed，不静默回退写旧路径）
#   6. 边界     — 未知子命令 / 缺内容 / 空参数
#   7. 接线     — post-commit.sh 真调用本脚本；check-bypass-log.sh 走 union 读（铁律 0-2）
#   8. Stage 2 不变量 — 旧路径**停写** + 影子登记提交**已删除**（本卡契约，D970）
#
# 零真实仓库污染: 全部经 SYNO_BYPASS_LEDGER_DIR / SYNO_LEGACY_BYPASS_LOG /
#   SYNO_BYPASS_SESSIONS_ROOT / SYNO_BYPASS_ARCHIVE_DIR 注入缝落在 mktemp 沙箱。
# ═══════════════════════════════════════════════════════════════════════════════
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
TOOL="$REPO_DIR/scripts/control-tower/bypass-ledger.sh"
HOOK="$REPO_DIR/scripts/hooks/post-commit.sh"
CHECKER="$REPO_DIR/scripts/control-tower/check-bypass-log.sh"

TMPD="$(mktemp -d)"
trap 'rm -rf "$TMPD"' EXIT

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
OUT=""; RC=0
run() { OUT="$( "$@" 2>&1 )"; RC=$?; }
NOARCH="$TMPD/no-archive"   # 归档注入缝：指向不存在目录 → 隔离真实归档

echo "═══════════════════════════════════════════════════════════"
echo "  D735 Stage 2 — bypass 账本出库（归档 + per-session 读面）"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "── 1. path: 落点解析 ──"
run env SYNO_SESSION_ID="sessA" SYNO_BYPASS_LEDGER_DIR="" bash "$TOOL" path
if [ "$RC" = 0 ] && echo "$OUT" | grep -q "sessA/bypass.log"; then pass "SYNO_SESSION_ID 进落点路径"; else fail "path 未含 sessA: $OUT"; fi
run env SYNO_SESSION_ID="a/b c" bash "$TOOL" path
if echo "$OUT" | grep -qE "a_b_c/bypass.log"; then pass "会话标识归一（/ 与空格 → _）"; else fail "未归一: $OUT"; fi
run env -u SYNO_SESSION_ID -u DSH_SESSION_ID -u SYNO_TASK_ID -u TASK_ID bash "$TOOL" path
if echo "$OUT" | grep -q "\.sessions/"; then pass "无 env 时回退（分支或目录名）仍落 .sessions/"; else fail "回退失败: $OUT"; fi
if echo "$OUT" | grep -q "$REPO_DIR/.sessions/"; then pass "落点在仓库 .sessions/ 下"; else fail "落点不在 .sessions/: $OUT"; fi

echo ""
echo "── 2. append: 创建 + 追加 ──"
LD="$TMPD/led/one"
run env SYNO_BYPASS_LEDGER_DIR="$LD" bash "$TOOL" append "2026-01-01T00:00:00Z | COMMITTED | HASH=deadbeef"
[ "$RC" = 0 ] && pass "append exit 0" || fail "append exit=$RC ($OUT)"
if [ -f "$LD/bypass.log" ] && grep -q "HASH=deadbeef" "$LD/bypass.log"; then pass "目录自动创建 + 内容落盘"; else fail "落盘失败"; fi
env SYNO_BYPASS_LEDGER_DIR="$LD" bash "$TOOL" append "second line"
if [ "$(grep -c . "$LD/bypass.log" | tr -d '\r\n')" = "2" ]; then pass "追加不覆盖（2 行）"; else fail "追加覆盖了"; fi

echo ""
echo "── 3. sources: 归档 + 旧路径 + per-session，去重 + 稳定排序 ──"
LD2="$TMPD/ledtwo"; LEG="$TMPD/legacy.log"; ARCH="$TMPD/archive"
mkdir -p "$LD2" "$ARCH"
printf 'legacy-1\n' > "$LEG"
printf 'new-1\n' > "$LD2/bypass.log"
printf 'archived-1\n' > "$ARCH/frozen-2026-09-25.txt"
run env SYNO_BYPASS_LEDGER_DIR="$LD2" SYNO_LEGACY_BYPASS_LOG="$LEG" \
  SYNO_BYPASS_SESSIONS_ROOT="$TMPD/empty-sessions" SYNO_BYPASS_ARCHIVE_DIR="$ARCH" bash "$TOOL" sources
CNT=$(printf '%s\n' "$OUT" | grep -c . | tr -d '\r\n')
[ "$CNT" = "3" ] && pass "sources 恰好 3 条（归档 + 旧路径 + per-session，无重复）" || fail "sources 条数 = ${CNT}（应 3，重复即去重失效）"
printf '%s\n' "$OUT" | grep -q "frozen-2026-09-25.txt" && pass "冻结归档纳入读面（证据链保全）" || fail "归档未纳入 sources"
printf '%s\n' "$OUT" | grep -q "legacy.log" && pass "旧路径仍纳入读面（本机残留证据不丢）" || fail "旧路径未纳入 sources"
OUT1="$OUT"
run env SYNO_BYPASS_LEDGER_DIR="$LD2" SYNO_LEGACY_BYPASS_LOG="$LEG" \
  SYNO_BYPASS_SESSIONS_ROOT="$TMPD/empty-sessions" SYNO_BYPASS_ARCHIVE_DIR="$ARCH" bash "$TOOL" sources
[ "$OUT1" = "$OUT" ] && pass "sources 稳定可复现（两次逐字节一致）" || fail "sources 顺序不稳定"
run env SYNO_BYPASS_LEDGER_DIR="$LD2" SYNO_LEGACY_BYPASS_LOG="$LEG" \
  SYNO_BYPASS_SESSIONS_ROOT="$TMPD/empty-sessions" SYNO_BYPASS_ARCHIVE_DIR="$NOARCH" bash "$TOOL" sources
CNT=$(printf '%s\n' "$OUT" | grep -c . | tr -d '\r\n')
[ "$CNT" = "2" ] && pass "归档缺失 → 退化为 2 条（不报错、不吞其余来源）" || fail "归档缺失时条数 = ${CNT}（应 2）"
run env SYNO_BYPASS_LEDGER_DIR="$TMPD/none" SYNO_LEGACY_BYPASS_LOG="$TMPD/none-legacy.log" \
  SYNO_BYPASS_SESSIONS_ROOT="$TMPD/empty-sessions" SYNO_BYPASS_ARCHIVE_DIR="$NOARCH" bash "$TOOL" sources
[ -z "$OUT" ] && pass "全不存在 → 空输出（不报错）" || fail "全不存在时输出非空: $OUT"

WR="$TMPD/wtroot"; mkdir -p "$WR/other"; printf 'other-session\n' > "$WR/other/bypass.log"
run env SYNO_BYPASS_LEDGER_DIR="$TMPD/none" SYNO_LEGACY_BYPASS_LOG="$TMPD/none-legacy.log" \
  SYNO_BYPASS_SESSIONS_ROOT="$WR" SYNO_BYPASS_ARCHIVE_DIR="$NOARCH" bash "$TOOL" sources
printf '%s\n' "$OUT" | grep -q "other/bypass.log" && pass "仓库级 .sessions 扫描纳入其他 session 账本" || fail "仓库级扫描缺失（对账会漏别的 session 登记）"

echo ""
echo "── 4. read: 合并内容 ──"
run env SYNO_BYPASS_LEDGER_DIR="$LD2" SYNO_LEGACY_BYPASS_LOG="$LEG" \
  SYNO_BYPASS_SESSIONS_ROOT="$TMPD/empty-sessions" SYNO_BYPASS_ARCHIVE_DIR="$ARCH" bash "$TOOL" read
if echo "$OUT" | grep -q "legacy-1" && echo "$OUT" | grep -q "new-1" && echo "$OUT" | grep -q "archived-1"; then
  pass "read 合并三来源（归档 + 旧路径 + per-session）"
else
  fail "read 未合并三来源: $OUT"
fi
# 去重（D970 实测缺陷）: 冻结归档是旧路径的**副本**，同一行两源并存时 read 必须只输出一次
#   —— 否则 Gatekeeper / 组 7c 的计数会翻倍（实测：今日 1 条被读成 2）。
DUP="$TMPD/dup"; mkdir -p "$DUP/leg" "$DUP/arch"
printf 'same-line\n' > "$DUP/leg/legacy.log"
printf 'same-line\nother-line\n' > "$DUP/arch/frozen.txt"
run env SYNO_BYPASS_LEDGER_DIR="$DUP/leg" SYNO_LEGACY_BYPASS_LOG="$DUP/leg/legacy.log" \
  SYNO_BYPASS_SESSIONS_ROOT="$TMPD/empty-sessions" SYNO_BYPASS_ARCHIVE_DIR="$DUP/arch" bash "$TOOL" read
CNT_DUP=$(printf '%s\n' "$OUT" | grep -c '^same-line$' | tr -d '\r\n')
[ "$CNT_DUP" = "1" ] && pass "read 去重（同一行归档+旧路径并存 → 只输出一次）" || fail "read 重复计数 = ${CNT_DUP}（应 1）"
printf '%s\n' "$OUT" | grep -q '^other-line$' && pass "read 去重不影响其它行（other-line 在）" || fail "去重误删其它行"

echo ""
echo "── 5. 降级: 落点不可写 → exit 2（fail-closed）──"
RO="$TMPD/readonly"; mkdir -p "$RO"; chmod 500 "$RO"
run env SYNO_BYPASS_LEDGER_DIR="$RO/sub" bash "$TOOL" append "should-fail"
if [ "$RC" = 2 ]; then pass "不可写 → exit 2"; else fail "不可写却 exit=${RC}（应 2，不得静默回退写旧路径）"; fi
chmod 700 "$RO" 2>/dev/null || true
if echo "$OUT" | grep -q "fail-closed"; then pass "降级信息点名 fail-closed"; else fail "降级信息缺 fail-closed"; fi
run env SYNO_BYPASS_LEDGER_DIR="$RO/sub" bash "$TOOL" path
[ "$RC" = 0 ] && pass "path 子命令不因目标不存在而失败（只解析）" || fail "path exit=$RC"

echo ""
echo "── 6. 边界 ──"
run bash "$TOOL"
[ "$RC" = 1 ] && pass "无子命令 → exit 1 + 用法" || fail "无子命令 exit=${RC}（应 1）"
run bash "$TOOL" bogus-cmd
[ "$RC" = 1 ] && pass "未知子命令 → exit 1" || fail "未知子命令 exit=${RC}（应 1）"
run bash "$TOOL" append ""
[ "$RC" = 1 ] && pass "append 空内容 → exit 1" || fail "空 append exit=${RC}（应 1）"

echo ""
echo "── 7. 接线（铁律 0-2 WIRE CHECK）──"
grep -q "bypass-ledger.sh" "$HOOK" && pass "post-commit.sh 真调用 bypass-ledger.sh（非死代码）" || fail "post-commit.sh 未调用（死代码）"
grep -q "LEDGER_SOURCES" "$CHECKER" && pass "check-bypass-log.sh 用多来源对账" || fail "对账器未接多来源"

echo ""
echo "── 8. Stage 2 不变量: 旧路径停写 + 影子登记提交已删 ──"
if grep -q '>> "$ROOT/.claude/bypass.log"' "$HOOK"; then
  fail "旧路径仍在写（Stage 2 应已停写）"
else
  pass "旧路径已停写（Stage 2 单一落点成立）"
fi
if grep -q 'git commit --no-verify -q -o -m "chore: bypass COMMITTED' "$HOOK"; then
  fail "影子登记提交仍在（Stage 2 应删除）"
else
  pass "影子登记提交已删除（旧路径出库后无此需求）"
fi
# 5 处原始写入点全部改走 helper（不得有直写绕过）
DIRECT=$(grep -c '| _bypass_append' "$HOOK" | tr -d '\r\n')
[ "$DIRECT" = "5" ] && pass "5 处证据写入点全部走 _bypass_append（无直写绕过）" || fail "接线数 = ${DIRECT}（应 5）"
# helper 失败必须显式（不许静默回退旧路径）
grep -q 'degraded-events.log' "$HOOK" && pass "helper 失败留痕 degraded-events.log（不静默）" || fail "helper 失败无留痕"

echo ""
echo "═══════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ 全部通过: $PASS 项"
  echo "═══════════════════════════════════════════════════════════"
  exit 0
else
  echo "  ❌ $FAIL 项失败 / $PASS 项通过"
  echo "═══════════════════════════════════════════════════════════"
  exit 1
fi
