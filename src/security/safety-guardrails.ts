/**
 * security/safety-guardrails.ts — 无悔动作 + 一致性检查 (P1-6.1 + 6.2)
 *
 * 参考 OpenClaw protocol-engine/no-regret-actions.ts + coherence-check.ts
 *
 * NRA-01: 注入安全约束 (拒答清单、数据隔离、合规红线)
 * NRA-02: 确保所有阶段被覆盖
 * NRA-03: 默认启用诚实标记 (可追溯性)
 *
 * R12: 低信任度 + 未启用审计 → critical
 * R14: 完全隔离 + 外部知识不可见 → critical
 * R16: 单决策者 + 多人否决权 → critical
 */
import type { DiagnosisEvent } from '../l2-interfaces/diagnosis-engine';
import { createLogger } from '@synova/logger';

const log = createLogger('security/safety-guardrails');

// ═══ NRA-01: 安全约束 ═══

/** 诊断中永远不应给出的建议 */
const REFUSAL_LIST = [
  '裁员', '解雇', 'fire', 'layoff',
  '绕过合规', 'bypass compliance',
  '伪造数据', 'falsify',
  '歧视', 'discriminat',
  '内幕交易', 'insider trading',
];

/** 检查诊断输出是否包含禁止内容 */
export function checkRefusalList(text: string): { blocked: boolean; match?: string } {
  const lower = text.toLowerCase();
  for (const item of REFUSAL_LIST) {
    if (lower.includes(item.toLowerCase())) {
      log.warn({ match: item }, 'NRA-01: 诊断输出含禁止内容');
      return { blocked: true, match: item };
    }
  }
  return { blocked: false };
}

// ═══ NRA-02: 阶段覆盖 ═══

const REQUIRED_PHASES = [0, 1, 2, 3, 4, 5];

export interface PhaseCoverageResult {
  covered: boolean;
  missing: number[];
}

/** 确保所有诊断阶段都被覆盖 */
export function checkPhaseCoverage(completedPhases: Set<number>): PhaseCoverageResult {
  const missing = REQUIRED_PHASES.filter(p => !completedPhases.has(p));
  if (missing.length > 0) {
    log.warn({ missing }, 'NRA-02: 诊断阶段未完全覆盖');
  }
  return { covered: missing.length === 0, missing };
}

// ═══ NRA-03: 诚实标记 ═══

export interface HonestyMark {
  traceable: boolean;
  evidenceCount: number;
  unverifiedClaims: string[];
}

/** 确保诊断结论附带可追溯的证据引用 */
export function checkHonestyMark(
  findings: Array<{ evidenceRefs?: string[]; statement: string }>,
): HonestyMark {
  const unverified: string[] = [];
  let totalEvidence = 0;

  for (const f of findings) {
    if (!f.evidenceRefs || f.evidenceRefs.length === 0) {
      unverified.push(f.statement.slice(0, 80));
    } else {
      totalEvidence += f.evidenceRefs.length;
    }
  }

  const traceable = unverified.length === 0 || findings.length === 0;
  if (!traceable) {
    log.warn({ unverifiedCount: unverified.length }, 'NRA-03: 存在无证据引用的诊断结论');
  }

  return { traceable, evidenceCount: totalEvidence, unverifiedClaims: unverified };
}

// ═══ R12: 信任度-审计一致性 ═══

export interface CoherenceViolation {
  rule: string;
  severity: 'critical' | 'warning';
  message: string;
}

export function checkCoherenceRules(config: {
  confidence: number;
  auditEnabled: boolean;
  isolationLevel: 'full' | 'semi' | 'none';
  externalKnowledgeEnabled: boolean;
  singleDecisionMaker: boolean;
  multiPartyVeto: boolean;
}): CoherenceViolation[] {
  const violations: CoherenceViolation[] = [];

  // R12: 低信任度 + 未启用审计 → critical
  if (config.confidence < 0.5 && !config.auditEnabled) {
    violations.push({
      rule: 'R12',
      severity: 'critical',
      message: `置信度 ${(config.confidence * 100).toFixed(0)}% 低于阈值且审计未启用——诊断结论不可信`,
    });
  }

  // R14: 完全隔离 + 外部知识不可见 → critical
  if (config.isolationLevel === 'full' && !config.externalKnowledgeEnabled) {
    violations.push({
      rule: 'R14',
      severity: 'critical',
      message: '完全隔离模式下外部知识不可用——诊断可能缺少行业上下文',
    });
  }

  // R16: 单决策者 + 无多人否决 → warning
  if (config.singleDecisionMaker && !config.multiPartyVeto) {
    violations.push({
      rule: 'R16',
      severity: 'warning',
      message: '单一决策者无多人否决机制——建议至少引入第二意见',
    });
  }

  if (violations.length > 0) {
    log.warn({ violations }, '一致性检查发现违规');
  }

  return violations;
}

// ═══ 综合安全门禁 (诊断前执行) ═══

export interface SafetyGateResult {
  passed: boolean;
  blockReasons: string[];
  warnings: string[];
}

export function runSafetyGate(input: {
  diagnosisPhase: number;
  completedPhases: Set<number>;
  confidence: number;
  auditEnabled: boolean;
  findings?: Array<{ evidenceRefs?: string[]; statement: string }>;
}): SafetyGateResult {
  const blockReasons: string[] = [];
  const warnings: string[] = [];

  // NRA-02: Phase coverage
  const coverage = checkPhaseCoverage(input.completedPhases);
  if (!coverage.covered) {
    warnings.push(`阶段未完全覆盖: 缺少 ${coverage.missing.join(', ')}`);
  }

  // R12: Confidence-audit coherence
  if (input.confidence < 0.5 && !input.auditEnabled) {
    blockReasons.push(`R12: 置信度过低 (${input.confidence}) 且审计未启用`);
  }

  // NRA-03: Honesty
  if (input.findings) {
    const honesty = checkHonestyMark(input.findings);
    if (!honesty.traceable && input.diagnosisPhase >= 4) {
      blockReasons.push(`NRA-03: Phase ${input.diagnosisPhase} 报告含 ${honesty.unverifiedClaims.length} 条无证据结论`);
    }
  }

  return {
    passed: blockReasons.length === 0,
    blockReasons,
    warnings,
  };
}
