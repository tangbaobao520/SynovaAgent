#!/bin/bash
# GS-01 首诊旅程场景 — 问卷/诉求入口 → 首诊诊断 → 报告产物可达
# 运行契约（GSS 设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
# 说明（D446，2026-08-21）：
#   · 首诊链路 = POST /api/diagnosis/consult（SSE 六阶段诊断，D232/D233 前置已就绪）
#   · 场景验证三个可机器判定的物理契约：
#     ① 负向：无 JWT → 401（auth 边界，fail-closed）
#     ② 正常：带 JWT 但缺 teamId → 400 VALIDATION_ERROR（入口可达 + 参数契约）
#     ③ 产物：GET /api/sentinel/reports → 200 ok（报告查询端点可达）
#   · consult 真实六阶段依赖 LLM（非确定性），本场景不硬跑 LLM —— 契约级断言
#     首诊旅程的入口/校验/产物端点，诚实 RED 明确标注（见 README.md）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 0. 自举 JWT（真实客户端行为，复用 GS-03 D462 模式）
JWT_SECRET="gs01-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs01-scenario", role: "admin", orgId: "default", iat: now, exp: now + 3600, jti: "gs01-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-01] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-01] 临时数据目录: $DATA_DIR"

# 铁律 0-4 隔离加固（D462 模式）：SYNOVA_DB_PATH 显式指向临时库
export SYNOVA_DB_PATH="$DATA_DIR/synova.db"

cleanup() {
  if [[ -f "$DATA_DIR/bootstrap-state.json" ]]; then
    pid="$(python3 -c "import json;print(json.load(open('$DATA_DIR/bootstrap-state.json'))['pid'])" 2>/dev/null || echo "")"
    if [[ -n "$pid" ]]; then kill "$pid" 2>/dev/null || true; fi
  fi
  rm -rf "$DATA_DIR" 2>/dev/null || true
  rm -f "$SCRIPT_DIR/expect.runtime.json"
}
trap cleanup EXIT

# 2. bootstrap（临时端口 + healthz 就绪探测）
(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 120 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 60); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-01] ❌ bootstrap 超时（120s 未就绪）— 日志尾:"
  tail -5 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-01] 服务就绪: $BASE"

# 3. 触发 1（负向）：无 token 调 consult → 401（auth fail-closed）
curl -sS -o "$DATA_DIR/noauth-response.json" -w "%{http_code}" \
  -X POST "$BASE/api/diagnosis/consult" \
  -H 'Content-Type: application/json' \
  -d '{"teamId":"t1","initiator":{"role":"ga"}}' \
  > "$DATA_DIR/noauth-status.txt" 2>&1 || true
echo "[GS-01] 无 token consult HTTP 状态: $(cat "$DATA_DIR/noauth-status.txt")"
echo "[GS-01] 无 token 响应: $(cat "$DATA_DIR/noauth-response.json")"

# 4. 触发 2（正常·入口校验）：带 token 但缺 teamId → 400 VALIDATION_ERROR
curl -sS -o "$DATA_DIR/validate-response.json" -w "%{http_code}" \
  -X POST "$BASE/api/diagnosis/consult" \
  -H 'Content-Type: application/json' \
  -H "$AUTH_HEADER" \
  -d '{"initiator":{"role":"ga"}}' \
  > "$DATA_DIR/validate-status.txt" 2>&1 || true
echo "[GS-01] 缺 teamId HTTP 状态: $(cat "$DATA_DIR/validate-status.txt")"
echo "[GS-01] 缺 teamId 响应: $(cat "$DATA_DIR/validate-response.json")"

# 5. 触发 3（产物端点）：GET /api/sentinel/reports → 200 ok
curl -sS -o "$DATA_DIR/reports-response.json" -w "%{http_code}" \
  -H "$AUTH_HEADER" \
  "$BASE/api/sentinel/reports" \
  > "$DATA_DIR/reports-status.txt" 2>&1 || true
