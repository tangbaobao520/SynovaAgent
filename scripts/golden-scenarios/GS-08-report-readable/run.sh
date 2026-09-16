#!/bin/bash
# GS-08 报告可读场景 — 一页纸四槽位 + 各维度循环结论 + 结论可溯源（D791）
#
# 运行契约（GSS 设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
#
# D791 改造（验收点 3-1 / 3-7）：
#   · 断言面从「.hbs 模板加载器契约级」（D449）升级为「生产 HTTP 报告端点 + 真实渲染/读取路径」：
#     seed 真实图快照 + 真实 checkpoint 归档行 → bootstrap 真实服务 →
#     curl GET /api/diagnosis/consult/:reportId/report?format=markdown → 审计工件 → 断言 → 证据
#   · 删旧死代码（`dist/l3/report-template-loader.js` + `|| true` 吞错，铁律 37/11）
#
# 诚实边界（**契约级**，README + 证据 quote 双处标注）：
#   本场景**不跑**真实 LLM 六阶段诊断——诊断报告为 fixture（形状对齐 DiagnosisReport），
#   但 checkpoint 归档行、图快照、渲染路径、读取路径、审计面全部为真实生产路径。
#   禁止把本场景结论冒充为「全链路 LLM 诊断已验」。
set -euo pipefail

# D313 M5 UTF-8 强制: Windows 控制台/子进程统一 UTF-8
export PYTHONIOENCODING=utf-8
export LC_ALL=C.UTF-8 2>/dev/null || true

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"
OUT_DIR="$REPO_ROOT/scripts/golden-scenarios/evidence/GS-08-$DATE"
FIXTURE="$SCRIPT_DIR/fixtures/diagnosis-report.json"
ORG="gs08-org"
REPORT_ID="rpt-gs08-001"

