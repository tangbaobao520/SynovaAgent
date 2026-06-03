/**
 * agent/engine-context.ts — ConversationEngine 子组件共享上下文
 *
 * 打破 ConversationEngine 单体：子组件通过此接口访问引擎状态，
 * 而非直接持有 ConversationEngine 引用（避免循环依赖）。
 *
 * Iron law #0-2: 每个子组件独立可测试。
 */
import type { LLMProvider, LLMMessage } from '../providers/types';
import type { ToolRegistry } from './tools';
import type { HookRunner } from '../orchestrator/hook-runner';
import type { EventBus } from '../orchestrator/event-bus';
import type { EvidenceCollector, CorroborationEngine } from '../evidence/index';
import type { createGraphBridge, GraphStore } from '../l4/graph-bridge';
import type { DiagnosisEngine } from '../l2-interfaces/diagnosis-engine';

export interface EngineContext {
  /** LLM provider (shared across all components) */
  provider: LLMProvider;
  /** Message history (mutable — pushed by all components) */
  messages: LLMMessage[];
  /** Organization ID */
  orgId: string;
  /** Session ID for event tracing */
  sessionId: string;
  /** Tool registry */
  toolRegistry: ToolRegistry;
  /** Hook runner (optional) */
  hookRunner: HookRunner | null;
  /** Event bus (optional) */
  eventBus: EventBus | null;
  /** Evidence collector (optional) */
  evidenceCollector: EvidenceCollector | null;
  /** CorroborationEngine — 矛盾检测 + 交叉验证 (optional) */
  corroborationEngine: CorroborationEngine | null;
  /** GraphBridge for diagnosis→ontology sync */
  graphBridge: ReturnType<typeof createGraphBridge> | null;
  /** GraphStore for read-only L4 queries */
  graphStore: GraphStore | null;
  /** L4 feature flags */
  flags: {
    enableCommunityReports: boolean;
    enableEntityResolution: boolean;
  };
  /** Logger prefix for this component */
  loggerPrefix: string;
  /** 铁律 39: DiagnosisEngine — L2 通过接口调用引擎, 不直接 import engine-core */
  diagnosisEngine: DiagnosisEngine;
  /** 铁律 39: GraphStore factory — 通过 adapter 获取, 不直接 import vendor */
  createGraphStore?: (db: unknown) => Promise<unknown>;
}
