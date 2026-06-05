/**
 * l3/expert-dispatcher.ts — L3 专家调度器 (Sprint 3: 合并 engine-core 结构化解析+重试+超时)
 *
 * 铁律 39: 从 SubAgentCoordinator (L2) 中提取的 L3 逻辑。
 * 职责: 专家子 Agent 执行 — 证据过滤 + Prompt 构建 + ExpertAutonomyEngine + QualityFirewall
 *
 * Sprint 3 (审计 P1-03): 吸收 engine-core ExpertSubAgentExecutor 的能力:
 *   - EXPERT_REPORT_SCHEMA — 结构化 JSON 输出验证
 *   - parseStructuredOutput — 健壮 JSON 解析 (含 markdown 兜底)
 *   - extractOntologyPatches — 从 LLM 输出提取本体图补丁
 *   - runWithRetry — 指数退避重试 (网络错误)
 *   - 超时隔离 — 每个 Expert 独立超时
 *
 * engine-core 的 ExpertSubAgentExecutor 已标记 @deprecated。
 */
import type { LLMClient } from '../orchestrator/diagnosis-orchestrator';
import type { Evidence } from '../evidence/types';
import type { DataAccessPolicy, SubAgentReport, ExpertType } from '../orchestrator/subagent-coordinator';
import { ExpertAutonomyEngine } from './expert-autonomy';
import type { QueryAPI } from './expert-autonomy';
import { QualityFirewall } from './quality-firewall';
import { validateExpertOutput } from './expert-output-schema';
import { getExpertRegistry } from './expert-registry';
import { createLogger } from '../logger';

const log = createLogger('l3/expert-dispatcher');

// ═══ Rich Expert Report (Sprint 3: 吸收 engine-core 结构化输出) ═══

export interface ExpertReport extends SubAgentReport {
  /** Structured findings from LLM output */
  findings?: Array<{
    id: string;
    dimension: string;
    statement: string;
    confidence: number;
    evidenceRefs: string[];
    severity: 'critical' | 'high' | 'medium' | 'low';
    suggestedActions: string[];
  }>;
  /** Overall assessment narrative */
  overallAssessment?: string;
  /** Uncertainties the expert flagged */
  uncertainties?: Array<{
    description: string;
    reason: '数据不足' | '超出领域' | '需要人工判断';
    suggestedNextStep: string;
  }>;
  /** Conflicting signals from other experts' perspectives */
  conflictingSignals?: Array<{
    dimension: string;
    myFinding: string;
    myConfidence: number;
    potentialOpposingExpert: string;
    reason: string;
  }>;
  /** Cross-references suggesting other experts should review */
  crossReferences?: Array<{
    dimension: string;
    expertType: string;
    reason: string;
    priority: 'advisory' | 'important' | 'critical';
  }>;
  /** Ontology patches extracted from LLM output */
  ontologyPatches?: Array<Record<string, unknown>>;
  /** LLM model used */
  model?: string;
}

// ═══ Output Schema (from engine-core ExpertSubAgentExecutor) ═══

export const EXPERT_REPORT_SCHEMA = JSON.stringify({
  findings: [{
    id: 'f1', dimension: '...', statement: '≤200字',
    confidence: 0.8, evidenceRefs: ['ev-xxx'],
    severity: 'critical|high|medium|low', suggestedActions: ['...'],
  }],
  overallAssessment: '≤300字',
  uncertainties: [{
    description: '...', reason: '数据不足|超出领域|需要人工判断',
    suggestedNextStep: '...',
  }],
  conflictingSignals: [{
    dimension: '...', myFinding: '...', myConfidence: 0.5,
    potentialOpposingExpert: 'org_diagnostician', reason: '...',
  }],
  crossReferences: [{
    dimension: '...', expertType: 'financial_analyst',
    reason: '...', priority: 'advisory|important|critical',
  }],
  ontologyPatches: [],
});

// ═══ Config ═══

// ═══ EC-08: OntologyPatch 输入类型 ═══

export interface OntologyPatch {
  action: 'create' | 'update';
  nodeType: string;
  props: Record<string, unknown>;
  evidence: string;
  confidence: number;
}

// ═══ Config ═══

