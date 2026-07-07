/**
 * @synova/ontology — Migration Helpers
 *
 * Maps old SOGNodeType/SOGEdgeType enum values to new @synova/ontology string constants.
 * Used by migration scripts and for transitional compatibility only.
 * DO NOT add permanent re-exports or aliases.
 *
 * @module @synova/ontology/mapping
 */

import { NodeType } from './node-types.js';
import { EdgeType } from './edge-types.js';

// ─── Old SOGNodeType → New NodeType ───
// 1:1 mappings (safe to auto-replace)
const NODE_1TO1: Record<string, NodeType> = {
  PERSON: NodeType.RESOURCE_PERSON,
  TEAM: NodeType.RESOURCE_TEAM,
  AGENT: NodeType.RESOURCE_AGENT,
  TOOL: NodeType.RESOURCE_TOOL,
  CLIENT: NodeType.RESOURCE_CLIENT,
  LOCATION: NodeType.RESOURCE_LOCATION,
  RISK: NodeType.OUTCOME_RISK,
  COMPLIANCE: NodeType.ACTIVITY_COMPLIANCE,
  KNOWLEDGE_CHUNK: NodeType.RESOURCE_KNOWLEDGE,
  USER: NodeType.RESOURCE_PERSON,          // USER → resource/person + role=user marker
};

// Non-1:1 mappings (requires human review)
const NODE_AMBIGUOUS: Record<string, string> = {
  FINANCIAL: 'OUTCOME_FINANCIAL or RESOURCE_MONEY — context dependent',
  GOAL: 'No direct match — map to activity/governance (strategic alignment)',
  CAPABILITY: 'No direct match — map to resource/knowledge (capability as knowledge resource)',
  PROCESS: 'Approximate — map to activity/production, activity/governance, or activity/coordination based on processType',
  EVENT: 'No direct match — store as timestamp annotation on edge props',
  DOCUMENT: 'Approximate — map to resource/knowledge or resource/data',
  BUSINESS_MODEL: 'No direct match — store as EXTERNAL_ASSUMPTION_BINDS edge param',
};

/** Map an old SOGNodeType key string to new NodeType. Returns null if ambiguous. */
export function mapOldNodeType(oldKey: string): NodeType | null {
  if (NODE_1TO1[oldKey]) return NODE_1TO1[oldKey];
  return null; // ambiguous — requires human review
}

/** Get migration guidance for ambiguous node types */
export function getNodeMappingGuide(oldKey: string): string | undefined {
  return NODE_AMBIGUOUS[oldKey];
}

/** List all old SOGNodeType keys that have 1:1 mappings */
export function getOneToOneNodeKeys(): string[] {
  return Object.keys(NODE_1TO1);
}

/** List all old SOGNodeType keys that require human review */
export function getAmbiguousNodeKeys(): string[] {
  return Object.keys(NODE_AMBIGUOUS);
}

// ─── Old SOGEdgeType → New EdgeType ───
const EDGE_1TO1: Record<string, EdgeType> = {
  DEPENDS_ON: EdgeType.DEPENDS_ON,
};

const EDGE_AMBIGUOUS: Record<string, string> = {
  INTERACTS_WITH: 'Approximate → INFORMS (info feedback)',
  BELONGS_TO: 'Syntactic — express via node ID path prefix',
  OWNS: 'Approximate → DEPLOYS (ownership as resource deployment)',
  TRIGGERS: 'No match — temporal data on edge props',
  AFFECTS: 'Combination → DEPENDS_ON + INFORMS',
  CORRESPONDS_TO: 'No match — document metadata on knowledge node',
  CONSUMES: 'Direction reversed → DEPLOYS (resource→activity)',
  ALIGNS_WITH: 'Approximate → INCENTIVE_BINDS',
  PROVIDES: 'Approximate → DEPLOYS (person→activity)',
  HAS_ACCESS_TO: 'No match — permission layer, not ontology edge',
  REVENUE_FROM: 'Combination → PRODUCES (activity→outcome) + REPLENISHES (outcome→resource)',
  COST_DRIVEN_BY: 'Approximate → FUNDS (money→activity)',
  VALUE_PROPOSITION: 'Approximate → DEPLOYS (client→activity)',
};

/** Map an old SOGEdgeType key string to new EdgeType. Returns null if ambiguous. */
export function mapOldEdgeType(oldKey: string): EdgeType | null {
  if (EDGE_1TO1[oldKey]) return EDGE_1TO1[oldKey];
  return null; // ambiguous — requires human review
}

/** Get migration guidance for ambiguous edge types */
export function getEdgeMappingGuide(oldKey: string): string | undefined {
  return EDGE_AMBIGUOUS[oldKey];
}

/** List all old SOGEdgeType keys that have 1:1 mappings */
export function getOneToOneEdgeKeys(): string[] {
  return Object.keys(EDGE_1TO1);
}

/** List all old SOGEdgeType keys that require human review */
export function getAmbiguousEdgeKeys(): string[] {
  return Object.keys(EDGE_AMBIGUOUS);
}
