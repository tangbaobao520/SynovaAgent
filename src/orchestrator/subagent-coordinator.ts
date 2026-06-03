/**
 * orchestrator/subagent-coordinator.ts — 子Agent协调器 + 数据沙箱 (Iter 5)
 *
 * Phase 2: 并行调度 6 专家子Agent。
 * 每个专家携带 DataAccessPolicy (行级安全):
 *   - 营销专家不能看薪资数据
 *   - 战略专家不能看具体个人隐私
 *   - 数据匿名化: 个人身份 → 角色标签
 */
import type { LLMClient } from './diagnosis-orchestrator';
import type { Evidence } from '../evidence/types';
import { createLogger } from '../logger';
import { ExpertAutonomyEngine } from '../l3/expert-autonomy';
import { QualityFirewall } from '../l3/quality-firewall';
import type { QueryAPI } from '../l3/expert-autonomy';

const log = createLogger('orchestrator/subagent-coordinator');

// ═══ Types ═══

export type ExpertType = 'strategy' | 'org' | 'finance' | 'tech' | 'marketing' | 'action';

export interface AnonymizationRule {
  field: string;
  replace: string;
}

export interface DataAccessPolicy {
  expertType: ExpertType;
  allowedDimensions: string[];
  prohibitedFields: string[];
  anonymizationRules: AnonymizationRule[];
  /** 行级过滤 (SQL WHERE) */
  rowLevelFilter?: string;
  /** Gear 1: 限制可调用的图查询函数 (空=全部允许) */
  allowedQueryFunctions?: string[];
}

export interface SubAgentReport {
  expertType: ExpertType;
  hypothesis: string;
  confidence: number;
  evidenceUsed: number;
  durationMs: number;
  /** Gear 1: ReAct rounds used (only when autonomy enabled) */
  autonomyRounds?: number;
  /** Gear 4: Quality firewall warnings */
  qualityWarnings?: string[];
}

// ═══ Default Policies ═══

const DEFAULT_POLICIES: DataAccessPolicy[] = [
  {
    expertType: 'strategy',
    allowedDimensions: ['goal_alignment', 'strategic_clarity', 'resource_allocation', 'risk', 'mission_objectives'],
    prohibitedFields: ['salary', 'personal_email', 'phone', 'id_number'],
    anonymizationRules: [{ field: 'person_name', replace: 'role_label' }],
  },
  {
    expertType: 'finance',
    allowedDimensions: ['cost', 'revenue', 'roi', 'budget', 'financial_risk', 'resource_constraints'],
    prohibitedFields: ['person_name', 'personal_email', 'phone'],
    anonymizationRules: [],
    rowLevelFilter: "type != 'personal_salary'",
  },
  {
    expertType: 'org',
    allowedDimensions: ['team_structure', 'collaboration', 'communication', 'information_flow', 'current_state'],
    prohibitedFields: ['salary'],
    anonymizationRules: [{ field: 'person_name', replace: 'role_label' }],
  },
  {
    expertType: 'tech',
    allowedDimensions: ['tool_chain', 'technical_debt', 'automation', 'architecture', 'rd_efficiency'],
    prohibitedFields: [],
    anonymizationRules: [],
  },
  {
    expertType: 'marketing',
    allowedDimensions: ['positioning', 'differentiation', 'category_clarity', 'business_value'],
    prohibitedFields: ['salary', 'cost_data', 'financial_projection'],
    anonymizationRules: [],
  },
  {
    expertType: 'action',
    allowedDimensions: ['priority', 'feasibility', 'risk', 'impact', 'success_criteria'],
    prohibitedFields: [],
    anonymizationRules: [],
  },
];

// ═══ SubAgentCoordinator ═══

export class SubAgentCoordinator {
  private llmClient: LLMClient;
  private policies: DataAccessPolicy[];
  private queryApi: QueryAPI | null = null;
  private graphStoreForFirewall: { queryNodes: (type: string, filters?: Record<string,unknown>, graph?: string) => Array<{id:string}> } | null = null;
  private enableAutonomy = false;
  /** P3-08: 可选工厂函数 — 允许测试和自定义配置注入 ExpertAutonomyEngine */
  private autonomyEngineFactory: ((llm: LLMClient, api: QueryAPI, policy: DataAccessPolicy, cfg?: { maxRounds?: number }) => ExpertAutonomyEngine) | null = null;

  constructor(llmClient: LLMClient, policies: DataAccessPolicy[] = DEFAULT_POLICIES) {
    this.llmClient = llmClient;
    this.policies = policies;
  }

  /** Gear 1: Enable expert autonomy with graph query API + quality firewall */
  enableExpertAutonomy(queryApi: QueryAPI, graphStore: { queryNodes: (type: string, filters?: Record<string,unknown>, graph?: string) => Array<{id:string}> }, opts?: { engineFactory?: (llm: LLMClient, api: QueryAPI, policy: DataAccessPolicy, cfg?: { maxRounds?: number }) => ExpertAutonomyEngine }): this {
    this.queryApi = queryApi;
    this.graphStoreForFirewall = graphStore;
    this.enableAutonomy = true;
    if (opts?.engineFactory) this.autonomyEngineFactory = opts.engineFactory;
    log.info('专家自主权引擎已启用');
    return this;
  }

