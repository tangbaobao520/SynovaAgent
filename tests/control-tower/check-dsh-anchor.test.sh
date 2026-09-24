#!/usr/bin/env bash
# D943 — check-dsh-anchor 门禁判别夹具（M9 三件套之一：改坏即红）
# 覆盖：正常 OK(0) / 事实源坏 DEGRADED(2) / 树移动 DEGRADED(2) / 旧断面引用 VIOLATION(1) / 空扫描 OK(0)
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="python3 $ROOT/scripts/control-tower/check-dsh-anchor.py"
PASS=0; FAIL=0
t() { local name="$1"; shift; local want="$1"; shift
  "$@" >/tmp/dsh-anchor-t.out 2>&1; local rc=$?
  if [ "$rc" = "$want" ]; then echo "  ✅ $name (rc=$rc)"; PASS=$((PASS+1));
  else echo "  ❌ $name 期望 rc=$want 实得 rc=$rc"; sed 's/^/      /' /tmp/dsh-anchor-t.out | head -4; FAIL=$((FAIL+1)); fi; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT

# T1 正常：事实源与真实树一致 → 0
t "T1 正常路径 = OK" 0 $GATE --repo "$ROOT"
# T2 事实源缺失 → 2（fail-closed，绝不当通过）
t "T2 事实源缺失 = DEGRADED" 2 $GATE --repo "$ROOT" --anchor "$TMP/nonexistent.json"
# T3 事实源非法 JSON → 2
echo '{ not json' > "$TMP/bad.json"
t "T3 事实源非法 = DEGRADED" 2 $GATE --repo "$ROOT" --anchor "$TMP/bad.json"
# T4 树已移动（事实源 head 篡改）→ 2
python3 -c "
import json;d=json.load(open('$ROOT/docs/synova/coordination/DSH-断面.json',encoding='utf-8'));d['current']['head']='deadbeef';json.dump(d,open('$TMP/moved.json','w',encoding='utf-8'),ensure_ascii=False)"
t "T4 树已移动 = DEGRADED" 2 $GATE --repo "$ROOT" --anchor "$TMP/moved.json"
# T5 未登记版本串 → 1
mkdir -p "$TMP/s1"; echo 'DSH = 0.1.9-alpha.9' > "$TMP/s1/a.md"
t "T5 未登记版本串 = VIOLATION" 1 $GATE --repo "$ROOT" --scan-dir "$TMP/s1"
# T6 把 superseded 断面当现状引用 → 1
mkdir -p "$TMP/s2"; echo 'TS: 0.1.7-alpha.2 @ 00102833' > "$TMP/s2/b.md"
t "T6 引用已作废断面 = VIOLATION" 1 $GATE --repo "$ROOT" --scan-dir "$TMP/s2"
# T7 引用豁免段内的旧断面 → 0（豁免生效）
mkdir -p "$TMP/s3"; printf '# x\n\n## 引用豁免\n\n- 0.1.7-alpha.2 @ 00102833 — 历史留档\n' > "$TMP/s3/c.md"
t "T7 豁免段内 = OK" 0 $GATE --repo "$ROOT" --scan-dir "$TMP/s3"
# T8 空扫描目录 → 0
mkdir -p "$TMP/s4"
t "T8 空扫描 = OK" 0 $GATE --repo "$ROOT" --scan-dir "$TMP/s4"
# T9 真实树不存在 → 2
t "T9 树路径不存在 = DEGRADED" 2 $GATE --repo "$ROOT" --tree "$TMP/nodir"
echo "──── 结果: $PASS 通过, $FAIL 失败 ────"
[ "$FAIL" = "0" ] || exit 1
