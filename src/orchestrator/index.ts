/**
 * orchestrator/index.ts — 编排层统一导出 (P2: 导出规范统一)
 */
export { EventBus } from './event-bus';
export type { OrchestrationEvent } from './types';
export { PhaseStateMachine } from './phase-state-machine';
export type { MachineState, PhaseConfig, PhaseState } from './phase-state-machine';
export { SessionManager } from './session-manager';
export type { CompactionLevel, Message, CompactionResult, SessionConfig } from './session-manager';
export { HookRunner, createPermissionHook, createEvidenceHook, createAuditHook } from './hook-runner';
export { ModuleRunner } from './module-runner';
export type { ModuleTask, ModuleResult, ModuleRunResults, ModuleRunnerConfig } from './module-runner';
export { SubAgentCoordinator } from './subagent-coordinator';
export type { SubAgentReport, ExpertType, DataAccessPolicy } from './subagent-coordinator';
export { IntentRouter } from './intent-router';
export { DimensionRegistry } from './dimension-registry';
export { createOrchestrationWiring } from './wiring';
export type { OrchestrationWiring } from './wiring';
export { LLMPhaseExecutor } from './llm-phase-executor';
export { EventStore } from './event-store';
export { Phase0Engine } from './phase0-engine';
