/**
 * expert-platform/extractor.ts — LLM 辅助知识提取 (Slice 4.3 实现)
 *
 * 将行业专家的自然语言描述自动提取为结构化诊断模板:
 *   自然语言 → 症状节点 → 根因节点 → 边类型 → 行业标签 → 置信度
 *
 * 这是"护城河"的核心: 不懂技术的专家也能贡献行业隐性知识。
 */
import type { LLMProvider } from '../providers/types';
import type { ExpertContribution, ExpertTemplate } from './types';
import { createLogger } from '../logger';

const log = createLogger('expert-platform/extractor');

// ═══ Extraction prompt ═══

const EXTRACTION_PROMPT = `你是一个组织诊断知识提取器。你的任务是将行业专家的自然语言描述转换为结构化的诊断模板。

输入: 专家对某个行业场景的问题描述
输出: 严格 JSON 格式

{
  "symptom": "症状名称(简洁, ≤10字)",
  "rootCause": "根因名称(简洁, ≤10字)",
  "edgeType": "TRIGGERS 或 AFFECTS 或 DEPENDS_ON 或 PROVIDES",
  "industry": "行业标签(如 manufacturing, healthcare, finance)",
  "scenario": "场景标签(如 high_turnover, slow_delivery)",
  "confidence": 0.9,
  "principle": "原理层: 为什么这个根因导致这个症状(timeless,1-2句)",
  "solution": "方案层: 当前有效的具体解决方法(1-2句,可能随时间过时)"
}

规则:
- symptom 和 rootCause 必须是简洁的名词短语
- edgeType 必须是给定的四种之一
- confidence 基于专家经验和描述的明确程度, 0.5-1.0
- principle 解释因果关系(长期有效)
- solution 给出当前可行的解决方案(可能过时)
- 只输出 JSON, 不要 markdown 代码块, 不要解释`;

// ═══ Extractor ═══

export class ExpertKnowledgeExtractor {
  private provider: LLMProvider;

  constructor(provider: LLMProvider) {
    this.provider = provider;
  }

  /**
   * Extract structured template from an expert's natural language contribution.
   *
   * @param contribution - Raw expert input (natural language)
   * @returns ExpertTemplate or null if extraction fails
   */
  async extract(contribution: ExpertContribution): Promise<ExpertTemplate | null> {
    const userMessage = [
      `行业: ${contribution.industry}`,
      `场景: ${contribution.scenario}`,
      `专家描述: ${contribution.description}`,
      contribution.yearsOfExperience
        ? `该专家有 ${contribution.yearsOfExperience} 年行业经验。`
        : '',
    ].filter(Boolean).join('\n');

    try {
      const result = await this.provider.chat([
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userMessage },
      ], { temperature: 0.3, maxTokens: 500 });

      const extracted = JSON.parse(result.content) as {
        symptom: string;
        rootCause: string;
        edgeType: string;
        industry: string;
        scenario: string;
        confidence: number;
        principle: string;
        solution: string;
      };

      // Validate required fields
      if (!extracted.symptom || !extracted.rootCause || !extracted.edgeType) {
        log.warn({ contribution: contribution.description.slice(0, 80) },
          'LLM 提取缺少必填字段');
        return null;
      }

      const template: ExpertTemplate = {
        id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        symptom: extracted.symptom.slice(0, 40),
        rootCause: extracted.rootCause.slice(0, 40),
        edgeType: extracted.edgeType.slice(0, 20),
        industry: extracted.industry || contribution.industry,
        scenario: extracted.scenario || contribution.scenario,
        confidence: Math.min(Math.max(extracted.confidence ?? 0.7, 0), 1),
        principle: extracted.principle?.slice(0, 200) || '',
        solution: extracted.solution?.slice(0, 200) || '',
        contributedBy: contribution.expertId,
        createdAt: new Date().toISOString(),
        status: 'experimental',
      };

      log.info({
        templateId: template.id,
        symptom: template.symptom,
        rootCause: template.rootCause,
        confidence: template.confidence,
      }, '行业知识模板已提取');

      return template;
    } catch (err: any) {
      // JSON parse failure or LLM error — retry with lower temperature
      log.warn({ err: err.message }, '知识提取失败');

      // Second attempt with simpler prompt
      try {
        const retry = await this.provider.chat([
          { role: 'system', content: 'Extract symptom, root_cause, edge_type, principle, solution as JSON from the expert description. Output ONLY valid JSON.' },
          { role: 'user', content: contribution.description },
        ], { temperature: 0.1, maxTokens: 400 });

        const data = JSON.parse(retry.content);
        if (data.symptom && data.root_cause) {
          return {
            id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            symptom: String(data.symptom).slice(0, 40),
            rootCause: String(data.root_cause).slice(0, 40),
            edgeType: String(data.edge_type || data.edgeType || 'TRIGGERS').slice(0, 20),
            industry: contribution.industry,
            scenario: contribution.scenario,
            confidence: Math.min(Math.max(contribution.confidence ?? 0.5, 0), 1),
            principle: String(data.principle || '').slice(0, 200),
            solution: String(data.solution || '').slice(0, 200),
            contributedBy: contribution.expertId,
            createdAt: new Date().toISOString(),
            status: 'experimental',
          };
        }
      } catch {
        log.error({ err }, '知识提取重试也失败');
      }

      return null;
    }
  }

  /**
   * Cross-validate a template by asking another LLM instance to review it.
   * Returns agreement and suggested corrections.
   */
  async crossValidate(
    template: ExpertTemplate,
    originalDescription: string,
  ): Promise<{ agrees: boolean; comment: string; suggestedCorrection?: string }> {
    const prompt = [
      `原始专家描述: ${originalDescription}`,
      `提取的模板:`,
      `  症状: ${template.symptom}`,
      `  根因: ${template.rootCause}`,
      `  边: ${template.edgeType}`,
      `  原理: ${template.principle}`,
      `  方案: ${template.solution}`,
      '',
      '这个提取是否准确反映了专家的描述? 用 JSON 回答: {"agrees": true/false, "comment": "...", "correction": "可选修正"}',
    ].join('\n');

    try {
      const result = await this.provider.chat([
        { role: 'system', content: '你是组织诊断知识的审核专家。审核以下知识提取是否准确。只输出 JSON。' },
        { role: 'user', content: prompt },
      ], { temperature: 0.2, maxTokens: 300 });

      const review = JSON.parse(result.content);
      return {
        agrees: !!review.agrees,
        comment: review.comment || '',
        suggestedCorrection: review.correction,
      };
    } catch {
      return { agrees: true, comment: '自动审核失败，默认通过' };
    }
  }
}