export interface ExpertDispatcherConfig {
  llmClient: LLMClient;
  policies: DataAccessPolicy[];
  /** Per-expert timeout in ms (default 60s) */
  timeoutMs?: number;
  /** Max retries for network errors (default 2) */
  maxRetries?: number;
  /** PII 脱敏: 证据出站到云 LLM 前脱敏 */
  piiScrubber?: import('../security/pii-scrubber').PIIScrubber;
  /** ToolRegistry: 注入到 ExpertAutonomyEngine (替代硬编码 switch) */
  toolRegistry?: import('../agent/tools').ToolRegistry;
  /** Optional: ExpertAutonomyEngine factory (DI) */
  engineFactory?: (llm: LLMClient, api: QueryAPI, policy: DataAccessPolicy, cfg?: { maxRounds?: number }) => ExpertAutonomyEngine;
}

export class ExpertDispatcher {
  private llmClient: LLMClient;
  private policies: DataAccessPolicy[];
  private queryApi: QueryAPI | null = null;
  private graphStoreForFirewall: { queryNodes: (type: string, filters?: Record<string, unknown>, graph?: string) => Array<{ id: string }> } | null = null;
  private enableAutonomy = false;
  private engineFactory: ((llm: LLMClient, api: QueryAPI, policy: DataAccessPolicy, cfg?: { maxRounds?: number }) => ExpertAutonomyEngine) | null = null;
  private timeoutMs: number;
  private maxRetries: number;
  private piiScrubber: import('../security/pii-scrubber').PIIScrubber | null = null;
  private toolRegistry: import('../agent/tools').ToolRegistry | null = null;

  constructor(config: ExpertDispatcherConfig) {
    this.llmClient = config.llmClient;
    this.policies = config.policies;
    this.engineFactory = config.engineFactory || null;
    this.timeoutMs = config.timeoutMs ?? 60_000;
    this.maxRetries = config.maxRetries ?? 2;
    this.piiScrubber = config.piiScrubber || null;
    this.toolRegistry = config.toolRegistry || null;
  }

  /** Enable expert autonomy with graph query + quality firewall */
  enableAutonomyWithGraph(
    queryApi: QueryAPI,
    graphStore: { queryNodes: (type: string, filters?: Record<string, unknown>, graph?: string) => Array<{ id: string }> },
  ): this {
    this.queryApi = queryApi;
    this.graphStoreForFirewall = graphStore;
    this.enableAutonomy = true;
    return this;
  }

  /** EC-08: 将 Evidence 转换为 OntologyPatch[] 结构化输入 */
  private evidenceToPatches(evidence: Evidence[]): OntologyPatch[] {
    return evidence.map(e => ({
      action: 'create' as const,
      nodeType: this.mapDimensionToNodeType(e.type),
      props: {
        name: e.content.slice(0, 100),
        confidence: e.confidence,
        dimension: e.type,
        source: 'expert_evidence',
      },
      evidence: e.content,
      confidence: e.confidence,
    }));
  }

