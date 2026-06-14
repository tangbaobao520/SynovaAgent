/**
 * @synova/diagnosis-engine — 六阶段诊断引擎公开 API
 *
 * 内部委托给 engine-core 实现，对外暴露稳定的公开契约。
 * 使用相对路径引用 engine-core，避免模块解析双实例问题。
 *
 * 铁律 39: 此包是 L3 (洞察层) 的唯一公开入口。
 */
// ═══ 核心编排器 (L3) ═══
export { DiagnosisOrchestrator } from '../../engine-core/src/pipeline/diagnosis/diagnosis-orchestrator';
export type {
  DiagnosisLLMClient,
  LLMResponse,
  ToolExecutor,
  ToolResult,
} from '../../engine-core/src/pipeline/diagnosis/diagnosis-orchestrator';

// ═══ GraphStore 工厂 (L4) ═══
export { createGraphStore } from '../../engine-core/src/pipeline/diagnosis/graph-store';
export type { GraphStore } from '../../engine-core/src/pipeline/diagnosis/graph-store';

// ═══ 引擎上下文注入 ═══
export { setEngineContext, getEngineContext } from '../../engine-core/src/engine-context';

// ═══ 文档摄取 ═══
export { ingestDocument } from '../../engine-core/src/pipeline/diagnosis/ontology-adapter';

// ═══ 六阶段诊断管线 ═══
export {
  createFdeToolExecutor,
} from '../../engine-core/src/pipeline/diagnosis/fde-toolset';

// ═══ 会话追踪 ═══
// MemorySessionTracer 已移除 — fde-toolset 不再导出 (迁移到 Sentinel 接口)
export { DiagnosisEventStream } from '../../engine-core/src/pipeline/diagnosis/diagnosis-event-stream';

// ═══ 类型 ═══
export type {
  InitiatorProfile,
  DiagnosisScope,
  DiagnosisEvent,
} from '../../engine-core/src/pipeline/diagnosis/types';
