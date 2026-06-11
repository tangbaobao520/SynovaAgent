/**
 * expert-data-policy.ts — 专家数据权限策略
 * Step 2a: 对标 Claw-Code allowed_tools_for_subagent + Hermes 权限隔离
 */
import type { DataAccessPolicy, DiagnosisEvidence, ExpertType } from './types';

const POLICIES: Record<ExpertType, DataAccessPolicy> = {
  strategic_analyst: {
    expertType: 'strategic_analyst',
    allowedDimensions: ['decision_making','information_flow','knowledge_sharing','trust_level','goal_alignment','role_clarity','external_interface','strategic_posture'],
    allowedDataSources: ['system_logs','interviews','surveys','documents'],
    allowedTools: ['diagnose_gaps','gap_recorder','seven_powers','posture_detector','benchmark_engine','data_enricher'],
    sensitiveDataAccess: 'read',
    anonymizedView: false,
  },
  org_diagnostician: {
    expertType: 'org_diagnostician',
    allowedDimensions: ['decision_making','information_flow','knowledge_sharing','trust_level','goal_alignment','role_clarity','quality_gate','key_person_risk'],
    allowedDataSources: ['system_logs','interviews','surveys'],
    allowedTools: ['diagnose_gaps','gap_recorder','hacd','hona','htm','eob','ipu_overload','attention_allocator','evidence_manager'],
    sensitiveDataAccess: 'full',
    anonymizedView: false,
  },
  financial_analyst: {
    expertType: 'financial_analyst',
    allowedDimensions: ['information_flow','knowledge_sharing','quality_gate','external_interface'],
    allowedDataSources: ['financial_data','system_logs'],
    allowedTools: ['financial_impact','token_economics','financial_snapshot'],
    sensitiveDataAccess: 'full',
    anonymizedView: false,
  },
  tech_architect: {
    expertType: 'tech_architect',
    allowedDimensions: ['information_flow','knowledge_sharing','quality_gate','role_clarity'],
    allowedDataSources: ['system_logs'],
    allowedTools: ['benchmark_engine','capability_spectrum','auto_interpreter','data_enricher'],
    sensitiveDataAccess: 'read',
    anonymizedView: false,
  },
  marketing_analyst: {
    expertType: 'marketing_analyst',
    allowedDimensions: ['information_flow','trust_level','external_interface'],
    allowedDataSources: ['surveys','interviews','system_logs'],
    allowedTools: ['category_clarity','positioning_consistency','differentiation_validation'],
    sensitiveDataAccess: 'read',
    anonymizedView: true,
  },
  action_advisor: {
    expertType: 'action_advisor',
    allowedDimensions: ['decision_making','information_flow','knowledge_sharing','trust_level','goal_alignment','role_clarity','quality_gate','key_person_risk','external_interface'],
    allowedDataSources: ['system_logs','interviews','surveys','documents'],
    allowedTools: ['auto_action','task_integration','fde_toolset'],
    sensitiveDataAccess: 'read',
    anonymizedView: true,
  },
};

export function getDataAccessPolicy(expertType: ExpertType): DataAccessPolicy {
  return POLICIES[expertType];
}

export function filterEvidenceForExpert(
  evidence: DiagnosisEvidence[],
  policy: DataAccessPolicy,
): DiagnosisEvidence[] {
  return evidence.filter(e => {
    if (!policy.allowedDimensions.includes(e.dimension)) return false;
    if (e.supersededBy) return false; // Skip superseded
    return true;
  });
}

export function anonymizeEvidence(evidence: DiagnosisEvidence[]): DiagnosisEvidence[] {
  return evidence.map(e => ({
    ...e,
    content: e.content.replace(/(?:张三|李四|王五|\b[A-Z][a-z]+ [A-Z][a-z]+\b)/g, '[匿名]'),
    isPrivate: true,
    privateReason: 'anonymized_view',
  }));
}

export function getAllowedToolsForExpert(expertType: ExpertType): string[] {
  return POLICIES[expertType].allowedTools;
}
