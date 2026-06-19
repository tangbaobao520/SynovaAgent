/**
 * adapters/engine-core-adapter.ts — engine-core 适配器
 *
 * 铁律 39: 唯一知道 server/vendor/ 路径的文件。
 * 实现 DiagnosisEngine 接口，封装动态 import + 适配器创建。
 *
 * 如果换引擎实现（如 mock engine 用于测试），只需替换此适配器。
 */
import type { DiagnosisEngine, DiagnosisEvent, ConsultationResult } from '../l2-interfaces/diagnosis-engine';
import type { LLMProvider } from '../providers/types';
import type { ToolRegistry } from '../agent/tools';
import { createLogger } from '../logger';

const log = createLogger('adapters/engine-core');

export class EngineCoreVendorAdapter implements DiagnosisEngine {
  private provider: LLMProvider;
  private toolRegistry: ToolRegistry;

  constructor(provider: LLMProvider, toolRegistry: ToolRegistry) {
    this.provider = provider;
    this.toolRegistry = toolRegistry;
  }

  async runConsultation(
    teamId: string,
    initiator: { role: string; name: string; teamId: string; concerns: string[] },
    onEvent?: (event: DiagnosisEvent) => void,
  ): Promise<ConsultationResult> {
    try {
      // 铁律 39: 通过 @synova/diagnosis-engine 包访问 (不再直连 vendor 路径)
      const { DiagnosisOrchestrator } = await import('@synova/diagnosis-engine');
      const { createDiagnosisLLMClient, createToolExecutorAdapter } = await import(
        '../agent/orchestrator-adapter'
      );

      // 确保 EngineContext 已初始化 — 引擎模块需要 DB + logger
      try {
        const { getDatabase, initEngineContext } = await import('../init/engine-context');
        try { getDatabase(); } catch { initEngineContext(); }
      } catch { log.warn('engine-context 初始化跳过 (非阻断)'); }

      const llmClient = createDiagnosisLLMClient(this.provider);
      const toolExecutor = createToolExecutorAdapter(this.toolRegistry);

      // PDE 手动完成访谈后创建初始 snapshot — 首次诊断的数据种子
      try {
        const { getLatestSnapshot, recordGapSnapshot } = await import(
          '../pipeline/gap-recorder'
        );
        if (!getLatestSnapshot(teamId)) {
          const GAP_DIMS = [
            'division_of_labor', 'information_flow', 'authority_governance',
            'trust_incentive', 'knowledge_sharing', 'external_interface',
          ] as const;
          const gaps = Object.fromEntries(
            GAP_DIMS.map(dim => [dim, {
              mode: 'inferred_from_interview',
              engineScore: 0.5,
              confidence: 'medium' as const,
              sourceBreakdown: { pde_interview: 1.0 },
            }])
          ) as Record<string, unknown>;
          recordGapSnapshot({
            teamId,
            observedAt: new Date().toISOString(),
            sourcePipeline: 'manual_trigger',
            gaps,
          } as Parameters<typeof recordGapSnapshot>[0]);
          log.info({ teamId }, '已创建初始 snapshot（PDE 访谈数据）');
        }
      } catch (seedErr: unknown) {
        log.warn({ err: (seedErr as Error).message }, '种子 snapshot 创建失败（非阻断）');
      }

      const orchestrator = new DiagnosisOrchestrator(llmClient, toolExecutor)
        .withMaxIterations(4)
        .withGateDataCompleteness(0.3)
        .withGateMinHypothesisConfidence(0.5);

      const result = await orchestrator.runConsultation(teamId, initiator);

      if (onEvent && result.events) {
        for (const event of result.events) {
          onEvent(event as DiagnosisEvent);
        }
      }

      return {
        teamId: result.teamId,
        report: result.report,
        totalDurationMs: result.totalDurationMs,
        degradedModules: result.degradedModules || [],
      };
    } catch (err: any) {
      log.error({ err, teamId }, 'engine-core 诊断调用失败');
      throw err;
    }
  }

  /** 铁律 39: GraphStore 工厂 — 通过 @synova/diagnosis-engine 包 */
  static async createGraphStore(db: unknown): Promise<Record<string, unknown>> {
    const { createGraphStore: factory } = await import('@synova/diagnosis-engine');
    return (factory as unknown as (backend: string, database: unknown) => Record<string, unknown>)('sqlite', db);
  }
}
