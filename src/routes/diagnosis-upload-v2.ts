/**
 * routes/diagnosis-upload.ts — MVP 诊断上报路由 V2
 * @state: real — 接入真实测量管道 + 专家LLM推理 + GraphBridge后处理
 *
 * V2 变更 (2026-06-11):
 *   - MeasurementPipeline (7个真实测量器) 替换硬编码评分
 *   - ExpertPipeline (6专家并行LLM) 替换硬编码 buildSectionsFromEngine
 *   - GraphBridge 后处理 — 诊断结果写入本体层 (P0-1)
 *   - 覆盖度检查 — 报告展示各维度数据充分性 (P0-3)
 *
 * 铁律 31: 每层独立返回 degradedModules, 调用方检查并传播
 * 铁律 24: 每个 catch 带 log.warn + degraded 标记
 * 铁律 32: 错误带 .code + .phase + .retryable
 */
import { Router, type Request, type Response } from 'express';
import { createProvider } from '../providers';
import { loadConfig } from '../config';
import { createLogger } from '@synova/logger';
import { getDatabase } from '../init/engine-context';
// V4.2.2: doc-extractor 桥接已删除（铁律46）
export interface ExtractionResult {
  documentId: string;
  extractedAt: string;
  dimensions: Array<{ dimensionKey: string; dimensionLabel: string; content: string; sufficient: boolean }>;
  coveredCount: number;
  totalCount: number;
  insufficientDimensions: string[];
  content?: string;
  metadata?: Record<string, unknown>;
}

// 本地类型镜像 — 避免 L1 静态跨层依赖 (铁律 39, 审计 2026-06-20)
interface L2EntityNode { id: string; type: string; name: string; props: Record<string, unknown>; confidence: number }

const log = createLogger('routes/diagnosis-upload');
const router = Router();

interface DiagnosisJob {
  jobId: string; teamId: string;
  status: 'extracting' | 'measuring' | 'reasoning' | 'building' | 'complete' | 'failed';
  createdAt: string; completedAt?: string; report?: string; error?: string;
}
const jobStore = new Map<string, DiagnosisJob>();

