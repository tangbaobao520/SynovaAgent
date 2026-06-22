/**
 * analyst.ts — 维度分析师 (L3)
 *
 * 收到哨兵 Finding[]，按维度分组，每个维度独立调 LLM 分析。
 * 一个维度 = 一次独立的 LLM 思考，不混合其他维度的上下文。
 *
 * 这是专家体系的第一步——先把 LLM 调用从"一个人分析所有"拆成"一个人分析一个维度"。
 *
 * Iron law #24: catch + log + degraded.
 * Iron law #38: zero unsafe type casts.
 */
import { createLogger } from '../logger';
import type { SentinelFinding } from '../sentinel/types';

const log = createLogger('l3/analyst');

// ═══ 类型 ═══

interface LLMClient {
  chat(messages: Array<{ role: string; content: string }>): Promise<{ content: string }>;
}

export interface DimensionAnalysis {
  dimension: string;
  summary: string;
  confidence: number;
  insights: string[];
}

export interface AnalysisResult {
  analyses: DimensionAnalysis[];
  totalFindings: number;
}

// ═══ 维度 → 专业视角 Prompt ═══

const DIMENSION_PROMPTS: Record<string, string> = {
  D1: '你是一位增长战略分析师。专注于收入增长、市场扩张、客户获取。基于数据给出增长瓶颈判断。',
  D2: '你是一位组织架构分析师。专注于团队结构、协作模式、权责分配。基于数据给出组织效率判断。',
  D3: '你是一位人才与知识管理分析师。专注于关键人风险、知识分布、Bus Factor。基于数据给出人才风险判断。',
  D4: '你是一位技术架构分析师。专注于技术栈、工具链、自动化水平。基于数据给出技术债与效率判断。',
  D5: '你是一位适配度分析师。专注于产品-市场匹配、客户成功、交付效率。基于数据给出适配度判断。',
  D6: '你是一位战略定位分析师。专注于竞争壁垒、商业模式、市场定位。基于数据给出战略判断。',
  D7: '你是一位风险管理分析师。专注于财务风险、合规风险、运营风险。基于数据给出风险判断。',
};

function getPrompt(dimension: string): string {
  return DIMENSION_PROMPTS[dimension] || '你是一位组织诊断分析师。基于数据给出客观判断。';
}

// ═══ 主入口 ═══

export async function runAnalysis(
  llm: LLMClient,
  teamId: string,
  findings: SentinelFinding[],
): Promise<AnalysisResult> {
  if (findings.length === 0) {
    return { analyses: [], totalFindings: 0 };
  }

  // 按维度分组
  const byDim = new Map<string, SentinelFinding[]>();
  for (const f of findings) {
    const dim = f.dimension || 'general';
    if (!byDim.has(dim)) byDim.set(dim, []);
    byDim.get(dim)!.push(f);
  }

  const analyses: DimensionAnalysis[] = [];

  // 每个维度独立 LLM 调用
  for (const [dim, dimFindings] of byDim) {
    try {
      const analysis = await analyzeDimension(llm, teamId, dim, dimFindings);
      analyses.push(analysis);
    } catch (err: unknown) {
      log.warn({ err, dim, teamId }, '维度分析失败 — degraded');
      analyses.push({
        dimension: dim,
        summary: `维度 ${dim} 分析暂时不可用。`,
        confidence: 0,
        insights: [],
      });
    }
  }

  log.info({ teamId, dimensions: analyses.length, findings: findings.length }, '分析完成');
  return { analyses, totalFindings: findings.length };
}

async function analyzeDimension(
  llm: LLMClient,
  teamId: string,
  dimension: string,
  findings: SentinelFinding[],
): Promise<DimensionAnalysis> {
  const findingText = findings.map(f =>
    `- [${f.severity}] ${f.title}: ${f.description}${f.suggestion ? ` 建议: ${f.suggestion}` : ''}`
  ).join('\n');

  const response = await llm.chat([{
    role: 'user',
    content: `${getPrompt(dimension)}

## 目标组织
${teamId}

## 监测数据
${findingText}

请基于以上数据，给出简短判断（2-3句话）:
1. 这一个维度最关键的发现是什么？
2. 置信度 (0-1)
3. 一两个关键词（逗号分隔）

用 JSON 格式回复: {"summary": "...", "confidence": 0.8, "insights": ["关键词1", "关键词2"]}`,
  }]);

  const parsed = parseResponse(response.content);
  return { dimension, ...parsed };
}

function parseResponse(content: string): { summary: string; confidence: number; insights: string[] } {
  try {
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      const j = JSON.parse(match[0]);
      return {
        summary: typeof j.summary === 'string' ? j.summary : content.slice(0, 200),
        confidence: typeof j.confidence === 'number' ? Math.min(1, Math.max(0, j.confidence)) : 0.7,
        insights: Array.isArray(j.insights) ? j.insights.filter((i): i is string => typeof i === 'string') : [],
      };
    }
  } catch { /* degraded — 使用原始文本 */ }
  return { summary: content.slice(0, 200), confidence: 0.5, insights: [] };
}

// ═══ LLM 格式化 ═══

/** 将分析结果格式化为 LLM prompt 文本 */
export function formatAnalysisForLLM(result: AnalysisResult): string {
  if (result.analyses.length === 0) return '';
  const lines = ['## 维度分析\n'];
  for (const a of result.analyses) {
    lines.push(`### ${a.dimension}: ${a.summary}`);
    if (a.insights.length > 0) lines.push(`关键点: ${a.insights.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}
