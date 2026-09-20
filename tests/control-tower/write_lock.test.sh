#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# write_lock.test.sh — write_lock.py 配对测试（U7/CT-40 命名约定:
#   scripts/control-tower/write_lock.py ↔ tests/control-tower/write_lock.test.sh）
#
# 覆盖矩阵（铁律 48：正常 / 降级 / 边界）:
#   ① 原子获取（D847）: 两进程并发抢同一把锁 → **恰好一个成功**（消 D209 的 check-then-act 竞态）
#   ② 重复获取: 同一进程二次 acquire → 拒绝（acquired=False + reason）
#   ③ 过期锁回收: timestamp=0 的残留锁（持锁进程崩溃）→ 可获取（无永久死锁）
#   ④ 空窗口保护（D847 实测丢更新根因）: 锁文件刚被 O_EXCL 创建、payload 未写完（空/半写 + mtime 新鲜）
#      → **不得判定过期**（否则两进程同时进临界区）；仅当确实陈旧才可回收
#   ⑤ 降级契约（D209 §5）: 只读锁目录 → acquired=True + degraded=True + reason（**不抛异常**）
#   ⑥ 释放语义: pid 不匹配 → released=False（不误删他人锁）；本人 → released=True 且可再次获取
#
# 隔离: mktemp -d 沙箱（锁目录也在沙箱内），零真实仓库写入、零网络。
# 跨平台: 只用 python3（Windows Git Bash 无 shasum/coreutils）；路径作 argv 传入（MSYS 会转换 argv）。
# ═══════════════════════════════════════════════════════════════
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
LOCK_SRC="$REPO_DIR/scripts/control-tower/write_lock.py"

PASS=0; FAIL=0
pass() { PASS=$((PASS + 1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL + 1)); echo "  ❌ $1" >&2; }
skip() { echo "  ⚠ 跳过: $1"; }
assert_eq() { if [ "$1" = "$2" ]; then pass "$3 (=$1)"; else fail "$3 — 实际 $1 期望 $2"; fi; }
assert_contains() { if echo "$1" | grep -qF -- "$2"; then pass "$3"; else fail "$3 — 未找到: $2"; fi; }

if [ ! -f "$LOCK_SRC" ]; then echo "❌ 缺 scripts/control-tower/write_lock.py（未实现）" >&2; exit 2; fi

SB=$(mktemp -d); trap 'rm -rf "$SB"' EXIT
LOCKDIR="$REPO_DIR/scripts/control-tower"
LOCKS="$SB/locks"
rm -rf "$LOCKS"

echo "── ① 原子获取: 两进程并发抢同一把锁（先占者独占，后到者拒绝）──"
python3 -c '
import sys, time
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
lk = WriteLock(lock_dir=sys.argv[2], timeout_sec=30)
r = lk.acquire("contended-key", owner="holder-a")
print("A=%s" % ("OK" if r.get("acquired") else "REJECT"))
time.sleep(1.6)
if r.get("acquired"):
    lk.release("contended-key")
' "$LOCKDIR" "$LOCKS" > "$SB/a.out" 2>&1 &
APID=$!
sleep 0.8
python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
lk = WriteLock(lock_dir=sys.argv[2], timeout_sec=30)
r = lk.acquire("contended-key", owner="holder-b")
print("B=%s" % ("OK" if r.get("acquired") else "REJECT"))
' "$LOCKDIR" "$LOCKS" > "$SB/b.out" 2>&1
wait "$APID" 2>/dev/null || true   # swallow-ok: 夹具清理等待；被抢占时 wait 非零无副作用
assert_contains "$(cat "$SB/a.out")" "A=OK" "① 先到进程获取成功"
assert_contains "$(cat "$SB/b.out")" "B=REJECT" "① 后到进程被拒绝（同一时刻只有一个持有者）"
assert_contains "$(cat "$SB/b.out")" "REJECT" "① 竞争失败不降级为\"假成功\""
grep -qF "B=REJECT" "$SB/b.out" && pass "① 拒绝路径输出可核" || fail "① 拒绝路径无可核输出"

