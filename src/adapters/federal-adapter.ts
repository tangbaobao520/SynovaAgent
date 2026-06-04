/**
 * adapters/federal-adapter.ts — 联邦进化适配器
 *
 * 铁律 39: 封装 vendor engine-core 的 FederalReporter。
 * FED-001: 接线联邦进化系统 — 诊断完成后上报质量信号。
 */
import { createLogger } from '../logger';

const log = createLogger('adapters/federal');

export interface FederalAdapter {
  /** Report diagnosis quality signal after diagnosis completes */
  reportQuality(signal: {
    diagnosisId: string;
    teamId: string;
    confirmRate: number;
    adoptionRate: number;
    phaseDurationMs: number;
    moduleCount: number;
  }): Promise<void>;
}

/** No-op adapter when federal reporting is disabled */
const noopAdapter: FederalAdapter = {
  async reportQuality() { /* disabled */ },
};

let _instance: FederalAdapter = noopAdapter;

/** Initialize federal reporting with engine-core FederalReporter */
export async function initFederalReporter(db: unknown, config?: { epsilon?: number; optOut?: boolean }): Promise<FederalAdapter> {
  try {
    const { FederalReporter } = await import('@synova/diagnosis-engine');
    const reporter = new FederalReporter(db, {
      epsilon: config?.epsilon ?? 1.0,
      optOut: config?.optOut ?? false,
    });

    _instance = {
      async reportQuality(signal) {
        if (config?.optOut) return;
        try {
          reporter.reportDiagnosisQuality({
            signalType: 'diagnosis_quality',
            diagnosisId: signal.diagnosisId,
            teamId: signal.teamId,
            overallHypothesisConfirmRate: signal.confirmRate,
            overallActionAdoptionRate: signal.adoptionRate,
            phaseCompletionTime: signal.phaseDurationMs,
            moduleCount: signal.moduleCount,
            timestamp: new Date().toISOString(),
          });
          log.debug({ diagnosisId: signal.diagnosisId }, '联邦质量信号已上报');
        } catch (err: any) {
          log.warn({ err }, '联邦上报失败 — degraded, 诊断继续');
        }
      },
    };
    log.info('FederalReporter 已初始化 (联邦进化已启用)');
    return _instance;
  } catch (err: any) {
    log.warn({ err }, 'FederalReporter 初始化失败 — 联邦进化降级为离线模式');
    return noopAdapter;
  }
}

/** Get current federal adapter instance */
export function getFederalAdapter(): FederalAdapter {
  return _instance;
}
