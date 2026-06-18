/**
 * l1/qa-router.ts — 员工知识问答路由器 (KnowledgeAgent 后台化)
 *
 * 流程:
 *   用户提问 → 领域识别 → KnowledgeAgent 检索 → 领域专家回答 → 返回
 *
 * KnowledgeAgent 只检索不回答。回答由对应领域专家负责。
 * 权限: 根据用户角色过滤知识 (L1→request-context)
 */
import { createLogger } from '../logger';
import { KnowledgeStore } from '../agent/knowledge-bridge-service';
import type { FilterClause } from '../agent/knowledge-bridge-service';
import { getDatabase } from '../init/engine-context';
import { getCurrentFilterClause } from '../services/request-context';

const log = createLogger('l1/qa-router');

// ═══ 领域识别 ═══

interface QARoute {
  domain: string;
  confidence: number;
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  strategy: ['战略', '目标', '方向', '竞争', '市场地位', '增长', '扩张', '收购', '并购', '行业', '波特', 'SWOT'],
  org: ['组织', '团队', '架构', '管理', '人员', '文化', '跨部门', '招聘', '离职', '绩效', '考核', '薪酬', '劳动', '合同', '社保', '杨三角'],
  finance: ['财务', '成本', '利润', '收入', '现金流', '预算', '投资', '资产', '负债', '税', '发票', '报销', '会计', '报表', '审计', 'ROI', 'ROE'],
  tech: ['技术', '系统', '工具', '软件', '开发', '自动化', '数据', '服务器', 'AI', 'IT', '代码', '架构', '运维'],
  marketing: ['市场', '营销', '客户', '销售', '品牌', '广告', '获客', '转化', '定价', '竞品', '渠道', '增长', 'NPS'],
  action: ['执行', '项目', '任务', '进度', '计划', '交付', '流程', '会议', 'OKR', 'KPI', '敏捷', 'Scrum'],
};

function detectDomain(question: string): QARoute[] {
  const results: QARoute[] = [];
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (question.includes(kw)) score++;
    }
    if (score > 0) {
      results.push({ domain, confidence: Math.min(1, score / Math.max(keywords.length * 0.1, 3)) });
    }
  }
  return results.sort((a, b) => b.confidence - a.confidence).slice(0, 2);
}

// ═══ 专家回答模板 ═══

const EXPERT_ANSWER_PROMPTS: Record<string, string> = {
  strategy: '你是企业战略专家。根据检索到的知识和数据，结合用户企业的实际情况给出专业建议。回答需有数据支撑和可操作性。',
  org: '你是组织管理专家。根据检索到的知识和数据，结合劳动法规和最佳实践给出专业建议。',
  finance: '你是财务专家。根据检索到的会计准则、税法和财务数据给出专业建议。数字必须准确，引用必须合规。',
  tech: '你是技术架构专家。根据检索到的技术知识和数据给出专业建议。',
  marketing: '你是市场营销专家。根据检索到的市场数据和营销理论给出专业建议。',
  action: '你是执行力专家。根据检索到的执行方法论和数据给出专业建议。',
};

// ═══ 问答入口 ═══

export interface QARequest {
  question: string;
  userId: string;
  teamId?: string;
  knowledgeLevel?: 1 | 2 | 3;
}

export interface QAResponse {
  ok: boolean;
  answer?: string;
  domain: string;
  knowledgeSources: Array<{ id: string; type: string; confidence: number; snippet: string }>;
  degraded: boolean;
  error?: string;
}

/**
 * 处理员工问答请求。
 * KnowledgeAgent 检索 → 领域专家回答 → 返回。
 */
export async function answerQuestion(req: QARequest): Promise<QAResponse> {
  try {
    const store = new KnowledgeStore(getDatabase());
    const filter = await getCurrentFilterClause('KnowledgeChunk') as FilterClause;

    // Step 1: 领域识别
    const routes = detectDomain(req.question);
    const primaryDomain = routes[0]?.domain || 'strategy';
    log.debug({ question: req.question.slice(0, 80), domain: primaryDomain, confidence: routes[0]?.confidence }, 'QA 路由');

    // Step 2: KnowledgeAgent 检索 (本地+IML+PKB)
    const { results: localResults } = store.search(req.question, filter, 5);
    const { results: pkbResults } = store.searchPKB({
      query: req.question,
      domain: primaryDomain,
      knowledgeLevel: req.knowledgeLevel || 2,
    }, filter, 5);

    // 合并结果
    const allResults = [
      ...localResults.map(r => ({ ...r, source: '本地知识库' })),
      ...pkbResults.map(r => ({ ...r, source: 'PKB' })),
    ].slice(0, 8);

    // Step 3: 构建专家回答上下文
    const sources = allResults.map(r => ({
      id: r.id,
      type: (r as Record<string, unknown>).pkb_type as string || r.sourceType,
      confidence: (r as Record<string, unknown>).pkb_confidence as number || 0.7,
      snippet: (r as Record<string, unknown>).snippet as string || r.text?.slice(0, 200) || '',
    }));

    // Step 4: 根据用户层级调整回答深度
    const level = req.knowledgeLevel || 2;
    const levelGuide = level === 1 ? '用户是非专业背景，请用简单易懂的语言解释，避免专业术语。'
      : level === 3 ? '用户是专业背景(CFO/CPA等)，可以使用专业术语和深度分析。'
      : '用户有一定基础，使用适度专业的语言。';

    const answer = buildAnswer(primaryDomain, req.question, sources, levelGuide);

    return {
      ok: true,
      answer,
      domain: primaryDomain,
      knowledgeSources: sources,
      degraded: sources.length === 0,
    };
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    log.error({ err: error, question: req.question.slice(0, 80) }, 'QA 问答失败');
    return { ok: false, domain: 'unknown', knowledgeSources: [], degraded: true, error };
  }
}

function buildAnswer(domain: string, question: string, sources: QAResponse['knowledgeSources'], levelGuide: string): string {
  const prompt = EXPERT_ANSWER_PROMPTS[domain] || EXPERT_ANSWER_PROMPTS.strategy;

  if (sources.length === 0) {
    return `关于"${question}"，我在当前知识库中未找到相关信息。建议: 1. 请确认您有权限查看相关数据 2. 可以请管理员补充相关领域的知识到知识库 3. 您可以换个角度重新提问。`;
  }

  const knowledgeContext = sources.map(s =>
    `[来源: ${s.type} | 置信度: ${(s.confidence * 100).toFixed(0)}%]\n${s.snippet}`
  ).join('\n\n');

  // 返回给 LLM 的完整 prompt — 由调用方 (L1) 发送到 LLM
  return `${prompt}\n\n${levelGuide}\n\n## 用户问题\n${question}\n\n## 检索到的相关知识\n${knowledgeContext}\n\n请根据以上知识回答用户问题。回答要求: 1.标注信息来源 2.区分事实和观点 3.如果知识不足以回答,诚实告知 4.禁止编造数据。`;
}
