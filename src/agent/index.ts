/**
 * agent/index.ts — Agent 包导出汇总 (v2.1)
 *
 * 接线: 确保所有新组件在生产入口中有引用。
 */
export { KnowledgeInjector } from './knowledge-injector';
export type { KnowledgeContext, KnowledgeConflict, InjectionResult } from './knowledge-injector';
export { KnowledgeConflictHandler } from './knowledge-conflict-handler';
export { AtomicWriter } from './atomic-write';
export type { AtomicWriteResult } from './atomic-write';
export { getEnabledDiagnosticExperts, getBackgroundExperts } from './expert-config-loader';
