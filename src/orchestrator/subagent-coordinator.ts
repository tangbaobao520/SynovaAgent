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

  constructor(llmClient: LLMClient, policies: DataAccessPolicy[] = DEFAULT_POLICIES) {
    this.llmClient = llmClient;
    this.policies = policies;
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
