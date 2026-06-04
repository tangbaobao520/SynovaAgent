/**
 * @synova/diagnosis-engine — 六阶段诊断引擎公开 API
 *
 * 从 engine-core 单体中提取的薄门面层。
 * 内部委托给 engine-core 实现，对外暴露稳定的公开契约。
 *
 * 铁律 39: 此包是 L3 (洞察层) 的唯一公开入口。
 * L4 组件 (GraphStore) 的工厂函数也在此暴露——诊断引擎需要图存储。
 */

// ═══ 核心编排器 (L3) ═══

export { DiagnosisOrchestrator } from '@synova/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator';
export type {
  DiagnosisLLMClient,
  LLMResponse,
  ToolExecutor,
  ToolResult,
} from '@synova/engine-core/src/pipeline/diagnosis/diagnosis-orchestrator';

// ═══ GraphStore 工厂 (L4) ═══

export { createGraphStore } from '@synova/engine-core/src/pipeline/diagnosis/graph-store';
export type { GraphStore } from '@synova/engine-core/src/pipeline/diagnosis/graph-store';

// ═══ 引擎上下文注入 ═══

export { setEngineContext, getEngineContext } from '@synova/engine-core/src/infra/engine-context';

// ═══ 文档摄取 ═══

export { ingestDocument } from '@synova/engine-core/src/pipeline/diagnosis/ontology-adapter';

// ═══ 六阶段诊断管线 ═══

export {
  runModules,
  createFdeToolExecutor,
  getGapTimeline,
} from '@synova/engine-core/src/pipeline/diagnosis/fde-toolset';

// ═══ 会话追踪 ═══

export { MemorySessionTracer } from '@synova/engine-core/src/pipeline/diagnosis/diagnosis-session-store';
export { DiagnosisEventStream } from '@synova/engine-core/src/pipeline/diagnosis/diagnosis-event-stream';

// ═══ 类型 ═══

export type {
  InitiatorProfile,
  DiagnosisScope,
  DiagnosisEvent,
} from '@synova/engine-core/src/pipeline/diagnosis/types';
