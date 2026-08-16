# 验证脚本 — dsh-desktop 壳自检（headless，不需要 GUI 交互）
# 用法: bash dsh/desktop/verify.sh
set -uo pipefail

PORT=3080
BASE="http://127.0.0.1:${PORT}"
PASS=0; FAIL=0

check() {
  local name="$1" cond="$2"
  if eval "$cond"; then echo "  ✅ $name"; PASS=$((PASS+1)); else echo "  ❌ $name"; FAIL=$((FAIL+1)); fi
}

echo "== dsh-desktop 壳自检 =="

# ① dsh web 在跑（当前浏览器实例即可，壳会复用）
# swallow-ok: 探针命令预期输出进 /dev/null，仅取 HTTP code（验证脚本模式，非业务代码）
check "dsh web 存活 (${BASE}/)" "curl -s -o /dev/null -w '%{http_code}' --max-time 3 $BASE/ | grep -q 200"

# ② Host 半数据路由
check "Host 数据路由 /synova/dashboards/data" "curl -s --max-time 3 $BASE/synova/dashboards/data | grep -q 'product_progress_pct'"

# ③ client 包可提供（进程重启后必真；未重启时可能 404 → 提示重启）
# swallow-ok: 探针只取 HTTP code，body 弃置（验证脚本模式）
echo "  ⚠️  ③ client 包可提供性（需 dsh web 重启后才 404→200；当前可先看状态）"
curl -s -o /dev/null -w "       HTTP %{http_code}\n" --max-time 3 "$BASE/plugins/@synova/dsh-dashboards/client.js"

# ④ 端口单一监听（无冲突）——lsof -t 只输出 PID 行，无表头
check "3080 单一 LISTEN（无双实例）" "[ \$(lsof -t -iTCP:$PORT -sTCP:LISTEN -P 2>/dev/null | wc -l | tr -d ' ') -le 1 ]" # swallow-ok: 端口未占用时 lsof 预期 stderr，探测型判定

# ⑤ Electron 二进制可执行（已安装）
check "electron 二进制存在" "[ -x node_modules/electron/dist/Electron.app/Contents/MacOS/Electron ]"

echo ""
echo "通过 $PASS 项 / 失败 $FAIL 项"
[ "$FAIL" = 0 ] && echo "✅ 全部通过" || echo "❌ 有失败项，见上"
exit $FAIL
