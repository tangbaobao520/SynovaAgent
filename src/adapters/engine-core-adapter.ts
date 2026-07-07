/**
 * adapters/engine-core-adapter.ts — engine-core 适配器 (旧引擎)
 *
 * 铁律 39: 唯一知道 server/vendor/ 路径的文件。
 * 实现 DiagnosisEngine 接口，封装动态 import + 适配器创建。
 *
 * ═══ Step 3 迁移 (待执行) ═══
 * 替换为新引擎: SynovaDiagnosisEngineImpl + createSynovaDiagnosisEngine
 *   import { SynovaDiagnosisEngineImpl, createSynovaDiagnosisEngine } from '../l3/synova-diagnosis-engine-impl';
 *   const engine = createSynovaDiagnosisEngine(llmClient, toolExecutor, config);
 * 切换后本文件可删除。
 */
import type { DiagnosisEngine, DiagnosisEvent, ConsultationResult } from '../l2-interfaces/diagnosis-engine';
import type { LLMProvider } from '../providers/types';
import type { ToolRegistry } from '../agent/tools';
import { createLogger } from '@synova/logger';

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
      // 铁律 39+46: 直接 import engine-core (V4.4.2: 壳包 @synova/diagnosis-engine 已删除)
      const { DiagnosisOrchestrator } = await import('../../packages/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator');
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

      // gap-recorder 已从 engine-core 迁移 — 跳过 snapshot 创建
      log.info({ teamId }, '跳过旧 snapshot 创建（gap-recorder 已迁移）');

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

  /** 铁律 39: GraphStore 工厂 — 通过 @synova/graph-store 包 */
  static async createGraphStore(db: unknown): Promise<Record<string, unknown>> {
    const { createSynovaGraphStore } = await import('@synova/graph-store');
    return createSynovaGraphStore(db as import('@synova/graph-store').SqliteDb) as unknown as Record<string, unknown>;
  }
}
