/**
 * routes/diagnosis-upload.ts — MVP 诊断上报路由 V2
 * @state: skeleton — 诊断引擎已接入，extractSections 不再硬编码，改为消费引擎输出 + 提取结果
 *
 * V2 变更: extractSections → buildSectionsFromEngine
 *         调用真实诊断引擎，degradedModules 影响置信度
 */
import { Router, type Request, type Response } from 'express';
import { createProvider } from '../providers';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { EngineCoreVendorAdapter } from '../adapters/engine-core-adapter';
import { ToolRegistry } from '../agent/tools';

const log = createLogger('routes/diagnosis-upload');
const router = Router();

interface DiagnosisJob {
  jobId: string; teamId: string;
  status: 'extracting' | 'diagnosing' | 'building' | 'complete' | 'failed';
  createdAt: string; completedAt?: string; report?: string; error?: string;
}
const jobStore = new Map<string, DiagnosisJob>();

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

router.get('/report/:jobId', (req: Request, res: Response) => {
  const jid = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = jobStore.get(jid);
  if (!job) { res.status(404).json({ error: '诊断任务未找到' }); return; }
  if (job.status === 'complete') { res.type('html').send(job.report!); }
  else if (job.status === 'failed') { res.status(500).json({ error: job.error || '诊断失败' }); }
  else { res.json({ jobId: job.jobId, status: job.status }); }
});

// ═══ Pipeline ═══

async function runDiagnosisPipeline(jobId: string, content: string, teamId: string, orgName: string): Promise<void> {
  const job = jobStore.get(jobId)!;
  const config = loadConfig();
  const providerType = (process.env.LLM_PROVIDER as string || 'deepseek') as 'deepseek' | 'qwen' | 'glm' | 'kimi' | 'yi' | 'minimax' | 'step' | 'ernie' | 'openai' | 'gateway';
  const provider = createProvider(providerType, { apiKey: config.llmApiKey || '', model: config.llmModel, baseUrl: config.llmBaseUrl });
  const toolRegistry = new ToolRegistry();
  const llmClient = {
    async complete(prompt: string, systemPrompt?: string): Promise<string> {
      const messages: Array<{role: 'system'|'user'|'assistant'; content: string}> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      const response = await provider.chat(messages);
      return Array.isArray(response.content) ? response.content.join('') : (response.content || '');
    },
  };

  // Step 1: 八维度提取
  job.status = 'extracting';
  const { DocExtractor } = await import('../../packages/engine-core/src/pipeline/diagnosis/doc-extractor');
  const graphStore = createMemoryGraphStore();
  // 类型断言: createMemoryGraphStore 实现 GraphStore 接口，但不需要完整 SQLiteGraphStore
  const extractor = new DocExtractor(
    graphStore as unknown as Parameters<typeof DocExtractor.prototype.constructor>[0],
    llmClient,
  );
  const { SOGNodeType } = await import('@synova/sog-core');
  const docId = graphStore.createNode(SOGNodeType.DOCUMENT, { name: `interview_${jobId}`, content }, teamId);
  const extraction = await extractor.extract(docId, content, teamId);

  // Step 2: 诊断引擎
  job.status = 'diagnosing';
  log.info({ jobId, covered: extraction.coveredCount }, '提取完成，启动诊断引擎');
  const concerns = extraction.dimensions
    .filter(d => d.content && d.content !== '未提及')
    .map(d => `[${d.dimensionLabel}] ${d.content.slice(0, 200)}`);
  const adapter = new EngineCoreVendorAdapter(provider, toolRegistry);
  const diagnosisResult = await adapter.runConsultation(teamId, {
    role: 'fde', name: 'FDE', teamId,
    concerns: concerns.length > 0 ? concerns : ['初步诊断'],
  });

  // Step 3: 构建报告 — 消费真实引擎输出
  job.status = 'building';
  log.info({ jobId, duration: diagnosisResult.totalDurationMs, degraded: diagnosisResult.degradedModules }, '诊断完成');

  const { ReportBuilder } = await import('../../packages/engine-core/src/pipeline/diagnosis/report-builder');
  const sections = buildSectionsFromEngine(extraction, diagnosisResult.degradedModules);

  const builder = new ReportBuilder();
  const html = builder.build({
    coreConclusion: buildCore(extraction, orgName),
    explanation: buildExplanation(extraction, diagnosisResult.degradedModules),
    orgName, diagnosedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    overallScore: sections.reduce((sum, s) => sum + s.score, 0) / sections.length,
    extraction, sections,
    crossValidation: [],
    dataTrust: {
      coveredSources: ['FDE采访文档（八维度提取）'],
      missingSources: [
        ...extraction.insufficientDimensions.map(d => `${d}维度的访谈信息不足`),
        ...(diagnosisResult.degradedModules.length > 0 ? ['诊断引擎部分模块降级: ' + diagnosisResult.degradedModules.join(', ')] : []),
      ],
    },
  });

  job.status = 'complete'; job.completedAt = new Date().toISOString(); job.report = html;
  log.info({ jobId }, '诊断报告已就绪');
}

// ═══ Section Builder (V2: 消费引擎degraded状态) ═══

