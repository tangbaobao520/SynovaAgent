/**
 * @synova/sog-core — Synova Ontology Graph Core Schema v1.0 [DEPRECATED]
 *
 * ⚠️  This package is DEPRECATED. Use @synova/ontology instead.
 *     src/ 已全部迁移到 @synova/ontology。此包仅保留以满足 packages/ 中
 *     engine-core/connector-registry 等遗留模块的编译依赖。
 *
 * 公开 API (deprecated):
 *   - SOGNodeType, SOGEdgeType — use @synova/ontology NodeType/EdgeType
 *   - Node props interfaces: PersonProps, TeamProps, AgentProps, ...
 *   - Edge props interfaces: BelongsToProps, AffectsProps, ...
 *   - Validators: NODE_VALIDATORS, EDGE_VALIDATORS, validateSOGNode, validateSOGEdge
 *   - Endpoint map: EDGE_ENDPOINT_MAP, validateEdgeEndpoints
 *   - Metadata: validateTemplateManifest, validateAdapterManifest
 *   - Certification: certifyTemplate, certifyAdapter
 */

// ── Core Schema (保留以供 packages/ 遗留模块编译) ──
export {
  SOG_CORE_VERSION,
  EDGE_ENDPOINT_MAP,
  NODE_VALIDATORS,
  EDGE_VALIDATORS,
  SOGValidationError,
  validateEdgeEndpoints,
} from './sog-core-schema';

/** @deprecated Use @synova/ontology NodeType instead. Kept for packages/ legacy compat. */
export { SOGNodeType } from './sog-core-schema';
/** @deprecated Use @synova/ontology EdgeType instead. Kept for packages/ legacy compat. */
export { SOGEdgeType } from './sog-core-schema';

export type {
  PersonProps,
  TeamProps,
  AgentProps,
  ToolProps,
  ClientProps,
  ProcessProps,
  EventProps,
  DocumentProps,
  FinancialProps,
  LocationProps,
  GoalProps,
  CapabilityProps,
  RiskProps,
  ComplianceProps,
  // Edge props
  InteractsWithEdgeProps,
  BelongsToEdgeProps,
  OwnsEdgeProps,
  TriggersEdgeProps,
  AffectsEdgeProps,
  DependsOnEdgeProps,
  CorrespondsToEdgeProps,
  ConsumesEdgeProps,
  AlignsWithEdgeProps,
  ProvidesEdgeProps,
  // Union types
  SOGNodeProps,
  SOGEdgeProps,
} from './sog-core-schema';

// ── SDK (补充校验工具) ──
export {
  validateSOGNode,
  validateSOGEdge,
  validateSOGSubgraph,
} from './sog-sdk';

// ── Metadata ──
export {
  validateTemplateManifest,
  validateAdapterManifest,
} from './sog-metadata';

export type {
  NodeTypeDefinition,
  EdgeTypeDefinition,
  SOGTemplateManifest,
  SOGAdapterManifest,
  ValidationResult,
} from './sog-metadata';

// ── Certification ──
export {
  certifyTemplate,
  certifyAdapter,
} from './sog-certification';

export type { CertificationResult } from './sog-certification';
