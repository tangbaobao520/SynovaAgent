// Synova MVP Server — 端到端诊断管线 (测量+专家管道)
// node mvp-server.cjs
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { MeasurementPipeline } = require('./packages/engine-core/src/pipeline/diagnosis/measurement-pipeline');
const { createMeasurers } = require('./packages/engine-core/src/pipeline/diagnosis/real-measurers');
const { ExpertPipeline } = require('./packages/engine-core/src/pipeline/diagnosis/expert-pipeline');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
const jobStore = new Map();

function loadEnv() {
  var env = {};
  try {
    var t = fs.readFileSync('.env', 'utf-8');
    t.split('\n').forEach(function(l) { var m = l.match(/^(\w+)\s*=\s*(.+)/); if (m) env[m[1]] = m[2].trim(); });
  } catch(e) {}
  return env;
}

var DIMS = [
  { key: 'mission', label: '任务目标', q: '长期愿景和近期战略目标？' },
  { key: 'businessModel', label: '业务价值', q: '主营业务、价值主张、盈利模式？' },
  { key: 'currentState', label: '现状起点', q: '现有组织架构、团队规模？' },
  { key: 'resources', label: '资源约束', q: '预算、人员、技术栈限制？' },
  { key: 'risks', label: '风险瓶颈', q: '最担心什么？踩过哪些坑？' },
  { key: 'successCriteria', label: '成功标准', q: '北极星指标是什么？' },
  { key: 'marketPositioning', label: '市场定位', q: '客户用什么词描述你？' },
  { key: 'digitalFoundation', label: '数字底座', q: '日常用哪些系统和工具？' },
];

app.get('/api/health', function(_req, res) {
  res.json({ status: 'ok', service: 'synova-e2e', time: new Date().toISOString() });
});

app.post('/api/diagnosis/upload', function(req, res) {
  var content = req.body.content, orgName = req.body.orgName || '企业';
  if (!content || content.length < 20) return res.status(400).json({ error: 'Content too short' });
  var jobId = 'diag_' + Date.now().toString(36);
  jobStore.set(jobId, { jobId: jobId, status: 'extracting', createdAt: new Date().toISOString() });
  console.log('[job:' + jobId + '] created');
  res.json({ jobId: jobId, status: 'extracting' });
  runPipeline(jobId, content, orgName);
});

app.get('/api/diagnosis/report/:jobId', function(req, res) {
  var job = jobStore.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Not found' });
  if (job.status === 'complete') return res.type('html').send(job.report);
  if (job.status === 'failed') return res.status(500).json({ error: job.error });
  res.json({ jobId: job.jobId, status: job.status });
});

