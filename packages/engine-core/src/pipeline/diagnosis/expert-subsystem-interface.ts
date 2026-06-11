/**
 * expert-subsystem-interface.ts — 专家子系统接口 (EC-02 Sprint A)
 *
 * 铁律 39: orchestrator 依赖接口，不依赖具体专家实现。
 * ExpertSubAgentExecutor 实现此接口，ExpertDispatcher 也可实现。
 */
import type { DiagnosisEvidence, DiagnosisHypothesis, ExpertType } from './types';

export interface ExpertContext {
  expertType: ExpertType;
  diagnosisId: string;
  orgName: string;
  teamId: string;
  sessionBrief: Record<string, unknown>;
  allowedEvidence: DiagnosisEvidence[];
  allowedTools: string[];
  systemPrompt: string;
  expertKnowledge: string;
  outputSchema: string;
  timeoutMs: number;
  maxRetries: number;
}

export interface ExpertReport {
  reportId: string;
  diagnosisId: string;
  expertType: ExpertType;
  expertName: string;
  orgName: string;
  status: 'running' | 'completed' | 'timeout' | 'failed';
  findings: Array<Record<string, unknown>>;
  overallAssessment: string;
  uncertainties: Array<Record<string, unknown>>;
  conflictingSignals: Array<Record<string, unknown>>;
  crossReferences: Array<Record<string, unknown>>;
  model: string;
  tokens: { input: number; output: number };
  durationMs: number;
  generatedAt: string;
  toolCalls: unknown[];
  ontologyPatches?: unknown[];
}

export interface ExpertSubsystem {
  executeAll(contexts: ExpertContext[]): Promise<ExpertReport[]>;
}
