/**
 * orchestrator/subagent-coordinator.ts — L2 子Agent编排器
 *
 * 铁律 39: L2 只做流程编排 (并发调度 + 事件发射 + 结果聚合)。
 * L3 的专家执行逻辑已提取到 src/l3/expert-dispatcher.ts。
 */
import type { LLMClient } from './diagnosis-orchestrator';
import type { Evidence } from '../evidence/types';
import { createLogger } from '../logger';
import { ExpertDispatcher } from '../l3/expert-dispatcher';
import type { QueryAPI } from '../l3/expert-autonomy';

const log = createLogger('orchestrator/subagent-coordinator');

// ═══ Types (L2 接口定义) ═══

export type ExpertType = 'strategy' | 'org' | 'finance' | 'tech' | 'marketing' | 'action';

export interface AnonymizationRule { field: string; replace: string; }

export interface DataAccessPolicy {
  expertType: ExpertType;
  allowedDimensions: string[];
  prohibitedFields: string[];
  anonymizationRules: AnonymizationRule[];
  rowLevelFilter?: string;
  allowedQueryFunctions?: string[];
}

export interface SubAgentReport {
  expertType: ExpertType;
  hypothesis: string;
  confidence: number;
  evidenceUsed: number;
  durationMs: number;
  autonomyRounds?: number;
  qualityWarnings?: string[];
}

// ═══ Default Policies ═══

const DEFAULT_POLICIES: DataAccessPolicy[] = [
  { expertType: 'strategy', allowedDimensions: ['goal_alignment', 'strategic_clarity', 'resource_allocation', 'risk', 'mission_objectives'], prohibitedFields: ['salary', 'personal_email', 'phone', 'id_number'], anonymizationRules: [{ field: 'person_name', replace: 'role_label' }] },
  { expertType: 'finance', allowedDimensions: ['cost', 'revenue', 'roi', 'budget', 'financial_risk', 'resource_constraints'], prohibitedFields: ['person_name', 'personal_email', 'phone'], anonymizationRules: [], rowLevelFilter: "type != 'personal_salary'" },
  { expertType: 'org', allowedDimensions: ['team_structure', 'collaboration', 'communication', 'information_flow', 'current_state'], prohibitedFields: ['salary'], anonymizationRules: [{ field: 'person_name', replace: 'role_label' }] },
  { expertType: 'tech', allowedDimensions: ['tool_chain', 'technical_debt', 'automation', 'architecture', 'rd_efficiency'], prohibitedFields: [], anonymizationRules: [] },
  { expertType: 'marketing', allowedDimensions: ['positioning', 'differentiation', 'market_analysis', 'competitive_landscape', 'customer_insight'], prohibitedFields: ['salary', 'cost_data'], anonymizationRules: [] },
  { expertType: 'action', allowedDimensions: ['priority', 'feasibility', 'urgency', 'impact', 'resource_requirement'], prohibitedFields: [], anonymizationRules: [] },
];

// ═══ SubAgentCoordinator (L2 编排) ═══

export class SubAgentCoordinator {
  private llmClient: LLMClient;
  private policies: DataAccessPolicy[];
  private dispatcher: ExpertDispatcher;

  constructor(llmClient: LLMClient, policies: DataAccessPolicy[] = DEFAULT_POLICIES) {
    this.llmClient = llmClient;
    this.policies = policies;
    this.dispatcher = new ExpertDispatcher({ llmClient, policies });
  }

  /** Enable expert autonomy with graph query (delegates to L3 ExpertDispatcher) */
  enableExpertAutonomy(queryApi: QueryAPI, graphStore: { queryNodes: (type: string, filters?: Record<string,unknown>, graph?: string) => Array<{id:string}> }): this {
    this.dispatcher.enableAutonomyWithGraph(queryApi, graphStore);
    log.info('专家自主权引擎已启用');
    return this;
  }

  /** Delegate: filter evidence by policy (public for test access) */
  filterEvidence(evidence: Evidence[], policy: DataAccessPolicy): Evidence[] {
    return this.dispatcher.filterEvidence(evidence, policy);
  }

  /** L2 编排: 并发调度所有专家, 聚合结果 */
  async dispatch(evidence: Evidence[], maxConcurrency = 6): Promise<SubAgentReport[]> {
    if (evidence.length === 0) return [];

    const expertTypes: ExpertType[] = ['strategy', 'org', 'finance', 'tech', 'marketing', 'action'];
    const tasks = expertTypes.map(type => this.dispatcher.runExpert(type, evidence));

    const results: SubAgentReport[] = [];
    for (let i = 0; i < tasks.length; i += maxConcurrency) {
      const batch = tasks.slice(i, i + maxConcurrency);
      const batchResults = await Promise.allSettled(batch);
      for (const r of batchResults) {
        if (r.status === 'fulfilled' && r.value) results.push(r.value);
      }
    }

    log.info({ expertCount: results.length }, '子Agent协调完成');
    return results;
  }
}