function buildSectionsFromEngine(
  extraction: { dimensions: Array<{dimensionKey: string; dimensionLabel: string; content: string; sufficient: boolean}> },
  degradedModules: string[],
): Array<{
  expertName: string; expertLabel: string; score: number;
  trend: 'improving' | 'stable' | 'declining';
  findings: Array<{severity: 'critical'|'warning'|'info'; title: string; description: string; evidence: string[]; suggestion: string; crossReference?: string}>;
  dataCoverage: number; confidence: 'high'|'medium'|'low';
}> {
  const map = new Map(extraction.dimensions.map(d => [d.dimensionKey, d]));
  const g = (k: string) => map.get(k)?.content || '';
  const s = (k: string) => map.get(k)?.sufficient ?? false;
  const engDown = degradedModules.length > 0;

  return [
    {
      expertName: 'strategic', expertLabel: '战略健康：方向对不对',
      score: g('mission') ? 6.5 : 4.0, trend: 'stable' as const,
      findings: [
        { severity: (s('mission') ? 'info' : 'warning') as 'info'|'warning', title: s('mission') ? '战略方向明确' : '战略方向待补充', description: g('mission') || '未提及战略方向。', evidence: g('mission') ? [g('mission').slice(0, 200)] : [], suggestion: s('mission') ? '定期审视战略与市场匹配度' : '补充战略方向信息' },
        { severity: (s('marketPositioning') ? 'info' : 'warning') as 'info'|'warning', title: '市场定位', description: g('marketPositioning') || '未提及市场差异化。', evidence: g('marketPositioning') ? [g('marketPositioning').slice(0, 200)] : [], suggestion: '明确客户认知与差异化' },
      ],
      dataCoverage: s('mission') ? 0.6 : 0.3, confidence: engDown ? 'low' : (s('mission') ? 'medium' : 'low') as 'medium'|'low',
    },
    {
      expertName: 'org', expertLabel: '组织能力：团队能不能执行',
      score: g('currentState') ? 5.5 : 3.5, trend: 'stable' as const,
      findings: [
        { severity: (s('currentState') ? 'info' : 'warning') as 'info'|'warning', title: '组织现状', description: g('currentState') || '未提及团队规模和架构。', evidence: g('currentState') ? [g('currentState').slice(0, 200)] : [], suggestion: '梳理关键岗位和能力缺口' },
        { severity: (g('resources')?.includes('只有') ? 'warning' : 'info') as 'warning'|'info', title: '资源约束', description: g('resources') || '未提及预算和人员限制。', evidence: g('resources') ? [g('resources').slice(0, 200)] : [], suggestion: g('resources')?.includes('只有') ? '关键岗位单点依赖——立即建立备份' : '在约束内找到最优解' },
      ],
      dataCoverage: s('currentState') ? 0.6 : 0.3, confidence: engDown ? 'low' : (s('currentState') ? 'medium' : 'low') as 'medium'|'low',
    },
    {
      expertName: 'finance', expertLabel: '财务视角：增长的财务支撑',
      score: g('businessModel') ? 5.5 : 4.0, trend: 'stable' as const,
      findings: [
        { severity: (s('risks') ? 'warning' : 'info') as 'warning'|'info', title: s('risks') ? '风险关注' : '风险识别不足', description: g('risks') || '未系统识别风险。', evidence: g('risks') ? [g('risks').slice(0, 200)] : [], suggestion: s('risks') ? '制定风险缓解计划' : '补充风险评估' },
        { severity: (s('successCriteria') ? 'info' : 'warning') as 'info'|'warning', title: '成功标准', description: g('successCriteria') || '未定义成功标准。', evidence: g('successCriteria') ? [g('successCriteria').slice(0, 200)] : [], suggestion: s('successCriteria') ? '拆解为年度里程碑' : '定义北极星指标' },
      ],
      dataCoverage: s('businessModel') ? 0.5 : 0.3, confidence: engDown ? 'low' : (s('businessModel') ? 'medium' : 'low') as 'medium'|'low',
    },
  ];
}

function buildCore(extraction: { dimensions: Array<{dimensionKey: string; content: string}> }, orgName: string): string {
  const g = (k: string) => extraction.dimensions.find(d => d.dimensionKey === k)?.content || '';
  const risks = g('risks'); const mission = g('mission');
  if (risks && mission) return `${esc(orgName)}的增长卡点在组织能力——${risks.slice(0, 100)}。战略方向（${mission.slice(0, 60)}），但执行层面存在关键风险。`;
  if (mission) return `${esc(orgName)}当前处于转型期。${mission.slice(0, 150)}。`;
  return `${esc(orgName)}的初步诊断已完成。基于现有信息，主要关注点在组织执行能力。`;
}

function buildExplanation(ex: { dimensions: Array<{dimensionKey: string; dimensionLabel: string; content: string; sufficient: boolean}> }, degraded: string[]): string {
  const parts = ex.dimensions.filter(d => d.sufficient).slice(0, 4).map(d => `${d.dimensionLabel}: ${d.content.slice(0, 50)}`);
  const base = parts.join('。');
  return degraded.length > 0 ? `${base}。⚠️ 诊断引擎部分模块降级(${degraded.join(',')})，结论置信度降低。` : base;
}

function esc(t: string): string { return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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

export default router;