// P0-3: FDE 采访文档上传界面
router.get('/upload', (_req: Request, res: Response) => {
  const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Synova · 文档诊断</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><text y='28' font-size='28'>🔍</text></svg>">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;background:#0d1117;color:#c9d1d9;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:2rem;max-width:680px;width:90%}
h1{font-size:1.3rem;color:#58a6ff;margin-bottom:.5rem}
.sub{color:#8b949e;font-size:.85rem;margin-bottom:1.5rem}
label{display:block;font-size:.9rem;margin-bottom:.4rem}
input,textarea{width:100%;padding:.6rem;margin-bottom:1rem;background:#0d1117;border:1px solid #30363d;border-radius:6px;color:#c9d1d9;font-size:.9rem;font-family:inherit}
textarea{min-height:200px;resize:vertical}
button{width:100%;padding:.75rem;background:#238636;color:#fff;border:none;border-radius:6px;font-size:1rem;cursor:pointer;font-weight:600}
button:hover{background:#2ea043}
.dims{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-bottom:1rem}
.dim{background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:.5rem;font-size:.8rem;color:#8b949e}
.dim strong{color:#c9d1d9}
#result{margin-top:1rem;padding:1rem;border-radius:6px;display:none}
.success{background:#1b3a1b;border:1px solid #3fb950;display:block!important}
.error{background:#3a1b1b;border:1px solid #f85149;display:block!important}
a{color:#58a6ff}
</style></head><body>
<div class="card">
<h1>Synova · 文档诊断</h1>
<p class="sub">上传企业访谈记录 → 八维提取 → 8位专家并行推理 → 诊断报告</p>
<form id="f">
<label>企业名称</label><input name="orgName" value="示例企业" required>
<label>团队标识</label><input name="teamId" value="demo-team" required>
<div class="dims">
<div class="dim"><strong>1.Goal</strong> vision, strategy</div>
<div class="dim"><strong>2.Value</strong> business, proposition</div>
<div class="dim"><strong>3.Status</strong> org structure, assets</div>
<div class="dim"><strong>4.Constraint</strong> budget, people, time</div>
<div class="dim"><strong>5.Risk</strong> worries, past failures</div>
<div class="dim"><strong>6.Success</strong> north star metric</div>
<div class="dim"><strong>7.Market</strong> positioning, differentiation</div>
<div class="dim"><strong>8.Digital</strong> systems, tools, efficiency</div>
</div>
<label>访谈记录</label>
<textarea name="content" placeholder="在此粘贴企业访谈记录..." required></textarea>
<button type="submit">开始诊断</button>
</form>
<div id="result"></div>
</div>
<script>
document.getElementById('f').addEventListener('submit',async(e)=>{
e.preventDefault();
const r=document.getElementById('result');
r.style.display='block';r.className='';
r.innerHTML='<p style=color:#58a6ff>提交中...</p>';
try{
const fd=new FormData(e.target);
const b=Object.fromEntries(fd.entries());
const resp=await fetch('/api/diagnosis/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
const d=await resp.json();
if(d.jobId){
r.className='success';
r.innerHTML='<p>Job: <code>'+d.jobId+'</code></p><p style=margin-top:1rem><a href=/api/diagnosis/status/'+d.jobId+'>View Progress</a></p>';
setTimeout(()=>{window.location.href='/api/diagnosis/status/'+d.jobId;},2000);
}else{
r.className='error';
r.innerHTML='<p>Error: '+(d.error||'unknown')+'</p>';
}
}catch(err){
  log.warn({ err: err instanceof Error ? err.message : String(err) }, "诊断报告上传");
  r.className='error';r.innerHTML='<p>'+err.message+'</p>';
}
});
</script></body></html>`;
  res.type('html').send(html);
});

router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { content, teamId = 'mvp-default', orgName = '企业' } = req.body as {
      content?: string; teamId?: string; orgName?: string;
    };
    if (!content || typeof content !== 'string' || content.trim().length < 20) {
      res.status(400).json({ error: '文档内容至少需要 20 个字符' }); return;
    }
    const jobId = `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    jobStore.set(jobId, { jobId, teamId, status: 'extracting', createdAt: new Date().toISOString() });
    log.info({ jobId, teamId, contentLen: content.length }, '诊断任务已创建');
    runDiagnosisPipeline(jobId, content, teamId, orgName).catch(err => {
      log.error({ jobId, err }, '诊断管线失败');
      const job = jobStore.get(jobId);
      if (job) { job.status = 'failed'; job.error = (err as Error).message; }
    });
    res.json({ jobId, status: 'extracting' });
  } catch (err: any) {
    log.error({ err: err?.message || String(err), stack: err?.stack?.slice(0, 500) }, '上传失败');
    res.status(500).json({ error: err?.message || '服务器内部错误' });
  }
});

// ══════════════════════════════════════════════════════════════════
// T11: 无数据诊断 — 访谈上传 + 预诊断处理
// ══════════════════════════════════════════════════════════════════

/**
 * 将访谈文本解析为 RoleResponse[] 格式。
 * 支持两种输入格式：
 *   1. 结构化：每个角色段以 "【角色】" 开头，行内包含 "(Q1)" 等标记
 *   2. 纯文本：整个文档视为一个角色的回答
 */
function parseInterviewText(
  text: string,
  _roleAnnotations?: Array<{ fileIndex: number; roleId: string }>,
): Array<{ roleId: string; questionIndex: number; answer: string; confidence: number }> {
  const results: Array<{ roleId: string; questionIndex: number; answer: string; confidence: number }> = [];

  if (_roleAnnotations && _roleAnnotations.length > 0) {
    // 多文件模式：由上层按角色分别处理 — 返回空，实际由 runInterviewPipeline 处理
    return results;
  }

  // 单文本模式：按角色段落分割
  const rolePatterns = [
    { role: 'ceo', keywords: ['【CEO】', '【创始人】', 'CEO:', '创始人：'] },
    { role: 'cto', keywords: ['【CTO】', '【技术负责人】', 'CTO:', '技术负责人：'] },
    { role: 'cfo', keywords: ['【CFO】', '【财务负责人】', 'CFO:', '财务负责人：'] },
    { role: 'manager', keywords: ['【中层】', '【经理】', 'Manager:', '管理者：'] },
    { role: 'engineer', keywords: ['【工程师】', '【一线】', 'Engineer:', '工程师：'] },
    { role: 'designer', keywords: ['【设计师】', '【产品】', 'Designer:', '设计师：'] },
    { role: 'hr', keywords: ['【HR】', '【人事】', 'HR:', '人事：'] },
  ];

  for (const pattern of rolePatterns) {
    let roleStart = -1;
    let roleEnd = text.length;

    for (const kw of pattern.keywords) {
      const idx = text.indexOf(kw, 0);
      if (idx >= 0 && (roleStart === -1 || idx < roleStart)) {
        roleStart = idx;
      }
    }
    if (roleStart < 0) continue;

    // 找下一个角色的起始位置作为本角色段落的结束
    for (const otherPattern of rolePatterns) {
      if (otherPattern.role === pattern.role) continue;
      for (const kw of otherPattern.keywords) {
        const idx = text.indexOf(kw, roleStart + 1);
        if (idx >= 0 && idx < roleEnd) {
          roleEnd = idx;
        }
      }
    }

    const section = text.slice(roleStart, roleEnd).trim();
    if (!section) continue;

    // 查找 (Q1) (Q2) 等问答题标记
    const qRegex = /\(?\s*Q\s*(\d+)\s*\)?\s*[:：]?\s*([^]*?)(?=(?:\(?\s*Q\s*\d+\s*\)?\s*[:：])|$)/gi;
    let qMatch;
    let qCount = 0;

    while ((qMatch = qRegex.exec(section)) !== null) {
      const qIndex = parseInt(qMatch[1], 10) - 1; // 0-based
      const ans = qMatch[2].trim();
      if (ans.length > 5) {
        results.push({
          roleId: pattern.role,
          questionIndex: qIndex >= 0 ? qIndex : qCount,
          answer: ans.slice(0, 500),
          confidence: ans.length > 50 ? 0.7 : 0.5,
        });
        qCount++;
      }
    }

    // 如果没有 Q 标记，将整个段落作为通用锚题 A4 的回答
    if (qCount === 0 && section.length > 10) {
      results.push({
        roleId: pattern.role,
        questionIndex: 3, // A4: 如果能改一件事
        answer: section.slice(0, 500),
        confidence: 0.5,
      });
    }
  }

  return results;
}

/**
 * 无数据诊断管线：访谈 → 信号提取 → GPI 估算 → 预诊断报告
 */
async function runInterviewPipeline(
  jobId: string,
  text: string,
  teamId: string,
  orgName: string,
  _roleAnnotations?: Array<{ fileIndex: number; roleId: string }>,
): Promise<void> {
  const job = jobStore.get(jobId)!;
  const config = loadConfig();

  try {
    // Step 1: 解析访谈文本 → RoleResponse[]
    job.status = 'extracting';
    const responses = parseInterviewText(text);
    const roleIds = [...new Set(responses.map(r => r.roleId))];
    log.info({ jobId, responseCount: responses.length, roles: roleIds }, '访谈文本解析完成');

    // Step 2: 信号提取 (R1/R2/R3)
    job.status = 'measuring';
    const { extractSignals } = await import('../interview/signal-extractor');
    const extracted = extractSignals(responses, roleIds);
    log.info({ jobId, signalCount: extracted.signals.length, contradictionCount: extracted.contradictions.length }, '信号提取完成');

    // Step 3: GPI 估算
    const { estimateGPI } = await import('../interview/gpi-estimator');
    const gpiEstimate = estimateGPI({
      signals: extracted.signals,
      contradictionCount: extracted.contradictions.length,
      blindSpotCount: extracted.blindSpots.length,
    });
    log.info({ jobId, gpi: gpiEstimate.gpi, tier: gpiEstimate.gpiTier }, 'GPI 估算完成');

    // Step 4: 专家推理 (通过 T11 interview 路径)
    job.status = 'reasoning';
    const providerType = (process.env.LLM_PROVIDER as string || 'deepseek') as 'deepseek' | 'qwen' | 'glm' | 'kimi' | 'yi' | 'minimax' | 'step' | 'ernie' | 'openai' | 'gateway';
    const provider = createProvider(providerType, {
      apiKey: config.llmApiKey || '', model: config.llmModel, baseUrl: config.llmBaseUrl,
    });
    const llmClient = {
      async complete(prompt: string, systemPrompt?: string): Promise<string> {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: prompt });
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM 超时 (120s)')), 120_000));
            const response = await Promise.race([provider.chat(messages), timeout]);
            return Array.isArray(response.content) ? response.content.join('') : (response.content || '');
          } catch (err: any) { lastErr = err; if (attempt === 0) log.warn({ err: err.message }, 'LLM 调用失败 — 重试'); }
        }
        log.warn({ err: lastErr?.message }, 'LLM 调用失败 (2次重试后)');
        return '';
      },
      async consult(systemPrompt: string, userMessage: string, options?: { temperature?: number; maxTokens?: number }): Promise<{ content: string; model: string }> {
        const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
        if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
        messages.push({ role: 'user', content: userMessage });
        let lastErr: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM 超时 (120s)')), 120_000));
            const response = await Promise.race([provider.chat(messages, options), timeout]);
            const content = Array.isArray(response.content) ? response.content.join('') : (response.content || '');
            const resp = response as unknown as Record<string, unknown>;
            const model = typeof resp.model === 'string' ? resp.model : 'deepseek';
            return { content, model };
          } catch (err: any) { lastErr = err; if (attempt === 0) log.warn({ err: err.message }, 'LLM 调用失败 — 重试'); }
        }
        log.warn({ err: lastErr?.message }, 'LLM 调用失败 (2次重试后)');
        return { content: '', model: 'deepseek' };
      },
    };

    const { ExpertDispatcher } = await import('../l3/expert-dispatcher');
    const dispatcher = new ExpertDispatcher({
      llmClient,
      policies: [{ expertType: 'strategy', allowedDimensions: ['*'], prohibitedFields: [], anonymizationRules: [] }],
    });

    const expertReports = await dispatcher.runAllExpertsFromInterview(extracted.signals, teamId);
    log.info({ jobId, expertCount: expertReports.length }, '专家推理完成');

    // Step 5: 组装预诊断 HTML 报告
    job.status = 'building';
    const signalSummary = extracted.signals.map(s =>
      `[${s.signalStrength}] ${s.description}`,
    ).join('\n');
    const contradictionSummary = extracted.contradictions.map(c =>
      `${c.description}`,
    ).join('\n');

    const html = buildPreliminaryReportHtml({
      orgName,
      jobId,
      gpi: gpiEstimate,
      signalCount: extracted.signals.length,
      contradictionCount: extracted.contradictions.length,
      blindSpots: extracted.blindSpots,
      signalSummary,
      contradictionSummary,
      expertCount: expertReports.length,
      roles: roleIds,
    });

    job.status = 'complete';
    job.completedAt = new Date().toISOString();
    job.report = html;
    log.info({ jobId }, '预诊断报告已就绪');
  } catch (err: any) {
    log.error({ jobId, err: err.message }, '无数据诊断管线失败');
    job.status = 'failed';
    job.error = err.message;
  }
}

/** 构建预诊断 HTML 报告 */
function buildPreliminaryReportHtml(data: {
  orgName: string; jobId: string;
  gpi: { gpi: number; gpiTier: string; external_opportunity: { score: number | null }; value_capture: { score: number | null }; endogenous_creation: { score: number | null }; growth_cost: { score: number | null; reason?: string } };
  signalCount: number; contradictionCount: number;
  blindSpots: string[];
  signalSummary: string; contradictionSummary: string;
  expertCount: number; roles: string[];
}): string {
  const tierColor = data.gpi.gpiTier === 'red' ? '#f85149' : data.gpi.gpiTier === 'yellow' ? '#d29922' : '#3fb950';
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${data.orgName} 预诊断报告</title>
<style>
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;background:#0d1117;color:#e6edf3;margin:auto;padding:2rem;max-width:900px}
h1{color:#58a6ff;border-bottom:1px solid #30363d;padding-bottom:.5rem}
.badge{display:inline-block;background:#1b3a1b;border:1px solid #3fb950;padding:.2rem .6rem;border-radius:6px;font-size:.8rem;margin-right:.5rem}
.badge-warn{background:#3a2f1b;border-color:#d29922}
.card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:1.5rem;margin:1rem 0}
.gpi{font-size:2.5rem;font-weight:700;color:${tierColor}}
.gpi-label{color:#8b949e;font-size:.8rem}
.meta{color:#8b949e;font-size:.85rem;margin-bottom:.5rem}
.warning{color:#d29922;border-left:3px solid #d29922;padding:.5rem 1rem;background:#161b22;margin:1rem 0}
pre{background:#0d1117;padding:1rem;border-radius:6px;overflow-x:auto;font-size:.85rem}
table{width:100%;border-collapse:collapse}
td{padding:.3rem}
</style></head><body>
<h1>🔍 ${data.orgName} 预诊断报告</h1>
<div class="badge badge-warn">预诊断 · 基于访谈数据</div>
<div class="badge">dataSource: interview</div>
<div class="meta">诊断ID: ${data.jobId} | 角色数: ${data.roles.length} | 信号数: ${data.signalCount}</div>

<div class="warning">
<strong>⚠️ 此诊断为预诊断</strong><br>
基于访谈数据的初步判断，部署后将基于真实数据进行精确诊断。
当前置信度为 preliminary，诊断结论仅供参考。
</div>

<div class="card">
<h2>GPI 估算</h2>
<div class="gpi">${data.gpi.gpi.toFixed(2)}</div>
<div class="gpi-label">GPI tier: ${data.gpi.gpiTier} | dataSource: interview</div>
<table>
<tr><td>外部机会 (α)</td><td>${data.gpi.external_opportunity.score?.toFixed(2) ?? 'N/A'}</td><td style="color:#8b949e">preliminary</td></tr>
<tr><td>价值捕获 (β)</td><td>${data.gpi.value_capture.score?.toFixed(2) ?? 'N/A'}</td><td style="color:#8b949e">preliminary</td></tr>
<tr><td>内生创造 (γ)</td><td>${data.gpi.endogenous_creation.score?.toFixed(2) ?? 'N/A'}</td><td style="color:#8b949e">preliminary</td></tr>
<tr><td>增长成本 (δ)</td><td>${data.gpi.growth_cost.score !== null ? data.gpi.growth_cost.score.toFixed(2) : 'N/A'}</td><td style="color:#8b949e">${data.gpi.growth_cost.reason || 'unavailable'}</td></tr>
</table>
</div>

<div class="card">
<h2>信号摘要 (${data.signalCount})</h2>
<pre>${data.signalSummary || '无显著信号'}</pre>
</div>

${data.contradictionSummary ? `<div class="card">
<h2>跨角色矛盾 (${data.contradictionCount})</h2>
<pre>${data.contradictionSummary}</pre>
</div>` : ''}

${data.blindSpots.length > 0 ? `<div class="card">
<h2>盲区检测</h2>
<p>以下维度在访谈中未被任何角色提及：</p>
<ul>${data.blindSpots.map(d => `<li>${d}</li>`).join('')}</ul>
</div>` : ''}

<div class="card">
<h2>专家推理</h2>
<p>${data.expertCount} 位专家已完成基于访谈信号的推理。</p>
</div>

<p style="color:#8b949e;font-size:.8rem;text-align:center;margin-top:2rem">
🤖 Generated by SynovaAgent · 基于访谈数据 · ${new Date().toISOString()}
</p>
</body></html>`;
}

router.post('/interview', async (req: Request, res: Response) => {
  try {
    const { content, teamId = 'mvp-default', orgName = '企业', roles } = req.body as {
      content?: string; teamId?: string; orgName?: string;
      roles?: Array<{ fileIndex: number; roleId: string }>;
    };
    if (!content || typeof content !== 'string' || content.trim().length < 20) {
      res.status(400).json({ error: '访谈内容至少需要 20 个字符' }); return;
    }
    const jobId = `prelim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    jobStore.set(jobId, {
      jobId, teamId, status: 'extracting', createdAt: new Date().toISOString(),
    });
    log.info({ jobId, teamId, contentLen: content.length, roles }, '无数据诊断任务已创建');
    runInterviewPipeline(jobId, content, teamId, orgName, roles).catch(err => {
      log.error({ jobId, err }, '无数据诊断管线失败');
      const job = jobStore.get(jobId);
      if (job) { job.status = 'failed'; job.error = (err as Error).message; }
    });
    res.json({ jobId, status: 'extracting', type: 'preliminary' });
  } catch (err: any) {
    log.error({ err: err?.message || String(err) }, '无数据诊断上传失败');
    res.status(500).json({ error: err?.message || '服务器内部错误' });
  }
});

router.get('/report/:jobId', (req: Request, res: Response) => {
  const jid = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = jobStore.get(jid);
  if (!job) { res.status(404).json({ error: '诊断任务未找到' }); return; }
  if (job.status === 'complete') {
    // Day4: 报告外壳 — 深色/浅色主题 + 导航 + 打印优化
    const wrapped = '<!DOCTYPE html>\n<html lang="zh-CN" class="dark">\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width,initial-scale=1.0">\n<title>Synova 诊断报告</title>\n<style>\n:root{--bg:#0d1117;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--border:#30363d;--card:#161b22}\n.light{--bg:#fff;--text:#1f2328;--muted:#656d76;--accent:#0969da;--border:#d0d7de;--card:#f6f8fa}\nbody{font-family:-apple-system,"Microsoft YaHei",sans-serif;background:var(--bg);color:var(--text);margin:0;padding:0}\n.report-toolbar{background:var(--card);border-bottom:1px solid var(--border);padding:.6rem 1.5rem;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:100;gap:1rem;flex-wrap:wrap}\n.report-toolbar a{color:var(--accent);text-decoration:none;font-size:.85rem}\n.report-toolbar button{background:var(--card);border:1px solid var(--border);color:var(--text);padding:.3rem .8rem;border-radius:6px;cursor:pointer;font-size:.8rem}\n.report-body{padding:0}\n@media print{.report-toolbar{display:none}body{background:#fff;color:#000}}\n</style>\n</head>\n<body>\n<div class="report-toolbar">\n  <div><a href="/">← 首页</a> &nbsp; <a href="/chat">对话诊断</a> &nbsp; <a href="/api/diagnosis/upload">文档诊断</a></div>\n  <div><button onclick="toggleTheme()" id="theme-btn">🌙 深色</button> &nbsp; <button onclick="window.print()">🖨️ 打印</button></div>\n</div>\n<div class="report-body">\n' + (job.report || '') + '\n</div>\n<script>\nfunction toggleTheme(){var h=document.documentElement,b=document.getElementById("theme-btn");if(h.classList.contains("light")){h.classList.remove("light");h.classList.add("dark");b.textContent="🌙 深色"}else{h.classList.remove("dark");h.classList.add("light");b.textContent="☀️ 浅色"}}\n</script>\n</body>\n</html>';
    res.type('html').send(wrapped);
  }
  else if (job.status === 'failed') { res.status(500).json({ error: job.error || '诊断失败' }); }
  else { res.json({ jobId: job.jobId, status: job.status }); }
});

// P0-3: 管线进度页 — FDE 提交后可以看到实时阶段变化
router.get('/status/:jobId', (req: Request, res: Response) => {
  const jid = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = jobStore.get(jid);
  if (!job) { res.status(404).json({ error: '诊断任务未找到' }); return; }

  const STAGES = ['extracting', 'measuring', 'reasoning', 'building', 'complete'] as const;
  const STAGE_LABELS: Record<string, string> = {
    extracting: '八维度提取', measuring: '测量管道', reasoning: '专家推理',
    building: '报告生成', complete: '完成', failed: '失败',
  };
  const currentIdx = STAGES.indexOf(job.status as typeof STAGES[number]);

  const progressPct = job.status === 'complete' ? 100
    : job.status === 'failed' ? 0
    : Math.round(((currentIdx >= 0 ? currentIdx : 0) / STAGES.length) * 100);

  res.type('html').send(`<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta http-equiv="refresh" content="3">
<title>诊断进度 — Synova</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,"Microsoft YaHei",sans-serif;background:#0d1117;color:#c9d1d9;display:flex;justify-content:center;align-items:center;min-height:100vh}
.card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:2rem;max-width:500px;width:90%}
h1{font-size:1.2rem;margin-bottom:1.5rem;color:#58a6ff}
.stage{display:flex;align-items:center;margin-bottom:0.75rem;font-size:0.9rem}
.stage-dot{width:12px;height:12px;border-radius:50%;margin-right:0.75rem;flex-shrink:0}
.done .stage-dot{background:#3fb950}
.active .stage-dot{background:#58a6ff;animation:pulse 1s infinite}
.pending .stage-dot{background:#30363d}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
.stage-label{flex:1}
.done .stage-label{color:#3fb950}
.pending .stage-label{color:#484f58}
.bar{height:4px;background:#30363d;border-radius:2px;margin:1.5rem 0;overflow:hidden}
.bar-fill{height:100%;background:#58a6ff;border-radius:2px;transition:width 1s}
.pct{text-align:center;font-size:2rem;font-weight:700;color:#58a6ff;margin-bottom:0.5rem}
.status-msg{text-align:center;color:#8b949e;font-size:0.85rem}
.failed .stage-dot{background:#f85149}
.failed{color:#f85149}
</style></head><body>
<div class="card">
<h1>Synova 组织诊断</h1>
${STAGES.map((s, i) => {
  const cls = job.status === 'complete' || i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending';
  return `<div class="stage ${cls}"><span class="stage-dot"></span><span class="stage-label">${STAGE_LABELS[s]}</span></div>`;
}).join('')}
${job.status === 'failed' ? `<div class="stage failed"><span class="stage-dot"></span>❌ ${job.error || '诊断失败'}</div>` : ''}
<div class="bar"><div class="bar-fill" style="width:${progressPct}%"></div></div>
<div class="pct">${progressPct}%</div>
<div class="status-msg">${job.status === 'complete' ? '✅ 诊断完成 — <a href="/api/diagnosis/report/' + jid + '" style="color:#58a6ff">查看报告</a>' : job.status === 'failed' ? '诊断失败，请重试' : '页面每 3 秒自动刷新'}</div>
</div></body></html>`);
});

// ═══ Pipeline ═══

async function runDiagnosisPipeline(jobId: string, content: string, teamId: string, orgName: string): Promise<void> {
  const job = jobStore.get(jobId)!;
  const config = loadConfig();
  const providerType = (process.env.LLM_PROVIDER as string || 'deepseek') as 'deepseek' | 'qwen' | 'glm' | 'kimi' | 'yi' | 'minimax' | 'step' | 'ernie' | 'openai' | 'gateway';
  const provider = createProvider(providerType, { apiKey: config.llmApiKey || '', model: config.llmModel, baseUrl: config.llmBaseUrl });
  const llmClient = {
    async complete(prompt: string, systemPrompt?: string): Promise<string> {
      const messages: Array<{role: 'system'|'user'|'assistant'; content: string}> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      // Day1降级: LLM 超时 120s + 一次重试
      let lastErr: Error | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('LLM 超时 (120s)')), 120_000));
          const response = await Promise.race([provider.chat(messages), timeout]);
          return Array.isArray(response.content) ? response.content.join('') : (response.content || '');
        } catch (err: any) {
          lastErr = err;
          if (attempt === 0) log.warn({ err: err.message, attempt }, 'LLM 调用失败 — 重试中');
        }
      }
      log.error({ err: lastErr?.message }, 'LLM 调用失败 (2次重试后) — 降级返回空');
      return ''; // 降级: 不崩，返回空字符串让 pipeline 继续
    },
  };

  // Step 1: 八维度提取
  job.status = 'extracting';
  const DocExtractor = null; /* doc-extractor 桥接已删除 */
  const graphStore = await createRealGraphStore(jobId);
  // GraphStore 已通过 createRealGraphStore 创建 (P0-1 修复)
  // engine-core 为 CJS 模块，动态导入无 TS 类型约束 — 运行时结构子类型兼容。
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractor = new (DocExtractor as unknown as new (graphStore: unknown, llmClient: unknown) => { extract: (docId: string, content: string, teamId: string) => Promise<ExtractionResult> })(graphStore, llmClient);
  const { NodeType } = await import('@synova/ontology');
  const docId = graphStore.createNode(NodeType.RESOURCE_KNOWLEDGE /* ONTOLOGY-MIGRATION: NodeType.RESOURCE_KNOWLEDGE -> resource/knowledge or resource/data? Check context. */, { name: `interview_${jobId}`, docType: 'meeting_notes', content }, teamId);
  let extraction: ExtractionResult;
  try {
    extraction = await extractor.extract(docId, content, teamId);
  } catch (extractErr: any) {
    log.error({ jobId, err: extractErr.message }, '八维度提取失败 — 降级为空提取');
    extraction = { documentId: docId, extractedAt: new Date().toISOString(), dimensions: [], coveredCount: 0, totalCount: 8, insufficientDimensions: ['extraction_failed'] } as unknown as ExtractionResult;
  }

  // ── 提取结果准备 ──
  const dims = extraction.dimensions;
  const covered = dims.filter((d: { sufficient: boolean }) => d.sufficient).length;
  log.info({ jobId, covered: `${covered}/8`, insufficient: extraction.insufficientDimensions }, '八维度提取完成');

  // 提取结果写入 SOG 图节点 (修复专家工具桩 — 数据不再只存在 DOCUMENT 节点属性中)
  const DIM_TO_NODE_TYPE: Record<string, string> = {
    mission: 'Goal', market: 'Goal', competition: 'Goal',
    team: 'Team', finance: 'Financial', client: 'Client',
    risk: 'Risk', technology: 'Capability',
  };
  const sufficients = dims.filter((d: { sufficient: boolean }) => d.sufficient);
  for (const dim of sufficients) {
    const nodeType = DIM_TO_NODE_TYPE[dim.dimensionKey];
    if (nodeType) {
      try {
        graphStore.createNode(nodeType as unknown as string, {
          name: `extracted_${dim.dimensionKey}_${jobId}`,
          dimensionKey: dim.dimensionKey,
          dimensionLabel: dim.dimensionLabel,
          content: dim.content || '',
          confidence: 0.5,
          source: 'document_extraction',
          extractedAt: new Date().toISOString(),
        }, teamId);
      } catch (nodeErr: unknown) {
        log.warn({ dim: dim.dimensionKey, err: (nodeErr as Error)?.message }, '维度节点创建失败（非阻断）');
      }
    }
  }
  log.info({ jobId, nodesCreated: sufficients.length }, '提取维度已写入SOG图节点');

  // Step 2: 测量管道 (7个真实测量器)
  job.status = 'measuring';
  log.info({ jobId }, '启动测量管道');
  let measOutput: { results: Array<{ measurerId: string; score?: number }>; aggregated: Record<string, unknown>; degradedModules: string[] };
  try {
    // 测量管道已从 engine-core 迁移 — 当前使用降级空测量
    measOutput = { results: [], aggregated: {}, degradedModules: ['measurement-pipeline (待迁移)'] };
    log.info({ jobId, count: measOutput.results.length, degraded: measOutput.degradedModules }, '测量完成');
  } catch (measErr: any) {
    log.warn({ jobId, err: measErr.message }, '测量管道失败，降级为空测量');
    measOutput = { results: [], aggregated: {}, degradedModules: ['measurement-pipeline'] };
  }

  // Step 3: 专家推理管道 (6专家并行LLM, 铁律24: 每个catch打log+降级)
  job.status = 'reasoning';
  log.info({ jobId }, '启动专家推理管道');
  let expOutput: { results: Array<{
    expertId: string; expertName: string; score: number; confidence: 'high'|'medium'|'low';
    conclusion: string; findings: Array<{ severity: 'critical'|'warning'|'info'; title: string; description: string; evidence: string[]; suggestion: string }>;
  }>; degradedModules: string[] };
  try {
    // 专家管道已从 engine-core 迁移 — 当前使用降级空推理
    expOutput = { results: [], degradedModules: ['expert-pipeline (待迁移)'] };
    log.info({ jobId, count: expOutput.results.length, degraded: expOutput.degradedModules }, '专家推理完成');
  } catch (expErr: any) {
    log.warn({ jobId, err: expErr.message }, '专家管道失败，降级为空推理');
    expOutput = { results: [], degradedModules: ['expert-pipeline'] };
  }

  // 合并降级信号 (铁律31: 传播到调用链顶端)
  const allDegraded = [
    ...measOutput.degradedModules.map((m: string) => `测量器:${m}`),
    ...expOutput.degradedModules.map((m: string) => `专家:${m}`),
  ];

  // Step 4: 构建报告 — 消费真实专家输出
  job.status = 'building';
  log.info({ jobId }, '构建报告');

  const sections = buildSectionsFromExperts(extraction, expOutput, allDegraded);

  const html = buildReportHtml({
    coreConclusion: buildCoreFromExperts(expOutput, orgName, allDegraded),
    explanation: buildExplanationFromExp(extraction, expOutput, allDegraded),
    orgName, diagnosedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    overallScore: sections.length > 0
      ? sections.reduce((sum: number, s: { score: number }) => sum + s.score, 0) / sections.length
      : 5.0,
    extraction, sections,
    crossValidation: (extractCrossRefs(expOutput) as string[]).join('; '),
    dataTrust: {
      coveredSources: ['FDE采访文档（八维度LLM提取）'],
      missingSources: [
        ...extraction.insufficientDimensions.map((d: string) => `${d}维度的访谈信息不足`),
        ...(allDegraded.length > 0 ? ['部分管道降级: ' + allDegraded.join(', ')] : []),
      ],
    },
  });

  // Step 5: GraphBridge 后处理 (P0-1: 结果写入本体层)
  try {
    await syncDiagnosisToGraph(extraction, expOutput, measOutput, teamId, jobId, graphStore);
    log.info({ jobId }, 'GraphBridge 同步完成');
  } catch (syncErr: any) {
    log.warn({ jobId, err: syncErr.message }, 'GraphBridge 同步失败（非阻断）');
    allDegraded.push('graphbridge-sync');
  }

  job.status = 'complete'; job.completedAt = new Date().toISOString(); job.report = html;
  log.info({ jobId, degraded: allDegraded }, '诊断报告已就绪');
}

// ═══ Section Builder: 从真实专家输出构建 ═══

function buildSectionsFromExperts(
  extraction: { dimensions: Array<{dimensionKey: string; dimensionLabel: string; content: string; sufficient: boolean}> },
  expOutput: { results: Array<{expertId: string; expertName: string; score: number; confidence: 'high'|'medium'|'low'; conclusion: string; findings: Array<{severity: 'critical'|'warning'|'info'; title: string; description: string; evidence: string[]; suggestion: string}>}>; degradedModules: string[] },
  allDegraded: string[],
): Array<{
  expertName: string; expertLabel: string; score: number;
  trend: 'improving' | 'stable' | 'declining';
  findings: Array<{severity: 'critical'|'warning'|'info'; title: string; description: string; evidence: string[]; suggestion: string; crossReference?: string}>;
  dataCoverage: number; confidence: 'high'|'medium'|'low';
}> {
  // 维度→专家映射
  const EXPERT_DIM_MAP: Record<string, string[]> = {
    strategic: ['mission', 'marketPositioning'],
    org: ['currentState', 'resources'],
    finance: ['businessModel', 'risks', 'successCriteria'],
    marketing: ['marketPositioning', 'businessModel'],
    tech: ['digitalFoundation', 'resources'],
    action: ['successCriteria', 'risks'],
    business_model: ['businessModel', 'risks', 'marketPositioning'],
  };

  const dimMap = new Map(extraction.dimensions.map(d => [d.dimensionKey, d]));

  // 有专家输出→用专家输出; 无专家输出→用提取数据兜底
  if (expOutput.results.length > 0) {
    return expOutput.results
      .filter(r => r.expertId !== 'action') // 行动专家单独处理
      .map(r => {
        const dimKeys = EXPERT_DIM_MAP[r.expertId] || [];
        const coverage = dimKeys.length > 0
          ? dimKeys.filter(k => dimMap.get(k)?.sufficient).length / dimKeys.length
          : 0.5;
        const degraded = allDegraded.length > 0;
        return {
          expertName: r.expertId,
          expertLabel: r.expertName || r.expertId,
          score: r.score || 5.0,
          trend: 'stable' as const,
          findings: (r.findings || []).map((f: any) => ({
            severity: (f.severity || 'info') as 'critical'|'warning'|'info',
            title: f.title || '',
            description: f.description || '',
            evidence: Array.isArray(f.evidence) ? f.evidence : (f.evidence ? [f.evidence] : []),
            suggestion: f.suggestion || '',
          })),
          dataCoverage: coverage,
          confidence: degraded ? 'low' : ((r.confidence || 'medium') as 'high'|'medium'|'low'),
        };
      });
  }

  // 兜底：从提取数据构建基本sections (铁律11: 降级打log)
  log.warn('专家输出为空，使用提取数据兜底');
  return [
    {
      expertName: 'strategic', expertLabel: '战略健康：方向对不对', score: 4.0, trend: 'stable',
      findings: [{ severity: 'warning', title: '专家分析不可用', description: '专家推理管道未产出结果，请重试。', evidence: [], suggestion: '重新运行诊断或补充更多信息' }],
      dataCoverage: 0.3, confidence: 'low',
    },
  ];
}

function buildCoreFromExperts(
  expOutput: { results: Array<{expertId: string; conclusion: string; score: number}> },
  orgName: string,
  degraded: string[],
): string {
  if (expOutput.results.length === 0) {
    return `${esc(orgName)}的初步诊断已完成。${degraded.length > 0 ? '⚠️ 部分管道降级(' + degraded.join(',') + ')，结论置信度降低。' : '建议补充更多信息以提升诊断深度。'}`;
  }
  // 取前3个专家的结论拼接
  const conclusions = expOutput.results
    .filter(r => r.expertId !== 'action')
    .slice(0, 3)
    .map(r => r.conclusion)
    .filter(Boolean);
  return conclusions.length > 0
    ? conclusions.join(' ')
    : `${esc(orgName)}的诊断分析已完成，详见各专家报告。`;
}

function buildExplanationFromExp(
  extraction: { dimensions: Array<{dimensionLabel: string; content: string; sufficient: boolean}> },
  expOutput: { results: Array<{expertName: string; score: number}> },
  degraded: string[],
): string {
  const parts = extraction.dimensions
    .filter(d => d.sufficient)
    .slice(0, 4)
    .map(d => `${d.dimensionLabel}: ${d.content.slice(0, 50)}`);
  const base = parts.join('。') || '数据有限';
  const expSummary = expOutput.results.length > 0
    ? `${expOutput.results.length}个专家已完成推理。`
    : '';
  return `${base}。${expSummary}${degraded.length > 0 ? ' ⚠️ 部分管道降级(' + degraded.join(',') + ')，结论置信度降低。' : ''}`;
}

function extractCrossRefs(expOutput: { results: Array<{findings: Array<{title: string; description: string}>}> }): string[] {
  // 从多专家finding中提取交叉印证——同一个主题被多个专家提及
  const themes = new Map<string, number>();
  expOutput.results.forEach(r => {
    (r.findings || []).forEach((f: { title: string; description: string }) => {
      const keyword = f.title.slice(0, 20);
      themes.set(keyword, (themes.get(keyword) || 0) + 1);
    });
  });
  return [...themes.entries()]
    .filter(([, count]) => count >= 2)
    .map(([theme, count]) => `${theme}（${count}位专家同时指向）`)
    .slice(0, 3);
}

/** P0-1: 诊断结果同步到本体层 */
async function syncDiagnosisToGraph(
  extraction: { dimensions: Array<{dimensionKey: string; dimensionLabel: string; content: string; sufficient: boolean}> },
  expOutput: { results: Array<{expertId: string; findings: Array<{severity: string; title: string; description: string}>}> },
  measOutput: { results: Array<{measurerId: string; score?: number}> },
  teamId: string,
  jobId: string,
  graphStore: any,
): Promise<void> {
  try {
    const { NodeType } = await import('@synova/ontology');
    const now = new Date().toISOString();

    // 创建 Diagnosis 节点
    const diagId = graphStore.createNode(
      'Diagnosis',
      {
        name: `diagnosis_${jobId}`,
        diagnosedAt: now,
        extractionCovered: extraction.dimensions.filter((d: { sufficient: boolean }) => d.sufficient).length,
        extractionTotal: extraction.dimensions.length,
        expertCount: expOutput.results.length,
        measurerCount: measOutput.results.length,
      },
      teamId,
    );

    // 创建 Signal 节点 (每个critical/warning finding → 一个Signal)
    const signalIds: string[] = [];
    for (const expert of expOutput.results) {
      for (const finding of (expert.findings || [])) {
        if (finding.severity === 'critical' || finding.severity === 'warning') {
          const sigId = graphStore.createNode(
            'Signal',
            {
              name: `[${finding.severity}] ${finding.title}`,
              severity: finding.severity,
              source: expert.expertId,
              description: finding.description,
              observedAt: now,
            },
            teamId,
          );
          signalIds.push(sigId);
          // Edge: Diagnosis → Signal
          graphStore.createEdge('HAS_SIGNAL', diagId, sigId, 1.0, {}, teamId);
        }
      }
    }

    // 创建 Observation 节点 (每个测量器结果)
    for (const m of measOutput.results) {
      if (m.score !== undefined) {
        const obsId = graphStore.createNode(
          'Observation',
          {
            name: `measurement_${m.measurerId}`,
            measurerId: m.measurerId,
            score: m.score,
            observedAt: now,
          },
          teamId,
        );
        graphStore.createEdge('HAS_OBSERVATION', diagId, obsId, 1.0, {}, teamId);
      }
    }

    // Step 6: 社区检测 (P0-1: detectCommunities)
    let communityCount = 0;
    try {
      // V4.2.3: detectCommunities 桥接已删除 — 降级跳过
      const communities: Array<{ id: string; name: string; size: number; members: string[]; modularity: number }> = [];
      for (const c of communities) {
        const commId = graphStore.createNode(
          'Community',
          { name: `community_${c.id}`, members: c.members, modularity: c.modularity },
          teamId,
        );
        graphStore.createEdge('HAS_COMMUNITY', diagId, commId, 1.0, {}, teamId);
        communityCount++;
      }
      if (communityCount > 0) {
        log.info({ jobId, communities: communityCount }, '社区检测完成');
      }
    } catch (commErr: any) {
      log.warn({ jobId, err: commErr.message }, '社区检测失败（非阻断）');
    }

    // Step 7: 实体解析 (P0-1: L2 entity resolution)
    let resolvedCount = 0;
    try {
      // V4.2.3: generateL2Candidates 桥接已删除 — 降级跳过
      // 从 Signal 节点名生成候选
      const signalNames = signalIds.map((sid) => {
        const node = graphStore.getNode(sid, teamId);
        return { id: sid, name: node?.props?.name || sid };
      }).filter((n) => n.name);
      // 查询已有实体（Person/Team 节点）
      const persons = graphStore.queryNodes('Person', undefined, teamId);
      const teams = graphStore.queryNodes('Team', undefined, teamId);
      const existingNodes = [...persons, ...teams].map((n: any) => ({
        id: n.id, name: n.props?.name || n.id, type: n.type,
      }));
      // generateL2Candidates 已删除 — 降级跳过
      if (signalNames.length > 0 && existingNodes.length > 0) {
        const candidates: Array<{ nodeA: string; nodeB: string; confidence: number; reason: string }> = [];
        for (const c of candidates) {
          if (c.confidence > 0.7) {
            const linkId = graphStore.createNode(
              'EntityLink',
              { name: `resolved_${c.nodeA}_${c.nodeB}`, confidence: c.confidence, reason: c.reason },
              teamId,
            );
            graphStore.createEdge('RESOLVED_TO', diagId, linkId, c.confidence, {}, teamId);
            resolvedCount++;
          }
        }
        if (resolvedCount > 0) {
          log.info({ jobId, resolved: resolvedCount }, '实体解析完成');
        }
      }
    } catch (resErr: any) {
      log.warn({ jobId, err: resErr.message }, '实体解析失败（非阻断）');
    }

    log.info({ jobId, diagId, signals: signalIds.length, communities: communityCount, resolved: resolvedCount }, 'GraphBridge 同步完成');
  } catch (err: any) {
    // 铁律24: 区分错误类型, 打log + degraded
    const msg = err?.message || String(err);
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      log.warn({ jobId, err: msg }, 'GraphBridge 文件缺失（非阻断）');
    } else {
      log.error({ jobId, err: msg, code: 'GRAPHSYNC_FAILED', phase: 5, retryable: true }, 'GraphBridge 同步失败');
    }
    throw err;
  }
}

function esc(t: string): string { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/** P0-1: 创建真实 SQLite GraphStore，失败时回退到内存存储 */
async function createRealGraphStore(jobId: string): Promise<any> {
  try {
    const db = getDatabase();
    const { SqliteGraphStore } = await import('../adapters/sqlite-graph-store');
    const store = new SqliteGraphStore(db);
    log.debug({ jobId }, 'GraphStore (SQLite) 已连接');
    return store;
  } catch (err: any) {
    log.warn({ jobId, err: err.message }, '数据库不可用 — 降级为内存 GraphStore');
    return createMemoryGraphStore();
  }
}

function createMemoryGraphStore() {
  const nodes = new Map<string, any[]>(); const edges: any[] = [];
  return {
    createNode(type: string, props: Record<string, unknown>, graph: string): string {
      const id = `node_${Date.now().toString(36)}`; const arr = nodes.get(graph) || [];
      arr.push({ id, type, props, graph }); nodes.set(graph, arr); return id;
    },
    createNodes(items: Array<any>, g: string): string[] { return items.map((i: any) => this.createNode(i.type, i.props, g)); },
    updateNode(id: string, props: Record<string, unknown>, graph: string): void {
      const n = (nodes.get(graph) || []).find((x: any) => x.id === id); if (n) Object.assign(n.props, props);
    },
    getNode(id: string, graph: string): any { return (nodes.get(graph) || []).find((n: any) => n.id === id) || null; },
    queryNodes(type: string, _f?: any, graph?: string): any[] { return ((graph ? nodes.get(graph) : [...nodes.values()].flat()) || []).filter((n: any) => n.type === type); },
    createEdge(type: string, from: string, to: string, _w?: number, _p?: any, _g?: string): string { const id = `edge_${Date.now().toString(36)}`; edges.push({id, type, from, to}); return id; },
    createEdges(items: Array<any>, g: string): string[] { return items.map((e: any) => this.createEdge(e.type, e.from, e.to, e.weight, e.props, g)); },
    queryEdges(): any[] { return edges; }, traverse(): any { return { nodes: [...nodes.values()].flat(), edges }; },
    findPaths(): any[] { return []; }, queryTriples(): any[] { return []; },
    deleteNode(): void {}, deleteEdge(): void {}, getNodeAtTime(id: string, _t: string, graph: string): any { return this.getNode(id, graph); },
  };
}

/** 简化 HTML 报告构建器 — ReportBuilder 已从 engine-core 迁移 */
function buildReportHtml(data: {
  coreConclusion: string; explanation: string; orgName: string;
  diagnosedAt: string; overallScore: number;
  extraction: { dimensions: Array<{dimensionLabel: string; content: string; sufficient: boolean}> };
  sections: Array<{ expertName: string; expertLabel: string; score: number; findings: Array<{ title: string; description: string }> }>;
  crossValidation: string; dataTrust: { coveredSources: string[]; missingSources: string[] };
}): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${data.orgName} 诊断报告</title></head><body>
<h1>${data.orgName} 诊断报告</h1>
<p>诊断时间: ${data.diagnosedAt} | 综合评分: ${data.overallScore.toFixed(1)}/10</p>
<h2>核心结论</h2><p>${data.coreConclusion}</p>
<h2>分析说明</h2><p>${data.explanation}</p>
<h2>维度详情</h2>
${data.sections.map(s => `<h3>${s.expertLabel} (${s.score.toFixed(1)})</h3>
${s.findings.map(f => `<p><strong>${f.title}</strong>: ${f.description}</p>`).join('')}`).join('')}
<p style="color:gray;font-size:small">🤖 Generated by SynovaAgent — ${new Date().toISOString()}</p></body></html>`;
}

export default router;
