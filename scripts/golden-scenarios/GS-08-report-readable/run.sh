#!/bin/bash
# GS-08 报告可读场景 — 一页纸 + 移动端模板加载与渲染
# 运行契约（GSS 设计 §2.2 8 条）：fresh-db / bootstrap / inject / trigger / assert / evidence / exit / 幂等
# 说明（D449，2026-08-21）：
#   · 报告模板（K3 定稿前置）已在 main：extensions/reports/{default,executive-summary}.hbs
#   · 三个机器判定断言（模板加载器契约级）：
#     ① loadTemplate('executive-summary') → degraded=false（一页纸模板可用）
#     ② render 产物含一页纸结构（title/overall_score/卡片）
#     ③ listTemplates() 含 executive-summary（模板注册可见）
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMMON_DIR="$SCRIPT_DIR/../common"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DATE="$(date +%Y-%m-%d)"

# 0. 自举 JWT（真实客户端行为，复用 GS-03 D462 模式）
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

# 2. 模板加载 + 渲染验证（不依赖服务——模板加载器是纯文件驱动）
#    a) loadTemplate('executive-summary') → degraded=false
#    b) render 产物 → 含 title/score（一页纸结构）
#    c) listTemplates() → 含 executive-summary
node -e "
const { loadTemplate, listTemplates } = require('$REPO_ROOT/dist/l3/report-template-loader.js');
" 2>/dev/null || true

cd "$REPO_ROOT"
npx tsx -e "
import { loadTemplate, listTemplates } from './src/l3/report-template-loader.ts';
import * as fs from 'fs';

const outDir = '$DATA_DIR';
// a) 模板可用性
const loaded = loadTemplate('executive-summary');
fs.writeFileSync(outDir + '/load-result.json', JSON.stringify({
  name: loaded.template?.name ?? null,
  degraded: loaded.degraded,
  errors: loaded.errors,
}));

// b) 渲染产物（一页纸结构：title + score + 卡片）
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
fs.writeFileSync(outDir + '/render-result.html', html);
fs.writeFileSync(outDir + '/render-meta.json', JSON.stringify({
  hasTitle: html.includes('企业健康诊断报告'),
  hasScore: html.includes('72'),
  hasCard: html.includes('card'),
  length: html.length,
}));

// c) 模板注册
const templates = listTemplates();
fs.writeFileSync(outDir + '/templates.json', JSON.stringify(templates));
" > "$DATA_DIR/tsx.log" 2>&1
echo "[GS-08] 模板加载: $(cat "$DATA_DIR/load-result.json")"
echo "[GS-08] 渲染元数据: $(cat "$DATA_DIR/render-meta.json")"
echo "[GS-08] 模板列表: $(cat "$DATA_DIR/templates.json")"

# 3. 断言（expect.json 模板 → 注入 DATA_DIR 实际路径）
sed "s|__DATA_DIR__|$DATA_DIR|g" "$SCRIPT_DIR/expect.json" > "$SCRIPT_DIR/expect.runtime.json"

cd "$REPO_ROOT"
set +e
npx tsx "$COMMON_DIR/assert.ts" \
  --expect "$SCRIPT_DIR/expect.runtime.json" \
  --out "$REPO_ROOT/scripts/golden-scenarios/evidence/GS-08-$DATE.json"
ASSERT_EXIT=$?
set -e
echo "[GS-08] 断言 exit: $ASSERT_EXIT"
exit "$ASSERT_EXIT"
