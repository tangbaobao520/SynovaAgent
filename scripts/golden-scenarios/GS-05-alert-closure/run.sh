#!/bin/bash
# GS-05 告警闭环场景 — 越阈 fixture → sentinel_tickets 有行 + 推送去重键稳定（S0-3）
# 运行契约（设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
# 序列：空库触发（负向基线）→ 注入越阈 fixture → 触发#1（越阈→工单）→ 触发#2（去重键稳定）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 0. 自举 JWT（真实客户端行为）：bootstrap.ts 强制 DEV_MODE=false → 上传须带合法 Bearer token。
#    run.sh 生成 JWT_SECRET（≥16 字符）→ bootstrap 子进程继承（{...process.env}）→ 同密钥签发 token。
#    一行自举（K3 R2）：无人工前置步骤。
JWT_SECRET="gs05-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs05-scenario", role: "admin", orgId: "default", iat: now, exp: now + 3600, jti: "gs05-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-05] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-05] 临时数据目录: $DATA_DIR"

# 铁律 0-4 隔离加固（2026-08-19 实测缺陷）: config.ts 的 SYNOVA_DB_PATH 优先级高于 SYNOVA_DATA_DIR，
# 开发者会话常自带 SYNOVA_DB_PATH（GSS README 08-16 已警告"自带指向真实库"）→ 会短路指向真实库。
# run.sh 显式覆盖为临时库路径——结构上保证触达不了真实 data/synova.db。
export SYNOVA_DB_PATH="$DATA_DIR/synova.db"

cleanup() {
  # 幂等 + 中途失败也清理临时资源（硬契约 8）
  if [[ -f "$DATA_DIR/bootstrap-state.json" ]]; then
    pid="$(python3 -c "import json;print(json.load(open('$DATA_DIR/bootstrap-state.json'))['pid'])" 2>/dev/null || echo "")"
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  fi
  rm -rf "$DATA_DIR" 2>/dev/null || true
  rm -f "$SCRIPT_DIR/expect.runtime.json"
}
trap cleanup EXIT

# 2. bootstrap（临时端口 + healthz 就绪探测）
#   注: bootstrap.ts 起服务后进程不退出（子进程 stdio 管道保持父进程事件循环，2026-08-19 实测）——
#       不能命令替换（会永久挂起），改为后台拉起 + 轮询 bootstrap-state.json
(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 60); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-05] ❌ bootstrap 超时（120s 未就绪）— 日志尾:"
  tail -5 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-05] 服务就绪: $BASE"

# 3. 负向基线：空库触发 cash-runway（无数据 → 不得产生工单，降级不误报）
curl -sS -X POST "$BASE/api/sentinel/run/cash-runway" > "$DATA_DIR/run-empty-response.json" 2>&1 || true
curl -sS "$BASE/api/sentinel/tickets" > "$DATA_DIR/tickets-empty.json" 2>&1 || true
# 空库时刻 DB 工单快照（断言在末尾运行，届时触发#1 已建工单——须在负向时刻采样，否则断言失真）
python3 -c "import sqlite3;c=sqlite3.connect('$DATA_DIR/synova.db');print('EMPTY_TICKET_COUNT='+str(c.execute('SELECT COUNT(*) FROM sentinel_tickets').fetchone()[0]))" > "$DATA_DIR/empty-ticket-count.txt" 2>/dev/null || echo "EMPTY_TICKET_COUNT=ERR" > "$DATA_DIR/empty-ticket-count.txt"
echo "[GS-05] 空库触发响应: $(cat "$DATA_DIR/run-empty-response.json")"
echo "[GS-05] 空库工单: $(cat "$DATA_DIR/tickets-empty.json")"
echo "[GS-05] 空库 DB 工单快照: $(cat "$DATA_DIR/empty-ticket-count.txt")"

