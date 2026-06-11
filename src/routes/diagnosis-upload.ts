/**
 * routes/diagnosis-upload.ts — MVP 诊断上报路由
 * @state: skeleton — 路由逻辑正确，但八维度提取用 mock LLM，extractSections 是硬编码占位，未消费真实诊断引擎输出
 *
 * POST /api/diagnosis/upload — 上传采访文档 → 八维度提取 → 启动诊断 → 返回报告
 * GET  /api/diagnosis/report/:jobId — 获取诊断报告
 *
 * 铁律 39: L1 路由通过 Adapter 调用 L2/L3，不直接 import engine-core 内部实现细节。
 * MVP 让步：直接调用 DocExtractor 和 ReportBuilder（engine-core 公开模块），其余走 Adapter。
 */
import { Router, type Request, type Response } from 'express';
import { createProvider } from '../providers';
import { loadConfig } from '../config';
import { createLogger } from '../logger';
import { EngineCoreVendorAdapter } from '../adapters/engine-core-adapter';
import { ToolRegistry } from '../agent/tools';

const log = createLogger('routes/diagnosis-upload');
const router = Router();

// ═══ Job Store (MVP: in-memory, Phase N: SQLite) ═══

interface DiagnosisJob {
  jobId: string;
  teamId: string;
  status: 'extracting' | 'diagnosing' | 'building' | 'complete' | 'failed';
  createdAt: string;
  completedAt?: string;
  report?: string;
  error?: string;
}

const jobStore = new Map<string, DiagnosisJob>();

// ═══ POST /api/diagnosis/upload ═══

