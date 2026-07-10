/**
 * @synova/ontology — Package Entry Point
 *
 * @module @synova/ontology
 */

export {
  NodeType,
  ACTIVITY_TYPES,
  OUTCOME_TYPES,
  RESOURCE_TYPES,
  POOL_TYPES,
  EXTERNAL_TYPES,
  ALL_NODE_TYPES,
} from './node-types.js';
export type { NodeType as NodeTypeUnion } from './node-types.js';

export {
  EdgeType,
  ALL_EDGE_TYPES,
} from './edge-types.js';
export type { EdgeType as EdgeTypeUnion } from './edge-types.js';

export {
  mapOldNodeType,
  getNodeMappingGuide,
  getOneToOneNodeKeys,
  getAmbiguousNodeKeys,
  mapOldEdgeType,
  getEdgeMappingGuide,
  getOneToOneEdgeKeys,
  getAmbiguousEdgeKeys,
} from './mapping.js';
