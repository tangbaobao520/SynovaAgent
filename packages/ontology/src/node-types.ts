/**
 * @synova/ontology — Node Type Constants
 *
 * 29 node type string constants derived from extensions/ontology/ JSON Schema.
 * Replaces old SOGNodeType enum. DO NOT add backward-compatible aliases.
 *
 * Source of truth: extensions/ontology/ (activity/, outcome/, resource/)
 *
 * @module @synova/ontology/node-types
 */

// ─── Activity Types (8) ───
export const NodeType = {
  ACTIVITY_PRODUCTION: 'activity/production',
  ACTIVITY_ACQUISITION: 'activity/acquisition',
  ACTIVITY_INNOVATION: 'activity/innovation',
  ACTIVITY_COORDINATION: 'activity/coordination',
  ACTIVITY_LEARNING: 'activity/learning',
  ACTIVITY_GOVERNANCE: 'activity/governance',
  ACTIVITY_MAINTENANCE: 'activity/maintenance',
  ACTIVITY_COMPLIANCE: 'activity/compliance',

  // ─── Outcome Types (8) ───
  OUTCOME_FINANCIAL: 'outcome/financial',
  OUTCOME_MARKET: 'outcome/market',
  OUTCOME_OPERATIONAL: 'outcome/operational',
  OUTCOME_PEOPLE: 'outcome/people',
  OUTCOME_INNOVATION: 'outcome/innovation',
  OUTCOME_RISK: 'outcome/risk',
  OUTCOME_COMPETITIVE: 'outcome/competitive',
  OUTCOME_EXTERNAL: 'outcome/external',

  // ─── Resource Types (13) ───
  RESOURCE_MONEY: 'resource/money',
  RESOURCE_PERSON: 'resource/person',
  RESOURCE_TEAM: 'resource/team',
  RESOURCE_AGENT: 'resource/agent',
  RESOURCE_TOOL: 'resource/tool',
  RESOURCE_KNOWLEDGE: 'resource/knowledge',
  RESOURCE_CLIENT: 'resource/client',
  RESOURCE_BRAND: 'resource/brand',
  RESOURCE_DATA: 'resource/data',
  RESOURCE_IP: 'resource/ip',
  RESOURCE_LOCATION: 'resource/location',
  RESOURCE_CHANNEL: 'resource/channel',
  RESOURCE_SUPPLIER: 'resource/supplier',
} as const;

/** Union type of all 29 node type string values */
export type NodeType = typeof NodeType[keyof typeof NodeType];

// ─── Category helpers ───
export const ACTIVITY_TYPES: readonly NodeType[] = [
  NodeType.ACTIVITY_PRODUCTION,
  NodeType.ACTIVITY_ACQUISITION,
  NodeType.ACTIVITY_INNOVATION,
  NodeType.ACTIVITY_COORDINATION,
  NodeType.ACTIVITY_LEARNING,
  NodeType.ACTIVITY_GOVERNANCE,
  NodeType.ACTIVITY_MAINTENANCE,
  NodeType.ACTIVITY_COMPLIANCE,
] as const;

export const OUTCOME_TYPES: readonly NodeType[] = [
  NodeType.OUTCOME_FINANCIAL,
  NodeType.OUTCOME_MARKET,
  NodeType.OUTCOME_OPERATIONAL,
  NodeType.OUTCOME_PEOPLE,
  NodeType.OUTCOME_INNOVATION,
  NodeType.OUTCOME_RISK,
  NodeType.OUTCOME_COMPETITIVE,
  NodeType.OUTCOME_EXTERNAL,
] as const;

export const RESOURCE_TYPES: readonly NodeType[] = [
  NodeType.RESOURCE_MONEY,
  NodeType.RESOURCE_PERSON,
  NodeType.RESOURCE_TEAM,
  NodeType.RESOURCE_AGENT,
  NodeType.RESOURCE_TOOL,
  NodeType.RESOURCE_KNOWLEDGE,
  NodeType.RESOURCE_CLIENT,
  NodeType.RESOURCE_BRAND,
  NodeType.RESOURCE_DATA,
  NodeType.RESOURCE_IP,
  NodeType.RESOURCE_LOCATION,
  NodeType.RESOURCE_CHANNEL,
  NodeType.RESOURCE_SUPPLIER,
] as const;

/** All 29 node types in a flat array */
export const ALL_NODE_TYPES: readonly NodeType[] = [
  ...ACTIVITY_TYPES,
  ...OUTCOME_TYPES,
  ...RESOURCE_TYPES,
] as const;
