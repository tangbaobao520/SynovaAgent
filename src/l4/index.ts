/**
 * l4/index.ts — 本体层统一导出 (P2: 导出规范统一)
 */
export { createGraphBridge } from './graph-bridge';
export type {
  GraphStore, BridgeResult, HONAInput, HONAEdge,
  KeyPersonRiskInput, FinancialImpactInput,
  CapabilityGapInput, SevenPowersInput, CPCInput,
} from './graph-bridge';
export { resolveEntitiesL3 } from './entity-resolver';
export { reflectOnTriples } from './triple-reflection';
export { captureDecision } from './decision-capture';
// V4.2.3: diagnosis-graph-query.ts 已删除 — type export 移除
export { validateMigration, validateAll } from './migration-validator';
export type { ValidationReport, ValidationStatus } from './migration-validator';
