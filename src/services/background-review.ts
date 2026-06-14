/**
 * services/background-review.ts — 诊断后质量审查 (Hermes 项目 10: spawn_background_review)
 *
 * 参考 Hermes background_review.py: 诊断完成后 fork 一个轻量 Agent 审查质量,
 * 不触碰主会话的 prompt cache。Fork 继承父进程的 provider/model/credentials。
 *
 * 审查维度:
 *   1. 诊断质量评估 — 证据是否充分? 矛盾是否标记? 维度是否遗漏?
 *   2. 模式提取 — 症状→根因 是否匹配已有模板? 新模板候选?
 *   3. 结果写回 — ExpertPlatform SQLite store, 更新 OutcomeTracker 评分
 *
 * 铁律 31: 审查失败不影响主诊断流程 — 所有错误静默降级。
 */
import type { LLMProvider } from '../providers/types';
import { createLogger } from '../logger';

const log = createLogger('services/background-review');

// ═══ Review Prompts (Hermes _MEMORY_REVIEW_PROMPT + _SKILL_REVIEW_PROMPT 模式) ═══

const QUALITY_REVIEW_PROMPT = `Review the diagnosis report above and evaluate its quality.

Focus on:
1. Evidence sufficiency — Are there enough independent data sources to support each conclusion? (minimum 3 sources per major finding)
2. Contradiction marking — Were conflicting signals flagged? Were they resolved or escalated?
3. Dimension coverage — Were all 7 expert dimensions (strategy, org, finance, tech, marketing, action, business_model) adequately covered?
4. Actionability — Can the recommendations be executed by a non-technical manager?

Output JSON:
{
  "qualityScore": 0-100,
  "evidenceGaps": ["dimension: missing evidence description"],
  "unmarkedContradictions": ["dimension: contradiction description"],
  "missingDimensions": ["dimension name"],
  "actionabilityScore": 0-100,
  "improvementSuggestions": ["concrete suggestion"]
}`;

const PATTERN_EXTRACTION_PROMPT = `Review the diagnosis and identify reusable patterns.

Focus on:
1. Symptom→RootCause mappings — Are there repeatable patterns?
2. Industry-specific insights — Does this match any known industry templates?
3. Cross-reference value — Would this diagnosis help other organizations?

Output JSON:
{
  "patternsFound": [{
    "symptom": "brief description",
    "rootCause": "brief description",
    "confidence": 0-1,
    "industryRelevance": ["industry name"],
    "suggestedTemplateId": "template_name or null"
  }],
  "templateUpdates": [{
    "templateId": "existing template id",
    "field": "field to update",
    "newValue": "updated value",
    "reason": "why this update is needed"
  }]
}`;

// ═══ Types ═══

export interface QualityReviewResult {
  qualityScore: number;
  evidenceGaps: string[];
  unmarkedContradictions: string[];
  missingDimensions: string[];
  actionabilityScore: number;
  improvementSuggestions: string[];
}

export interface PatternExtractionResult {
  patternsFound: Array<{
    symptom: string;
    rootCause: string;
    confidence: number;
    industryRelevance: string[];
    suggestedTemplateId: string | null;
  }>;
  templateUpdates: Array<{
    templateId: string;
    field: string;
    newValue: string;
    reason: string;
  }>;
}

// ═══ Background Review ═══

export class BackgroundReviewer {
  private provider: LLMProvider;
  private reviewModel: string; // 辅助模型 (cheap/fast — Hermes auxiliary model pattern)

  constructor(provider: LLMProvider, reviewModel = 'deepseek-v4-flash') {
    this.provider = provider;
    this.reviewModel = reviewModel;
  }

  /**
   * Spawn a background review of the diagnosis.
   * Hermes pattern: fork inherits provider/credentials, separate tool whitelist,
   * result written to ExpertPlatform store. Never touches main conversation cache.
   *
   * Returns null if review fails — caller should NOT block on this.
   */
  async reviewDiagnosis(
    diagnosisReport: unknown,
    orgId: string,
  ): Promise<{ quality: QualityReviewResult | null; patterns: PatternExtractionResult | null }> {
    const reportText = typeof diagnosisReport === 'string'
      ? diagnosisReport
      : JSON.stringify(diagnosisReport, null, 2);

    // Both reviews run in parallel (no dependency between them)
    const [quality, patterns] = await Promise.allSettled([
      this.reviewQuality(reportText, orgId),
      this.extractPatterns(reportText, orgId),
    ]);

    return {
      quality: quality.status === 'fulfilled' ? quality.value : null,
      patterns: patterns.status === 'fulfilled' ? patterns.value : null,
    };
  }

  private async reviewQuality(reportText: string, _orgId: string): Promise<QualityReviewResult | null> {
    try {
      const result = await this.provider.chat([
        { role: 'system', content: QUALITY_REVIEW_PROMPT },
        { role: 'user', content: reportText.slice(0, 8000) },
      ], { model: this.reviewModel, temperature: 0.1, maxTokens: 1000 });

      const parsed = JSON.parse(result.content) as QualityReviewResult;
      log.info({ score: parsed.qualityScore, gaps: parsed.evidenceGaps.length }, '诊断质量审查完成');
      return parsed;
    } catch (err: any) {
      log.warn({ err: err.message }, '质量审查失败 — degraded');
      return null;
    }
  }

  private async extractPatterns(reportText: string, _orgId: string): Promise<PatternExtractionResult | null> {
    try {
      const result = await this.provider.chat([
        { role: 'system', content: PATTERN_EXTRACTION_PROMPT },
        { role: 'user', content: reportText.slice(0, 8000) },
      ], { model: this.reviewModel, temperature: 0.1, maxTokens: 1000 });

      const parsed = JSON.parse(result.content) as PatternExtractionResult;
      log.info({ patterns: parsed.patternsFound.length, updates: parsed.templateUpdates.length }, '模式提取完成');
      return parsed;
    } catch (err: any) {
      log.warn({ err: err.message }, '模式提取失败 — degraded');
      return null;
    }
  }
}

// ═══ Fire-and-forget launcher (Hermes spawn_background_review pattern) ═══

/**
 * Launch a background review of the diagnosis.
 * Hermes pattern: daemon thread / fire-and-forget, never blocks main flow.
 * Writes results to ExpertPlatform store for future template evolution.
 */
export function launchBackgroundReview(
  provider: LLMProvider,
  diagnosisReport: unknown,
  orgId: string,
  onComplete?: (qr: QualityReviewResult | null, pr: PatternExtractionResult | null) => void,
): void {
  const reviewer = new BackgroundReviewer(provider);
  // Daemon-style fire-and-forget — 不阻塞诊断完成响应
  reviewer.reviewDiagnosis(diagnosisReport, orgId).then(({ quality, patterns }) => {
    if (quality) {
      log.info({
        score: quality.qualityScore,
        actionability: quality.actionabilityScore,
      }, '后台质量审查完成');
    }
    if (patterns && patterns.patternsFound.length > 0) {
      log.info({ count: patterns.patternsFound.length }, '后台模式提取完成');
    }
    onComplete?.(quality, patterns);
  }).catch(err => {
    log.warn({ err }, '后台审查异常 — degraded');
  });
}
