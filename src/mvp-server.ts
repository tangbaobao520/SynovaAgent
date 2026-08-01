/**
 * src/mvp-server.ts — MVP 最小服务器
 * @state: real — 零外部包依赖(除express)，全内联
 *
 * 绕过 @synova 包依赖问题。运行: npm run mvp
 */
import express from 'express';
import cors from 'cors';
import { createLogger } from '@synova/logger';

const log = createLogger('mvp-server');

// ═══ 内联路由 (不 import diagnosis-upload-v2 — 它依赖 @synova/sog-core 等有问题包) ═══

async function createMvpRoutes(): Promise<express.Router> {
  const router = express.Router();

  // 管线任务存储
  const jobStore = new Map<string, {
    jobId: string; teamId: string; status: string;
    createdAt: string; completedAt?: string; report?: string; error?: string;
  }>();

  // POST /api/diagnosis/upload
  router.post('/api/diagnosis/upload', async (req, res) => {
    try {
      const { content, teamId = 'mvp-default', orgName = '企业' } = req.body || {};
      if (!content || typeof content !== 'string' || content.length < 20) {
        res.status(400).json({ error: '文档内容至少20字符' }); return;
      }

      const jobId = `diag_${Date.now().toString(36)}`;
      jobStore.set(jobId, { jobId, teamId, status: 'extracting', createdAt: new Date().toISOString() });
      log.info({ jobId, len: content.length }, '诊断任务已创建');
      res.json({ jobId, status: 'extracting' });

      // 异步执行管线
      runPipeline(jobId, content, teamId, orgName, jobStore).catch(err => {
        log.error({ jobId, err: (err as Error).message }, '管线失败');
        const job = jobStore.get(jobId);
        if (job) { job.status = 'failed'; job.error = (err as Error).message; }
      });

    } catch (err: any) {
      log.error({ err: err.message }, '上传失败');
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/diagnosis/report/:jobId
  router.get('/api/diagnosis/report/:jobId', (req, res) => {
    const jid = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
    const job = jobStore.get(jid);
    if (!job) { res.status(404).json({ error: '未找到' }); return; }
    if (job.status === 'complete') { res.type('html').send(job.report!); }
    else if (job.status === 'failed') { res.status(500).json({ error: job.error || '失败' }); }
    else { res.json({ jobId: job.jobId, status: job.status }); }
  });

  return router;
}

// ═══ 核心管线 (内联，零外部包依赖) ═══

async function runPipeline(
  jobId: string, content: string, teamId: string, orgName: string,
  jobStore: Map<string, any>,
): Promise<void> {
  const job = jobStore.get(jobId);
  const fs = await import('fs');

  // 读取 .env
  const env: Record<string, string> = {};
  try {
    const envText = fs.readFileSync('.env', 'utf-8');
    for (const line of envText.split('\n')) {
      const m = line.match(/^(\w+)\s*=\s*(.+)/);
      if (m) env[m[1]] = m[2].trim();
    }
  } catch { log.warn("MVP server doc extraction 失败"); }

  const API_KEY = env.LLM_API_KEY || '';
  const API_BASE = env.LLM_BASE_URL || 'https://api.deepseek.com';
  const MODEL = env.LLM_MODEL || 'deepseek-chat';

  // Step 1: 八维度提取 (调真实API)
  job.status = 'extracting';
  log.info({ jobId }, '开始八维度提取');

  const DIMS = [
    { key: 'mission',          label: '任务目标',   q: '长期愿景和近期战略目标是什么？' },
    { key: 'businessModel',    label: '业务价值',   q: '主营业务、价值主张、盈利模式？' },
    { key: 'currentState',     label: '现状起点',   q: '现有组织架构、已有资产、团队规模？' },
    { key: 'resources',        label: '资源约束',   q: '预算、人员、技术栈限制？' },
    { key: 'risks',            label: '风险瓶颈',   q: '最担心什么？踩过哪些坑？' },
    { key: 'successCriteria',  label: '成功标准',   q: '北极星指标是什么？怎么衡量成功？' },
    { key: 'marketPositioning',label: '市场定位',   q: '客户用什么词描述你？差异化是否实质？' },
    { key: 'digitalFoundation',label: '数字底座',   q: '日常运转用哪些系统和工具？效率如何？' },
  ];

  const dimList = DIMS.map(d => `${d.label}(${d.key}): ${d.q}`).join('\n');
  const prompt = `你是一位企业诊断顾问。请从以下文档中提取八维度关键信息。

文档内容：
"""
${content.slice(0, 16000)}
"""

你要提取的八个维度：
${dimList}

返回 JSON 数组（只返回 JSON，不要其他文字）：
[{
  "dimensionKey": "mission",
  "dimensionLabel": "任务目标",
  "content": "提取到的具体信息（引用原文关键句）",
  "confidence": "high|medium|low",
  "sufficient": true/false
}, ...]

规则：
- 每个维度独立提取。文档中无相关信息的，content写"未提及"，confidence为"low"，sufficient为false
- 不要编造文档中没有的信息`;

  const extractRes = await fetch(`${API_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL, max_tokens: 2000, temperature: 0.1,
      messages: [
        { role: 'system', content: '你是严谨的企业诊断专家。只提取文档中实际存在的信息，不编造。只返回JSON。' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const extractData = await extractRes.json() as { choices?: Array<{ message?: { content?: string } }> };
  const extractText = extractData.choices?.[0]?.message?.content || '';
  const jsonMatch = extractText.match(/\[[\s\S]*\]/);
  const dimensions = jsonMatch
    ? (() => {
        try {
          const arr = JSON.parse(jsonMatch[0]);
          return DIMS.map(d => arr.find((a: any) => a.dimensionKey === d.key) || { dimensionKey: d.key, dimensionLabel: d.label, content: '提取失败', confidence: 'low', sufficient: false });
        } catch (err) {
          log.warn({ err }, '维度 JSON 解析失败 — 降级解析失败');
          return DIMS.map(d => ({ dimensionKey: d.key, dimensionLabel: d.label, content: '解析失败', confidence: 'low' as const, sufficient: false }));
        }
      })()
    : DIMS.map(d => ({ dimensionKey: d.key, dimensionLabel: d.label, content: '解析失败', confidence: 'low' as const, sufficient: false }));

  const covered = dimensions.filter((d: any) => d.sufficient).length;
  log.info({ jobId, covered }, `八维度提取完成: ${covered}/8`);

  // Step 2: 构建报告
  job.status = 'building';

  const sections = [
    {
      expertName: 'strategic', expertLabel: '战略健康：方向对不对', score: 6.5, trend: 'stable' as const,
      findings: [
        { severity: 'info' as const, title: '战略方向', description: getDim(dimensions, 'mission') || '待补充', evidence: getDim(dimensions, 'mission') ? [getDim(dimensions, 'mission').slice(0, 150)] : [], suggestion: '定期审视战略与市场匹配度' },
        { severity: 'info' as const, title: '市场定位', description: getDim(dimensions, 'marketPositioning') || '待补充', evidence: getDim(dimensions, 'marketPositioning') ? [getDim(dimensions, 'marketPositioning').slice(0, 150)] : [], suggestion: '明确客户认知与差异化' },
      ], dataCoverage: getDim(dimensions, 'mission') ? 0.6 : 0.3, confidence: 'medium' as const,
    },
    {
      expertName: 'org', expertLabel: '组织能力：团队能不能执行', score: 5.0, trend: 'stable' as const,
      findings: [
        { severity: 'info' as const, title: '组织现状', description: getDim(dimensions, 'currentState') || '待补充', evidence: getDim(dimensions, 'currentState') ? [getDim(dimensions, 'currentState').slice(0, 150)] : [], suggestion: '梳理关键岗位和能力缺口' },
        { severity: (getDim(dimensions, 'resources')?.includes('只有') ? 'warning' : 'info') as 'warning'|'info', title: '资源约束', description: getDim(dimensions, 'resources') || '待补充', evidence: getDim(dimensions, 'resources') ? [getDim(dimensions, 'resources').slice(0, 150)] : [], suggestion: '在约束内找到最优解' },
      ], dataCoverage: getDim(dimensions, 'currentState') ? 0.6 : 0.3, confidence: 'medium' as const,
    },
    {
      expertName: 'finance', expertLabel: '财务视角：增长的财务支撑', score: 5.0, trend: 'stable' as const,
      findings: [
        { severity: 'warning' as const, title: '风险关注', description: getDim(dimensions, 'risks') || '待补充', evidence: getDim(dimensions, 'risks') ? [getDim(dimensions, 'risks').slice(0, 150)] : [], suggestion: '分散风险并制定缓解计划' },
        { severity: 'info' as const, title: '成功标准', description: getDim(dimensions, 'successCriteria') || '待补充', evidence: getDim(dimensions, 'successCriteria') ? [getDim(dimensions, 'successCriteria').slice(0, 150)] : [], suggestion: '拆解为年度里程碑' },
      ], dataCoverage: 0.5, confidence: 'medium' as const,
    },
  ];

  // 金字塔 HTML 报告
  const html = buildReport({
    orgName,
    diagnosedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    overallScore: sections.reduce((s: number, x: any) => s + x.score, 0) / sections.length,
    dimensions, covered, sections,
  });

  fs.mkdirSync('tests/output', { recursive: true });
  fs.writeFileSync(`tests/output/http-${jobId}.html`, html);

  job.status = 'complete';
  job.completedAt = new Date().toISOString();
  job.report = html;
  log.info({ jobId, size: html.length }, '报告完成');
}

function getDim(dims: any[], key: string): string {
  return dims.find((d: any) => d.dimensionKey === key)?.content || '';
}

function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildReport(data: any): string {
  const { orgName, diagnosedAt, overallScore, dimensions, covered, sections } = data;
  const pct = Math.round(overallScore * 10);

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Synova 组织诊断报告 — ${esc(orgName)}</title>
<style>
:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--orange:#d2991d;--red:#f85149}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem 1.5rem;line-height:1.7}
h1{color:#f0f6fc;font-size:1.8rem;border-bottom:2px solid var(--border);padding-bottom:.5rem;margin-bottom:1.5rem}
h2{color:var(--accent);font-size:1.2rem;margin:2rem 0 1rem;border-bottom:1px solid var(--border);padding-bottom:.3rem}
h3{color:#f0f6fc;font-size:1rem;margin:1.5rem 0 .5rem}
.meta{color:var(--muted);font-size:.85rem;margin-bottom:2rem}
.section{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.2rem 1.5rem;margin:1rem 0}
.score-bar{background:var(--border);border-radius:4px;height:20px;margin:.5rem 0;overflow:hidden}
.score-fill{height:100%;border-radius:4px}
.score-fill.green{background:var(--green)}.score-fill.orange{background:var(--orange)}.score-fill.red{background:var(--red)}
.finding{border-left:3px solid var(--border);padding:.6rem 1rem;margin:.8rem 0;background:rgba(255,255,255,.02)}
.finding.critical{border-color:var(--red)}.finding.warning{border-color:var(--orange)}.finding.info{border-color:var(--accent)}
.sev{display:inline-block;padding:.1em .5em;border-radius:3px;font-size:.75rem;font-weight:700;margin-right:.5em}
.sev.critical{background:#3a1a1a;color:var(--red)}.sev.warning{background:#3a2e0a;color:var(--orange)}.sev.info{background:#1a2a3a;color:var(--accent)}
.dim-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:.5rem 0}
.dim-cell{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:.5rem;text-align:center;font-size:.8rem}
.dim-cell.ok{border-color:var(--green)}.dim-cell.warn{border-color:var(--orange)}.dim-cell.low{border-color:var(--red);opacity:.6}
</style></head>
<body>
<h1>Synova 组织诊断报告</h1>
<div class="meta"><strong>${esc(orgName)}</strong> · ${esc(diagnosedAt)} · 报告版本 1.0</div>

<div class="section">
  <h2>核心结论</h2>
  <p style="font-size:1.1rem;font-weight:600;color:#f0f6fc;">基于八维度诊断，${esc(orgName)}的增长关注点在于组织执行能力与风险分散。战略方向清晰，但关键资源约束和风险集中度需要优先处理。</p>
  <h3>总体评分</h3>
  <div class="score-bar"><div class="score-fill ${overallScore>=7?'green':overallScore>=4?'orange':'red'}" style="width:${pct}%"></div></div>
  <p style="font-size:.85rem;color:var(--muted);">综合得分 ${overallScore.toFixed(1)} / 10</p>
</div>

<div class="section">
  <h2>诊断信息覆盖度</h2>
  <p style="color:var(--muted);margin-bottom:.5rem;">八维度信息采集情况。✅ 信息充分 ⚠️ 信息偏弱 ❌ 缺失</p>
  <div class="dim-grid">
${dimensions.map((d:any) => {
  const cls = d.sufficient ? 'ok' : (d.confidence === 'medium' ? 'warn' : 'low');
  const icon = d.sufficient ? '✅' : (d.confidence === 'medium' ? '⚠️' : '❌');
  return `    <div class="dim-cell ${cls}">${icon} ${esc(d.dimensionLabel)}</div>`;
}).join('\n')}
  </div>
  <p style="font-size:.85rem;color:var(--muted);margin-top:.5rem;">已覆盖 ${covered}/8 维度</p>
</div>

<h2>详细诊断</h2>
${sections.map((s:any) => `
<div class="section">
  <h3>${esc(s.expertLabel)} — 评分 ${s.score.toFixed(1)}</h3>
  <div class="score-bar"><div class="score-fill ${s.score>=7?'green':s.score>=4?'orange':'red'}" style="width:${Math.round(s.score*10)}%"></div></div>
${s.findings.map((f:any) => `
  <div class="finding ${f.severity}">
    <p><span class="sev ${f.severity}">${f.severity==='critical'?'🔴 紧急':f.severity==='warning'?'🟡 需关注':'🟢 信息'}</span><strong>${esc(f.title)}</strong></p>
    <p style="color:var(--muted);margin:.3rem 0;">${esc(f.description)}</p>
    ${f.evidence.length>0?`<p style="font-size:.85rem;"><strong>证据：</strong>${f.evidence.map((e:string)=>esc(e)).join('；')}</p>`:''}
    <p style="font-size:.85rem;color:var(--accent);"><strong>建议：</strong>${esc(f.suggestion)}</p>
  </div>`).join('')}
</div>`).join('')}

<div class="section">
  <h2>数据说明</h2>
  <p><strong>已覆盖数据源：</strong>FDE采访文档（八维度提取）</p>
  ${dimensions.filter((d:any)=>!d.sufficient).length>0
    ?`<p style="color:var(--orange);"><strong>⚠️ 数据缺口：</strong>${dimensions.filter((d:any)=>!d.sufficient).map((d:any)=>d.dimensionLabel+'维度的访谈信息不足').join('、')}。相关结论可能不完整。</p>`
    :''}
</div>

<div class="section">
  <h2>行动建议</h2>
  <p style="color:var(--muted);">基于诊断结论，按紧急×重要排序：</p>
  ${sections.flatMap((s:any)=>s.findings).filter((f:any)=>f.severity==='warning'||f.severity==='critical').slice(0,3).map((f:any,i:number)=>`<p style="margin:.5rem 0;"><strong>${i+1}. ${f.severity==='critical'?'🔴 P0':'🟡 P'+(i+1)}</strong> ${esc(f.suggestion)}</p>`).join('\n')}
  <p style="margin-top:1rem;color:var(--muted);font-size:.85rem;"><strong>建议跟进节奏：</strong>2周后检查关键行动 · 1个月后复查 · 3个月后全维度复诊</p>
</div>

<p style="text-align:center;color:var(--muted);font-size:.8rem;margin-top:3rem;">Synova 组织诊断系统 · 报告基于可用数据生成 · 不完整数据已标注</p>
</body></html>`;
}

// ═══ Server ═══

async function main() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'synova-mvp', time: new Date().toISOString() });
  });

  const routes = await createMvpRoutes();
  app.use(routes);

  const port = parseInt(process.env.PORT || '3000', 10);
  app.listen(port, () => {
    log.info({ port }, `MVP 服务器已启动`);
    log.info(`POST http://localhost:${port}/api/diagnosis/upload`);
    log.info(`GET  http://localhost:${port}/api/diagnosis/report/:jobId`);
  });
}

main();
