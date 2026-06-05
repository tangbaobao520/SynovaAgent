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
export type { GraphDiff, GraphStoreRO } from './diagnosis-graph-query';