  /**
   * Filter evidence by data access policy (行级安全).
   * Returns only evidence the expert is allowed to see.
   */
  filterEvidence(evidence: Evidence[], policy: DataAccessPolicy): Evidence[] {
    let filtered = evidence.filter(e => {
      // Dimension check: only allowed dimensions
      if (!policy.allowedDimensions.includes(e.type)) return false;
      // Field check: no prohibited fields in content
      for (const field of policy.prohibitedFields) {
        if (e.content.toLowerCase().includes(field.toLowerCase())) return false;
      }
      return true;
    });

    // Apply anonymization rules
    if (policy.anonymizationRules.length > 0) {
      filtered = filtered.map(e => {
        let content = e.content;
        for (const rule of policy.anonymizationRules) {
          // Simple pattern: replace Chinese names with role label
          content = content.replace(/[一-龥]{2,4}(?:是|的|说|负责)/g, `[${rule.replace}]$1`);
          content = content.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, `[${rule.replace}]`);
        }
        return { ...e, content };
      });
    }

    return filtered;
  }

  /**
   * Dispatch evidence to all sub-agents in parallel.
   * Each sub-agent gets filtered evidence per its DataAccessPolicy.
   * Returns aggregated reports.
   */
  async dispatch(evidence: Evidence[], maxConcurrency = 6): Promise<SubAgentReport[]> {
    if (evidence.length === 0) return [];

    const expertTypes: ExpertType[] = ['strategy', 'org', 'finance', 'tech', 'marketing', 'action'];
    const tasks = expertTypes.map(type => this.runSubAgent(type, evidence));

    // Run with concurrency limit
    const results: SubAgentReport[] = [];
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const batch = tasks.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(batch);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value) {
          results.push(result.value);
        }
      }
    }

    log.info({ expertCount: results.length }, '子Agent协调完成');
    return results;
  }

  /** Run a single sub-agent with data sandbox */
  private async runSubAgent(type: ExpertType, evidence: Evidence[]): Promise<SubAgentReport | null> {
    const policy = this.policies.find(p => p.expertType === type);
    if (!policy) return null;

    const startTime = Date.now();
    const filtered = this.filterEvidence(evidence, policy);

    try {
      // Build expert prompt with evidence summary
      const evidenceSummary = filtered.slice(0, 10).map(e =>
        `[${e.type}] ${e.content.slice(0, 100)} (置信度: ${e.confidence})`,
      ).join('\n');

      // Gear 1: Expert Autonomy — ReAct loop with graph queries
      if (this.enableAutonomy && this.queryApi) {
        // P3-08: 优先使用注入的工厂函数, 否则默认构造
        const engine = this.autonomyEngineFactory
          ? this.autonomyEngineFactory(this.llmClient, this.queryApi, policy, { maxRounds: 5 })
          : new ExpertAutonomyEngine(this.llmClient, this.queryApi, policy, { maxRounds: 5 });
        const autonomyResult = await engine.run({
          evidence: filtered.map(e => `[${e.type}] ${e.content.slice(0, 100)}`),
          expertType: type,
        });

        // Quality firewall
        let hypothesis = autonomyResult.hypothesis;
        let confidence = autonomyResult.confidence;
        let qWarnings: string[] = [];
        if (this.graphStoreForFirewall) {
          const firewall = new QualityFirewall(this.graphStoreForFirewall, 'default');
          const qr = await firewall.validate({
            hypothesis: autonomyResult.hypothesis,
            evidenceRefs: filtered.slice(0, 5).map(e => e.id),
            confidence: autonomyResult.confidence,
            expertType: type,
          });
          if (!qr.passed) hypothesis = `[低质量-已过滤] ${hypothesis}`;
          confidence = qr.adjustedConfidence;
          qWarnings = qr.warnings;
        }

        return {
          expertType: type,
          hypothesis,
          confidence,
          evidenceUsed: filtered.length,
          durationMs: Date.now() - startTime,
          autonomyRounds: autonomyResult.roundsUsed,
          qualityWarnings: qWarnings,
        };
      }

      // Fallback: simple LLM consult (no autonomy)
      const systemPrompt = `你是 Synova 的${this.getExpertLabel(type)}。分析以下证据，生成诊断假设。只输出 JSON: {"hypothesis": "...", "confidence": 0.0-1.0}`;

      const response = await this.llmClient.consult(
        systemPrompt,
        `证据:\n${evidenceSummary || '(无相关证据)'}`,
        { temperature: 0.3, maxTokens: 500 },
      );

      const parsed = JSON.parse(response.content);
      return {
        expertType: type,
        hypothesis: parsed.hypothesis || '未能生成假设',
        confidence: parsed.confidence || 0.5,
        evidenceUsed: filtered.length,
        durationMs: Date.now() - startTime,
      };
    } catch (err: any) {
      log.warn({ expertType: type, err: err.message }, '子Agent执行失败');
      return {
        expertType: type,
        hypothesis: `子Agent执行失败: ${err.message}`,
        confidence: 0,
        evidenceUsed: 0,
        durationMs: Date.now() - startTime,
      };
    }
  }

  private getExpertLabel(type: ExpertType): string {
    const labels: Record<ExpertType, string> = {
      strategy: '战略专家',
      org: '组织专家',
      finance: '财务专家',
      tech: '技术专家',
      marketing: '营销专家',
      action: '行动专家',
    };
    return labels[type];
  }
}