async function runPipeline(jobId, content, orgName) {
  var job = jobStore.get(jobId);
  var env = loadEnv();
  var KEY = env.LLM_API_KEY, BASE = env.LLM_BASE_URL || 'https://api.deepseek.com', MODEL = env.LLM_MODEL || 'deepseek-chat';
  if (!KEY) { job.status = 'failed'; job.error = 'No API key'; return; }

  async function llmCall(prompt, sysPrompt) {
    var msgs = [];
    if (sysPrompt) msgs.push({ role: 'system', content: sysPrompt });
    msgs.push({ role: 'user', content: prompt });
    var r = await fetch(BASE + '/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ model: MODEL, messages: msgs, max_tokens: 1500, temperature: 0.1 }),
    });
    var d = await r.json();
    return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
  }

  // Step 1: 八维度提取
  job.status = 'extracting';
  console.log('[job:' + jobId + '] extracting...');
  var dimList = DIMS.map(function(d) { return d.label + '(' + d.key + '): ' + d.q; }).join('\n');
  var prompt = '你是企业诊断顾问。从下列文档中提取八维度关键信息。\n\n文档：\n"""\n' + content.slice(0, 16000) + '\n"""\n\n维度：\n' + dimList + '\n\n返回JSON：[{"dimensionKey":"mission","dimensionLabel":"任务目标","content":"提取的信息","confidence":"high|medium|low","sufficient":true/false},...]\n每个维度独立提取。无信息→写"未提及",confidence:"low",sufficient:false。不编造。';
  var extractText = await llmCall(prompt, '你是严谨的企业诊断专家。只提取实际信息，不编造。只返回JSON。');
  var match = extractText.match(/\[[\s\S]*\]/);
  var dims;
  if (match) {
    try { var arr = JSON.parse(match[0]); dims = DIMS.map(function(d) { return arr.find(function(a) { return a.dimensionKey === d.key; }) || { dimensionKey: d.key, dimensionLabel: d.label, content: '提取失败', confidence: 'low', sufficient: false }; }); }
    catch(e) { dims = DIMS.map(function(d) { return { dimensionKey: d.key, dimensionLabel: d.label, content: '解析失败', confidence: 'low', sufficient: false }; }); }
  } else { dims = DIMS.map(function(d) { return { dimensionKey: d.key, dimensionLabel: d.label, content: '解析失败', confidence: 'low', sufficient: false }; }); }
  var covered = dims.filter(function(d) { return d.sufficient; }).length;
  console.log('[job:' + jobId + '] extracted: ' + covered + '/8');

  // Step 2: 测量管道
  job.status = 'measuring';
  var mp = new MeasurementPipeline();
  mp.register(createMeasurers(dims));
  var measOutput = await mp.run({ dims: dims });
  console.log('[job:' + jobId + '] measurers: ' + measOutput.results.length);

  // Step 3: 专家推理管道
  job.status = 'reasoning';
  var ep = new ExpertPipeline();
  ep.register([
    { id: 'strategic', name: '战略健康：方向对不对', dimensions: ['D1'], systemPrompt: '你是企业战略诊断专家。分析战略方向和竞争力量。只基于测量数据，不编造。' },
    { id: 'org', name: '组织能力：团队能不能执行', dimensions: ['D2'], systemPrompt: '你是组织诊断专家。分析团队规模、关键人依赖、协作健康度。只基于测量数据，不编造。' },
    { id: 'finance', name: '财务视角：增长的财务支撑', dimensions: ['D1'], systemPrompt: '你是财务诊断专家。分析客户集中度、增长动力、现金流风险。只基于测量数据，不编造。' },
    { id: 'marketing', name: '营销视角：市场定位与客户认知', dimensions: ['D1'], systemPrompt: '你是营销诊断专家。分析市场定位清晰度、客户认知、差异化是否实质。只基于测量数据，不编造。' },
    { id: 'tech', name: '技术视角：数字底座与工具链', dimensions: ['D2'], systemPrompt: '你是技术诊断专家。分析数字基础设施、系统健康度、工具效率。只基于测量数据，不编造。' },
    { id: 'action', name: '行动建议：从分析到执行', dimensions: ['D1', 'D2'], systemPrompt: '你是行动诊断专家。基于其他专家的分析，提炼出优先级最高的可执行行动。每条建议必须具体到能检查是否完成。不重复分析，只提炼行动。' },
  ], { complete: llmCall });
  var expOutput = await ep.run(measOutput.aggregated);
  console.log('[job:' + jobId + '] experts: ' + expOutput.results.length);

  // Step 4: 报告
  job.status = 'building';
  var html = buildReport(orgName, dims, covered, measOutput, expOutput);
  try { fs.mkdirSync('tests/output', { recursive: true }); } catch(e) {}
  fs.writeFileSync('tests/output/http-' + jobId + '.html', html);
  job.status = 'complete'; job.report = html; job.completedAt = new Date().toISOString();
  console.log('[job:' + jobId + '] done: ' + (html.length/1024).toFixed(1) + 'KB');
}