router.post('/upload', async (req: Request, res: Response) => {
  try {
    const { content, teamId = 'mvp-default', orgName = '企业' } = req.body as {
      content?: string;
      teamId?: string;
      orgName?: string;
    };

    if (!content || typeof content !== 'string' || content.trim().length < 20) {
      res.status(400).json({ error: '文档内容至少需要 20 个字符' });
      return;
    }

    const jobId = `diag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const job: DiagnosisJob = {
      jobId, teamId, status: 'extracting',
      createdAt: new Date().toISOString(),
    };
    jobStore.set(jobId, job);

    log.info({ jobId, teamId, contentLen: content.length }, '诊断任务已创建');

    // 异步执行诊断流程
    runDiagnosisPipeline(job, content, teamId, orgName).catch(err => {
      log.error({ jobId, err }, '诊断管线失败');
      job.status = 'failed';
      job.error = (err as Error).message;
    });

    res.json({ jobId, status: 'extracting' });
  } catch (err) {
    log.error({ err }, '上传失败');
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ═══ GET /api/diagnosis/report/:jobId ═══

router.get('/report/:jobId', (req: Request, res: Response) => {
  const jobId = Array.isArray(req.params.jobId) ? req.params.jobId[0] : req.params.jobId;
  const job = jobStore.get(jobId);
  if (!job) {
    res.status(404).json({ error: '诊断任务未找到' });
    return;
  }

  if (job.status === 'complete') {
    res.type('html').send(job.report!);
  } else if (job.status === 'failed') {
    res.status(500).json({ error: job.error || '诊断失败' });
  } else {
    res.json({ jobId: job.jobId, status: job.status });
  }
});

// ═══ Pipeline ═══

async function runDiagnosisPipeline(
  job: DiagnosisJob,
  content: string,
  teamId: string,
  orgName: string,
): Promise<void> {
  const config = loadConfig();
  const providerType = (process.env.LLM_PROVIDER as string || 'deepseek') as
    'deepseek' | 'qwen' | 'glm' | 'kimi' | 'yi' | 'minimax' | 'step' | 'ernie' | 'openai' | 'gateway';
  const provider = createProvider(providerType, {
    apiKey: config.llmApiKey || '',
    model: config.llmModel,
    baseUrl: config.llmBaseUrl,
  });
  const toolRegistry = new ToolRegistry();

  // ── Step 1: 八维度提取 ──
  job.status = 'extracting';
  log.info({ jobId: job.jobId }, '开始八维度提取');

  const { DocExtractor } = await import(
    '../../packages/engine-core/src/pipeline/diagnosis/doc-extractor'
  );

  // 创建 LLM 适配器（实现 DocExtractor 的 LLMClient 接口）
  const llmClient = {
    async complete(prompt: string, systemPrompt?: string): Promise<string> {
      const messages: Array<{role: 'system'|'user'|'assistant'; content: string}> = [];
      if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
      messages.push({ role: 'user', content: prompt });
      const response = await provider.chat(messages);
      return Array.isArray(response.content)
        ? response.content.join('')
        : (response.content || '');
    },
  };

  // GraphStore 占位（MVP 阶段：内存存储，Phase N 接 SQLite GraphStore）
  const graphStore = createMemoryGraphStore();

  const extractor = new DocExtractor(graphStore, llmClient);

  // 先用 DocExtractor 创建 document 节点
  const { SOGNodeType } = await import('@synova/sog-core');
  const docId = graphStore.createNode(
    SOGNodeType.DOCUMENT,
    { name: `interview_${job.jobId}`, content },
    teamId,
  );

  const extraction = await extractor.extract(docId, content, teamId);

  // ── Step 2: 准备诊断 ──
  job.status = 'diagnosing';
  log.info({ jobId: job.jobId, covered: extraction.coveredCount }, '八维度提取完成，启动诊断');

  // 将八维度提取结果转化为 initiator concerns
  const concerns = extraction.dimensions
    .filter(d => d.content && d.content !== '未提及')
    .map(d => `[${d.dimensionLabel}] ${d.content.slice(0, 200)}`);

  const adapter = new EngineCoreVendorAdapter(provider, toolRegistry);

  // ── Step 3: 运行诊断 ──
  const diagnosisResult = await adapter.runConsultation(
    teamId,
    {
      role: 'fde',
      name: 'FDE',
      teamId,
      concerns: concerns.length > 0 ? concerns : ['初步诊断'],
    },
  );

  // ── Step 4: 构建报告 ──
  job.status = 'building';
  log.info({ jobId: job.jobId, duration: diagnosisResult.totalDurationMs,
    degraded: diagnosisResult.degradedModules }, '诊断完成，构建报告');

  const { ReportBuilder } = await import(
    '../../packages/engine-core/src/pipeline/diagnosis/report-builder'
  );

  // 从诊断引擎输出构建 section：优先引擎输出，提取结果兜底
  const engineReport = typeof diagnosisResult.report === 'string' ? diagnosisResult.report : '';
  const sections = buildSectionsFromEngine(extraction, diagnosisResult.degradedModules);

  const reportBuilder = new ReportBuilder();
  const html = reportBuilder.build({
    coreConclusion: buildCoreFromExtraction(extraction, orgName),
    explanation: buildExplanationFromExtraction(extraction, diagnosisResult.degradedModules),
    orgName,
    diagnosedAt: new Date().toISOString().replace('T', ' ').slice(0, 19),
    overallScore: sections.length > 0
      ? sections.reduce((sum, s) => sum + s.score, 0) / sections.length
      : 5.0,
    extraction,
    sections,
    crossValidation: engineReport
      ? engineReport.split('\n').filter(l => l.includes('交叉') || l.includes('印证') || l.includes('同时指向')).slice(0, 3)
      : [],
    dataTrust: {
      coveredSources: ['FDE 采访文档（八维度提取）'],
      missingSources: [
        ...extraction.insufficientDimensions.map(d => `${d}维度的访谈信息不足`),
        ...(diagnosisResult.degradedModules.length > 0
          ? ['诊断引擎部分模块降级: ' + diagnosisResult.degradedModules.join(', ')]
          : []),
      ],
    },
  });

  // ── Complete ──
  job.status = 'complete';
  job.completedAt = new Date().toISOString();
  job.report = html;
  log.info({ jobId: job.jobId }, '诊断报告已就绪');
}

// ═══ Helpers ═══

/** 内存 GraphStore — MVP 占位 */
function createMemoryGraphStore() {
  const nodes = new Map<string, any[]>();
  const edges: any[] = [];
  return {
    createNode(type: string, props: Record<string, unknown>, graph: string): string {
      const id = `node_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const arr = nodes.get(graph) || [];
      arr.push({ id, type, props, graph, created_at: new Date().toISOString() });
      nodes.set(graph, arr);
      return id;
    },
    createNodes(items: Array<{type: string; props: Record<string, unknown>}>, graph: string): string[] {
      return items.map(item => this.createNode(item.type, item.props, graph));
    },
    updateNode(id: string, props: Record<string, unknown>, graph: string): void {
      const arr = nodes.get(graph) || [];
      const node = arr.find((n: any) => n.id === id);
      if (node) Object.assign(node.props, props);
    },
    getNode(id: string, graph: string): any {
      const arr = nodes.get(graph) || [];
      return arr.find((n: any) => n.id === id) || null;
    },
    queryNodes(type: string, _filters?: Record<string, unknown>, graph?: string): any[] {
      const arr = (graph ? nodes.get(graph) : [...nodes.values()].flat()) || [];
      return arr.filter((n: any) => n.type === type);
    },
    createEdge(type: string, from: string, to: string, _weight?: number, _props?: Record<string, unknown>, _graph?: string): string {
      const id = `edge_${Date.now().toString(36)}`;
      edges.push({ id, type, from, to });
      return id;
    },
    createEdges(items: Array<{type: string; from: string; to: string; weight?: number; props?: Record<string, unknown>}>, graph: string): string[] {
      return items.map(e => this.createEdge(e.type, e.from, e.to, e.weight, e.props, graph));
    },
    queryEdges(_type?: string, _from?: string, _to?: string, _graph?: string): any[] {
      return edges;
    },
    traverse(): any { return { nodes: [...nodes.values()].flat(), edges }; },
    findPaths(): any[] { return []; },
    queryTriples(): any[] { return []; },
    deleteNode(): void {},
    deleteEdge(): void {},
    getNodeAtTime(id: string, _ts: string, graph: string): any { return this.getNode(id, graph); },
  };
}

