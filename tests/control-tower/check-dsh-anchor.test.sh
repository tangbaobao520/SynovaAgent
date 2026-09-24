#!/usr/bin/env bash
# D943 — check-dsh-anchor 判别夹具（密闭：只用 checkout 自身与临时目录，不依赖本机 DSH 树）
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
GATE="python3 $ROOT/scripts/control-tower/check-dsh-anchor.py"
PASS=0; FAIL=0
t() { local name="$1"; shift; local want="$1"; shift
  "$@" >/tmp/dsh-anchor-t.out 2>&1; local rc=$?
  if [ "$rc" = "$want" ]; then echo "  ✅ $name (rc=$rc)"; PASS=$((PASS+1));
  else echo "  ❌ $name 期望 rc=$want 实得 rc=$rc"; sed 's/^/      /' /tmp/dsh-anchor-t.out | head -3; FAIL=$((FAIL+1)); fi; }
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
HEAD=$(git -C "$ROOT" rev-parse --short HEAD)
mk(){ python3 - "$1" "$2" "$3" <<'PY'
import json,sys
path,head,out=sys.argv[1],sys.argv[2],sys.argv[3]
json.dump({"current":{"version":"0.1.7-rc.1","head":head,"tag":"dsh-v0.1.7-rc.1","path":path,"recorded_at":"test"},
 "superseded":[{"version":"0.1.7-alpha.2","head":"00102833","retired_at":"2026-09-24","reason":"test"}],
 "known_versions":["0.1.7-rc.1","0.1.7-alpha.2"]},open(out,"w",encoding="utf-8"),ensure_ascii=False)
PY
}
mk "$ROOT" "$HEAD" "$TMP/ok.json"            # 事实源绑定 checkout 自身 → 密闭
mkdir -p "$TMP/empty" "$TMP/s1" "$TMP/s2" "$TMP/s3"
echo 'DSH = 0.1.9-alpha.9' > "$TMP/s1/a.md"
echo 'TS: 0.1.7-alpha.2 @ 00102833' > "$TMP/s2/b.md"
printf '# x\n\n## 引用豁免\n\n- 0.1.7-alpha.2 @ 00102833 — 历史留档\n' > "$TMP/s3/c.md"

t "T1 正常（事实源=checkout，树在场且一致）= OK" 0 $GATE --repo "$ROOT" --anchor "$TMP/ok.json" --tree "$ROOT" --scan-dir "$TMP/empty"
t "T2 事实源缺失 = DEGRADED" 2 $GATE --repo "$ROOT" --anchor "$TMP/none.json" --tree "$ROOT" --scan-dir "$TMP/empty"
echo '{ bad' > "$TMP/bad.json"
t "T3 事实源非法 JSON = DEGRADED" 2 $GATE --repo "$ROOT" --anchor "$TMP/bad.json" --tree "$ROOT" --scan-dir "$TMP/empty"
mk "$ROOT" deadbeef "$TMP/moved.json"
t "T4 树已移动（head 不符）= DEGRADED" 2 $GATE --repo "$ROOT" --anchor "$TMP/moved.json" --tree "$ROOT" --scan-dir "$TMP/empty"
t "T5 未登记版本串 = VIOLATION" 1 $GATE --repo "$ROOT" --anchor "$TMP/ok.json" --tree "$ROOT" --scan-dir "$TMP/s1"
t "T6 引用已作废断面 = VIOLATION" 1 $GATE --repo "$ROOT" --anchor "$TMP/ok.json" --tree "$ROOT" --scan-dir "$TMP/s2"
t "T7 豁免段内 = OK" 0 $GATE --repo "$ROOT" --anchor "$TMP/ok.json" --tree "$ROOT" --scan-dir "$TMP/s3"
t "T8 空扫描 = OK" 0 $GATE --repo "$ROOT" --anchor "$TMP/ok.json" --tree "$ROOT" --scan-dir "$TMP/empty"
t "T9 树路径不存在 = DEGRADED" 2 $GATE --repo "$ROOT" --anchor "$TMP/ok.json" --tree "$TMP/nodir" --scan-dir "$TMP/empty"
t "T10 CI 模式 --no-tree-check（无本地 DSH 树仍只查文档）= OK" 0 $GATE --repo "$ROOT" --anchor "$TMP/ok.json" --no-tree-check --scan-dir "$TMP/empty"
echo "──── 结果: $PASS 通过, $FAIL 失败 ────"
[ "$FAIL" = "0" ] || exit 1