  /** Map evidence dimension to SOG node type */
  private mapDimensionToNodeType(dimension: string): string {
    const map: Record<string, string> = {
      goal_alignment: 'Goal', strategic_clarity: 'Goal', mission_objectives: 'Goal',
      team_structure: 'Team', collaboration: 'Team', org_structure: 'Team',
      cost: 'Financial', revenue: 'Financial', roi: 'Financial', budget: 'Financial',
      risk: 'Risk', financial_risk: 'Risk',
      current_state: 'Person', resource_allocation: 'Resource',
      communication: 'Process', information_flow: 'Process',
    };
    return map[dimension] || 'Observation';
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

  /** Run a single expert sub-agent with full L3 pipeline (returns rich ExpertReport) */
  async runExpert(type: ExpertType, evidence: Evidence[]): Promise<ExpertReport | null> {
    const policy = this.policies.find(p => p.expertType === type);
    if (!policy) return null;

    const startTime = Date.now();
    const filtered = this.filterEvidence(evidence, policy);
    // PII 脱敏: 证据出站到云 LLM 前脱敏 (S4移除 + S3脱敏 + S2角色掩盖)
    if (this.piiScrubber) {
      for (const e of filtered) {
        e.content = this.piiScrubber.scrub(e.content, 'S2').cleaned;
      }
    }

    try {
      // Gear 1: ExpertAutonomyEngine — ReAct loop with graph queries
      if (this.enableAutonomy && this.queryApi) {
        return await this.runWithRetry(async () => {
          const engine = this.engineFactory
            ? this.engineFactory(this.llmClient, this.queryApi!, policy, { maxRounds: 5 })
            : new ExpertAutonomyEngine(this.llmClient, this.queryApi!, policy, { maxRounds: 5 });
          // 注入 ToolRegistry — 替代硬编码 switch, 专家可调用所有注册工具
          if (this.toolRegistry) engine.withToolRegistry(this.toolRegistry);

          // EC-08: 传入 patches 供引擎做图查询 (additive — 保留文本 evidence)
          const patches = this.evidenceToPatches(filtered);
          const autonomyResult = await Promise.race([
            engine.run({
              patches,
              evidence: filtered.map(e => `[${e.type}] ${e.content.slice(0, 100)}`),
              expertType: type,
            }),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error(`expert_timeout: ${type} exceeded ${this.timeoutMs}ms`)), this.timeoutMs)),
          ]);

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

          return {
            expertType: type, hypothesis, confidence,
            evidenceUsed: filtered.length, durationMs: Date.now() - startTime,
            autonomyRounds: autonomyResult.roundsUsed, qualityWarnings: qWarnings,
          };
        }, type);
      }