/** 从诊断结果中提取各专家 section */
function extractSections(
  report: string,
  extraction: { dimensions: Array<{dimensionLabel: string; content: string; sufficient: boolean}> },
): Array<{
  expertName: string;
  expertLabel: string;
  score: number;
  trend: 'improving' | 'stable' | 'declining';
  findings: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    evidence: string[];
    suggestion: string;
    crossReference?: string;
  }>;
  dataCoverage: number;
  confidence: 'high' | 'medium' | 'low';
}> {
  const sections = [];

  // 从提取结果和诊断报告中构建简化的专家 section
  const dimMap = new Map(extraction.dimensions.map(d => [d.dimensionLabel, d]));

  // 战略专家
  const missionContent = dimMap.get('任务目标')?.content || '';
  const marketContent = dimMap.get('市场定位')?.content || '';
  sections.push({
    expertName: 'strategic',
    expertLabel: '战略健康：方向对不对',
    score: missionContent ? 6.5 : 4.0,
    trend: 'stable' as const,
    findings: [
      {
        severity: (missionContent ? 'info' : 'warning') as 'info' | 'warning',
        title: missionContent ? '战略方向有明确描述' : '战略方向不清晰',
        description: missionContent || '采访中未明确提到长期目标和战略方向，这是诊断的盲区。',
        evidence: missionContent ? [missionContent.slice(0, 200)] : [],
        suggestion: missionContent
          ? '定期审视战略方向与市场变化的匹配度'
          : '建议补充战略方向信息——明确未来 1-3 年的核心目标',
      },
      {
        severity: (marketContent ? 'info' : 'warning') as 'info' | 'warning',
        title: '市场定位分析',
        description: marketContent || '未提及市场定位和差异化',
        evidence: marketContent ? [marketContent.slice(0, 200)] : [],
        suggestion: '明确"客户用什么词描述你"——定位清晰度直接影响增长效率',
      },
    ],
    dataCoverage: missionContent ? 0.6 : 0.3,
    confidence: (missionContent ? 'medium' : 'low') as 'medium' | 'low',
  });

  // 组织专家
  const currentStateContent = dimMap.get('现状起点')?.content || '';
  const resourceContent = dimMap.get('资源约束')?.content || '';
  sections.push({
    expertName: 'org',
    expertLabel: '组织能力：团队能不能执行',
    score: currentStateContent ? 5.5 : 3.5,
    trend: 'stable' as const,
    findings: [
      {
        severity: (currentStateContent ? 'info' : 'warning') as 'info' | 'warning',
        title: '现状评估',
        description: currentStateContent || '未提及现有团队规模和组织架构',
        evidence: currentStateContent ? [currentStateContent.slice(0, 200)] : [],
        suggestion: '梳理关键岗位和能力缺口——团队能否支撑战略目标',
      },
      {
        severity: (resourceContent ? 'info' : 'warning') as 'info' | 'warning',
        title: '资源约束分析',
        description: resourceContent || '未提及预算和人员限制',
        evidence: resourceContent ? [resourceContent.slice(0, 200)] : [],
        suggestion: '在资源约束下找到最优解——避免不切实际的建议',
      },
    ],
    dataCoverage: currentStateContent ? 0.6 : 0.3,
    confidence: (currentStateContent ? 'medium' : 'low') as 'medium' | 'low',
  });

  // 财务专家 — 业务价值 + 风险中的客户/现金流部分
  const businessContent = dimMap.get('业务价值')?.content || '';
  const riskContent = dimMap.get('风险瓶颈')?.content.includes('客户') || dimMap.get('风险瓶颈')?.content.includes('现金')
    ? dimMap.get('风险瓶颈')?.content : '';
  const successContent = dimMap.get('成功标准')?.content || '';
  sections.push({
    expertName: 'finance',
    expertLabel: '财务视角：增长的财务支撑',
    score: businessContent ? 5.5 : 4.0,
    trend: 'stable' as const,
    findings: [
      {
        severity: (riskContent ? 'warning' : 'info') as 'warning' | 'info',
        title: riskContent ? '客户集中度或现金流风险' : '财务基础评估',
        description: riskContent || businessContent || '财务数据有限，无法深入评估',
        evidence: riskContent ? [riskContent.slice(0, 200)] : (businessContent ? [businessContent.slice(0, 200)] : []),
        suggestion: riskContent ? '分散客户或补充现金流储备' : '补充财务数据以进行更深入的诊断',
      },
      {
        severity: (successContent ? 'info' : 'warning') as 'info' | 'warning',
        title: '成功标准',
        description: successContent || '未定义明确的成功标准',
        evidence: successContent ? [successContent.slice(0, 200)] : [],
        suggestion: successContent ? '将长期目标拆解为年度里程碑' : '定义北极星指标——"怎么才算成了"',
      },
    ],
    dataCoverage: businessContent ? 0.5 : 0.3,
    confidence: (businessContent ? 'medium' : 'low') as 'medium' | 'low',
  });

  return sections;
}

