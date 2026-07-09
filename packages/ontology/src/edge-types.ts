/**
 * @synova/ontology — Edge Type Constants
 *
 * 17+ edge type string constants derived from extensions/ontology/edge-types/ JSON Schema.
 * Replaces old SOGEdgeType enum. DO NOT add backward-compatible aliases.
 *
 * Current edges: PRODUCES, DEPLOYS, FUNDS, DEPENDS_ON, SUBSTITUTES,
 * SIGNAL_TRANSMITS, METRIC_BINDS, INCENTIVE_BINDS, DECISION_CONCENTRATES,
 * EXTERNAL_ASSUMPTION_BINDS, LOCKS_IN, CONSTRAINS, AUGMENTS, INFORMS,
 * DEPENDS_ON_PLATFORM, REPLENISHES, BRAND_BUILDS, COUPLES,
 * CUMULATIVE_LEARNING, OCCUPIES.
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
  // T7a: 品牌建设边
  BRAND_BUILDS: 'BRAND_BUILDS',
  // T7: 增长边
  COUPLES: 'COUPLES',
  CUMULATIVE_LEARNING: 'CUMULATIVE_LEARNING',
  OCCUPIES: 'OCCUPIES',
} as const;

/** Union type of all 20 edge type string values */
export type EdgeType = typeof EdgeType[keyof typeof EdgeType];

/** All 20 edge types in a flat array */
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
  // T7a
  EdgeType.BRAND_BUILDS,
  // T7
  EdgeType.COUPLES,
  EdgeType.CUMULATIVE_LEARNING,
  EdgeType.OCCUPIES,
] as const;