      // Fallback: structured LLM consult with output schema
      return await this.runWithRetry(async () => {
        const prompt = getExpertRegistry().getPrompt(type) || '你是组织诊断专家。';
        const evidenceSummary = filtered.slice(0, 10).map(e =>
          `[${e.type}] ${e.content.slice(0, 100)} (置信度: ${e.confidence})`,
        ).join('\n');

        const systemPrompt = `${prompt}\n\n## 输出格式 (必须严格遵守)\n只输出纯 JSON, 不要 Markdown 代码块包裹。\n${EXPERT_REPORT_SCHEMA}`;
        const userMessage = `## 可用证据\n${evidenceSummary || '无证据'}\n\n## 本体图更新 (可选)\n如果你发现了证据中未出现的新实体或关系，请在 ontologyPatches 字段中输出。格式: "ontologyPatches": [{ "createNodes": [...], "createEdges": [...] }]`;

        const response = await Promise.race([
          this.llmClient.consult(systemPrompt, userMessage, { temperature: 0.3, maxTokens: 800 }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`expert_timeout: ${type} exceeded ${this.timeoutMs}ms`)), this.timeoutMs)),
        ]);

        const parsed = this.parseStructuredOutput(response.content, type);
        const ontologyPatches = this.extractOntologyPatches(response.content);

        // EC-07: zod Schema 校验 — LLM 输出不符合 Schema 时标记 degraded
        const validation = validateExpertOutput(parsed as Record<string, unknown>);
        if (!validation.valid) {
          log.warn({ expertType: type, errors: validation.errors }, 'Expert output schema 校验失败 — degraded');
        }

        return {
          expertType: type,
          hypothesis: validation.output.overallAssessment?.slice(0, 200) || response.content.slice(0, 200),
          confidence: validation.output.findings?.length
            ? validation.output.findings.reduce((sum: number, f: { confidence: number }) => sum + f.confidence, 0) / validation.output.findings.length
            : 0.6,
          evidenceUsed: filtered.length, durationMs: Date.now() - startTime,
          findings: validation.output.findings?.map(f => ({
            id: f.id, dimension: f.dimension, statement: f.statement,
            confidence: f.confidence, evidenceRefs: f.evidenceRefs,
            severity: f.severity, suggestedActions: f.suggestedActions || [],
          })),
          overallAssessment: validation.output.overallAssessment,
          uncertainties: validation.output.uncertainties?.map(u => ({
            description: u.description, reason: u.reason as '数据不足' | '超出领域' | '需要人工判断',
            suggestedNextStep: u.suggestedNextStep || '',
          })),
          conflictingSignals: validation.output.conflictingSignals?.map(c => ({
            dimension: c.dimension, myFinding: c.myFinding,
            myConfidence: c.myConfidence, potentialOpposingExpert: c.potentialOpposingExpert || '',
            reason: c.reason || '',
          })),
          crossReferences: validation.output.crossReferences?.map(c => ({
            dimension: c.dimension, expertType: c.expertType,
            reason: c.reason || '', priority: c.priority,
          })),
          ontologyPatches,
          model: response.model,
        };
      }, type);
    } catch (err: any) {
      log.warn({ err, expertType: type }, '专家执行失败');
      return null;
    }
  }

  // ═══ Private: Structured Parsing (from engine-core ExpertSubAgentExecutor) ═══

  /** Parse structured JSON output with markdown code-block fallback */
  private parseStructuredOutput(content: string, expertType: string): Partial<ExpertReport> {
    try {
      const json = JSON.parse(content.trim());
      return {
        findings: Array.isArray(json.findings) ? json.findings : [],
        overallAssessment: String(json.overallAssessment || ''),
        uncertainties: Array.isArray(json.uncertainties) ? json.uncertainties : [],
        conflictingSignals: Array.isArray(json.conflictingSignals) ? json.conflictingSignals : [],
        crossReferences: Array.isArray(json.crossReferences) ? json.crossReferences : [],
      };
    } catch (err) {
      log.warn({ err }, '专家调度解析失败 — degraded');
      // Try extracting JSON from markdown code block
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          const json = JSON.parse(match[1].trim());
          return {
            findings: Array.isArray(json.findings) ? json.findings : [],
            overallAssessment: String(json.overallAssessment || ''),
            uncertainties: Array.isArray(json.uncertainties) ? json.uncertainties : [],
            conflictingSignals: Array.isArray(json.conflictingSignals) ? json.conflictingSignals : [],
            crossReferences: Array.isArray(json.crossReferences) ? json.crossReferences : [],
          };
        } catch { log.debug('Fallback 专家不可用 — 继续'); }
      }
      return { overallAssessment: content.slice(0, 500) };
    }
  }

  /** Extract ontology patches from LLM output (full JSON or code block) */
  private extractOntologyPatches(content: string): Array<Record<string, unknown>> {
    try {
      const json = JSON.parse(content.trim());
      if (json.ontologyPatches && Array.isArray(json.ontologyPatches)) return json.ontologyPatches;
      if (json.ontologyPatches && !Array.isArray(json.ontologyPatches)) return [json.ontologyPatches];
      return [];
    } catch (err) {
      log.warn({ err }, '本体补丁提取失败 — degraded');
      const match = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (match) {
        try {
          const json = JSON.parse(match[1].trim());
          if (json.ontologyPatches) return Array.isArray(json.ontologyPatches) ? json.ontologyPatches : [json.ontologyPatches];
        } catch { log.debug('Fallback 模式不可用 — 继续'); }
      }
    }
    return [];
  }

  /** Retry wrapper with exponential backoff for network errors */
  private async runWithRetry<T extends ExpertReport>(
    fn: () => Promise<T>,
    expertType: string,
    attempt = 0,
  ): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      const isNetworkError = /timeout|network|econnrefused|etimedout|5\d{2}/i.test(err.message);
      if (isNetworkError && attempt < this.maxRetries) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 8000);
        log.debug({ expertType, attempt, delay }, 'Expert network error — retrying');
        await new Promise(r => setTimeout(r, delay));
        return this.runWithRetry(fn, expertType, attempt + 1);
      }
      throw err;
    }
  }

  /** Hermes P0-3: 6 专家并行执行 — 诊断速度 3-6x */
  async runAllExperts(evidence: Evidence[]): Promise<ExpertReport[]> {
    const expertTypes: ExpertType[] = ['strategy', 'org', 'finance', 'tech', 'marketing', 'action'];

    const results = await Promise.allSettled(
      expertTypes.map(type => this.runExpert(type, evidence)),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<ExpertReport> => r.status === 'fulfilled' && r.value !== null)
      .map(r => r.value);
  }
}

// Expert prompts moved to ExpertRegistry (src/l3/expert-registry.ts) — Task 3
