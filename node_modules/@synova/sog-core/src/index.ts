/**
 * @synova/sog-core — Synova Ontology Graph Core Schema v1.0
 *
 * 公开 API:
 *   - SOGNodeType, SOGEdgeType (frozen enums — 14 nodes + 10 edges)
 *   - Node props interfaces: PersonProps, TeamProps, AgentProps, ...
 *   - Edge props interfaces: BelongsToProps, AffectsProps, ...
 *   - Validators: NODE_VALIDATORS, EDGE_VALIDATORS, validateSOGNode, validateSOGEdge
 *   - Endpoint map: EDGE_ENDPOINT_MAP, validateEdgeEndpoints
 *   - Metadata: validateTemplateManifest, validateAdapterManifest
 *   - Certification: certifyTemplate, certifyAdapter
 *
 * SOG enum 只增不删 (iron law #15) + 运行时 Extension Registry 支持新类型。
 */

// ── Core Schema ──
export {
  SOGNodeType,
  SOGEdgeType,
  SOG_CORE_VERSION,
  EDGE_ENDPOINT_MAP,
  NODE_VALIDATORS,
  EDGE_VALIDATORS,
  SOGValidationError,
  validateEdgeEndpoints,
} from './sog-core-schema';

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