function buildReport(orgName, dims, covered, measOutput, expOutput) {
  var now = new Date().toISOString().replace('T',' ').slice(0,19);
  var totalScore = expOutput.results.reduce(function(s, r) { return s + r.score; }, 0) / Math.max(1, expOutput.results.length);
  var pct = Math.round(totalScore * 10);
  var cls = totalScore >= 7 ? 'green' : totalScore >= 4 ? 'orange' : 'red';

  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  var coreConclusion = expOutput.results.map(function(r) { return r.conclusion; }).join(' ');

  var dimGrid = dims.map(function(d) {
    var c = d.sufficient ? 'ok' : (d.confidence === 'medium' ? 'warn' : 'low');
    return '<div class="dim-cell ' + c + '">' + (d.sufficient ? '✅' : '⚠️') + ' ' + esc(d.dimensionLabel) + '</div>';
  }).join('\n');

  var expertHtml = expOutput.results.map(function(r) {
    var sc = r.score >= 7 ? 'green' : r.score >= 4 ? 'orange' : 'red';
    var fhtml = r.findings.map(function(f) {
      var icon = f.severity === 'critical' ? '🔴 紧急' : f.severity === 'warning' ? '🟡 需关注' : '🟢 信息';
      return '<div class="finding ' + f.severity + '"><p><span class="sev ' + f.severity + '">' + icon + '</span><strong>' + esc(f.title) + '</strong></p><p style="color:var(--muted);">' + esc(f.description) + '</p>' + (f.evidence.length ? '<p style="font-size:.85rem;">证据：' + f.evidence.map(esc).join('；') + '</p>' : '') + '<p style="font-size:.85rem;color:var(--accent);">建议：' + esc(f.suggestion) + '</p></div>';
    }).join('\n');
    return '<div class="section"><h3>' + esc(r.expertName) + ' — 评分 ' + r.score.toFixed(1) + ' [' + r.confidence + ']</h3><div class="score-bar"><div class="score-fill ' + sc + '" style="width:' + Math.round(r.score*10) + '%"></div></div>' + fhtml + '</div>';
  }).join('\n');

  var allF = [];
  expOutput.results.forEach(function(r) { r.findings.forEach(function(f) { allF.push(f); }); });
  var actions = allF.filter(function(f) { return f.severity === 'critical' || f.severity === 'warning'; }).slice(0, 3);
  var actionHtml = actions.length === 0 ? '<p>当前未发现需要紧急干预的问题。</p>' : actions.map(function(a, i) { return '<p style="margin:.5rem 0;"><strong>' + (i+1) + '. ' + (a.severity==='critical'?'🔴 P0':'🟡 P'+(i+1)) + '</strong> ' + esc(a.suggestion) + '</p>'; }).join('\n');

  var degradedNote = expOutput.degradedModules.length ? '<p style="color:var(--orange);">⚠️ 部分专家降级：' + expOutput.degradedModules.join(',') + '</p>' : '';

  return '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><title>Synova 诊断报告 - ' + esc(orgName) + '</title><style>:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--orange:#d2991d;--red:#f85149}*{margin:0;padding:0;box-sizing:border-box}body{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem 1.5rem;line-height:1.7}h1{color:#f0f6fc;font-size:1.8rem;border-bottom:2px solid var(--border);padding-bottom:.5rem;margin-bottom:1.5rem}h2{color:var(--accent);font-size:1.2rem;margin:2rem 0 1rem;border-bottom:1px solid var(--border);padding-bottom:.3rem}h3{color:#f0f6fc;font-size:1rem;margin:1.5rem 0 .5rem}.section{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.2rem 1.5rem;margin:1rem 0}.score-bar{background:var(--border);border-radius:4px;height:20px;margin:.5rem 0;overflow:hidden}.score-fill{height:100%;border-radius:4px}.score-fill.green{background:var(--green)}.score-fill.orange{background:var(--orange)}.score-fill.red{background:var(--red)}.finding{border-left:3px solid var(--border);padding:.6rem 1rem;margin:.8rem 0;background:rgba(255,255,255,.02)}.finding.critical{border-color:var(--red)}.finding.warning{border-color:var(--orange)}.finding.info{border-color:var(--accent)}.sev{display:inline-block;padding:.1em .5em;border-radius:3px;font-size:.75rem;font-weight:700;margin-right:.5em}.sev.critical{background:#3a1a1a;color:var(--red)}.sev.warning{background:#3a2e0a;color:var(--orange)}.sev.info{background:#1a2a3a;color:var(--accent)}.dim-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:.5rem 0}.dim-cell{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:.5rem;text-align:center;font-size:.8rem}.dim-cell.ok{border-color:var(--green)}.dim-cell.warn{border-color:var(--orange)}.dim-cell.low{border-color:var(--red)}</style></head><body><h1>Synova 组织诊断报告</h1><div class="meta"><strong>' + esc(orgName) + '</strong> · ' + now + ' · v2.0 (测量+专家管道)</div><div class="section"><h2>核心结论</h2><p style="font-size:1.1rem;font-weight:600;color:#f0f6fc;">' + esc(coreConclusion) + '</p><h3>总体评分</h3><div class="score-bar"><div class="score-fill ' + cls + '" style="width:' + pct + '%"></div></div><p style="font-size:.85rem;color:var(--muted);">综合得分 ' + totalScore.toFixed(1) + ' / 10（' + measOutput.results.length + ' 个测量器 + ' + expOutput.results.length + ' 个专家推理）</p></div><div class="section"><h2>诊断信息覆盖度</h2><div class="dim-grid">' + dimGrid + '</div><p style="font-size:.85rem;color:var(--muted);margin-top:.5rem;">' + covered + '/8 维度覆盖</p></div>' + degradedNote + '<h2>专家诊断（真实 LLM 推理）</h2>' + expertHtml + '<div class="section"><h2>行动建议</h2><p style="color:var(--muted);margin-bottom:.5rem;">基于诊断结论，按紧急×重要排序：</p>' + actionHtml + '<p style="margin-top:1rem;color:var(--muted);font-size:.85rem;">建议跟进：2周后检查 · 1个月后复查 · 3个月后全维度复诊</p></div><div class="section"><h2>数据说明</h2><p>数据源：FDE采访文档（八维度LLM提取）</p><p>测量管道：' + measOutput.results.length + ' 个活跃（从提取数据中计算）</p><p>专家推理：' + expOutput.results.length + ' 个活跃（真实LLM推理, 非模板填充）</p></div><p style="text-align:center;color:var(--muted);font-size:.8rem;margin-top:3rem;">Synova 组织诊断系统 · 结论来自真实计算和专家推理</p></body></html>';
}

var PORT = parseInt(process.env.PORT || '3000', 10);
app.listen(PORT, function() {
  console.log('\n=== Synova E2E Server ===');
  console.log('POST http://localhost:' + PORT + '/api/diagnosis/upload');
  console.log('GET  http://localhost:' + PORT + '/api/diagnosis/report/:jobId\n');
});
