/**
 * l3/expert-dispatcher.ts — L3 专家调度器
 *
 * 铁律 39: 从 SubAgentCoordinator (L2) 中提取的 L3 逻辑。
 * 职责: 专家子 Agent 执行 — 证据过滤 + Prompt 构建 + ExpertAutonomyEngine + QualityFirewall
 *
 * L2 的 SubAgentCoordinator 只做编排 (并发/事件/聚合),
 * L3 的 ExpertDispatcher 做实质分析 (专家调度/策略/防火墙)。
 */
import type { LLMClient } from '../orchestrator/diagnosis-orchestrator';
import type { Evidence } from '../evidence/types';
import type { DataAccessPolicy, SubAgentReport, ExpertType } from '../orchestrator/subagent-coordinator';
import { ExpertAutonomyEngine } from './expert-autonomy';
import type { QueryAPI } from './expert-autonomy';
import { QualityFirewall } from './quality-firewall';
import { createLogger } from '../logger';

const log = createLogger('l3/expert-dispatcher');

export interface ExpertDispatcherConfig {
  llmClient: LLMClient;
  policies: DataAccessPolicy[];
  /** Optional: ExpertAutonomyEngine factory (DI) */
  engineFactory?: (llm: LLMClient, api: QueryAPI, policy: DataAccessPolicy, cfg?: { maxRounds?: number }) => ExpertAutonomyEngine;
}

export class ExpertDispatcher {
  private llmClient: LLMClient;
  private policies: DataAccessPolicy[];
  private queryApi: QueryAPI | null = null;
  private graphStoreForFirewall: { queryNodes: (type: string, filters?: Record<string,unknown>, graph?: string) => Array<{id:string}> } | null = null;
  private enableAutonomy = false;
  private engineFactory: ((llm: LLMClient, api: QueryAPI, policy: DataAccessPolicy, cfg?: { maxRounds?: number }) => ExpertAutonomyEngine) | null = null;

  constructor(config: ExpertDispatcherConfig) {
    this.llmClient = config.llmClient;
    this.policies = config.policies;
    this.engineFactory = config.engineFactory || null;
  }

  /** Enable expert autonomy with graph query + quality firewall */
  enableAutonomyWithGraph(
    queryApi: QueryAPI,
    graphStore: { queryNodes: (type: string, filters?: Record<string,unknown>, graph?: string) => Array<{id:string}> },
  ): this {
    this.queryApi = queryApi;
    this.graphStoreForFirewall = graphStore;
    this.enableAutonomy = true;
    return this;
  }

  /** Filter evidence by expert's DataAccessPolicy (row-level security) */
  filterEvidence(evidence: Evidence[], policy: DataAccessPolicy): Evidence[] {
    return evidence.filter(e => {
      if (!policy.allowedDimensions.includes(e.type)) return false;
      if (policy.rowLevelFilter) {
        if (policy.rowLevelFilter.includes('personal_salary') && e.type === 'salary') return false;
      }
      return true;
    }).map(e => {
      let content = e.content;
      for (const rule of policy.anonymizationRules) {
        if (rule.field === 'person_name') {
          content = content.replace(/[一-鿿]{2,4}(?:是|的|说|负责)/g, `[${rule.replace}]$1`);
          content = content.replace(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g, `[${rule.replace}]`);
        }
      }
      return { ...e, content };
    });
  }

  /** Run a single expert sub-agent with full L3 pipeline */
  async runExpert(type: ExpertType, evidence: Evidence[]): Promise<SubAgentReport | null> {
    const policy = this.policies.find(p => p.expertType === type);
    if (!policy) return null;

    const startTime = Date.now();
    const filtered = this.filterEvidence(evidence, policy);

    try {
      const evidenceSummary = filtered.slice(0, 10).map(e =>
        `[${e.type}] ${e.content.slice(0, 100)} (置信度: ${e.confidence})`,
      ).join('\n');

      // Gear 1: ExpertAutonomyEngine — ReAct loop with graph queries
      if (this.enableAutonomy && this.queryApi) {
        const engine = this.engineFactory
          ? this.engineFactory(this.llmClient, this.queryApi, policy, { maxRounds: 5 })
          : new ExpertAutonomyEngine(this.llmClient, this.queryApi, policy, { maxRounds: 5 });

        const autonomyResult = await engine.run({
          evidence: filtered.map(e => `[${e.type}] ${e.content.slice(0, 100)}`),
          expertType: type,
        });

        // Gear 4: QualityFirewall
        let hypothesis = autonomyResult.hypothesis;
        let confidence = autonomyResult.confidence;
        let qWarnings: string[] = [];
        if (this.graphStoreForFirewall) {
          const firewall = new QualityFirewall(this.graphStoreForFirewall, 'default');
          const qr = await firewall.validate({
            hypothesis, evidenceRefs: filtered.slice(0, 5).map(e => e.id),
            confidence, expertType: type,
          });
          if (!qr.passed) hypothesis = `[低质量-已过滤] ${hypothesis}`;
          confidence = qr.adjustedConfidence;
          qWarnings = qr.warnings;
        }

        return { expertType: type, hypothesis, confidence, evidenceUsed: filtered.length, durationMs: Date.now() - startTime, autonomyRounds: autonomyResult.roundsUsed, qualityWarnings: qWarnings };
      }

      // Fallback: simple LLM consult
      const prompt = EXPERT_PROMPTS[type] || '你是组织诊断专家。';
      const result = await this.llmClient.consult(prompt, evidenceSummary || '无证据', { temperature: 0.3, maxTokens: 500 });

      return { expertType: type, hypothesis: result.content.slice(0, 200), confidence: 0.6, evidenceUsed: filtered.length, durationMs: Date.now() - startTime };
    } catch (err: any) {
      log.warn({ err, expertType: type }, '专家执行失败');
      return null;
    }
  }
}

/** Expert system prompts (L3 domain logic) */
const EXPERT_PROMPTS: Record<string, string> = {
  strategy: '你是企业战略专家。分析组织的战略清晰度、目标对齐度和资源配置有效性。',
  org: '你是组织架构专家。分析团队结构、协作模式和信息流动效率。',
  finance: '你是财务分析专家。分析成本结构、资源利用率和投资回报。',
  tech: '你是技术架构专家。分析工具链效率、技术债务和自动化水平。',
  marketing: '你是市场营销专家。分析市场定位、竞争差异化和增长策略。',
  action: '你是执行力专家。分析行动项的优先级、可行性和预期效果。',
};
