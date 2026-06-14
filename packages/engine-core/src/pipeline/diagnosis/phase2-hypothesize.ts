/**
 * phase2-hypothesize.ts — Phase 2: 专家并行假设生成 (EC-02 Sprint C)
 *
 * 从 diagnosis-orchestrator.ts (1354行) 提取。
 * 独立文件，可被 orchestrator 或其他调用方使用。
 */
import type { ExpertSubsystem } from './expert-subsystem-interface';
import { ExpertSubAgentExecutor, type ExpertSubAgentContext, EXPERT_REPORT_SCHEMA } from './expert-subagent-executor';
import { getDataAccessPolicy, filterEvidenceForExpert, anonymizeEvidence, getAllowedToolsForExpert } from './expert-data-policy';
import { renderKnowledgeForSystemPrompt } from './expert-knowledge';
import { buildExpertSystemPrompt } from './expert-prompts';
import { synthesizeExpertReports } from './synthesizer';
import { saveExpertReport } from './expert-report-store';
import { extractSessionBrief } from './phase0-prompts';
import type { ExpertType, DiagnosisEvidence, DiagnosisHypothesis, DiagnosisScope, ExpertReport } from './types';
import type { ExpertContext } from './expert-subsystem-interface';
import type { Phase0State } from './phase0-prompts';
import { createLogger } from '../../infra/logger';

const log = createLogger('diagnosis/phase2');

export interface Phase2Deps {
  llmClient: { consult(system: string, user: string, opts?: unknown): Promise<{ content: string }> };
  toolExecutor: { execute(name: string, input: string): Promise<unknown> };
  evidenceManager: {
    expireByAge(ms: number): void;
    query(filter: Record<string, unknown>): DiagnosisEvidence[];
    detectContradictions(): Array<{ dimension: string; description?: string; severity?: number }>;
  };
  tracer: {
    trace(event: Record<string, unknown>): void;
  };
  /** 注入的 ExpertSubsystem (默认 ExpertSubAgentExecutor) */
  expertExecutor?: ExpertSubsystem | null;
  /** Phase 0 状态快照 */
  phase0State?: Record<string, unknown>;
}

export async function phase2Hypothesize(
  teamId: string,
  scope: DiagnosisScope,
  deps: Phase2Deps,
): Promise<DiagnosisHypothesis[]> {
  deps.evidenceManager.expireByAge(7 * 24 * 60 * 60 * 1000);
  const filteredEvidence = deps.evidenceManager.query({ minConfidence: 0.4 });
  const diagnosisId = `diag_${Date.now().toString(36)}`;

  const sessionBrief = extractSessionBrief(
    { ...(deps.phase0State || {}), orgName: scope.teamId, teamSize: '' } as unknown as Phase0State,
    { dimensions: scope.dimensions, depth: scope.depth },
  );
  sessionBrief.diagnosisId = diagnosisId;

  const executor: ExpertSubsystem = deps.expertExecutor
    || new ExpertSubAgentExecutor(deps.llmClient as any, deps.toolExecutor as any) as unknown as ExpertSubsystem;
  const expertTypes: ExpertType[] = ['strategic_analyst','org_diagnostician','financial_analyst','tech_architect','marketing_analyst','action_advisor'];

  const contexts: ExpertSubAgentContext[] = expertTypes.map(type => {
    const policy = getDataAccessPolicy(type);
    let ev = filterEvidenceForExpert(filteredEvidence, policy);
    if (policy.anonymizedView) ev = anonymizeEvidence(ev);
    return {
      expertType: type, diagnosisId, orgName: scope.teamId, teamId,
      sessionBrief, allowedEvidence: ev,
      allowedTools: getAllowedToolsForExpert(type),
      dataPolicy: policy,
      systemPrompt: buildExpertSystemPrompt(type, { teamId, phase: 2, evidence: ev, sessionBrief }),
      expertKnowledge: renderKnowledgeForSystemPrompt(type),
      outputSchema: EXPERT_REPORT_SCHEMA,
      timeoutMs: 120_000, maxRetries: 1,
    };
  });

  const reports = await executor.executeAll(contexts as unknown as ExpertContext[]);
  for (const r of reports) {
    saveExpertReport(r as unknown as ExpertReport);
    deps.tracer.trace({ type: 'expert_report_completed', expertType: r.expertType, status: r.status, timestamp: new Date().toISOString() });
  }

  try {
    const { applyOntologyPatches } = require('./expert-ontology-bridge');
    const { createGraphStore } = require('./graph-store');
    const store = createGraphStore('sqlite', require('../../../infra/engine-context').getEngineContext()?.database?.getDb?.());
    if (store) applyOntologyPatches(reports, store, scope.teamId);
  } catch (err) { log.warn({ err }, '本体桥接失败 (非阻断)'); }

  let synthesis: Awaited<ReturnType<typeof synthesizeExpertReports>>;
  try {
    synthesis = await synthesizeExpertReports(reports as unknown as ExpertReport[], filteredEvidence, deps.llmClient as any);
  } catch (err) {
    log.warn({ err }, '合成失败, 回退到规则引擎');
    return generateRuleBasedHypotheses(filteredEvidence);
  }

  const hypotheses = synthesis.hypotheses;
  const contradictions = deps.evidenceManager.detectContradictions();
  for (const h of hypotheses) {
    const related = contradictions.filter(c => h.dimensions.includes(c.dimension));
    if (related.length > 0) {
      (h as any).contradictionSignal = {
        dimension: related[0].dimension,
        description: related[0].description || '证据方向冲突',
        strength: related[0].severity || 0.5,
      };
    }
  }
  hypotheses.sort((a, b) => {
    const aC = (a as any).contradictionSignal ? 1 : 0;
    const bC = (b as any).contradictionSignal ? 1 : 0;
    if (aC !== bC) return bC - aC;
    return b.confidence - a.confidence;
  });

  for (const h of hypotheses) {
    deps.tracer.trace({ type: 'hypothesis_generated', hypothesis: h, timestamp: new Date().toISOString() });
  }
  return hypotheses;
}

function generateRuleBasedHypotheses(evidence: DiagnosisEvidence[]): DiagnosisHypothesis[] {
  const dims = [...new Set(evidence.map(e => e.dimension))];
  return dims.map(dim => ({
    id: `h_rule_${dim}`,
    dimensions: [dim],
    statement: `基于规则的假设: ${dim} 维度存在改进空间`,
    confidence: 0.4,
    status: 'active' as const,
    supportingEvidence: evidence.filter(e => e.dimension === dim).slice(0, 3).map(e => e.id),
    refutingEvidence: [],
    generatedInPhase: 2,
  })) as unknown as DiagnosisHypothesis[];
}