/** 从报告中提取核心结论 */
function buildCoreConclusion(
  sections: Array<{ findings: Array<{ severity: string; description: string }> }>,
  orgName: string,
): string {
  const criticals = sections.flatMap(s => s.findings.filter(f => f.severity === 'critical'));
  const warnings = sections.flatMap(s => s.findings.filter(f => f.severity === 'warning'));

  if (criticals.length > 0) {
    return `${escapeHtml(orgName)}当前面临 ${criticals.length} 个紧急问题，${warnings.length} 个需要关注的事项。建议优先处理标注为"紧急"的行动项。`;
  }
  if (warnings.length > 0) {
    return `${escapeHtml(orgName)}整体健康，有 ${warnings.length} 个需要关注的信号。这些信号目前不构成紧急风险，但需要持续跟踪。`;
  }
  return `${escapeHtml(orgName)}当前处于健康状态。请继续定期诊断，保持对变化的敏感度。`;
}

function buildExplanation(
  sections: Array<{ expertLabel: string; score: number }>,
): string {
  return sections
    .map(s => `"${s.expertLabel}"评分 ${s.score.toFixed(1)}。`)
    .join(' ');
}

/** 从诊断报告中提取交叉验证信息 */
function extractCrossValidation(report: string): string[] {
  if (!report) return [];
  // 从报告中提取包含"交叉"或"印证"或"同时指向"的句子
  const lines = report.split('\n').filter(line =>
    line.includes('交叉') || line.includes('印证') || line.includes('同时指向') || line.includes('关联'),
  );
  return lines.slice(0, 3).map(l => l.trim());
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default router;