echo "── ①b 同时起跑（barrier）: 两进程同一时刻抢锁 → 恰好一个成功 ──"
rm -rf "$LOCKS"; rm -f "$SB/go"
for who in p1 p2; do
  ( python3 -c '
import os, sys, time
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
go = sys.argv[3]
while not os.path.exists(go):
    time.sleep(0.001)
lk = WriteLock(lock_dir=sys.argv[2], timeout_sec=30)
r = lk.acquire("barrier-key", owner=sys.argv[4])
print("%s=%s" % (sys.argv[4], "OK" if r.get("acquired") else "REJECT"))
time.sleep(0.5)
if r.get("acquired"):
    lk.release("barrier-key")
' "$LOCKDIR" "$LOCKS" "$SB/go" "$who" ) > "$SB/$who.out" 2>&1 &
done
sleep 0.9
touch "$SB/go"                 # 同时放行
wait 2>/dev/null || true       # swallow-ok: 夹具等待全部子进程结束；个别非零无副作用
OKS=$(cat "$SB/p1.out" "$SB/p2.out" | grep -c "=OK" | tr -d '\n\r')
assert_eq "$OKS" "1" "①b 同一时刻恰好一个持有者（TOCTOU 已消，不出现两个\"成功\"）"

echo "── ②/⑥ 重复获取 + 释放语义（同进程）──"
python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
lk = WriteLock(lock_dir=sys.argv[2], timeout_sec=30)
r1 = lk.acquire("same-proc", owner="me")
print("first=%s" % r1.get("acquired"))
r2 = lk.acquire("same-proc", owner="me")
print("second=%s" % r2.get("acquired"))
print("reason=%s" % ("有" if r2.get("reason") else "无"))
print("is_locked=%s" % lk.is_locked("same-proc"))
rel = lk.release("same-proc")
print("released=%s" % rel.get("released"))
print("is_locked_after=%s" % lk.is_locked("same-proc"))
r3 = lk.acquire("same-proc", owner="me")
print("reacquire=%s" % r3.get("acquired"))
lk.release("same-proc")
# pid 不匹配 → 拒绝释放（伪造他人锁文件）
import json, os, time
from pathlib import Path
lp = Path(sys.argv[2]) / lk._lock_id("foreign")
lp.parent.mkdir(parents=True, exist_ok=True)
lp.write_text(json.dumps({"pid": os.getpid() + 12345, "timestamp": time.time(), "owner": "other"}), encoding="utf-8")
print("foreign_release=%s" % lk.release("foreign").get("released"))
lp.unlink(missing_ok=True)
' "$LOCKDIR" "$LOCKS" > "$SB/same.out" 2>&1
O=$(cat "$SB/same.out")
assert_contains "$O" "first=True" "② 首次 acquire 成功"
assert_contains "$O" "second=False" "② 同进程二次 acquire 被拒（不重入）"
assert_contains "$O" "reason=有" "② 拒绝带 reason（不静默）"
assert_contains "$O" "is_locked=True" "② is_locked 反映锁定态"
assert_contains "$O" "released=True" "⑥ release 成功"
assert_contains "$O" "is_locked_after=False" "⑥ 释放后不再锁定"
assert_contains "$O" "reacquire=True" "⑥ 释放后可再次获取"
assert_contains "$O" "foreign_release=False" "⑥ pid 不匹配 → 拒绝释放他人锁"

echo "── ③ 过期锁回收（持锁进程崩溃残留）──"
rm -rf "$LOCKS"; mkdir -p "$LOCKS"
LKID=$(python3 -c "import hashlib;print(hashlib.sha256(b'stale-key').hexdigest()[:16])")
printf '{"pid":999999,"timestamp":0,"owner":"dead","file_path":"stale-key"}' > "$LOCKS/$LKID"
python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
r = WriteLock(lock_dir=sys.argv[2], timeout_sec=30).acquire("stale-key", owner="later")
print("acquired=%s" % r.get("acquired"))
' "$LOCKDIR" "$LOCKS" > "$SB/stale.out" 2>&1
assert_contains "$(cat "$SB/stale.out")" "acquired=True" "③ 过期锁被回收后可获取（崩溃无永久死锁）"

echo "── ④ 空窗口保护（D847 实测丢更新根因：不许抢\"刚创建、payload 未写完\"的锁）──"
rm -rf "$LOCKS"; mkdir -p "$LOCKS"
: > "$LOCKS/$LKID"          # 空文件 + mtime=刚刚（模拟 O_EXCL 创建后 payload 尚未落盘）
python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
r = WriteLock(lock_dir=sys.argv[2], timeout_sec=30).acquire("stale-key", owner="intruder")
print("acquired=%s" % r.get("acquired"))
' "$LOCKDIR" "$LOCKS" > "$SB/window.out" 2>&1
assert_contains "$(cat "$SB/window.out")" "acquired=False" "④ 空锁文件（mtime 新鲜）不被判过期 → 不抢（否则两进程同进临界区）"
printf '{"pid":99,"timestamp":' > "$LOCKS/$LKID"   # 半写（JSON 截断）+ mtime 新鲜
python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
r = WriteLock(lock_dir=sys.argv[2], timeout_sec=30).acquire("stale-key", owner="intruder")
print("acquired=%s" % r.get("acquired"))
' "$LOCKDIR" "$LOCKS" > "$SB/window2.out" 2>&1
assert_contains "$(cat "$SB/window2.out")" "acquired=False" "④ 半写锁文件（mtime 新鲜）同样不抢"
# 确实陈旧的不可解析锁 → 可回收（避免"损坏锁永久死锁"）
python3 -c "
import os, sys
p = sys.argv[1]
os.utime(p, (0, 0))   # mtime 置为纪元 → 明显陈旧
" "$LOCKS/$LKID"
python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
r = WriteLock(lock_dir=sys.argv[2], timeout_sec=30).acquire("stale-key", owner="later")
print("acquired=%s" % r.get("acquired"))
' "$LOCKDIR" "$LOCKS" > "$SB/window3.out" 2>&1
assert_contains "$(cat "$SB/window3.out")" "acquired=True" "④ 陈旧且不可解析的锁仍可回收（无永久死锁）"

echo "── ⑤ 降级契约（D209 §5）: 只读锁目录 → degraded allow，不抛异常 ──"
python3 -c '
import os, platform, sys
sys.path.insert(0, sys.argv[1])
from write_lock import WriteLock
base = os.path.join(sys.argv[2], "ro")
os.makedirs(base, exist_ok=True)
os.chmod(base, 0o444)
try:
    r = WriteLock(lock_dir=base, timeout_sec=300).acquire("degrade-key", owner="t")
    print("acquired=%s degraded=%s reason=%s" % (r.get("acquired"), bool(r.get("degraded")), "有" if r.get("reason") else "无"))
except Exception as exc:
    print("RAISED %s: %s (platform=%s)" % (type(exc).__name__, exc, platform.system()))
finally:
    os.chmod(base, 0o755)
' "$LOCKDIR" "$SB" > "$SB/ro.out" 2>&1
O=$(cat "$SB/ro.out")
if echo "$O" | grep -qF "RAISED"; then
  if [ "$(python3 -c 'import platform;print(platform.system())')" = "Windows" ]; then
    skip "⑤ 只读锁目录（Windows 权限模型不支持该用例）: $O"
  else
    fail "⑤ 只读锁目录不得抛异常 —— 实际 $O"
  fi
else
  assert_contains "$O" "acquired=True" "⑤ 锁目录不可写 → 降级允许写入（D209 契约）"
  assert_contains "$O" "degraded=True" "⑤ 降级必须显式标记（铁律 11：不静默放过）"
  assert_contains "$O" "reason=有" "⑤ 降级带原因（可诊断）"
fi

echo "──────────────────────────────────────────────"
echo "  PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "FAIL=0" || echo "FAIL=$FAIL"
exit $([ "$FAIL" -eq 0 ] && echo 0 || echo 1)