# 0. 自举 JWT（真实客户端行为，复用 GS-03 D462 模式；报告端点当前无鉴权中间件——
#    仍带 Bearer 以保持「真实客户端」语义，未来加鉴权不破场景）
JWT_SECRET="gs08-$(date +%s)-$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')"
export JWT_SECRET
GS_TOKEN="$(node -e '
  const crypto = require("crypto");
  const secret = process.env.JWT_SECRET;
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const header = b64({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64({ sub: "gs08-scenario", role: "admin", orgId: "default", iat: now, exp: now + 3600, jti: "gs08-" + now });
  const sig = crypto.createHmac("sha256", secret).update(header + "." + payload).digest("base64url");
  process.stdout.write(header + "." + payload + "." + sig);
')"
AUTH_HEADER="Authorization: Bearer $GS_TOKEN"
echo "[GS-08] JWT_SECRET 已自举（长度 ${#JWT_SECRET}），token 已签发"

# 1. fresh-db（临时库，测后删除；真实库只读；禁止 cp data/synova.db——铁律 0-4）
DATA_DIR="$(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/fresh-db.ts")"
echo "[GS-08] 临时数据目录: $DATA_DIR"
# 铁律 0-4 隔离加固（D462）: config.ts 的 SYNOVA_DB_PATH 优先级高于 SYNOVA_DATA_DIR，
# 开发者会话常自带 SYNOVA_DB_PATH 指向真实库 → 显式覆盖为临时库路径。
export SYNOVA_DB_PATH="$DATA_DIR/synova.db"
export SYNOVA_DATA_DIR="$DATA_DIR"

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

mkdir -p "$OUT_DIR"

# 2. seed：真实图快照（2 条循环）+ 真实 checkpoint 归档行（fixture 报告）+ 降级变体工件
cd "$REPO_ROOT"
npx tsx "$SCRIPT_DIR/render-onepager.ts" --mode seed \
  --data-dir "$DATA_DIR" --out "$OUT_DIR" --fixture "$FIXTURE" --org "$ORG"

# 3. bootstrap（临时端口 + healthz 就绪探测；bootstrap.ts 起服务后进程不退出 → 后台拉起 + 轮询 state）
(cd "$REPO_ROOT" && npx tsx "$COMMON_DIR/bootstrap.ts" --data-dir "$DATA_DIR" --timeout 180 \
  > "$DATA_DIR/bootstrap.log" 2>&1 &)
BOOT_STATE="$DATA_DIR/bootstrap-state.json"
BOOT_READY=""
for _ in $(seq 1 90); do
  if [ -f "$BOOT_STATE" ]; then BOOT_READY="yes"; break; fi
  sleep 2
done
if [ -z "$BOOT_READY" ]; then
  echo "[GS-08] bootstrap 超时（180s 未就绪）— 日志尾:"
  tail -20 "$DATA_DIR/bootstrap.log" 2>/dev/null || true
  exit 2
fi
PORT="$(python3 -c "import json;print(json.load(open('$BOOT_STATE'))['port'])")"
BASE="http://127.0.0.1:$PORT"
echo "[GS-08] 服务就绪: $BASE"

# 4. trigger：生产路径 GET 报告（markdown）——本场景的核心被测面
HTTP_STATUS="$(curl -sS -o "$OUT_DIR/onepager.md" -w '%{http_code}' \
  -H "$AUTH_HEADER" \
  "$BASE/api/diagnosis/consult/$REPORT_ID/report?format=markdown")"
echo "status=$HTTP_STATUS" > "$OUT_DIR/report-endpoint-status.txt"
echo "[GS-08] 报告端点 HTTP ${HTTP_STATUS}；生产 markdown → $OUT_DIR/onepager.md"

# 5. audit：指针解析审计 + 维度审计 + 篇幅/确定性工件 + S3 槽位片段
npx tsx "$SCRIPT_DIR/render-onepager.ts" --mode audit \
  --data-dir "$DATA_DIR" --out "$OUT_DIR" --fixture "$FIXTURE" --org "$ORG"

# 6. .hbs 轨回归（D449 覆盖保留——HTML 模板加载/渲染不回退）
npx tsx -e "
import { loadTemplate, listTemplates } from './src/l3/report-template-loader.ts';
import * as fs from 'fs';
const outDir = '$OUT_DIR';
const loaded = loadTemplate('executive-summary');
fs.writeFileSync(outDir + '/load-result.json', JSON.stringify({
  name: loaded.template?.name ?? null,
  degraded: loaded.degraded,
  errors: loaded.errors,
}));
const data = {
  report: { title: '企业健康诊断报告', generated_at: '生成时间', ceo_summary: 'CEO 摘要', key_findings: '关键发现', action_recommendations: '行动建议', footer: 'SynovaAgent' },
  org_name: '测试企业',
  lang: 'zh-CN',
  generated_at: '2026-08-21',
  overall_score: 72,
  ceo_summary_text: '增长健康度中等，现金流为关键约束。',
  findings: [{ priority: 'p0', title: '现金流危急', description: '跑道不足 6 个月' }],
  actions: { items: [{ priority: 'p0', action: '启动应急融资', rationale: '现金流约束' }] },
};
const html = loaded.template ? loaded.template.render(data) : '';
fs.writeFileSync(outDir + '/render-meta.json', JSON.stringify({
  hasTitle: html.includes('企业健康诊断报告'),
  hasScore: html.includes('72'),
  hasCard: html.includes('card'),
  length: html.length,
}));
fs.writeFileSync(outDir + '/templates.json', JSON.stringify(listTemplates()));
" > "$DATA_DIR/tsx.log" 2>&1
echo "[GS-08] .hbs 模板加载: $(cat "$OUT_DIR/load-result.json")"
echo "[GS-08] .hbs 渲染元数据: $(cat "$OUT_DIR/render-meta.json")"

# 7. 断言（expect.json 模板 → 注入 OUT_DIR / REPO_ROOT 实际路径）
sed -e "s|__OUT_DIR__|$OUT_DIR|g" -e "s|__REPO_ROOT__|$REPO_ROOT|g" \
  "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-08-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-08] 断言 exit: $ASSERT_EXIT"

# 8. 点级证据入库（3-1/3-7 记分的唯一路径；calc-progress 唯一扫描面）
#    幂等保护: 当日记录已存在 → 跳过（K3 独立重跑不产生 -1/-2 增量文件，也不改写既有证据）。
#    GS08_PUBLISH_EVIDENCE=0 可强制跳过。
EVIDENCE_FILE="$REPO_ROOT/docs/synova/product-lines/evidence/scenario-$DATE.json"
if [[ "$ASSERT_EXIT" -eq 0 && "${GS08_PUBLISH_EVIDENCE:-auto}" != "0" && ! -f "$EVIDENCE_FILE" ]]; then
  python3 "$REPO_ROOT/scripts/product-lines/evidence-writer.py" \
    --type scenario --verdict pass --points 3-1,3-7 \
    --source "scripts/golden-scenarios/GS-08-report-readable/run.sh @ $(git -C "$REPO_ROOT" rev-parse --short HEAD)" \
    --quote "契约级（生产渲染与读取路径真实、LLM 产物为 fixture）：生产 HTTP GET /api/diagnosis/consult/$REPORT_ID/report?format=markdown → onepager.md 四槽位齐备；pointer-audit.json 见 scripts/golden-scenarios/evidence/GS-08-$DATE/pointer-audit.json（externalResolvableCount≥1）；dimension-audit.json（missingDimensionCount=0）；onepager-meta.json（budgetOk/maxLineOk/conclusionCharsOk/deterministic 全 true）；机器断言 scripts/golden-scenarios/evidence/GS-08-$DATE.json 全 pass；复跑: bash scripts/golden-scenarios/GS-08-report-readable/run.sh" \
    || echo "[GS-08] 点级证据入库失败（断言已通过；证据面降级）"
  # CT-62: evidence-writer 不写 at 字段 → 补全量 ISO（含时区），供失效门做时间戳粒度比较
  if [[ -f "$EVIDENCE_FILE" ]]; then
    python3 - "$EVIDENCE_FILE" <<'PYEOF'
import json, sys
from datetime import datetime
p = sys.argv[1]
with open(p, "r", encoding="utf-8") as fh:
    rec = json.load(fh)
if "at" not in rec:
    rec["at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    with open(p, "w", encoding="utf-8") as fh:
        json.dump(rec, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    print("[GS-08] 点级证据已补 at=%s" % rec["at"])
PYEOF
  fi
elif [[ -f "$EVIDENCE_FILE" ]]; then
  echo "[GS-08] 点级证据已存在，跳过入库（幂等）: $EVIDENCE_FILE"
fi

exit "$ASSERT_EXIT"
