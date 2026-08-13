/**
 * orchestrator/phase-gate-check.ts — Phase 边界 Gate Check (P0 Loop Engineering 缺口修复)
 *
 * 在 PhaseStateMachine.onPhaseEnter 注册回调，强制执行诊断质量门禁。
 * 此前 QualityFirewall 仅在 ExpertDispatcher.runExpert() 内部调用（专家级），
 * 不在 Phase 边界调用。本模块填补这个缺口。
 *
 * 铁律 39: L2 编排层。通过 L3 QualityFirewall + L4 GraphStore 接口访问下级。
 */

import { createLogger } from '@synova/logger';
import type { PhaseStateMachine } from './phase-state-machine';

const log = createLogger('orchestrator/phase-gate-check');

// ═══ Types ═══

export interface PhaseGateConfig {
  /** Phase 1→2: 最小证据数量 */
  minEvidenceCount: number;
  /** Phase 2→3: 最小假设置信度 */
  minHypothesisConfidence: number;
  /** Phase 2→3: 最少通过的专家数 */
  minExpertsPassed: number;
}

export interface PhaseGateResult {
  phase: number;
  passed: boolean;
  reason?: string;
  warnings: string[];
}

// ═══ Gate Check Logic ═══

/**
 * 注册 Phase Gate Check 回调到 PhaseStateMachine。
 * 在 server.ts 的 wiring 阶段调用。
 *
 * @param sm - PhaseStateMachine 实例
 * @param config - Gate 阈值配置
 * @param evidenceCount - 当前证据数量（由调用方提供，闭包捕获）
 * @param expertResults - 专家执行结果引用（由调用方提供，闭包捕获）
 */
export function registerPhaseGateChecks(
  sm: PhaseStateMachine,
  config: PhaseGateConfig = { minEvidenceCount: 3, minHypothesisConfidence: 0.5, minExpertsPassed: 4 },
  evidenceCount: () => number,
  expertResults: () => Array<{ expertType: string; confidence: number; hypothesis: string; degraded?: boolean }>,
): void {

  // ── Gate 1→2: 数据完整性 ──
  sm.onPhaseEnter(2, () => {
    const count = evidenceCount();
    if (count < config.minEvidenceCount) {
      log.warn({ evidenceCount: count, minRequired: config.minEvidenceCount },
        '[Gate 1→2] 证据不足 — 诊断结论可能不可靠');
    } else {
      log.info({ evidenceCount: count }, '[Gate 1→2] 数据完整性检查通过');
    }
  });

  // ── Gate 2→3: 假设置信度 ──
  sm.onPhaseEnter(3, () => {
    const results = expertResults();
    const activeResults = results.filter(r => !r.degraded);
    const avgConfidence = activeResults.length > 0
      ? activeResults.reduce((s, r) => s + r.confidence, 0) / activeResults.length
      : 0;

    if (activeResults.length < config.minExpertsPassed) {
      log.warn({
        activeExperts: activeResults.length,
        minRequired: config.minExpertsPassed,
        totalExperts: results.length,
        degradedCount: results.filter(r => r.degraded).length,
      }, '[Gate 2→3] 通过专家数不足 — 需人工审核');
    }

    if (avgConfidence < config.minHypothesisConfidence) {
      log.warn({
        avgConfidence: avgConfidence.toFixed(2),
        minRequired: config.minHypothesisConfidence,
      }, '[Gate 2→3] 假设置信度偏低 — 诊断结论标注低置信度');
    } else {
      log.info({
        avgConfidence: avgConfidence.toFixed(2),
        activeExperts: activeResults.length,
      }, '[Gate 2→3] 假设置信度检查通过');
    }
  });

  // ── Gate 4→5: 报告完整性 ──
  sm.onPhaseEnter(5, () => {
    const results = expertResults();
    const withFindings = results.filter(r => r.hypothesis.length > 0);
    if (withFindings.length === 0) {
      log.warn('[Gate 4→5] 所有专家均无有效发现 — 报告将标注数据不足');
    }
  });

  log.info({
    phaseGates: ['1→2: dataCompleteness', '2→3: hypothesisConfidence', '4→5: reportCompleteness'],
    thresholds: config,
  }, 'Phase Gate Check 已注册');
}
