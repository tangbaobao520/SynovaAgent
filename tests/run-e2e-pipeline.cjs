/**
 * tests/run-e2e-pipeline.js — 端到端诊断管线 (切片3)
 * @state: real — 串联全部管道，真实 API 调用
 *
 * 管线: 文档 → 八维度提取(LLM) → 测量管道 → 专家推理(LLM) → 报告
 *
 * 运行: node tests/run-e2e-pipeline.js
 */
const fs = require('fs');
const path = require('path');

async function main() {
  console.log('=== Synova 端到端诊断管线 ===\n');

  // ═══ Load config (系统环境变量优先, .env 兜底) ═══
  const KEY = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || (() => { try { const t = fs.readFileSync('.env','utf-8'); const m = t.match(/LLM_API_KEY=(.+)/); return m ? m[1].trim() : ''; } catch(e) { return ''; } })();
  const BASE = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
  const MODEL = process.env.LLM_MODEL || 'deepseek-chat';
  if (!KEY) { console.error('LLM_API_KEY missing — 请设置系统环境变量或创建 .env'); process.exit(1); }

  // ═══ Load modules ═══
  const { MeasurementPipeline } = require('../packages/engine-core/src/pipeline/diagnosis/measurement-pipeline');
  const { ExpertPipeline } = require('../packages/engine-core/src/pipeline/diagnosis/expert-pipeline');
  const { createMeasurers } = require('../packages/engine-core/src/pipeline/diagnosis/real-measurers');

  // ═══ Sample Document ═══
  const SAMPLE_DOC = `
## 企业访谈 — XX 精密制造有限公司

### 任务目标
老板王总："我们未来3年目标是成为华南精密模具头部企业。年营收从3000万做到8000万。"
核心战略：从代工转向自主品牌，专注医疗设备和新能源汽车精密配件。

### 业务价值
主营精密模具制造和注塑成型。客户集中在医疗器械（60%）和汽车零部件（30%）。
价值主张："精度达到±0.005mm，交货周期比同行短30%。"毛利率约35%。

### 现状起点
现有团队120人。工厂5000平米，CNC设备30台，注塑机20台。
在用金蝶ERP、飞书办公、AutoCAD。ERP数据不完整。

### 资源约束
预算紧张。"技术团队只有1个资深模具设计师张工，他走了研发就停了。"

### 风险瓶颈
王总最担心两件事：1)核心设计师离职风险 2)大客户A占40%营收。

### 成功标准
3年后自有品牌收入超过代工。年营收>6000万，客户集中度<30%。

### 市场定位
客户评价："不便宜，但精度确实好，交期也稳。"品质战而非价格战。

### 数字底座
生产靠Excel手工排期。ERP数据不准。CNC有接口没用。飞书只用消息。
`;

  // ═══ LLM Client (共享) ═══
  async function llmComplete(prompt, systemPrompt) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });
    const r = await fetch(BASE + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + KEY },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 1500, temperature: 0.1 }),
    });
    const data = await r.json();
    return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
  }

  // ═══ Step 1: 八维度提取 (复用 MVP 管线的提取逻辑) ═══
  console.log('Step 1: 八维度提取...');
  const startTime = Date.now();
  const DIMS = [
    { key: 'mission', label: '任务目标', q: '长期愿景和近期战略目标？' },
    { key: 'businessModel', label: '业务价值', q: '主营业务、价值主张、盈利模式？' },
    { key: 'currentState', label: '现状起点', q: '现有组织架构、团队规模？' },
    { key: 'resources', label: '资源约束', q: '预算、人员、技术栈限制？' },
    { key: 'risks', label: '风险瓶颈', q: '最担心什么？踩过哪些坑？' },
    { key: 'successCriteria', label: '成功标准', q: '北极星指标是什么？' },
    { key: 'marketPositioning', label: '市场定位', q: '客户用什么词描述你？' },
    { key: 'digitalFoundation', label: '数字底座', q: '日常用哪些系统和工具？' },
  ];

  const dimList = DIMS.map(d => d.label + '(' + d.key + '): ' + d.q).join('\n');
  const extractPrompt = '你是企业诊断顾问。从下列文档中提取八维度关键信息。\n\n文档：\n"""\n' + SAMPLE_DOC.slice(0, 16000) + '\n"""\n\n维度：\n' + dimList + '\n\n返回JSON：[{"dimensionKey":"mission","dimensionLabel":"任务目标","content":"提取的信息","confidence":"high|medium|low","sufficient":true/false},...]\n每个维度独立提取。无信息→写"未提及",confidence:"low",sufficient:false。不编造。';

  const extractRes = await llmComplete(extractPrompt, '你是严谨的企业诊断专家。只提取实际信息，不编造。只返回JSON。');
  const jsonMatch = extractRes.match(/\[[\s\S]*\]/);
  const dims = jsonMatch
    ? (() => { try { const arr = JSON.parse(jsonMatch[0]); return DIMS.map(d => arr.find(a => a.dimensionKey === d.key) || { dimensionKey: d.key, dimensionLabel: d.label, content: '提取失败', confidence: 'low', sufficient: false }); } catch { return DIMS.map(d => ({ dimensionKey: d.key, dimensionLabel: d.label, content: '解析失败', confidence: 'low', sufficient: false })); } })()
    : DIMS.map(d => ({ dimensionKey: d.key, dimensionLabel: d.label, content: '解析失败', confidence: 'low', sufficient: false }));
  const covered = dims.filter(d => d.sufficient).length;
  console.log('  ' + covered + '/8 维度覆盖 (' + ((Date.now()-startTime)/1000).toFixed(1) + 's)\n');

  // ═══ Step 2: 测量管道 ═══
  console.log('Step 2: 测量管道...');
  const measPipeline = new MeasurementPipeline();
  const measurers = createMeasurers(dims);
  measPipeline.register(measurers);
  const measOutput = await measPipeline.run({ dims });
  console.log('  ' + measOutput.results.length + ' 个测量器执行');
  console.log('  聚合: ' + Object.keys(measOutput.aggregated).map(d => d + '=' + measOutput.aggregated[d].score.toFixed(1)).join(', '));
  console.log('  降级: ' + (measOutput.degradedModules.length || '无') + '\n');

  // ═══ Step 3: 专家推理管道 ═══
  console.log('Step 3: 专家推理 (LLM)...');
  const expertLLM = { complete: llmComplete };
  const expPipeline = new ExpertPipeline();
  expPipeline.register([
    { id: 'strategic', name: '战略健康：方向对不对', dimensions: ['D1'], systemPrompt: '你是企业战略诊断专家。分析企业的战略方向和市场定位。只基于测量数据。不编造。' },
    { id: 'org', name: '组织能力：团队能不能执行', dimensions: ['D2'], systemPrompt: '你是组织诊断专家。分析团队规模、关键人依赖、执行能力。只基于测量数据。不编造。' },
    { id: 'finance', name: '财务视角：增长的财务支撑', dimensions: ['D1'], systemPrompt: '你是财务诊断专家。分析客户集中度、增长动力。只基于测量数据。不编造。' },
  ], expertLLM);

  const expStart = Date.now();
  const expOutput = await expPipeline.run(measOutput.aggregated);
  console.log('  ' + expOutput.results.length + ' 个专家完成 (' + ((Date.now()-expStart)/1000).toFixed(1) + 's)');
  if (expOutput.degradedModules.length) console.log('  降级: ' + expOutput.degradedModules.join(', '));
  console.log('');

  // ═══ Step 4: 报告 ═══
  console.log('Step 4: 生成报告...');
  const orgName = 'XX精密制造有限公司';
  const now = new Date().toISOString().replace('T',' ').slice(0,19);
  const totalScore = expOutput.results.reduce((s, r) => s + r.score, 0) / Math.max(1, expOutput.results.length);
  const pct = Math.round(totalScore * 10);

  function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  const html = '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="UTF-8">\n<title>Synova 组织诊断报告 - ' + esc(orgName) + '</title>\n<style>\n:root{--bg:#0d1117;--surface:#161b22;--border:#30363d;--text:#c9d1d9;--muted:#8b949e;--accent:#58a6ff;--green:#3fb950;--orange:#d2991d;--red:#f85149}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{background:var(--bg);color:var(--text);font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:2rem 1.5rem;line-height:1.7}\nh1{color:#f0f6fc;font-size:1.8rem;border-bottom:2px solid var(--border);padding-bottom:.5rem;margin-bottom:1.5rem}\nh2{color:var(--accent);font-size:1.2rem;margin:2rem 0 1rem;border-bottom:1px solid var(--border);padding-bottom:.3rem}\nh3{color:#f0f6fc;font-size:1rem;margin:1.5rem 0 .5rem}\n.section{background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:1.2rem 1.5rem;margin:1rem 0}\n.score-bar{background:var(--border);border-radius:4px;height:20px;margin:.5rem 0;overflow:hidden}\n.score-fill{height:100%;border-radius:4px}\n.score-fill.green{background:var(--green)}.score-fill.orange{background:var(--orange)}.score-fill.red{background:var(--red)}\n.finding{border-left:3px solid var(--border);padding:.6rem 1rem;margin:.8rem 0;background:rgba(255,255,255,.02)}\n.finding.critical{border-color:var(--red)}.finding.warning{border-color:var(--orange)}.finding.info{border-color:var(--accent)}\n.sev{display:inline-block;padding:.1em .5em;border-radius:3px;font-size:.75rem;font-weight:700;margin-right:.5em}\n.sev.critical{background:#3a1a1a;color:var(--red)}.sev.warning{background:#3a2e0a;color:var(--orange)}.sev.info{background:#1a2a3a;color:var(--accent)}\n.dim-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem;margin:.5rem 0}\n.dim-cell{background:var(--surface);border:1px solid var(--border);border-radius:4px;padding:.5rem;text-align:center;font-size:.8rem}\n.dim-cell.ok{border-color:var(--green)}</style>\n</head>\n<body>\n<h1>Synova 组织诊断报告</h1>\n<div class="meta"><strong>' + esc(orgName) + '</strong> · ' + now + ' · v2.0 (测量+专家管道)</div>\n' +
  '<div class="section"><h2>核心结论</h2><p style="font-size:1.1rem;font-weight:600;color:#f0f6fc;">' +
  esc(expOutput.results.map(r => r.conclusion).join(' ')) +
  '</p><h3>总体评分</h3><div class="score-bar"><div class="score-fill ' + (totalScore>=7?'green':totalScore>=4?'orange':'red') + '" style="width:' + pct + '%"></div></div><p style="font-size:.85rem;color:var(--muted);">综合得分 ' + totalScore.toFixed(1) + ' / 10（基于 ' + measOutput.results.length + ' 个测量器 + ' + expOutput.results.length + ' 个专家推理）</p></div>\n' +
  '<div class="section"><h2>诊断信息覆盖度</h2><div class="dim-grid">' +
  dims.map(d => '<div class="dim-cell ' + (d.sufficient ? 'ok' : '') + '" style="border-color:' + (d.sufficient ? 'var(--green)' : 'var(--orange)') + '">' + (d.sufficient ? '✅' : '⚠️') + ' ' + esc(d.dimensionLabel) + '</div>').join('\n') +
  '</div><p style="font-size:.85rem;color:var(--muted);margin-top:.5rem;">' + covered + '/8 维度覆盖</p></div>\n' +
  '<h2>专家诊断（真实计算 + LLM 推理）</h2>' +
  expOutput.results.map(r => '<div class="section"><h3>' + esc(r.expertName) + ' — 评分 ' + r.score.toFixed(1) + ' [' + r.confidence + ']</h3><div class="score-bar"><div class="score-fill ' + (r.score>=7?'green':r.score>=4?'orange':'red') + '" style="width:' + Math.round(r.score*10) + '%"></div></div><p style="margin:.5rem 0;font-weight:600;">' + esc(r.conclusion) + '</p>' + r.findings.map(f => '<div class="finding ' + f.severity + '"><p><span class="sev ' + f.severity + '">' + (f.severity==='critical'?'🔴 紧急':f.severity==='warning'?'🟡 需关注':'🟢 信息') + '</span><strong>' + esc(f.title) + '</strong></p><p style="color:var(--muted);">' + esc(f.description) + '</p>' + (f.evidence.length ? '<p style="font-size:.85rem;">证据：' + f.evidence.map(e => esc(e)).join('；') + '</p>' : '') + '<p style="font-size:.85rem;color:var(--accent);">建议：' + esc(f.suggestion) + '</p></div>').join('\n') + '</div>').join('\n') +
  '<div class="section"><h2>测量数据明细</h2><table style="width:100%;font-size:.85rem;"><tr><th>测量器</th><th>维度</th><th>评分</th><th>置信度</th></tr>' +
  measOutput.results.map(r => '<tr><td>' + esc(r.measurerId) + '</td><td>' + r.dimension + '</td><td>' + r.score.toFixed(1) + '</td><td>' + r.confidence + '</td></tr>').join('\n') +
  '</table></div>\n' +
  '<div class="section"><h2>数据说明</h2><p>数据源：FDE采访文档（八维度LLM提取）</p><p>测量器：4个活跃（从提取文本中计算）</p><p>专家推理：3个活跃（LLM推理，非模板）</p>' +
  (expOutput.degradedModules.length ? '<p style="color:var(--orange);">⚠️ 部分专家降级</p>' : '') +
  '</div>\n<p style="text-align:center;color:var(--muted);font-size:.8rem;margin-top:3rem;">Synova 组织诊断系统 · 结论来自真实计算和专家推理</p>\n</body></html>';

  fs.mkdirSync('tests/output', { recursive: true });
  const outPath = 'tests/output/e2e-report.html';
  fs.writeFileSync(outPath, html);
  console.log('  ✅ 报告: ' + outPath + ' (' + (html.length/1024).toFixed(1) + 'KB)\n');

  // ═══ Verify ═══
  console.log('── 验证 ──');
  const checks = [
    { name: '测量管道有输出', pass: measOutput.results.length >= 4 },
    { name: '专家推理有输出', pass: expOutput.results.length >= 3 },
    { name: '无模板填充', pass: !html.includes('待补充') && !html.includes('硬编码') },
    { name: '报告包含真实结论', pass: expOutput.results.every(r => r.conclusion.length > 10) },
    { name: '测量器非样本', pass: !measOutput.results.some(r => r.measurerId.startsWith('sample')) },
  ];
  let ok = true;
  for (const c of checks) { console.log('  ' + (c.pass ? '✅' : '❌') + ' ' + c.name); if (!c.pass) ok = false; }

  if (ok) console.log('\n🎉 端到端管线通过');
  else console.log('\n❌ 部分验证失败');
  console.log('  总耗时: ' + ((Date.now()-startTime)/1000).toFixed(1) + 's');
}

main().catch(e => { console.error('管线失败:', e.message); process.exit(1); });
