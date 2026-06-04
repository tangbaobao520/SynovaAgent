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

      const llmClient = createDiagnosisLLMClient(this.provider);
      const toolExecutor = createToolExecutorAdapter(this.toolRegistry);

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
    return (factory as (backend: string, database: unknown) => Record<string, unknown>)('sqlite', db);
  }
}