echo "[GS-01] reports HTTP 状态: $(cat "$DATA_DIR/reports-status.txt")"
echo "[GS-01] reports 响应: $(cat "$DATA_DIR/reports-response.json")"

# 5.5 D504 Electron 断言组（静态配置 + 无头契约验证——CI 无 GUI 也能验桌面端产物面）
# D510 F1 标注: 以下断言①为静态检查非打包验证——真实打包产物验证见 D510 DESCOPE 表（founder-demo/CI）
ELECTRON_DIR="$REPO_ROOT/electron"

# ① L1-1 打包配置：backend-spawn/renderer 产物入包 + extraResources 后端资产
# ⚠️ 静态检查非打包验证（D510 F1）: 仅 grep build-synova.cjs 配置声明，不产出/不校验 release/ 产物
if grep -q "electron/backend-spawn.cjs" "$REPO_ROOT/build-synova.cjs"    && grep -q "dist/renderer" "$REPO_ROOT/build-synova.cjs"    && grep -q "extraResources" "$REPO_ROOT/build-synova.cjs"; then
  echo "PACK_CONFIG_OK" > "$DATA_DIR/electron-pack-check.txt"
else
  echo "PACK_CONFIG_MISSING" > "$DATA_DIR/electron-pack-check.txt"
fi

# ② L1-4 服务自启契约：node 无头直调 backend-spawn（reused 路径——本场景后端已在跑，探活必成功）
node -e '
  const { ensureBackend, buildCommand } = require(process.argv[1] + "/backend-spawn.cjs");
  (async () => {
    const dev = buildCommand("dev"), prod = buildCommand("prod");
    if (dev.bin !== "npx" || prod.bin !== "node") { console.error("buildCommand 契约失败"); process.exit(1); }
    const r = await ensureBackend({
      serverUrl: process.argv[2], cwd: process.argv[3], mode: "dev",
      command: { bin: "never-spawned", args: [] },
    });
    if (r.reused !== true) { console.error("reused 契约失败:", JSON.stringify(r)); process.exit(1); }
    console.log("SPAWN_CONTRACT_OK");
  })().catch((e) => { console.error("spawn 契约异常:", e.message); process.exit(1); });
' "$ELECTRON_DIR" "$BASE" "$REPO_ROOT" > "$DATA_DIR/electron-spawn-check.txt" 2>"$DATA_DIR/electron-spawn-check.err"   || echo "SPAWN_CONTRACT_FAIL" >> "$DATA_DIR/electron-spawn-check.txt"

# ③ L1-5 双引导收敛：main.cjs isPackaged 分支 + prod loadFile renderer
if grep -q "app.isPackaged" "$ELECTRON_DIR/main.cjs"    && grep -q "loadFile" "$ELECTRON_DIR/main.cjs"    && grep -q "renderer" "$ELECTRON_DIR/main.cjs"    && grep -q "ensureBackend" "$ELECTRON_DIR/main.cjs"; then
  echo "DUAL_BOOTSTRAP_OK" > "$DATA_DIR/electron-bootstrap-check.txt"
else
  echo "DUAL_BOOTSTRAP_MISSING" > "$DATA_DIR/electron-bootstrap-check.txt"
fi

# ④ L1-7 数据目录重定向：SYNOVA_DB_PATH 注入 + userData + src/config.ts:90 只读消费
if grep -q "SYNOVA_DB_PATH" "$ELECTRON_DIR/main.cjs"    && grep -q "getPath('userData')" "$ELECTRON_DIR/main.cjs"    && grep -q "SYNOVA_DB_PATH" "$REPO_ROOT/src/config.ts"; then
  echo "DBPATH_REDIRECT_OK" > "$DATA_DIR/electron-dbpath-check.txt"
else
  echo "DBPATH_REDIRECT_MISSING" > "$DATA_DIR/electron-dbpath-check.txt"
fi

# 6. 断言（expect.json 模板 → 注入 DATA_DIR 实际路径）
sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-01-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-01] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
