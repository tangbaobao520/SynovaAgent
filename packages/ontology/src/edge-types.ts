/**
 * @synova/ontology — Edge Type Constants
 *
 * 16 edge type string constants derived from extensions/ontology/edge-types/ JSON Schema.
 * Replaces old SOGEdgeType enum. DO NOT add backward-compatible aliases.
 *
 * Source of truth: extensions/ontology/edge-types/
 *
 * @module @synova/ontology/edge-types
 */

export const EdgeType = {
  PRODUCES: 'PRODUCES',
  DEPLOYS: 'DEPLOYS',
  FUNDS: 'FUNDS',
  DEPENDS_ON: 'DEPENDS_ON',
  SUBSTITUTES: 'SUBSTITUTES',
  SIGNAL_TRANSMITS: 'SIGNAL_TRANSMITS',
  METRIC_BINDS: 'METRIC_BINDS',
  INCENTIVE_BINDS: 'INCENTIVE_BINDS',
  DECISION_CONCENTRATES: 'DECISION_CONCENTRATES',
  EXTERNAL_ASSUMPTION_BINDS: 'EXTERNAL_ASSUMPTION_BINDS',
  LOCKS_IN: 'LOCKS_IN',
  CONSTRAINS: 'CONSTRAINS',
  AUGMENTS: 'AUGMENTS',
  INFORMS: 'INFORMS',
  DEPENDS_ON_PLATFORM: 'DEPENDS_ON_PLATFORM',
  REPLENISHES: 'REPLENISHES',
} as const;

/** Union type of all 16 edge type string values */
export type EdgeType = typeof EdgeType[keyof typeof EdgeType];

/** All 16 edge types in a flat array */
export const ALL_EDGE_TYPES: readonly EdgeType[] = [
  EdgeType.PRODUCES,
  EdgeType.DEPLOYS,
  EdgeType.FUNDS,
  EdgeType.DEPENDS_ON,
  EdgeType.SUBSTITUTES,
  EdgeType.SIGNAL_TRANSMITS,
  EdgeType.METRIC_BINDS,
  EdgeType.INCENTIVE_BINDS,
  EdgeType.DECISION_CONCENTRATES,
  EdgeType.EXTERNAL_ASSUMPTION_BINDS,
  EdgeType.LOCKS_IN,
  EdgeType.CONSTRAINS,
  EdgeType.AUGMENTS,
  EdgeType.INFORMS,
  EdgeType.DEPENDS_ON_PLATFORM,
  EdgeType.REPLENISHES,
] as const;
