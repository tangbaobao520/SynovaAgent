#!/usr/bin/env bash
# tests/control-tower/daily-cto-board.test.sh — CT-40 配对测试（D969 补）
# 覆盖: 三态（2 degraded / 0 OK / 1 有红项）+ 看板产出文件 + 不静默通过
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$ROOT/scripts/control-tower/daily-cto-board.sh"
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); echo "  ✓ $1"; }
no(){ FAIL=$((FAIL+1)); echo "  ✗ $1"; }

[ -f "$SCRIPT" ] || { echo "FATAL: 脚本不存在 $SCRIPT"; exit 1; }

# ① 降级路径: 工作区不存在 ⇒ exit 2（fail-closed，绝不静默通过）
OUT=$(SYNO_REPO=/nonexistent-ws-$$ bash "$SCRIPT" 2>&1); RC=$?
[ "$RC" -eq 2 ] && ok "工作区不存在 ⇒ exit 2（fail-closed）" || no "工作区不存在应为 exit 2，实得 $RC"
echo "$OUT" | grep -q "DEGRADED" && ok "降级输出含 DEGRADED" || no "降级输出缺 DEGRADED 标记"

# ② 正常路径: 隔离仓（git init + 最小结构）⇒ exit 0 或 1，且产出看板文件
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
( cd "$TMP" && git init -q . && mkdir -p docs/synova/coordination task-state .codex/control-tower/logs \
  && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m init ) >/dev/null 2>&1
OUT2=$(SYNO_REPO="$TMP" bash "$SCRIPT" 2>&1); RC2=$?
{ [ "$RC2" -eq 0 ] || [ "$RC2" -eq 1 ]; } && ok "隔离仓 ⇒ exit 0/1（实得 $RC2）" || no "隔离仓异常退出 $RC2"
[ -f "$TMP/docs/synova/coordination/CTO-看板-自动.md" ] && ok "看板文件已产出" || no "看板文件未产出（静默失败）"
grep -q "DAILY-BOARD" <<<"$OUT2" && ok "stdout 含 DAILY-BOARD 结论行" || no "stdout 缺结论行"

# ③ 三态明确性: 脚本头注释必须声明三态语义（防退化）
grep -qE "三态|exit 2" "$SCRIPT" && ok "脚本自述三态语义（exit 2 存在）" || no "脚本缺三态语义说明"

echo "  ── daily-cto-board.test.sh: 通过 $PASS / 失败 $FAIL ──"
[ "$FAIL" -eq 0 ] || exit 1