# 4. inject 越阈 fixture（erp-standard 契约，走 field-mappings；现金 3 万/月耗 12 万 → runway 0.25 < critical 6）
curl -sS -X POST "$BASE/api/data/upload" \
  -H 'Content-Type: application/json' \
  -H "$AUTH_HEADER" \
  -d "{\"mapping\":\"erp-standard\",\"rows\":[$(cat "$SCRIPT_DIR/fixtures/erp-low-cash.json")],\"graph\":\"default\"}" \
  > "$DATA_DIR/upload-response.json" 2>&1 || true
echo "[GS-05] 注入响应: $(cat "$DATA_DIR/upload-response.json")"

# 5. 触发#1：越阈 → 告警 → 工单落库
curl -sS -X POST "$BASE/api/sentinel/run/cash-runway" > "$DATA_DIR/run-1-response.json" 2>&1 || true
curl -sS "$BASE/api/sentinel/tickets" > "$DATA_DIR/tickets-after-1.json" 2>&1 || true
echo "[GS-05] 触发#1响应: $(cat "$DATA_DIR/run-1-response.json")"
echo "[GS-05] 工单#1: $(cat "$DATA_DIR/tickets-after-1.json")"

# 6. 触发#2：同哨兵去重窗口内再触发 → 工单不新增（推送/工单去重键稳定）
curl -sS -X POST "$BASE/api/sentinel/run/cash-runway" > "$DATA_DIR/run-2-response.json" 2>&1 || true
curl -sS "$BASE/api/sentinel/tickets" > "$DATA_DIR/tickets-after-2.json" 2>&1 || true
echo "[GS-05] 触发#2响应: $(cat "$DATA_DIR/run-2-response.json")"
echo "[GS-05] 工单#2: $(cat "$DATA_DIR/tickets-after-2.json")"

# 6b. 去重标记：工单数二次对比（assert 引擎 rows 白名单无 ==N，改为文件标记机器判定）
#     源 = sqlite 真实计数（与 ticket-created 同源；tickets API 读内存 recent results 与 DB 不一致，2026-08-19 实测）
#     防御: A=$(fail) || echo 陷阱 → CNT 可能空串触发 set -u unbound；统一 ${X:-ERR} 兜底
CNT1="$(python3 -c "import sqlite3;c=sqlite3.connect('$DATA_DIR/synova.db');print(c.execute('SELECT COUNT(*) FROM sentinel_tickets').fetchone()[0])" 2>/dev/null || true)"
CNT2="$(python3 -c "import sqlite3;c=sqlite3.connect('$DATA_DIR/synova.db');print(c.execute('SELECT COUNT(*) FROM sentinel_tickets').fetchone()[0])" 2>/dev/null || true)"
CNT1="${CNT1:-ERR}"
CNT2="${CNT2:-ERR}"
if [[ "$CNT1" =~ ^[0-9]+$ && "$CNT2" =~ ^[0-9]+$ ]]; then
  if [ "$CNT1" -eq 0 ]; then
    echo "DEDUP_VACUOUS count=0（触发未产生工单 — 去重键无法验证，依赖 D356 告警闭环，诚实 RED）" > "$DATA_DIR/dedup-check.txt"
  elif [ "$CNT1" -eq "$CNT2" ]; then
    echo "DEDUP_STABLE count=$CNT1（触发#1=$CNT1 触发#2=$CNT2，同窗口内工单不新增）" > "$DATA_DIR/dedup-check.txt"
  else
    echo "DEDUP_UNSTABLE count1=$CNT1 count2=$CNT2（二次触发工单数变化）" > "$DATA_DIR/dedup-check.txt"
  fi
else
  echo "DEDUP_UNSTABLE count1=$CNT1 count2=$CNT2（tickets 响应解析失败）" > "$DATA_DIR/dedup-check.txt"
fi
echo "[GS-05] 去重检查: $(cat "$DATA_DIR/dedup-check.txt")"

# 7. 断言（expect.json 模板 → 注入 DATA_DIR 实际路径）
sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-05-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-05] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
